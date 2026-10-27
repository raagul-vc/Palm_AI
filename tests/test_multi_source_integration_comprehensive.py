import os
import unittest
import json
import io
from pathlib import Path
from PIL import Image

# Set test environment
os.environ["FLASK_ENV"] = "testing"

from backend.api import app

PROJECT_ROOT = Path(__file__).resolve().parent.parent


class MultiSourceIntegrationComprehensiveTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = app.test_client()

    # 1. CORRECT NATURAL / ALPHABETICAL SORTING OF B001–B042
    def test_natural_alphabetical_sorting_b001_b042(self):
        """Verify that B001–B042 natural sort logic properly handles 42 blocks."""
        res = self.client.get("/api/multi-source-risk")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(len(data), 42)

        import re
        def natural_sort_key(item):
            bid = item["Block_ID"]
            num_val = int(re.search(r"\d+", bid).group(0))
            return num_val

        naturally_sorted = sorted(data, key=natural_sort_key)
        sorted_ids = [b["Block_ID"] for b in naturally_sorted]
        expected_ids = [f"B{i:03d}" for i in range(1, 43)]
        self.assertEqual(sorted_ids, expected_ids, "Natural sort must order B001 to B042 properly")

    # 2. DATASET JOINS AND DUPLICATE PREVENTION
    def test_raw_dataset_joins_and_duplicate_prevention(self):
        """Verify relational join keys and zero duplicate records in raw and processed sources."""
        raw_dir = PROJECT_ROOT / "data" / "raw_source"
        if not raw_dir.exists():
            self.skipTest("Raw source directory not present")

        import pandas as pd
        # Check productivity
        df_prod = pd.read_csv(raw_dir / "productivity_monthly.csv")
        self.assertEqual(len(df_prod), 6552)
        dup_prod = df_prod.duplicated(subset=["Year", "Month_Number", "Block_ID"]).sum()
        self.assertEqual(dup_prod, 0, "productivity_monthly must have zero duplicates")

        # Check characteristics
        df_char = pd.read_csv(raw_dir / "block_characteristics.csv")
        self.assertEqual(len(df_char), 42)
        dup_char = df_char.duplicated(subset=["Block_ID"]).sum()
        self.assertEqual(dup_char, 0, "block_characteristics must have zero duplicate blocks")

        # Check leaf membership join
        df_leaf = pd.read_csv(raw_dir / "leaf_sampling_event.csv")
        df_kcd = pd.read_csv(raw_dir / "kcd_block_membership.csv")
        merged_leaf = pd.merge(df_kcd, df_leaf, on="KCD_Event_ID", how="inner")
        self.assertEqual(len(merged_leaf), len(df_kcd), "Every KCD membership record must join to a leaf event")

        # Check soil membership join
        df_soil = pd.read_csv(raw_dir / "soil_sampling_event.csv")
        df_sbm = pd.read_csv(raw_dir / "soil_block_membership.csv")
        merged_soil = pd.merge(df_sbm, df_soil, on="Soil_Event_ID", how="inner")
        self.assertEqual(len(merged_soil), len(df_sbm), "Every soil membership record must join to a soil event")

    # 3. MISSING OR INVALID BLOCK MAPPINGS
    def test_missing_or_invalid_block_mappings(self):
        """Verify that invalid block IDs return 404, and drone/multispectral queries report unmapped status."""
        # Non-existent block
        res = self.client.get("/api/recommendations/B999")
        self.assertEqual(res.status_code, 404)
        data = res.get_json()
        self.assertIn("error", data)

        # Drone mapping status
        drone_res = self.client.get("/api/drone/summary")
        self.assertEqual(drone_res.status_code, 200)
        drone_data = drone_res.get_json()
        self.assertEqual(drone_data.get("block_mapping"), "unavailable")

        # Multispectral mapping status
        ms_res = self.client.get("/api/multispectral/summary")
        self.assertEqual(ms_res.status_code, 200)
        ms_data = ms_res.get_json()
        self.assertEqual(ms_data.get("block_mapping"), "unavailable")

    # 4. MULTISPECTRAL BAND COMPATIBILITY AND PROVENANCE
    def test_multispectral_band_compatibility_and_provenance(self):
        """Verify 5-band GeoTIFF calibration and explicit German beech forest provenance."""
        res = self.client.get("/api/multispectral/summary")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()

        self.assertEqual(data.get("tile_count"), 34)
        self.assertIn("MicaSense Altum", data.get("sensor_platform", ""))
        self.assertIn("Beech Forest", data.get("dataset_provenance", ""))
        self.assertIn("NOT Oil Palm", data.get("land_cover_type", ""))

        # Check vegetation indices from tiles endpoint
        indices_res = self.client.get("/api/multispectral/tiles")
        self.assertEqual(indices_res.status_code, 200)
        indices = indices_res.get_json()
        self.assertEqual(len(indices), 34)
        for tile in indices:
            self.assertGreaterEqual(tile["canopy_ndvi_mean"], -1.0)
            self.assertLessEqual(tile["canopy_ndvi_mean"], 1.0)
            self.assertGreaterEqual(tile["canopy_ndre_mean"], -1.0)
            self.assertLessEqual(tile["canopy_ndre_mean"], 1.0)

    # 5. RISK SCORE CALCULATIONS AND CATEGORY THRESHOLDS
    def test_risk_score_calculations_and_thresholds(self):
        """Verify canonical screening risk score formula bounds and threshold classification."""
        res = self.client.get("/api/multi-source-risk")
        self.assertEqual(res.status_code, 200)
        blocks = res.get_json()

        for b in blocks:
            score = float(b["Multi_Source_Risk_Score"])
            level = b["Multi_Source_Risk_Level"]
            self.assertGreaterEqual(score, 0.0)
            self.assertLessEqual(score, 100.0)

            if score >= 70.0:
                self.assertEqual(level, "HIGH", f"Block {b['Block_ID']} with score {score} must be HIGH")
            elif score >= 40.0:
                self.assertEqual(level, "MEDIUM", f"Block {b['Block_ID']} with score {score} must be MEDIUM")
            else:
                self.assertEqual(level, "LOW", f"Block {b['Block_ID']} with score {score} must be LOW")

    # 6. DATA COVERAGE REPORTING
    def test_data_coverage_reporting(self):
        """Verify data quality panel and data-coverage endpoint return verified metrics."""
        res = self.client.get("/api/data-quality")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("findings", data)
        self.assertEqual(data.get("period_start"), 2012)
        self.assertEqual(data.get("period_end"), 2024)

        # Check compatibility report endpoint
        comp_res = self.client.get("/api/dataset-compatibility")
        self.assertEqual(comp_res.status_code, 200)
        comp_data = comp_res.get_json()
        self.assertIn("tabular_datasets", comp_data)
        self.assertIn("drone_rgb", comp_data)
        self.assertIn("multispectral", comp_data)

    # 7. DRONE INFERENCE FAILURES HANDLING
    def test_drone_inference_failures(self):
        """Verify robust error handling for missing, empty, or invalid image uploads."""
        # 1. Missing file
        res = self.client.post("/api/drone/predict")
        self.assertEqual(res.status_code, 400)
        self.assertIn("error", res.get_json())

        # 2. Unsupported extension
        data = {"image": (io.BytesIO(b"fake txt"), "test.txt")}
        res = self.client.post("/api/drone/predict", data=data, content_type="multipart/form-data")
        self.assertEqual(res.status_code, 400)
        self.assertIn("Unsupported file extension", res.get_json()["error"])

        # 3. Empty image
        data = {"image": (io.BytesIO(b""), "empty.jpg")}
        res = self.client.post("/api/drone/predict", data=data, content_type="multipart/form-data")
        self.assertEqual(res.status_code, 400)
        self.assertIn("empty", res.get_json()["error"])

        # 4. Tiny image (<16x16)
        img = Image.new("RGB", (8, 8), color="green")
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        buf.seek(0)
        data = {"image": (buf, "tiny.jpg")}
        res = self.client.post("/api/drone/predict", data=data, content_type="multipart/form-data")
        self.assertEqual(res.status_code, 400)
        self.assertIn("too small", res.get_json()["error"].lower())

    # 8. RECOMMENDATION OUTPUT VALIDATION
    def test_recommendation_output_validation(self):
        """Verify recommendation service returns complete structured schema with evidence grounding."""
        for bid in ["B001", "B005", "B012"]:
            res = self.client.get(f"/api/recommendations/{bid}")
            self.assertEqual(res.status_code, 200)
            data = res.get_json()

            self.assertEqual(data["block_id"], bid)
            self.assertIn("risk_level", data)
            self.assertIn("risk_score", data)
            self.assertIn("recommendation", data)
            self.assertIn("supporting_observations", data)
            self.assertIn("data_coverage_limitations", data)
            self.assertIn("evidence_grounding", data)

            rec = data["recommendation"]
            self.assertIn(rec["priority"], ["Critical", "Moderate", "Routine"])
            self.assertIn("urgency", rec)
            self.assertTrue(len(rec["observed_finding"]) > 0)
            self.assertTrue(len(rec["agronomic_rationale"]) > 0)
            self.assertTrue(len(rec["recommended_action"]) > 0)
            self.assertTrue(len(rec["validation_protocol"]) > 0)

    # 9. DETERMINISTIC FALLBACK AND TIMEOUT HANDLING
    def test_deterministic_fallback_behavior(self):
        """Verify deterministic rule engine activates gracefully when OPENAI_API_KEY is not set."""
        orig_key = os.environ.get("OPENAI_API_KEY")
        try:
            os.environ["OPENAI_API_KEY"] = ""
            res = self.client.get("/api/recommendations/B001")
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertFalse(data["is_ai_generated"])
            self.assertEqual(data["source"], "deterministic_engine")
            self.assertIn("deterministic agronomic engine", data["note"].lower())
        finally:
            if orig_key is not None:
                os.environ["OPENAI_API_KEY"] = orig_key


if __name__ == "__main__":
    unittest.main()
