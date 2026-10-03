import json
import unittest
from pathlib import Path
import numpy as np
import pandas as pd

from backend.api import app
from backend.canonical_risk_engine import build_canonical_block_risk_dataset

BASE_DIR = Path(__file__).resolve().parent.parent


class RiskEngineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = app.test_client()
        cls.canonical = build_canonical_block_risk_dataset()

    # =========================================================================
    # 1. BLOCK FILTERING TESTS
    # =========================================================================

    def test_valid_block_filtering(self):
        """Valid Block_IDs return 200 with the exact matching block record."""
        for block_id in ["B001", "B005", "B012", "B031", "B042"]:
            resp = self.client.get(f"/api/risk/{block_id}")
            self.assertEqual(resp.status_code, 200, f"Failed for {block_id}")
            data = resp.get_json()
            self.assertEqual(data["Block_ID"], block_id)
            self.assertEqual(data["identity"]["Block_ID"], block_id)

    def test_block_filtering_case_insensitivity(self):
        """Block filtering accepts lowercase or mixed-case block identifiers."""
        resp_lower = self.client.get("/api/risk/b001")
        self.assertEqual(resp_lower.status_code, 200)
        data = resp_lower.get_json()
        self.assertEqual(data["Block_ID"], "B001")

        resp_mixed = self.client.get("/api/risk/b005")
        self.assertEqual(resp_mixed.status_code, 200)
        self.assertEqual(resp_mixed.get_json()["Block_ID"], "B005")

    def test_invalid_block_filtering(self):
        """Invalid or non-existent Block_IDs return 404 with error message."""
        for invalid_id in ["INVALID_BLOCK", "B999", "X001", "UNKNOWN"]:
            resp = self.client.get(f"/api/risk/{invalid_id}")
            self.assertEqual(resp.status_code, 404, f"Should return 404 for {invalid_id}")
            data = resp.get_json()
            self.assertIn("error", data)
            self.assertIn(invalid_id, data["error"])

    def test_exact_match_only_no_substring(self):
        """Partial substrings must not falsely match (exact match only)."""
        for partial_id in ["B0", "B00", "001", "B"]:
            resp = self.client.get(f"/api/risk/{partial_id}")
            self.assertEqual(resp.status_code, 404, f"Partial match should fail for {partial_id}")

    # =========================================================================
    # 2. RISK SCORE BOUNDS & DETERMINISM
    # =========================================================================

    def test_risk_scores_bounded_zero_to_hundred(self):
        """All overall risk scores and available components are strictly bounded in [0, 100]."""
        for block_id, record in self.canonical.items():
            score = record["overall_risk_score"]
            self.assertIsNotNone(score)
            self.assertGreaterEqual(score, 0.0, f"{block_id} score < 0")
            self.assertLessEqual(score, 100.0, f"{block_id} score > 100")

            components = record["risk_components"]
            for comp_name in ["production_risk", "nutrient_risk", "dris_risk"]:
                comp_val = components.get(comp_name)
                if comp_val is not None:
                    self.assertGreaterEqual(comp_val, 0.0, f"{block_id} {comp_name} < 0")
                    self.assertLessEqual(comp_val, 100.0, f"{block_id} {comp_name} > 100")

    def test_risk_level_threshold_conformance(self):
        """Risk level corresponds strictly to project threshold rules: >=70 HIGH, >=40 MEDIUM, <40 LOW."""
        for block_id, record in self.canonical.items():
            score = record["overall_risk_score"]
            level = record["risk_level"]
            if score >= 70.0:
                self.assertEqual(level, "HIGH", f"{block_id}: score {score} should be HIGH")
            elif score >= 40.0:
                self.assertEqual(level, "MEDIUM", f"{block_id}: score {score} should be MEDIUM")
            else:
                self.assertEqual(level, "LOW", f"{block_id}: score {score} should be LOW")

    def test_risk_score_determinism(self):
        """Re-computing the canonical risk dataset produces bit-identical scores."""
        second_run = build_canonical_block_risk_dataset()
        for block_id in self.canonical:
            first_record = self.canonical[block_id]
            second_record = second_run[block_id]
            self.assertEqual(first_record["overall_risk_score"], second_record["overall_risk_score"])
            self.assertEqual(first_record["risk_level"], second_record["risk_level"])
            self.assertEqual(first_record["risk_components"], second_record["risk_components"])

    # =========================================================================
    # 3. MISSING DATA & SPARSITY HANDLING
    # =========================================================================

    def test_sparse_soil_observations_handled_cleanly(self):
        """Soil observations exist for exactly 7 blocks; remaining 35 blocks are marked unavailable."""
        observed_soil_blocks = []
        unavailable_soil_blocks = []
        for block_id, record in self.canonical.items():
            soil_info = record["agronomic_evidence"]["soil_indicators"]
            self.assertIn("status", soil_info)
            if soil_info["status"] == "observed":
                observed_soil_blocks.append(block_id)
                self.assertIsNotNone(soil_info["sample_year"])
                self.assertIsNotNone(soil_info["pH_H2O"])
            else:
                unavailable_soil_blocks.append(block_id)
                self.assertIn("not conducted", soil_info["note"].lower())

            # Crucial: soil_risk must remain null/None to prevent unmeasured penalty
            self.assertIsNone(record["risk_components"]["soil_risk"])

        self.assertEqual(len(observed_soil_blocks), 7)
        self.assertEqual(len(unavailable_soil_blocks), 35)

    def test_weather_evidence_excluded_from_block_risk(self):
        """Weather evidence is marked Unavailable/Not integrated for block discrimination."""
        for block_id, record in self.canonical.items():
            weather_info = record["weather_evidence"]
            self.assertEqual(weather_info["status"], "Unavailable / Not integrated")
            self.assertFalse(weather_info["block_discriminating"])
            self.assertIn("estate-level", weather_info["reason"].lower())

            # Crucial: weather_risk must remain null/None
            self.assertIsNone(record["risk_components"]["weather_risk"])

    def test_sparse_boron_leaf_handling(self):
        """Leaf panel with missing Boron does not corrupt nutrient score calculation."""
        for block_id in ["B001", "B002", "B003"]:
            record = self.canonical[block_id]
            panel = record["agronomic_evidence"]["leaf_nutrients"]["panel"]
            self.assertIsNone(panel["B_ppm"], f"{block_id} B_ppm should be null")
            self.assertIsNotNone(record["risk_components"]["nutrient_risk"])

    # =========================================================================
    # 4. EVIDENCE SEPARATION (PILLARS 1, 2, AND 3)
    # =========================================================================

    def test_evidence_status_flags_present_and_decoupled(self):
        """All block records declare palm=available, rgb_drone=unmapped, multispectral=unmapped."""
        for block_id, record in self.canonical.items():
            status = record["evidence_status"]
            self.assertEqual(status["palm"], "available")
            self.assertEqual(status["rgb_drone"], "unmapped")
            self.assertEqual(status["multispectral"], "unmapped")

    def test_no_rgb_or_multispectral_data_leakage_into_block_records(self):
        """RGB detections and Multispectral raster metrics must not appear in block records."""
        prohibited_rgb_keys = ["drone_health_score", "dead_percentage", "yellow_percentage", "small_percentage"]
        prohibited_ms_keys = ["mhs", "multispectral_health_score", "canopy_ndvi_mean", "canopy_ndre_mean"]

        for block_id, record in self.canonical.items():
            record_str = json.dumps(record)
            for key in prohibited_rgb_keys:
                self.assertNotIn(f'"{key}"', record_str, f"RGB key {key} leaked into block {block_id}")
            for key in prohibited_ms_keys:
                self.assertNotIn(f'"{key}"', record_str, f"MS key {key} leaked into block {block_id}")

    def test_evidence_registry_endpoint(self):
        """Evidence registry endpoint exposes all three decoupled evidence pillars."""
        resp = self.client.get("/api/evidence-registry")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIn("evidence_pillars", data)
        pillars = data["evidence_pillars"]
        self.assertIn("palm_agronomic", pillars)
        self.assertIn("rgb_drone", pillars)
        self.assertIn("multispectral", pillars)

        self.assertEqual(pillars["palm_agronomic"]["block_mapping"], "available")
        self.assertEqual(pillars["rgb_drone"]["block_mapping"], "unavailable")
        self.assertEqual(pillars["multispectral"]["block_mapping"], "unavailable")

    # =========================================================================
    # 5. API SCHEMA & SUMMARY ENDPOINT
    # =========================================================================

    def test_risk_summary_endpoint(self):
        """Summary endpoint returns plantation statistics, risk counts, and coverage."""
        resp = self.client.get("/api/risk/summary")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()

        self.assertEqual(data["total_blocks"], 42)
        self.assertEqual(data["year"], 2024)
        counts = data["risk_level_counts"]
        self.assertEqual(sum(counts.values()), 42)
        self.assertEqual(counts["HIGH"], 1)
        self.assertEqual(counts["MEDIUM"], 6)
        self.assertEqual(counts["LOW"], 35)

        stats = data["score_statistics"]
        self.assertGreaterEqual(stats["min"], 0.0)
        self.assertLessEqual(stats["max"], 100.0)
        self.assertAlmostEqual(stats["max"], 70.0, places=1)

        coverage = data["evidence_coverage"]
        self.assertIn("42 / 42", coverage["palm_agronomic"])
        self.assertIn("0 / 42", coverage["rgb_drone"])
        self.assertIn("0 / 42", coverage["multispectral"])

        self.assertEqual(len(data["blocks"]), 42)

    def test_legacy_risk_endpoints_preserved(self):
        """Existing /api/risk and /api/multi-source-risk routes continue to function normally."""
        resp_risk = self.client.get("/api/risk")
        self.assertEqual(resp_risk.status_code, 200)
        self.assertIsInstance(resp_risk.get_json(), list)
        self.assertEqual(len(resp_risk.get_json()), 42)

        resp_filter = self.client.get("/api/risk?block_id=B001")
        self.assertEqual(resp_filter.status_code, 200)
        filtered = resp_filter.get_json()
        self.assertEqual(len(filtered), 1)
        self.assertEqual(filtered[0]["Block_ID"], "B001")

        resp_multi = self.client.get("/api/multi-source-risk")
        self.assertEqual(resp_multi.status_code, 200)
        self.assertEqual(len(resp_multi.get_json()), 42)


if __name__ == "__main__":
    unittest.main(verbosity=2)
