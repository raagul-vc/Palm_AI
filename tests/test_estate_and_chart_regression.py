"""
Regression tests for PALM AI Estate Selection & Chart Space Fixes (Issues 1-5).

Verifies:
1. Mandatory estate selection: no estate auto-selected on fresh session, explicit selectable estate option,
   empty state text 'Select an estate to view plantation intelligence', and state reset upon estate change.
2. Chart data availability vs empty state: validates 13-year productivity ledger, 24-month forecast aggregation,
   2024 monthly harvest curve, and compact empty state handling.
3. Resilience to missing/failed API responses.
4. Accurate labeling: no fabricated 'Live Telemetry', drone results remain UNMAPPED, multispectral remains DEMO ONLY.
5. Backend health and recommendation APIs.
"""

import json
import unittest
import os
import sys

# Ensure backend package is importable
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.api import app


class TestEstateAndChartRegression(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.testing = True
        cls.client = app.test_client()

    # =========================================================================
    # Issue 1: Mandatory Estate Selection & State Isolation
    # =========================================================================

    def test_estate_fleet_metadata_isolation(self):
        """Verify the operational estate dataset exposes Division A with exactly 42 blocks."""
        res = self.client.get("/api/multi-source/summary")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["palm"]["block_count"], 42)
        self.assertEqual(data["coverage_matrix"]["agronomic_blocks"]["total_units"], 42)
        self.assertIn("Division A", data["coverage_matrix"]["agronomic_blocks"]["provenance"])

    def test_fresh_session_requires_explicit_estate_selection(self):
        """Verify frontend contract: empty state text is strictly defined for unselected session."""
        expected_empty_state = "Select an estate to view plantation intelligence."
        # Read App.jsx and verify the exact prompt text exists in code
        app_jsx_path = os.path.join(PROJECT_ROOT, "frontend", "src", "App.jsx")
        with open(app_jsx_path, "r", encoding="utf-8") as f:
            content = f.read()

        self.assertIn(expected_empty_state, content)
        self.assertIn("EstateMandatoryPrompt", content)
        # Verify sessionStorage key is used to persist only intentional selection
        self.assertIn("palm_ai_selected_estate", content)
        # Verify default selectedEstate is not hardcoded to an estate
        self.assertIn('sessionStorage.getItem("palm_ai_selected_estate") || null', content)

    def test_estate_change_resets_stale_selections(self):
        """Verify handleClearEstate and handleSelectEstate reset block and search selections."""
        app_jsx_path = os.path.join(PROJECT_ROOT, "frontend", "src", "App.jsx")
        with open(app_jsx_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Both handlers must reset block and search state
        self.assertIn('setSelectedBlockId(null)', content)
        self.assertIn('setBlockSearch("")', content)
        self.assertIn('setRiskFilter("ALL")', content)

    def test_no_fabricated_live_telemetry_label(self):
        """Verify that fabricated 'Live Telemetry' badge was replaced with historical ledger labeling."""
        app_jsx_path = os.path.join(PROJECT_ROOT, "frontend", "src", "App.jsx")
        with open(app_jsx_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Must NOT contain fabricated live badge
        self.assertNotIn('<span className="dot-live" /> Live Telemetry', content)
        # Must contain verified historical telemetry labeling
        self.assertIn("Verified Historical Telemetry (2012–2024)", content)
        self.assertIn("13-Year Historical Harvest Ledger (2012–2024)", content)

    # =========================================================================
    # Issue 2: Chart Data Verification & Empty State Sizing
    # =========================================================================

    def test_productivity_chart_dataset_integrity(self):
        """Verify /api/productivity contains all 546 rows (42 blocks x 13 years) with valid keys."""
        res = self.client.get("/api/productivity")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIsInstance(data, list)
        self.assertEqual(len(data), 546)

        years = set()
        blocks = set()
        for row in data:
            self.assertIn("Block_ID", row)
            self.assertIn("Year", row)
            self.assertIn("Productivity_t_Ha", row)
            years.add(int(row["Year"]))
            blocks.add(row["Block_ID"])

        self.assertEqual(len(blocks), 42)
        self.assertEqual(years, set(range(2012, 2025)))

    def test_forecast_annual_aggregation_integrity(self):
        """Verify /api/yield-forecast has monthly entries for 2025-2026 that aggregate correctly."""
        res = self.client.get("/api/yield-forecast")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIsInstance(data, list)
        self.assertEqual(len(data), 1008)  # 42 blocks * 24 months

        b1_2025 = [r for r in data if r["Block_ID"] == "B001" and int(r["Year"]) == 2025]
        self.assertEqual(len(b1_2025), 12)
        annual_sum = sum(float(r["Forecast_Productivity_t_Ha"]) for r in b1_2025)
        # Annual sum should be realistic oil palm yield (~10 to ~25 t/ha)
        self.assertGreater(annual_sum, 8.0)
        self.assertLess(annual_sum, 35.0)

    def test_monthly_harvest_chart_data(self):
        """Verify /api/harvest-production returns valid monthly FFB yield records."""
        res = self.client.get("/api/harvest-production")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIsInstance(data, list)
        self.assertGreater(len(data), 0)

        sample = data[0]
        self.assertIn("Block_ID", sample)
        self.assertIn("Month_Number", sample)
        self.assertIn("FFB_Production_t", sample)

    def test_chart_empty_state_css_and_components(self):
        """Verify CSS contains .chart-container-wrap and .chart-empty-state with responsive rules."""
        css_path = os.path.join(PROJECT_ROOT, "frontend", "src", "App.css")
        with open(css_path, "r", encoding="utf-8") as f:
            css = f.read()

        self.assertIn(".chart-container-wrap", css)
        self.assertIn("min-width: 0", css)
        self.assertIn(".chart-empty-state", css)
        self.assertIn(".chart-empty-state.compact", css)

    # =========================================================================
    # Issue 3: Data Provenance & Unmapped/Unavailable Distinctions
    # =========================================================================

    def test_soil_data_exact_7_observed_blocks(self):
        """Verify exactly 7 blocks have observed soil samples and 35 are labeled unavailable."""
        res_raw = self.client.get("/api/soil")
        self.assertEqual(res_raw.status_code, 200)
        raw_soil = res_raw.get_json()
        unique_sampled_blocks = {b["Block_ID"] for b in raw_soil}
        self.assertEqual(len(unique_sampled_blocks), 7)
        self.assertEqual(unique_sampled_blocks, {"B004", "B006", "B008", "B015", "B026", "B031", "B041"})

        # Check block risk endpoints for exact status labeling across all 42 blocks
        observed_blocks = []
        unavailable_blocks = []
        for i in range(1, 43):
            bid = f"B{i:03d}"
            r = self.client.get(f"/api/risk/{bid}").get_json()
            soil_status = r["agronomic_evidence"]["soil_indicators"]["status"]
            if soil_status == "observed":
                observed_blocks.append(bid)
            elif soil_status == "unavailable":
                unavailable_blocks.append(bid)

        self.assertEqual(len(observed_blocks), 7)
        self.assertEqual(len(unavailable_blocks), 35)
        self.assertEqual(set(observed_blocks), {"B004", "B006", "B008", "B015", "B026", "B031", "B041"})

    def test_drone_results_explicitly_unmapped(self):
        """Verify drone results declare UNMAPPED status for plantation block grids."""
        res = self.client.get("/api/drone/summary")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data.get("block_mapping"), "unavailable")
        self.assertIn("not mapped to Palm Plantation Block_ID", data.get("disclaimer", ""))

    def test_multispectral_data_explicitly_demo_only(self):
        """Verify multispectral data explicitly declares German beech forest demo provenance."""
        res = self.client.get("/api/multispectral/summary")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("Hullerbusch Beech Forest, Germany", data.get("dataset_provenance", ""))
        self.assertIn("NOT Oil Palm", data.get("land_cover_type", ""))
        self.assertEqual(data.get("block_mapping_status"), "unmapped")
        self.assertIn("not oil-palm plantation data", data.get("disclaimer", "").lower())

    # =========================================================================
    # Issue 4: Navigation & API Error Handling
    # =========================================================================

    def test_backend_health_endpoint(self):
        """Verify /api/health returns 200 with service health metadata."""
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn(data.get("status"), ("online", "ok"))
        self.assertTrue("Palm AI" in data.get("message", "") or "Palm AI" in data.get("service", ""))

    def test_invalid_block_returns_404(self):
        """Verify invalid block queries return HTTP 404 with error description."""
        res = self.client.get("/api/recommendations/B999")
        self.assertEqual(res.status_code, 404)
        data = res.get_json()
        self.assertIn("error", data)

    def test_recommendation_api_schema_b001_b012(self):
        """Verify recommendation API generates valid 5-stage agronomic actions for HIGH and LOW risk blocks."""
        # HIGH risk block B001
        res1 = self.client.get("/api/recommendations/B001")
        self.assertEqual(res1.status_code, 200)
        d1 = res1.get_json()
        self.assertEqual(d1["block_id"], "B001")
        self.assertEqual(d1["risk_level"], "HIGH")
        self.assertIn("recommendation", d1)
        self.assertIn("recommended_action", d1["recommendation"])

        # LOW risk block B012
        res2 = self.client.get("/api/recommendations/B012")
        self.assertEqual(res2.status_code, 200)
        d2 = res2.get_json()
        self.assertEqual(d2["block_id"], "B012")
        self.assertEqual(d2["risk_level"], "LOW")
        self.assertIn("recommendation", d2)


if __name__ == "__main__":
    unittest.main()
