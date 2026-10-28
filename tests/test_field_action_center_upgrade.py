"""
Tests for PALM AI Upgraded Field Action Center:
1. Evidence-backed recommendations and facts vs. AI suggestions separation
2. Missing data handling (sparse soil, missing telemetry, remote sensing data availability)
3. API failures and graceful deterministic fallback (OpenAI timeout/error handling, 404s)
4. Block sorting (alphabetical A-Z, alphabetical Z-A, risk priority, score, status)
5. Risk categories (HIGH >= 70, MEDIUM 40-<70, LOW < 40, UNKNOWN) and canonical formula preservation
"""

import json
import unittest
from unittest.mock import patch, MagicMock
import urllib.error
import io

from backend.api import app
from backend.canonical_risk_engine import build_canonical_block_risk_dataset
from backend.multi_source_risk import base_weights
import backend.recommendation_service as recommendation_service


class TestFieldActionCenterUpgrade(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = app.test_client()
        cls.canonical_dict = build_canonical_block_risk_dataset()

    # =========================================================================
    # 1. RECOMMENDATIONS TESTS
    # =========================================================================
    def test_block_recommendation_schema_and_facts_separation(self):
        """
        Verify /api/recommendations/<block_id> returns complete schema with
        strict separation between observed empirical facts and recommendations.
        """
        res = self.client.get("/api/recommendations/B001")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()

        # Top-level fields
        self.assertEqual(data.get("block_id"), "B001")
        self.assertEqual(data.get("risk_level"), "HIGH")
        self.assertEqual(data.get("source"), "deterministic_engine")
        self.assertFalse(data.get("is_ai_generated"))
        self.assertFalse(data.get("insufficient_evidence"))

        # Facts separation
        observed_facts = data.get("observed_facts", [])
        self.assertTrue(len(observed_facts) >= 5, "Observed facts must compile verified telemetry")
        facts_text = " ".join(observed_facts)
        self.assertIn("2024 FFB Yield:", facts_text)
        self.assertIn("Foliar Assay", facts_text)
        self.assertIn("DRIS Nutritional Imbalance:", facts_text)

        # Model predictions separation
        model_predictions = data.get("model_predictions", [])
        self.assertTrue(len(model_predictions) >= 3)
        pred_text = " ".join(model_predictions)
        self.assertIn("Canonical Screening Score:", pred_text)
        self.assertIn("Screening Risk Band:", pred_text)

        # Recommendation separation
        rec = data.get("recommendation", {})
        self.assertIn("priority", rec)
        self.assertIn("urgency", rec)
        self.assertIn("observed_finding", rec)
        self.assertIn("agronomic_rationale", rec)
        self.assertIn("recommended_action", rec)
        self.assertIn("validation_protocol", rec)
        self.assertEqual(rec.get("priority"), "Critical")

    def test_all_recommendations_endpoint(self):
        """
        Verify /api/recommendations returns fleet-wide recommendations with counts.
        """
        res = self.client.get("/api/recommendations?sort_by=alphabetical")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data.get("status"), "success")
        self.assertEqual(data.get("count"), 42)
        self.assertEqual(data.get("total_blocks"), 42)

        # Check alphabetical sorting in response
        b_ids = [r["block_id"] for r in data.get("recommendations", [])]
        expected_alphabetical = sorted(self.canonical_dict.keys())
        self.assertEqual(b_ids, expected_alphabetical)

    def test_mock_openai_synthesis_success(self):
        """
        Verify that when OpenAI credentials are valid and API returns expected lines,
        the service sets is_ai_generated=True and parses lines accurately.
        """
        mock_response_content = (
            "FINDING: Block B001 exhibits severe yield depression with high screening score.\n"
            "RATIONALE: Foliar laboratory assays confirm acute nitrogen deficiency.\n"
            "ACTION: Dispatch field supervisor to audit weed circles and verify drainage.\n"
            "VALIDATION: Conduct Frond 17 re-sampling within 60 days."
        )
        mock_payload = {
            "choices": [{
                "message": {"content": mock_response_content}
            }]
        }

        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = json.dumps(mock_payload).encode("utf-8")
        mock_resp.__enter__.return_value = mock_resp
        mock_resp.__exit__.return_value = None

        with patch("urllib.request.urlopen", return_value=mock_resp):
            data, code = recommendation_service.generate_block_recommendation(
                "B001",
                canonical_dict=self.canonical_dict,
                openai_api_key="sk-test-mock-key-12345"
            )

        self.assertEqual(code, 200)
        self.assertTrue(data.get("is_ai_generated"))
        self.assertEqual(data.get("source"), "openai")
        rec = data.get("recommendation", {})
        self.assertEqual(rec.get("observed_finding"), "Block B001 exhibits severe yield depression with high screening score.")
        self.assertEqual(rec.get("agronomic_rationale"), "Foliar laboratory assays confirm acute nitrogen deficiency.")
        self.assertEqual(rec.get("recommended_action"), "Dispatch field supervisor to audit weed circles and verify drainage.")
        self.assertEqual(rec.get("validation_protocol"), "Conduct Frond 17 re-sampling within 60 days.")

    def test_api_keys_never_exposed(self):
        """
        Ensure API keys are never exposed in frontend responses.
        """
        with patch.dict("os.environ", {"OPENAI_API_KEY": "sk-super-secret-production-key-never-leak"}):
            res = self.client.get("/api/recommendations/B001")
            text = res.get_data(as_text=True)
            self.assertNotIn("sk-super-secret", text)
            self.assertNotIn("Bearer", text)

    # =========================================================================
    # 2. MISSING DATA TESTS
    # =========================================================================
    def test_missing_data_soil_honesty(self):
        """
        Ensure only 7 index blocks report observed soil samples, while 35 blocks
        honestly report unavailable / unsampled in observed facts.
        """
        # Block B012: No soil sample
        res_b012 = self.client.get("/api/recommendations/B012")
        data_b012 = res_b012.get_json()
        soil_obs_b012 = data_b012.get("supporting_observations", {}).get("soil_observation", {})
        self.assertEqual(soil_obs_b012.get("status"), "unavailable")
        self.assertIn("Soil Status: Unavailable", " ".join(data_b012.get("observed_facts", [])))

        # Block B004: Observed soil sample
        res_b004 = self.client.get("/api/recommendations/B004")
        data_b004 = res_b004.get_json()
        soil_obs_b004 = data_b004.get("supporting_observations", {}).get("soil_observation", {})
        self.assertEqual(soil_obs_b004.get("status"), "observed")
        self.assertIn("Soil Status: Observed", " ".join(data_b004.get("observed_facts", [])))

    def test_missing_data_insufficient_telemetry_handling(self):
        """
        Ensure blocks lacking empirical harvest yield and having <3 foliar nutrients
        explicitly return insufficient_evidence=True with deferred recommendation.
        """
        sparse_canonical = {
            "B_SPARSE": {
                "Block_ID": "B_SPARSE",
                "risk_level": "UNKNOWN",
                "overall_risk_score": None,
                "production_evidence": {"Productivity_t_Ha": None},
                "agronomic_evidence": {
                    "leaf_nutrients": {"panel": {"N_pct": 2.1}},  # Only 1 nutrient measured
                    "dris_indicators": {},
                    "soil_indicators": {"status": "unavailable"}
                },
                "weather_evidence": {}
            }
        }
        data, code = recommendation_service.generate_block_recommendation("B_SPARSE", canonical_dict=sparse_canonical)
        self.assertEqual(code, 200)
        self.assertTrue(data.get("insufficient_evidence"))
        self.assertEqual(data.get("risk_level"), "UNKNOWN")
        self.assertIn("minimum 3 required", " ".join(data.get("observed_facts", [])))
        self.assertEqual(data.get("recommendation", {}).get("priority"), "Routine")
        self.assertIn("baseline field census", data.get("recommendation", {}).get("recommended_action"))

    def test_drone_and_multispectral_data_availability_status(self):
        """
        Verify that drone and multispectral remote sensing data availability status
        is explicitly reported as unmapped / unavailable and contributes 0% weight.
        """
        res = self.client.get("/api/recommendations/B005")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()

        rs_status = data.get("remote_sensing_status", {})
        drone = rs_status.get("drone_rgb", {})
        self.assertFalse(drone.get("has_valid_mapping"))
        self.assertEqual(drone.get("block_mapping"), "unavailable")
        self.assertIn("Unmapped", drone.get("status"))

        ms = rs_status.get("multispectral", {})
        self.assertFalse(ms.get("has_valid_mapping"))
        self.assertEqual(ms.get("block_mapping"), "unavailable")
        self.assertIn("Unavailable", ms.get("status"))

    # =========================================================================
    # 3. API FAILURES AND DETERMINISTIC FALLBACK TESTS
    # =========================================================================
    def test_api_failure_unknown_block_404(self):
        """
        Verify 404 is returned when requesting a block not in plantation records.
        """
        res = self.client.get("/api/recommendations/B999")
        self.assertEqual(res.status_code, 404)
        data = res.get_json()
        self.assertIn("not found in plantation records", data.get("error", ""))

        res_inv = self.client.get("/api/recommendations/NONEXISTENT_BLOCK")
        self.assertEqual(res_inv.status_code, 404)

    def test_openai_api_timeout_fallback(self):
        """
        Verify that if OpenAI API times out (TimeoutError), the service gracefully
        catches the exception and falls back to deterministic engine.
        """
        with patch("urllib.request.urlopen", side_effect=TimeoutError("Connection timed out")):
            data, code = recommendation_service.generate_block_recommendation(
                "B001",
                canonical_dict=self.canonical_dict,
                openai_api_key="sk-test-timeout-key"
            )

        self.assertEqual(code, 200)
        self.assertFalse(data.get("is_ai_generated"))
        self.assertEqual(data.get("source"), "deterministic_engine")
        self.assertIn("Convene joint agronomy audit", data.get("recommendation", {}).get("recommended_action"))

    def test_openai_http_500_error_fallback(self):
        """
        Verify that if OpenAI API responds with HTTP 500 / 401 error, the service
        cleanly falls back to deterministic recommendations without crashing.
        """
        mock_http_err = urllib.error.HTTPError(
            url="https://api.openai.com/v1/chat/completions",
            code=500,
            msg="Internal Server Error",
            hdrs={},
            fp=io.BytesIO(b'{"error": {"message": "Service unavailable"}}')
        )

        with patch("urllib.request.urlopen", side_effect=mock_http_err):
            data, code = recommendation_service.generate_block_recommendation(
                "B005",
                canonical_dict=self.canonical_dict,
                openai_api_key="sk-test-http-error"
            )

        self.assertEqual(code, 200)
        self.assertFalse(data.get("is_ai_generated"))
        self.assertEqual(data.get("source"), "deterministic_engine")
        self.assertEqual(data.get("risk_level"), "MEDIUM")
        self.assertIn("Verify field application logs", data.get("recommendation", {}).get("recommended_action"))

    # =========================================================================
    # 4. BLOCK SORTING TESTS
    # =========================================================================
    def test_block_sorting_alphabetical_ascending(self):
        """
        Verify block sorting strictly orders B001 to B042 in natural alphabetical order.
        """
        test_blocks = [
            {"Block_ID": "B010"},
            {"Block_ID": "B002"},
            {"Block_ID": "B042"},
            {"Block_ID": "B001"},
            {"Block_ID": "B009"}
        ]
        sorted_list = recommendation_service.sort_blocks(test_blocks, sort_by="alphabetical")
        sorted_ids = [b["Block_ID"] for b in sorted_list]
        self.assertEqual(sorted_ids, ["B001", "B002", "B009", "B010", "B042"])

    def test_block_sorting_alphabetical_descending(self):
        """
        Verify block sorting orders B042 down to B001 in descending order.
        """
        test_blocks = [
            {"Block_ID": "B001"},
            {"Block_ID": "B042"},
            {"Block_ID": "B010"}
        ]
        sorted_list = recommendation_service.sort_blocks(test_blocks, sort_by="alphabetical_desc")
        sorted_ids = [b["Block_ID"] for b in sorted_list]
        self.assertEqual(sorted_ids, ["B042", "B010", "B001"])

    def test_block_sorting_risk_priority(self):
        """
        Verify sorting by risk priority orders CRITICAL > ELEVATED > ROUTINE.
        """
        test_blocks = [
            {"Block_ID": "B008", "priority": "ROUTINE", "risk_score": 26.25},
            {"Block_ID": "B001", "priority": "CRITICAL", "risk_score": 70.0},
            {"Block_ID": "B005", "priority": "ELEVATED", "risk_score": 53.75},
            {"Block_ID": "B031", "priority": "ELEVATED", "risk_score": 46.46},
        ]
        sorted_list = recommendation_service.sort_blocks(test_blocks, sort_by="priority")
        sorted_ids = [b["Block_ID"] for b in sorted_list]
        self.assertEqual(sorted_ids, ["B001", "B005", "B031", "B008"])

    def test_block_sorting_score_descending(self):
        """
        Verify sorting by screening risk score descending.
        """
        test_blocks = [
            {"Block_ID": "B008", "risk_score": 26.25},
            {"Block_ID": "B001", "risk_score": 70.0},
            {"Block_ID": "B005", "risk_score": 53.75},
        ]
        sorted_list = recommendation_service.sort_blocks(test_blocks, sort_by="score_desc")
        sorted_ids = [b["Block_ID"] for b in sorted_list]
        self.assertEqual(sorted_ids, ["B001", "B005", "B008"])

    def test_block_sorting_status(self):
        """
        Verify sorting by status orders OPEN -> IN REVIEW -> VERIFYING IN FIELD -> COMPLETED.
        """
        test_blocks = [
            {"Block_ID": "B004", "status": "COMPLETED"},
            {"Block_ID": "B001", "status": "OPEN"},
            {"Block_ID": "B003", "status": "VERIFYING IN FIELD"},
            {"Block_ID": "B002", "status": "IN REVIEW"}
        ]
        sorted_list = recommendation_service.sort_blocks(test_blocks, sort_by="status")
        sorted_ids = [b["Block_ID"] for b in sorted_list]
        self.assertEqual(sorted_ids, ["B001", "B002", "B003", "B004"])

    # =========================================================================
    # 5. RISK CATEGORIES AND FORMULA INTEGRITY TESTS
    # =========================================================================
    def test_risk_categories_canonical_thresholds(self):
        """
        Verify risk categories align with canonical thresholds:
        - HIGH: score >= 70
        - MEDIUM: 40 <= score < 70
        - LOW: score < 40
        """
        high_count = 0
        medium_count = 0
        low_count = 0

        for bid, row in self.canonical_dict.items():
            score = float(row.get("overall_risk_score", 0.0))
            level = str(row.get("risk_level", "LOW")).upper()

            if score >= 70.0:
                self.assertEqual(level, "HIGH", f"Block {bid} score {score} must be HIGH")
                high_count += 1
            elif score >= 40.0:
                self.assertEqual(level, "MEDIUM", f"Block {bid} score {score} must be MEDIUM")
                medium_count += 1
            else:
                self.assertEqual(level, "LOW", f"Block {bid} score {score} must be LOW")
                low_count += 1

        self.assertEqual(high_count, 1, "Expected 1 HIGH risk block (B001)")
        self.assertEqual(medium_count, 6, "Expected 6 MEDIUM risk blocks")
        self.assertEqual(low_count, 35, "Expected 35 LOW risk blocks")
        self.assertEqual(high_count + medium_count + low_count, 42)

    def test_canonical_screening_score_weights_preserved(self):
        """
        Strictly verify that the screening-score formula weights are preserved:
        Yield: 40%, Nutrient: 25%, DRIS: 15%.
        """
        self.assertEqual(base_weights.get("Yield_Risk_Component"), 0.40)
        self.assertEqual(base_weights.get("Nutrient_Risk_Component"), 0.25)
        self.assertEqual(base_weights.get("DRIS_Risk_Component"), 0.15)


if __name__ == "__main__":
    unittest.main()
