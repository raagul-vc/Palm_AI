import unittest
from pathlib import Path
from backend.api import app

BASE = Path(__file__).resolve().parent.parent


class MultiSourceEvidenceApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = app.test_client()

    def test_multi_source_summary_endpoint(self):
        """Test GET /api/multi-source/summary returns 200 and accurate consolidation schema."""
        response = self.client.get("/api/multi-source/summary")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()

        # Check required top-level keys
        self.assertIn("palm", data)
        self.assertIn("rgb_drone", data)
        self.assertIn("multispectral", data)
        self.assertIn("fusion_status", data)
        self.assertIn("future_requirements", data)

        # 1. Palm source status and mapping
        self.assertEqual(data["palm"]["status"], "available")
        self.assertEqual(data["palm"]["level"], "block")
        self.assertEqual(data["palm"]["block_mapping"], "native")
        self.assertEqual(data["palm"]["risk_engine"], "canonical")
        self.assertEqual(data["palm"]["block_count"], 42)

        # 2. RGB Drone source status and mapping
        self.assertEqual(data["rgb_drone"]["status"], "available")
        self.assertEqual(data["rgb_drone"]["level"], "image")
        self.assertEqual(data["rgb_drone"]["image_count"], 500)
        self.assertEqual(data["rgb_drone"]["block_mapping"], "unavailable")
        self.assertTrue(data["rgb_drone"]["health_score_available"])

        # 3. Multispectral source status and mapping
        self.assertEqual(data["multispectral"]["status"], "available")
        self.assertEqual(data["multispectral"]["level"], "tile")
        self.assertEqual(data["multispectral"]["tile_count"], 34)
        self.assertEqual(data["multispectral"]["block_mapping"], "unavailable")
        self.assertTrue(data["multispectral"]["ndvi_available"])
        self.assertTrue(data["multispectral"]["ndre_available"])
        self.assertTrue(data["multispectral"]["mhs_available"])

        # 4. Strict fusion isolation checks
        fusion = data["fusion_status"]
        self.assertFalse(fusion["direct_row_level_fusion"])
        self.assertFalse(fusion["spatial_fusion"])
        self.assertFalse(fusion["risk_score_fusion"])
        self.assertIn("No validated spatial linkage", fusion["reason"])

        # 5. Future integration requirements
        reqs = data["future_requirements"]
        self.assertEqual(len(reqs), 3)
        self.assertTrue(any("GIS" in r for r in reqs))
        self.assertTrue(any("orthomosaics" in r for r in reqs))
        self.assertTrue(any("telemetry" in r or "timestamps" in r for r in reqs))

        # 6. Absence of fabricated Block_ID attributes
        self.assertNotIn("Block_ID", data)

    def test_multi_source_evidence_endpoint(self):
        """Test GET /api/multi-source/evidence returns compact 3-pillar matrix."""
        response = self.client.get("/api/multi-source/evidence")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()

        self.assertIn("evidence_sources", data)
        self.assertIn("fusion_status", data)
        self.assertIn("scientific_disclaimer", data)

        sources = data["evidence_sources"]
        self.assertEqual(len(sources), 3)

        source_map = {s["source_id"]: s for s in sources}
        self.assertIn("palm", source_map)
        self.assertIn("rgb_drone", source_map)
        self.assertIn("multispectral", source_map)

        # Check Palm source
        palm = source_map["palm"]
        self.assertEqual(palm["granularity"], "Block")
        self.assertEqual(palm["block_mapping"], "Available")
        self.assertTrue(palm["participates_in_canonical_risk"])
        self.assertEqual(palm["status"], "AVAILABLE")

        # Check RGB Drone source
        rgb = source_map["rgb_drone"]
        self.assertEqual(rgb["granularity"], "Image")
        self.assertEqual(rgb["block_mapping"], "Unavailable")
        self.assertFalse(rgb["participates_in_canonical_risk"])
        self.assertEqual(rgb["status"], "AVAILABLE")

        # Check Multispectral source
        ms = source_map["multispectral"]
        self.assertEqual(ms["granularity"], "Tile")
        self.assertEqual(ms["block_mapping"], "Unavailable")
        self.assertFalse(ms["participates_in_canonical_risk"])
        self.assertEqual(ms["status"], "AVAILABLE")

        # Verify disclaimer text
        disclaimer = data["scientific_disclaimer"]
        self.assertIn("cannot be spatially assigned to Palm Plantation Block_ID", disclaimer)
        self.assertIn("not included in the canonical Palm block-risk score", disclaimer)

    def test_block_isolation_does_not_mutate_evidence(self):
        """Verify that passing block parameters does not fabricate a block mapping."""
        for block_id in ["B001", "B002", "B005"]:
            resp = self.client.get(f"/api/multi-source/summary?block_id={block_id}")
            self.assertEqual(resp.status_code, 200)
            data = resp.get_json()
            self.assertEqual(data["rgb_drone"]["block_mapping"], "unavailable")
            self.assertEqual(data["multispectral"]["block_mapping"], "unavailable")
            self.assertFalse(data["fusion_status"]["spatial_fusion"])

    def test_canonical_risk_api_remains_unchanged(self):
        """Verify that the existing canonical risk API remains active, canonical, and untouched."""
        resp = self.client.get("/api/risk")
        self.assertEqual(resp.status_code, 200)
        risk_records = resp.get_json()
        self.assertEqual(len(risk_records), 42)

        # Ensure no drone or multispectral columns entered the canonical risk output
        sample = risk_records[0]
        self.assertIn("Block_ID", sample)
        self.assertIn("Risk_Score", sample)
        self.assertIn("Risk_Level", sample)
        self.assertNotIn("drone_health_score", sample)
        self.assertNotIn("multispectral_health_score", sample)
        self.assertNotIn("canopy_ndvi_mean", sample)


if __name__ == "__main__":
    unittest.main()
