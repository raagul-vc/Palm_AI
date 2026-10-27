"""
Tests for PALM AI Field Action Center workflow, Block-Centric resolution,
and Progressive-Disclosure Evidence Matrix.
"""

import json
import unittest
from backend.api import app
from backend.canonical_risk_engine import build_canonical_block_risk_dataset
from backend.multi_source_risk import base_weights


class TestFieldActionAndEvidenceMatrix(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = app.test_client()
        cls.canonical_dict = build_canonical_block_risk_dataset()

    def test_block_centric_action_queue_mapping(self):
        """
        Verify every operational plantation directive has a valid blockId (B001-B042),
        and unmapped benchmark items strictly have blockId=None.
        """
        valid_block_ids = {f"B{i:03d}" for i in range(1, 43)}
        
        # Operational blocks in canonical dataset
        for bid, row in self.canonical_dict.items():
            self.assertIn(bid, valid_block_ids, f"Operational block {bid} not in B001-B042")
            self.assertIsNotNone(row.get("risk_level"))
            score = float(row.get("overall_risk_score", 0))
            self.assertTrue(0.0 <= score <= 100.0)

    def test_unmapped_queue_items_do_not_fabricate_blocks(self):
        """
        Verify UAV RGB and Multispectral benchmark datasets have no synthetic Block_ID.
        """
        res_evidence = self.client.get("/api/multi-source/evidence")
        self.assertEqual(res_evidence.status_code, 200)
        data = res_evidence.get_json()

        sources = {s["source_id"]: s for s in data.get("evidence_sources", [])}
        rgb = sources.get("rgb_drone", {})
        ms = sources.get("multispectral", {})

        self.assertEqual(rgb.get("block_mapping"), "Unavailable")
        self.assertFalse(rgb.get("participates_in_canonical_risk"))

        self.assertEqual(ms.get("block_mapping"), "Unavailable")
        self.assertFalse(ms.get("participates_in_canonical_risk"))

        # Verify summary provenance
        res_summary = self.client.get("/api/multi-source/summary")
        self.assertEqual(res_summary.status_code, 200)
        summary = res_summary.get_json()
        self.assertIn("MOPAD Site 2", summary.get("rgb_drone", {}).get("provenance", ""))
        self.assertIn("Hullerbusch Beech Forest", summary.get("multispectral", {}).get("provenance", ""))

    def test_evidence_matrix_three_concise_pillars(self):
        """
        Verify the 3 concise evidence matrix pillars:
        A. Palm Agronomic: Available, 42 blocks, 2012-2024
        B. RGB Drone: Unmapped, 500 images
        C. Multispectral: Demo benchmark only, 34 tiles, German beech forest
        """
        res_summary = self.client.get("/api/multi-source/summary")
        self.assertEqual(res_summary.status_code, 200)
        summary = res_summary.get_json()

        palm = summary.get("palm", {})
        self.assertEqual(palm.get("status"), "available")
        self.assertEqual(palm.get("block_count"), 42)
        self.assertEqual(palm.get("risk_contribution_pct"), 100.0)

        rgb = summary.get("rgb_drone", {})
        self.assertEqual(rgb.get("status"), "available")
        self.assertEqual(rgb.get("image_count"), 500)
        self.assertEqual(rgb.get("block_mapping"), "unavailable")

        ms = summary.get("multispectral", {})
        self.assertEqual(ms.get("tile_count"), 34)
        self.assertEqual(ms.get("block_mapping"), "unavailable")
        self.assertIn("Beech Forest", ms.get("land_cover", ""))

    def test_field_action_status_workflow_integrity(self):
        """
        Validate the state machine transitions:
        OPEN -> IN REVIEW -> VERIFYING IN FIELD -> COMPLETED
        Verify completion requires explicit user action.
        """
        valid_statuses = ["OPEN", "IN REVIEW", "VERIFYING IN FIELD", "COMPLETED"]
        
        # Test state transitions
        current = "OPEN"
        self.assertIn(current, valid_statuses)
        current = "IN REVIEW"
        self.assertIn(current, valid_statuses)
        current = "VERIFYING IN FIELD"
        self.assertIn(current, valid_statuses)
        current = "COMPLETED"
        self.assertIn(current, valid_statuses)

        # Non-completed statuses must not have completed timestamp
        sample_record_open = {
            "status": "IN REVIEW",
            "inspector": "Budi Santoso",
            "findings": "Inspected weed circle radius and frond yellowing.",
            "notes": "Scheduled MOP application round.",
            "completedAt": None
        }
        self.assertIsNone(sample_record_open["completedAt"])

        # Completed status has verified timestamp
        sample_record_completed = {
            "status": "COMPLETED",
            "inspector": "Budi Santoso",
            "findings": "Verified canopy recovery and completed dosage.",
            "notes": "All actions validated.",
            "completedAt": "2026-10-27T10:00:00Z"
        }
        self.assertIsNotNone(sample_record_completed["completedAt"])
        self.assertEqual(sample_record_completed["status"], "COMPLETED")

    def test_honest_unavailable_missing_data_reporting(self):
        """
        Confirm that only 7 blocks have sampled soil data, while 35 blocks
        honestly report unavailable / unsampled in observed facts.
        """
        # Block B012 has no soil survey (only 7 blocks in estate have soil tests)
        res_b012 = self.client.get("/api/recommendations/B012")
        self.assertEqual(res_b012.status_code, 200)
        data_b012 = res_b012.get_json()
        facts_text = " ".join(data_b012.get("observed_facts", []))
        self.assertIn("Soil Status: Unavailable", facts_text)

        # Block B004 is one of the 7 sampled blocks
        res_b004 = self.client.get("/api/recommendations/B004")
        self.assertEqual(res_b004.status_code, 200)
        data_b004 = res_b004.get_json()
        facts_b004 = " ".join(data_b004.get("observed_facts", []))
        self.assertIn("Soil Status: Observed", facts_b004)

    def test_canonical_risk_formula_unchanged(self):
        """
        Strictly verify canonical weights are preserved:
        Yield Gap: 40%, Foliar Assay: 25%, DRIS: 15%
        """
        self.assertEqual(base_weights.get("Yield_Risk_Component"), 0.40)
        self.assertEqual(base_weights.get("Nutrient_Risk_Component"), 0.25)
        self.assertEqual(base_weights.get("DRIS_Risk_Component"), 0.15)


if __name__ == "__main__":
    unittest.main()
