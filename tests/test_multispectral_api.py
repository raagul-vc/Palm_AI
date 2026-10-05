import math
import unittest
from pathlib import Path
from backend.api import app

BASE = Path(__file__).resolve().parent.parent


class MultispectralApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = app.test_client()

    def test_multispectral_summary_endpoint(self):
        """Test GET /api/multispectral/summary returns 200 and matches validated baseline metrics."""
        response = self.client.get("/api/multispectral/summary")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()

        # Tile count and pixel volume
        self.assertEqual(data["tile_count"], 34)
        self.assertEqual(data["total_pixels_evaluated"], 8912896)

        # Baseline index & score metrics
        self.assertAlmostEqual(data["mean_mhs"], 92.00, places=1)
        self.assertAlmostEqual(data["median_mhs"], 96.64, places=1)
        self.assertAlmostEqual(data["mean_canopy_cover"], 93.62, places=1)
        self.assertAlmostEqual(data["mean_ndvi"], 0.8977, places=2)
        self.assertAlmostEqual(data["mean_ndre"], 0.5129, places=2)

        # Value bounds validation
        self.assertGreaterEqual(data["mean_mhs"], 0.0)
        self.assertLessEqual(data["mean_mhs"], 100.0)
        self.assertGreaterEqual(data["median_mhs"], 0.0)
        self.assertLessEqual(data["median_mhs"], 100.0)
        self.assertGreaterEqual(data["mean_canopy_cover"], 0.0)
        self.assertLessEqual(data["mean_canopy_cover"], 100.0)

        # NDVI / NDRE physical range [-1.0, 1.0]
        self.assertGreaterEqual(data["mean_ndvi"], -1.0)
        self.assertLessEqual(data["mean_ndvi"], 1.0)
        self.assertGreaterEqual(data["median_ndvi"], -1.0)
        self.assertLessEqual(data["median_ndvi"], 1.0)
        self.assertGreaterEqual(data["mean_ndre"], -1.0)
        self.assertLessEqual(data["mean_ndre"], 1.0)
        self.assertGreaterEqual(data["median_ndre"], -1.0)
        self.assertLessEqual(data["median_ndre"], 1.0)

        # Category distribution counts (30 High, 3 Moderate, 1 Background)
        self.assertEqual(data["high_vigour_count"], 30)
        self.assertEqual(data["moderate_vigour_count"], 3)
        self.assertEqual(data["background_count"], 1)
        self.assertEqual(data["high_vigour_count"] + data["moderate_vigour_count"] + data["background_count"], 34)

        # Spatial isolation & integrity
        self.assertEqual(data["block_mapping"], "unavailable")
        self.assertIn("not mapped to Palm Plantation Block_ID", data["disclaimer"])
        self.assertNotIn("Block_ID", data)

    def test_multispectral_tiles_endpoint_and_filtering(self):
        """Test GET /api/multispectral/tiles returns 34 records and supports sorting & filtering."""
        response = self.client.get("/api/multispectral/tiles")
        self.assertEqual(response.status_code, 200)
        records = response.get_json()
        self.assertEqual(len(records), 34)

        # Validate each record format, bounds, and absence of NaN/Inf or Block_ID
        for r in records:
            self.assertIn("tile_id", r)
            self.assertIn("filename", r)
            self.assertIn("canopy_cover_percentage", r)
            self.assertIn("multispectral_health_score", r)
            self.assertIn("canopy_ndvi_mean", r)
            self.assertIn("canopy_ndre_mean", r)
            self.assertIn("vigour_category", r)
            self.assertIn("block_mapping", r)
            self.assertEqual(r["block_mapping"], "unavailable")
            self.assertNotIn("Block_ID", r)

            # Score and cover bounds [0, 100]
            mhs = r["multispectral_health_score"]
            cover = r["canopy_cover_percentage"]
            self.assertFalse(math.isnan(mhs) or math.isinf(mhs))
            self.assertFalse(math.isnan(cover) or math.isinf(cover))
            self.assertGreaterEqual(mhs, 0.0)
            self.assertLessEqual(mhs, 100.0)
            self.assertGreaterEqual(cover, 0.0)
            self.assertLessEqual(cover, 100.0)

            # NDVI and NDRE bounds [-1.0, 1.0]
            ndvi = r["canopy_ndvi_mean"]
            ndre = r["canopy_ndre_mean"]
            self.assertFalse(math.isnan(ndvi) or math.isinf(ndvi))
            self.assertFalse(math.isnan(ndre) or math.isinf(ndre))
            self.assertGreaterEqual(ndvi, -1.0)
            self.assertLessEqual(ndvi, 1.0)
            self.assertGreaterEqual(ndre, -1.0)
            self.assertLessEqual(ndre, 1.0)

        # Category Filter: HIGH -> 30 tiles
        resp_high = self.client.get("/api/multispectral/tiles?health_category=HIGH")
        self.assertEqual(resp_high.status_code, 200)
        high_rows = resp_high.get_json()
        self.assertEqual(len(high_rows), 30)
        self.assertTrue(all("High" in r["vigour_category"] for r in high_rows))

        # Category Filter: MODERATE -> 3 tiles
        resp_mod = self.client.get("/api/multispectral/tiles?health_category=MODERATE")
        self.assertEqual(resp_mod.status_code, 200)
        mod_rows = resp_mod.get_json()
        self.assertEqual(len(mod_rows), 3)
        self.assertTrue(all("Moderate" in r["vigour_category"] for r in mod_rows))

        # Category Filter: BACKGROUND -> 1 tile
        resp_bg = self.client.get("/api/multispectral/tiles?health_category=BACKGROUND")
        self.assertEqual(resp_bg.status_code, 200)
        bg_rows = resp_bg.get_json()
        self.assertEqual(len(bg_rows), 1)
        self.assertTrue(any(k in bg_rows[0]["vigour_category"] for k in ["Non-Canopy", "Background"]))

        # Limit filter
        resp_limit = self.client.get("/api/multispectral/tiles?limit=5")
        self.assertEqual(resp_limit.status_code, 200)
        self.assertEqual(len(resp_limit.get_json()), 5)

        # Sorting: mhs_desc
        resp_sort = self.client.get("/api/multispectral/tiles?sort_by=mhs_desc")
        self.assertEqual(resp_sort.status_code, 200)
        sorted_rows = resp_sort.get_json()
        scores = [r["multispectral_health_score"] for r in sorted_rows]
        self.assertEqual(scores, sorted(scores, reverse=True))

    def test_multispectral_indices_endpoint(self):
        """Test GET /api/multispectral/indices returns all 34 tiles with valid spectral ranges."""
        response = self.client.get("/api/multispectral/indices")
        self.assertEqual(response.status_code, 200)
        records = response.get_json()
        self.assertEqual(len(records), 34)

        for r in records:
            self.assertIn("tile_id", r)
            self.assertIn("filename", r)
            self.assertIn("ndvi_mean", r)
            self.assertIn("ndre_mean", r)
            self.assertIn("high_health_canopy_pct", r)
            self.assertEqual(r["block_mapping"], "unavailable")
            self.assertNotIn("Block_ID", r)

            # Physical ranges
            self.assertGreaterEqual(r["ndvi_mean"], -1.0)
            self.assertLessEqual(r["ndvi_mean"], 1.0)
            self.assertGreaterEqual(r["ndre_mean"], -1.0)
            self.assertLessEqual(r["ndre_mean"], 1.0)
            self.assertGreaterEqual(r["high_health_canopy_pct"], 0.0)
            self.assertLessEqual(r["high_health_canopy_pct"], 100.0)

    def test_multispectral_visualizations_endpoint(self):
        """Test GET /api/multispectral/visualizations manifest and static file serving."""
        resp_manifest = self.client.get("/api/multispectral/visualizations")
        self.assertEqual(resp_manifest.status_code, 200)
        manifest = resp_manifest.get_json()
        self.assertEqual(len(manifest), 7)

        # Test each chart file is retrievable as valid image/png
        for chart in manifest:
            resp_file = self.client.get(chart["url"])
            self.assertEqual(resp_file.status_code, 200)
            self.assertEqual(resp_file.content_type, "image/png")
            self.assertGreater(len(resp_file.data), 1000)
            resp_file.close()

    def test_block_risk_isolation(self):
        """Verify that passing block parameters does not fabricate a block mapping."""
        for block_id in ["B001", "B002", "B005"]:
            resp = self.client.get(f"/api/multispectral/summary?block_id={block_id}")
            self.assertEqual(resp.status_code, 200)
            data = resp.get_json()
            self.assertEqual(data["block_mapping"], "unavailable")
            self.assertNotIn("Block_ID", data)
            self.assertEqual(data["tile_count"], 34)


if __name__ == "__main__":
    unittest.main()
