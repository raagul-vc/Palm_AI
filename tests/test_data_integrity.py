import json
import math
import re
import unittest
from pathlib import Path

import pandas as pd

from backend.api import app

BASE = Path(__file__).resolve().parent.parent


class PalmDataIntegrityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = app.test_client()
        cls.master = pd.read_csv(BASE / "data" / "Palm_AI_Master_FFB_Leaf_Soil_Weather.csv")

    def test_core_dataset_counts(self):
        response = self.client.get("/api/data-quality")
        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        findings = {item["label"]: item for item in body["findings"]}
        self.assertEqual(findings["Master observations"]["value"], "6,552")
        self.assertIn("42 blocks", findings["Master observations"]["detail"])
        self.assertEqual(body["soil_sample_count"], 8)
        self.assertEqual(body["period_start"], 2012)
        self.assertEqual(body["period_end"], 2024)

    def test_flask_serves_built_frontend_and_spa_fallback(self):
        root = self.client.get("/")
        self.assertEqual(root.status_code, 200)
        html = root.get_data(as_text=True)
        self.assertIn("Palm AI", html)
        root.close()
        script_match = re.search(r'<script[^>]+src="([^"]+\.js)"', html)
        self.assertIsNotNone(script_match)
        script_path = script_match.group(1)
        script = self.client.get(script_path)
        self.assertEqual(script.status_code, 200)
        self.assertIn("javascript", script.content_type)
        script.close()
        deep_url = self.client.get("/productivity/yield-forecast")
        self.assertEqual(deep_url.status_code, 200)
        self.assertIn('id="root"', deep_url.get_data(as_text=True))
        deep_url.close()
        self.assertEqual(self.client.get("/api/not-a-route").status_code, 404)

    def test_nutrient_api_has_all_blocks_and_null_boron(self):
        response = self.client.get("/api/nutrients")
        rows = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(rows), 42)
        b001 = next(row for row in rows if row["Block_ID"] == "B001")
        self.assertIsNone(b001["B_ppm"])
        self.assertEqual(b001["B_ppm_Status"], "NO_DATA")
        self.assertEqual(b001["Available_Nutrient_Count"], 5)
        self.assertEqual(b001["Data_Status"], "Partial nutrient panel (5 of 6 measured)")
        self.assertIn("B001", {row["Block_ID"] for row in rows})

    def test_nutrient_summary_uses_valid_block_denominators(self):
        rows = self.client.get("/api/nutrients").get_json()
        summaries = {row["Nutrient"]: row for row in self.client.get("/api/nutrient-reference").get_json()}
        for nutrient, summary in summaries.items():
            status = f"{nutrient}_Status"
            valid = [row for row in rows if row[status] in {"LOW", "NORMAL", "HIGH"}]
            low = [row for row in valid if row[status] == "LOW"]
            missing = [row for row in rows if row[status] not in {"LOW", "NORMAL", "HIGH"}]
            self.assertEqual(int(summary["Valid_Blocks"]), len(valid))
            self.assertEqual(int(summary["Low_Blocks"]), len(low))
            self.assertEqual(int(summary["Missing_Blocks"]), len(missing))
        self.assertEqual(int(summaries["B_ppm"]["Valid_Blocks"]), 31)
        self.assertEqual(int(summaries["B_ppm"]["Missing_Blocks"]), 11)

    def test_unknown_block_is_empty_not_misjoined(self):
        for route in ("nutrients", "soil", "risk", "multi-source-risk", "yield-forecast"):
            response = self.client.get(f"/api/{route}?block_id=NOT_A_BLOCK")
            self.assertEqual(response.status_code, 200, route)
            self.assertEqual(response.get_json(), [], route)

    def test_forecast_endpoint_matches_saved_cache(self):
        saved = pd.read_csv(BASE / "outputs" / "yield_forecast_cache.csv")
        response = self.client.get("/api/yield-forecast")
        rows = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(rows), len(saved))
        self.assertEqual(set(row["Year"] for row in rows), {2025, 2026})
        api_total = sum(row["Forecast_FFB_t"] for row in rows if row["Year"] == 2025)
        saved_total = saved.loc[saved.Year.eq(2025), "Forecast_FFB_t"].sum()
        self.assertAlmostEqual(api_total, saved_total, places=8)

    def test_monthly_and_annual_production_reconcile(self):
        monthly = pd.DataFrame(self.client.get("/api/harvest-production").get_json())
        annual = pd.DataFrame(self.client.get("/api/production").get_json())
        monthly_totals = monthly.groupby("Year")["FFB_Production_t"].sum().sort_index()
        annual_totals = annual.set_index("Year")["FFB_Production_t"].sort_index()
        pd.testing.assert_series_equal(monthly_totals, annual_totals, check_names=False, check_exact=False, atol=1e-8)

    def test_source_units_reconcile_with_expected_rounding(self):
        rows = self.master
        ffb_delta = (rows["FFB_Production_t"] - rows["FFB_Production_kg"] / 1000).abs()
        self.assertEqual(int(ffb_delta.gt(0.00051).sum()), 0)
        productivity_delta = (rows["Productivity_t_Ha"] - rows["FFB_Production_t"] / rows["Area_Ha"]).abs()
        self.assertEqual(int(productivity_delta.gt(0.001).sum()), 0)

    def test_peer_deviation_and_minimum_peer_rule(self):
        rows = pd.read_csv(BASE / "outputs" / "block_health_risk.csv")
        limited = rows[rows["Expected_Peer_Count"] < 3]
        self.assertTrue(limited["Expected_Yield_t_Ha"].isna().all())
        self.assertTrue(limited["Productivity_Deviation_pct"].isna().all())
        enough = rows[rows["Expected_Peer_Count"] >= 3]
        expected = (enough["Actual_Yield_t_Ha"] - enough["Expected_Yield_t_Ha"]) / enough["Expected_Yield_t_Ha"] * 100
        self.assertTrue((expected - enough["Productivity_Deviation_pct"]).abs().lt(1e-9).all())

    def test_risk_score_is_reproducible_from_available_components(self):
        rows = pd.read_csv(BASE / "outputs" / "multi_source_block_risk.csv")
        for _, row in rows.iterrows():
            components = [
                ("Yield_Risk_Component", "Effective_Yield_Weight_pct"),
                ("Nutrient_Risk_Component", "Effective_Nutrient_Weight_pct"),
                ("DRIS_Risk_Component", "Effective_DRIS_Weight_pct"),
            ]
            available = [(row[c], row[w]) for c, w in components if pd.notna(row[c]) and pd.notna(row[w]) and row[w] > 0]
            self.assertTrue(available)
            self.assertLessEqual(abs(sum(weight for _, weight in available) - 100.0), 0.11)
            score = sum(value * weight for value, weight in available) / 100
            self.assertLessEqual(abs(score - row["Multi_Source_Risk_Score"]), 0.06)

    def test_api_json_has_no_nonstandard_nan_tokens(self):
        for route in ("nutrients", "nutrient-reference", "soil", "risk", "multi-source-risk", "yield-forecast", "data-quality"):
            body = self.client.get(f"/api/{route}").get_data(as_text=True)
            self.assertNotIn(": NaN", body, route)
            json.loads(body, parse_constant=lambda value: self.fail(f"Invalid JSON constant {value} in /api/{route}"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
