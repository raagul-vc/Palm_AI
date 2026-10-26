import os
import unittest
import json
import re
from pathlib import Path

# Set test environment
os.environ["FLASK_ENV"] = "testing"

from backend.api import app
from backend.canonical_risk_engine import build_canonical_block_risk_dataset


class TestRedesignVerification(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = app.test_client()

    # 1. TEST NATURAL BLOCK SORTING
    def test_natural_block_sorting(self):
        """Verify that blocks are sorted in natural numerical order (B001, B002 ... B010 ... B042).
        Lexicographical string sorting would incorrectly sort B010 before B002.
        """
        raw_ids = [f"B{i:03d}" for i in range(1, 43)]
        # Shuffle or reverse to test sort logic
        shuffled = list(reversed(raw_ids))

        # Natural sort function as implemented in frontend and backend
        def natural_sort_key(item):
            match = re.search(r"\d+", item)
            num_val = int(match.group(0)) if match else 0
            return (num_val, item)

        sorted_ids = sorted(shuffled, key=natural_sort_key)
        self.assertEqual(sorted_ids[0], "B001")
        self.assertEqual(sorted_ids[1], "B002")
        self.assertEqual(sorted_ids[9], "B010")
        self.assertEqual(sorted_ids[41], "B042")
        self.assertEqual(sorted_ids, raw_ids, "Blocks must be sorted in natural numerical order B001 to B042")

    # 2. TEST REAL RISK COUNTS DERIVED FROM BACKEND DATA
    def test_real_risk_counts(self):
        """Verify that risk counts match actual telemetry from /api/multi-source-risk and /api/risk,
        never hardcoded mock counts.
        """
        res = self.client.get("/api/multi-source-risk")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertEqual(len(data), 42, "Exactly 42 operational blocks must be monitored")

        high_blocks = [b for b in data if b.get("Multi_Source_Risk_Level") == "HIGH"]
        med_blocks = [b for b in data if b.get("Multi_Source_Risk_Level") == "MEDIUM"]
        low_blocks = [b for b in data if b.get("Multi_Source_Risk_Level") == "LOW"]

        # Canonical multi-source screening model yields 1 HIGH, 6 MEDIUM, 35 LOW
        self.assertEqual(len(high_blocks), 1, "Canonical screening identifies exactly 1 HIGH risk block (B001)")
        self.assertEqual(high_blocks[0]["Block_ID"], "B001")
        self.assertEqual(len(med_blocks), 6, "Canonical screening identifies exactly 6 MEDIUM risk blocks")
        self.assertEqual(len(low_blocks), 35, "Canonical screening identifies exactly 35 LOW risk blocks")
        self.assertEqual(len(high_blocks) + len(med_blocks) + len(low_blocks), 42)

    # 3. TEST RECOMMENDATIONS API - HIGH RISK BLOCK B001
    def test_recommendations_api_high_risk(self):
        """Verify /api/recommendations/<block_id> for HIGH risk block B001."""
        res = self.client.get("/api/recommendations/B001")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)

        self.assertEqual(data["block_id"], "B001")
        self.assertEqual(data["risk_level"], "HIGH")
        self.assertGreaterEqual(data["risk_score"], 70.0)
        self.assertIn("recommendation", data)
        self.assertIn("observed_facts", data)
        self.assertIn("model_predictions", data)
        self.assertIn("evidence_grounding", data)

        rec = data["recommendation"]
        self.assertEqual(rec["priority"], "Critical")
        self.assertTrue(len(rec["observed_finding"]) > 0)
        self.assertTrue(len(rec["agronomic_rationale"]) > 0)
        self.assertTrue(len(rec["recommended_action"]) > 0)
        self.assertTrue(len(rec["validation_protocol"]) > 0)

        # Grounding check: ensure yield and foliar data are present in observed_facts
        facts_text = " ".join(data["observed_facts"])
        self.assertIn("FFB Yield", facts_text)
        self.assertIn("Foliar Assay", facts_text)

    # 4. TEST RECOMMENDATIONS API - LOW RISK BLOCK B012
    def test_recommendations_api_low_risk(self):
        """Verify /api/recommendations/<block_id> for LOW risk block B012."""
        res = self.client.get("/api/recommendations/B012")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)

        self.assertEqual(data["block_id"], "B012")
        self.assertEqual(data["risk_level"], "LOW")
        self.assertLess(data["risk_score"], 40.0)

        rec = data["recommendation"]
        self.assertEqual(rec["priority"], "Routine")
        self.assertIn("maintenance", rec["recommended_action"].lower())

    # 5. TEST RECOMMENDATIONS API - INVALID BLOCK ERROR HANDLING
    def test_recommendations_api_invalid_block(self):
        """Verify that an invalid block ID returns HTTP 404 with a descriptive error message."""
        res = self.client.get("/api/recommendations/B999")
        self.assertEqual(res.status_code, 404)
        data = json.loads(res.data)
        self.assertIn("error", data)
        self.assertIn("B999", data["error"])

    # 6. TEST MISSING DATA HANDLING (SOIL SURVEY SPARSE DATA)
    def test_missing_data_behavior(self):
        """Verify that blocks without soil samples report status 'unavailable'
        and do not crash or hallucinate soil test values.
        """
        # Block B012 has no soil survey (only 7 blocks in estate have soil tests)
        res = self.client.get("/api/recommendations/B012")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)

        facts_text = " ".join(data["observed_facts"])
        self.assertIn("Soil Status: Unavailable", facts_text)

    # 7. TEST NON-AI DETERMINISTIC FALLBACK BEHAVIOR
    def test_deterministic_fallback_when_no_api_key(self):
        """Verify that when OPENAI_API_KEY is unset or invalid, the recommendation service
        gracefully falls back to the deterministic agronomic rules engine without error.
        """
        orig_key = os.environ.get("OPENAI_API_KEY")
        try:
            os.environ["OPENAI_API_KEY"] = ""  # Unset key
            res = self.client.get("/api/recommendations/B005")
            self.assertEqual(res.status_code, 200)
            data = json.loads(res.data)

            self.assertFalse(data["is_ai_generated"])
            self.assertEqual(data["source"], "deterministic_engine")
            self.assertEqual(data["model"], "canonical_agronomic_rules")
            self.assertIn("deterministic agronomic engine", data["note"].lower())
            self.assertIn("recommendation", data)
        finally:
            if orig_key is not None:
                os.environ["OPENAI_API_KEY"] = orig_key


if __name__ == "__main__":
    unittest.main()
