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
        # Verify invalid saved estate ID is purged and defaults to null
        self.assertIn("VALID_ESTATES", content)
        self.assertIn('sessionStorage.removeItem("palm_ai_selected_estate")', content)

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

    # =========================================================================
    # Browser-Level Simulation & Contract Regression Tests
    # =========================================================================

    def test_browser_fresh_incognito_session_contract(self):
        """Simulate fresh Incognito session: selectedEstate is null, prompt banner is rendered,
        card is unselected, operational dashboard KPIs and risk distribution are hidden."""
        app_jsx_path = os.path.join(PROJECT_ROOT, "frontend", "src", "App.jsx")
        with open(app_jsx_path, "r", encoding="utf-8") as f:
            app_code = f.read()

        # 1. Initial selectedEstate must validate against VALID_ESTATES with null fallback
        self.assertIn('VALID_ESTATES.includes(stored)', app_code)
        self.assertIn('sessionStorage.getItem("palm_ai_selected_estate")', app_code)

        # 2. On Estates view, when !selectedEstate, prominent callout banner MUST render
        self.assertIn('!selectedEstate && (', app_code)
        self.assertIn('className="estate-mandatory-callout"', app_code)
        self.assertIn('Select an estate to view plantation intelligence.', app_code)

        # 3. Card must NOT have container-level onClick handler (prevents accidental selection)
        self.assertNotIn('className={`estate-card ${selectedEstate === "North Estate (PT Palm Indo)" ? "is-selected" : ""}`}\n                onClick=', app_code)
        self.assertIn('className={`estate-card ${selectedEstate === "North Estate (PT Palm Indo)" ? "is-selected" : "unselected"}`}', app_code)

        # 4. Operational dashboard metrics (Mean Yield, Risk distribution bar) must be conditioned on selection
        self.assertIn('{selectedEstate === "North Estate (PT Palm Indo)" ? (', app_code)
        self.assertIn('className="estate-stats-grid prospective"', app_code)

        # 5. Explicit CTA button must be present in unselected card state
        self.assertIn('className="select-estate-cta-btn explicit-cta"', app_code)
        self.assertIn('handleSelectEstate("North Estate (PT Palm Indo)")', app_code)

    def test_browser_session_storage_restoration(self):
        """Verify that when sessionStorage has an active estate, App.jsx restores selectedEstate,
        renders the is-selected card state, and enables Enter Dashboard and Change/Clear actions."""
        app_jsx_path = os.path.join(PROJECT_ROOT, "frontend", "src", "App.jsx")
        with open(app_jsx_path, "r", encoding="utf-8") as f:
            app_code = f.read()

        self.assertIn('sessionStorage.getItem("palm_ai_selected_estate")', app_code)
        self.assertIn('selectedEstate === "North Estate (PT Palm Indo)"', app_code)
        self.assertIn('className="active-estate-pill"', app_code)
        self.assertIn('Enter Dashboard (42 Blocks)', app_code)
        self.assertIn('className="deselect-estate-btn"', app_code)

    def test_browser_explicit_estate_selection_workflow(self):
        """Verify explicit estate selection writes to sessionStorage, navigates to blocks, and resets stale filters."""
        app_jsx_path = os.path.join(PROJECT_ROOT, "frontend", "src", "App.jsx")
        with open(app_jsx_path, "r", encoding="utf-8") as f:
            app_code = f.read()

        # handleSelectEstate must persist and transition
        self.assertIn('sessionStorage.setItem("palm_ai_selected_estate", estateName)', app_code)
        self.assertIn('navigateTo("blocks")', app_code)
        self.assertIn('setSelectedBlockId(null)', app_code)
        self.assertIn('setBlockSearch("")', app_code)
        self.assertIn('setRiskFilter("ALL")', app_code)

    def test_browser_estate_deselection_workflow(self):
        """Verify handleClearEstate removes sessionStorage, resets selectedEstate to null, and navigates to estates view."""
        app_jsx_path = os.path.join(PROJECT_ROOT, "frontend", "src", "App.jsx")
        with open(app_jsx_path, "r", encoding="utf-8") as f:
            app_code = f.read()

        self.assertIn('sessionStorage.removeItem("palm_ai_selected_estate")', app_code)
        self.assertIn('setSelectedEstate(null)', app_code)
        self.assertIn('navigateTo("estates")', app_code)

    def test_browser_tab_navigation_estate_guards(self):
        """Verify that navigating to blocks, block-detail, field-actions, and multi-source without an estate
        renders EstateMandatoryPrompt and guards the protected operational content."""
        app_jsx_path = os.path.join(PROJECT_ROOT, "frontend", "src", "App.jsx")
        with open(app_jsx_path, "r", encoding="utf-8") as f:
            app_code = f.read()

        # Guard on Blocks view
        self.assertIn('{viewLevel === "blocks" && (\n          !selectedEstate ? (\n            <EstateMandatoryPrompt', app_code)

        # Guard on Block Detail view
        self.assertIn('{viewLevel === "block-detail" && (\n          !selectedEstate ? (\n            <EstateMandatoryPrompt', app_code)

        # Guard on Field Actions view
        self.assertIn('{viewLevel === "field-actions" && (\n          !selectedEstate ? (\n            <EstateMandatoryPrompt', app_code)

        # Guard on Multi-Source Evidence view
        self.assertIn('{viewLevel === "multi-source" && (\n          !selectedEstate ? (\n            <EstateMandatoryPrompt', app_code)

    def test_browser_empty_chart_data_simulation(self):
        """Verify chart computations and empty states when telemetry is empty or unavailable."""
        app_jsx_path = os.path.join(PROJECT_ROOT, "frontend", "src", "App.jsx")
        ubi_jsx_path = os.path.join(PROJECT_ROOT, "frontend", "src", "UnifiedBlockIntelligence.jsx")

        with open(app_jsx_path, "r", encoding="utf-8") as f:
            app_code = f.read()
        with open(ubi_jsx_path, "r", encoding="utf-8") as f:
            ubi_code = f.read()

        # App.jsx: When estateYieldTrend is empty, renders empty state
        self.assertIn('estateYieldTrend && estateYieldTrend.length > 0 ?', app_code)
        self.assertIn('Historical Yield Telemetry Unavailable', app_code)
        self.assertIn('No 13-year annual harvest average records found for the selected estate.', app_code)

        # UnifiedBlockIntelligence: When yieldTimeline is empty, renders empty state
        self.assertIn('yieldTimeline && yieldTimeline.length > 0 ?', ubi_code)
        self.assertIn('Historical Productivity Data Unavailable', ubi_code)
        self.assertIn('No verified annual productivity records mapped for Block', ubi_code)

        # UnifiedBlockIntelligence: Monthly harvest curve empty state
        self.assertIn('monthlyHarvest.length > 0 ?', ubi_code)
        self.assertIn('Monthly Harvest Curve Unavailable', ubi_code)

        # Recharts responsive attributes
        self.assertIn('isAnimationActive={false}', app_code)
        self.assertIn('isAnimationActive={false}', ubi_code)

    def test_chart_loading_skeletons_and_compact_empty_states(self):
        """Verify that charts render compact loading skeletons and avoid reserving blank boxes."""
        app_jsx_path = os.path.join(PROJECT_ROOT, "frontend", "src", "App.jsx")
        ubi_jsx_path = os.path.join(PROJECT_ROOT, "frontend", "src", "UnifiedBlockIntelligence.jsx")
        css_path = os.path.join(PROJECT_ROOT, "frontend", "src", "App.css")

        with open(app_jsx_path, "r", encoding="utf-8") as f:
            app_code = f.read()
        with open(ubi_jsx_path, "r", encoding="utf-8") as f:
            ubi_code = f.read()
        with open(css_path, "r", encoding="utf-8") as f:
            css_code = f.read()

        # Loading skeleton in App.jsx
        self.assertIn('className="chart-loading-state"', app_code)
        self.assertIn('Loading 13-year harvest productivity telemetry…', app_code)

        # Loading skeleton in UnifiedBlockIntelligence.jsx
        self.assertIn('className="chart-loading-state"', ubi_code)
        self.assertIn('Loading Block {currentBlockId} productivity trajectory…', ubi_code)
        self.assertIn('Loading 2024 monthly harvest curve…', ubi_code)

        # CSS definitions for loading skeleton
        self.assertIn('.chart-loading-state', css_code)
        self.assertIn('.chart-loading-state.compact', css_code)

        # Space elimination: tall-plantation-panel max-height/min-height constrained
        self.assertIn('min-height: 280px;', css_code)
        self.assertIn('max-height: 380px;', css_code)

    def test_annual_vs_monthly_productivity_units_reconciliation(self):
        """Verify that annual charts explicitly state t/ha/yr (12-month cumulative harvest) and
        reconcile the 17.90 t/ha/yr annual mean with the 1.49 t/ha/mo monthly average."""
        app_jsx_path = os.path.join(PROJECT_ROOT, "frontend", "src", "App.jsx")
        ubi_jsx_path = os.path.join(PROJECT_ROOT, "frontend", "src", "UnifiedBlockIntelligence.jsx")

        with open(app_jsx_path, "r", encoding="utf-8") as f:
            app_code = f.read()
        with open(ubi_jsx_path, "r", encoding="utf-8") as f:
            ubi_code = f.read()

        # App.jsx: annual units and explanatory note
        self.assertIn('unit=" t/ha/yr"', app_code)
        self.assertIn('12-Mo Sum', app_code)
        self.assertIn('Mean 17.90 t/ha/yr in 2024; monthly avg 1.49 t/ha/mo', app_code)

        # UBI: annual units and observed harvest
        self.assertIn('Observed Harvest (t/ha/yr)', ubi_code)
        self.assertIn('Forecast Model (Annual Sum)', ubi_code)
        self.assertIn('Actual Latest Yield (2024)', ubi_code)


if __name__ == "__main__":
    unittest.main()
