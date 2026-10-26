import unittest
from pathlib import Path
from backend.api import app

BASE = Path(__file__).resolve().parent.parent


class DroneHealthApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = app.test_client()

    def test_drone_summary_endpoint(self):
        """Test GET /api/drone/summary returns 200 and matches validated baseline metrics."""
        response = self.client.get("/api/drone/summary")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()

        # Image count & confidence
        self.assertEqual(data["image_count"], 500)
        self.assertEqual(data["baseline_confidence"], 0.25)
        self.assertEqual(data["recommended_confidence"], 0.25)

        # Baseline health scores & percentages
        self.assertAlmostEqual(data["mean_health_score"], 75.81, places=1)
        self.assertAlmostEqual(data["median_health_score"], 89.19, places=1)
        self.assertAlmostEqual(data["healthy_percentage"], 78.28, places=1)
        self.assertAlmostEqual(data["dead_percentage"], 0.19, places=1)
        self.assertAlmostEqual(data["small_percentage"], 20.28, places=1)
        self.assertAlmostEqual(data["yellow_percentage"], 1.25, places=1)
        self.assertAlmostEqual(data["grass_percentage"], 0.41, places=1)

        # Score & percentage bounds (0-100)
        self.assertGreaterEqual(data["mean_health_score"], 0.0)
        self.assertLessEqual(data["mean_health_score"], 100.0)
        self.assertGreaterEqual(data["healthy_percentage"], 0.0)
        self.assertLessEqual(data["healthy_percentage"], 100.0)
        self.assertGreaterEqual(data["non_healthy_percentage"], 0.0)
        self.assertLessEqual(data["non_healthy_percentage"], 100.0)

        # Outlier counts
        self.assertEqual(data["zero_detection_count"], 0)
        self.assertEqual(data["low_detection_count"], 17)
        self.assertEqual(data["health_outlier_count"], 59)
        self.assertEqual(data["total_outliers_flagged"], 89)

        # Spatial isolation & integrity
        self.assertEqual(data["block_mapping"], "unavailable")
        self.assertIn("not mapped to Palm Plantation Block_ID", data["disclaimer"])
        self.assertNotIn("Block_ID", data)

    def test_drone_images_endpoint_and_pagination(self):
        """Test GET /api/drone/images returns 500 records and respects filtering."""
        # Full query
        response = self.client.get("/api/drone/images")
        self.assertEqual(response.status_code, 200)
        records = response.get_json()
        self.assertEqual(len(records), 500)

        # Check fields and bounds of first record
        sample = records[0]
        self.assertIn("image_filename", sample)
        self.assertIn("palm_detections", sample)
        self.assertIn("drone_health_score", sample)
        self.assertIn("health_category", sample)
        self.assertIn("block_mapping", sample)
        self.assertEqual(sample["block_mapping"], "unavailable")
        self.assertNotIn("Block_ID", sample)

        # Ensure all scores and percentages are within [0, 100]
        for r in records:
            score = r["drone_health_score"]
            self.assertGreaterEqual(score, 0.0)
            self.assertLessEqual(score, 100.0)
            self.assertGreaterEqual(r["healthy_percentage"], 0.0)
            self.assertLessEqual(r["healthy_percentage"], 100.0)
            self.assertGreaterEqual(r["non_healthy_palm_percentage"], 0.0)
            self.assertLessEqual(r["non_healthy_palm_percentage"], 100.0)
            self.assertIn(r["health_category"], ["HIGH", "MODERATE", "LOW"])

        # Limit filter
        resp_limit = self.client.get("/api/drone/images?limit=10")
        self.assertEqual(resp_limit.status_code, 200)
        limit_data = resp_limit.get_json()
        self.assertIsInstance(limit_data, list)
        self.assertEqual(len(limit_data), 10)

        # Category filter: HIGH
        resp_high = self.client.get("/api/drone/images?health_category=HIGH")
        self.assertEqual(resp_high.status_code, 200)
        high_rows = resp_high.get_json()
        self.assertEqual(len(high_rows), 328)
        self.assertTrue(all(r["health_category"] == "HIGH" for r in high_rows))

        # Outlier only filter
        resp_outliers = self.client.get("/api/drone/images?outlier_only=true")
        self.assertEqual(resp_outliers.status_code, 200)
        outlier_rows = resp_outliers.get_json()
        self.assertEqual(len(outlier_rows), 89)
        self.assertTrue(all(r["is_outlier"] for r in outlier_rows))

    def test_drone_validation_endpoint(self):
        """Test GET /api/drone/validation returns threshold stability and robustness."""
        response = self.client.get("/api/drone/validation")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()

        self.assertEqual(data["baseline_confidence"], 0.25)
        self.assertEqual(data["recommended_confidence"], 0.25)

        # Threshold experiment has 5 thresholds
        thresh_exp = data["threshold_experiment"]
        self.assertEqual(len(thresh_exp), 5)
        thresholds_tested = [row["confidence_threshold"] for row in thresh_exp]
        self.assertEqual(thresholds_tested, [0.25, 0.40, 0.50, 0.60, 0.75])

        # Robustness table has 5 rows
        rob_rows = data["score_robustness"]
        self.assertEqual(len(rob_rows), 5)
        # Check Pearson correlation at 0.40 is >= 0.999
        r40 = next(r for r in rob_rows if r["confidence_threshold"] == 0.40)
        self.assertGreaterEqual(r40["pearson_correlation"], 0.999)
        self.assertLessEqual(r40["mean_absolute_difference"], 1.0)

        # Confidence summary
        conf_summary = data["detection_confidence_summary"]
        self.assertEqual(len(conf_summary), 5)
        class_names = {c["class_name"] for c in conf_summary}
        self.assertEqual(class_names, {"Healthy", "Dead", "Small", "Yellow", "Grass"})

    def test_drone_outliers_endpoint(self):
        """Test GET /api/drone/outliers returns transparent statistical rules and 89 outliers."""
        response = self.client.get("/api/drone/outliers")
        self.assertEqual(response.status_code, 200)
        outliers = response.get_json()
        self.assertIsInstance(outliers, list)
        self.assertEqual(len(outliers), 89)

        # Verify first outlier has transparent rule
        first = outliers[0]
        self.assertIn("outlier_categories", first)
        self.assertIn("statistical_rules_triggered", first)
        self.assertIn("scientific_characterization", first)
        self.assertEqual(first["block_mapping"], "unavailable")
        self.assertNotIn("Block_ID", first)

    def test_drone_visualizations_manifest_and_serving(self):
        """Test GET /api/drone/visualizations and individual chart file serving."""
        resp_manifest = self.client.get("/api/drone/visualizations")
        self.assertEqual(resp_manifest.status_code, 200)
        charts = resp_manifest.get_json()
        self.assertEqual(len(charts), 6)

        # Test serving chart 1
        resp_chart1 = self.client.get("/api/drone/visualizations/1_health_score_by_confidence_threshold.png")
        self.assertEqual(resp_chart1.status_code, 200)
        self.assertEqual(resp_chart1.content_type, "image/png")
        self.assertGreater(len(resp_chart1.get_data()), 50000)
        resp_chart1.close()

    def test_drone_block_isolation(self):
        """Verify querying with block_id does NOT fabricate Block_ID or filter drone summary."""
        # Querying drone summary with ?block_id=B001 should ignore it and keep block_mapping: unavailable
        resp = self.client.get("/api/drone/summary?block_id=B001")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data["block_mapping"], "unavailable")
        self.assertEqual(data["image_count"], 500)
        self.assertNotIn("Block_ID", data)

    def test_drone_predict_endpoint(self):
        """Test POST /api/drone/predict with an actual aerial survey image."""
        img_path = BASE / "drone" / "outputs" / "yolo_error_analysis" / "class_confusions" / "44000_16000_149_2457_confusion_1.jpg"
        self.assertTrue(img_path.exists(), f"Sample test image missing at {img_path}")

        with open(img_path, "rb") as f:
            resp = self.client.post(
                "/api/drone/predict",
                data={"image": f, "conf": "0.25"},
                content_type="multipart/form-data"
            )

        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()

        # Required fields
        required_keys = [
            "filename", "dimensions", "confidence_threshold", "total_detections",
            "palm_detections", "drone_health_score", "healthy_count", "small_count",
            "yellow_count", "dead_count", "grass_count", "class_counts", "detections",
            "annotated_image", "model_info", "disclaimer"
        ]
        for key in required_keys:
            self.assertIn(key, data, f"Missing key '{key}' in prediction response")

        # Metric assertions
        self.assertGreater(data["palm_detections"], 0)
        self.assertGreaterEqual(data["total_detections"], data["palm_detections"])
        self.assertGreaterEqual(data["drone_health_score"], 0.0)
        self.assertLessEqual(data["drone_health_score"], 100.0)
        self.assertTrue(data["annotated_image"].startswith("data:image/jpeg;base64,"))
        self.assertEqual(data["confidence_threshold"], 0.25)
        self.assertEqual(data["model_info"]["name"], "YOLO11n (palm_yolo_best.pt)")

    def test_drone_predict_get_schema(self):
        """Test GET /api/drone/predict returns endpoint schema and parameters documentation."""
        resp = self.client.get("/api/drone/predict")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data["endpoint"], "/api/drone/predict")
        self.assertEqual(data["method"], "POST")
        self.assertEqual(data["max_file_size_mb"], 10)
        self.assertIn("parameters", data)
        self.assertEqual(data["status"], "ready")

    def test_drone_predict_validation_errors(self):
        """Test POST /api/drone/predict error handling for missing and invalid uploads."""
        import io
        from PIL import Image

        # 1. No file provided
        resp_no_file = self.client.post("/api/drone/predict")
        self.assertEqual(resp_no_file.status_code, 400)
        self.assertIn("error", resp_no_file.get_json())

        # 2. Unsupported extension (.txt)
        resp_bad_ext = self.client.post(
            "/api/drone/predict",
            data={"image": (io.BytesIO(b"not an image"), "sample.txt")},
            content_type="multipart/form-data"
        )
        self.assertEqual(resp_bad_ext.status_code, 400)
        self.assertIn("Unsupported file extension", resp_bad_ext.get_json()["error"])

        # 3. Empty file (0 bytes)
        resp_empty = self.client.post(
            "/api/drone/predict",
            data={"image": (io.BytesIO(b""), "empty.jpg")},
            content_type="multipart/form-data"
        )
        self.assertEqual(resp_empty.status_code, 400)
        self.assertIn("empty", resp_empty.get_json()["error"].lower())

        # 4. Tiny image (< 16x16)
        tiny_img = Image.new("RGB", (8, 8), color="green")
        tiny_buf = io.BytesIO()
        tiny_img.save(tiny_buf, format="JPEG")
        tiny_buf.seek(0)
        resp_tiny = self.client.post(
            "/api/drone/predict",
            data={"image": (tiny_buf, "tiny.jpg")},
            content_type="multipart/form-data"
        )
        self.assertEqual(resp_tiny.status_code, 400)
        self.assertIn("too small", resp_tiny.get_json()["error"].lower())


if __name__ == "__main__":
    unittest.main()

