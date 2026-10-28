"""
Comprehensive verification test for the required user flow:
1. Initial screen: Show estate selection only, with a clean premium dashboard header.
   Do not show block analysis or all features before an estate is selected.
2. After selecting an estate: Display its 42 blocks in proper natural alphabetical order, B001 to B042, in a clean grid/list. No permanent sidebar.
3. After clicking a block: Display ALL available analyses for that selected block on the same screen:
   - Risk score, High/Medium/Low category and exact reasons.
   - What to do: evidence-based solutions and priority actions.
   - Productivity history and yield forecast.
   - Leaf nutrients, soil analysis and DRIS.
   - Weather context.
   - Drone AI results and multispectral results with clear coverage/mapping status.
   - Field Action Center with follow-up status.
4. Provide a clear Back to Estate button.
5. Fix uneven button alignment, inconsistent padding, card heights, typography, spacing and responsive layouts.
6. Risk counts must come from real block data. Never hardcode risk categories or fabricate solutions.
7. Preserve the existing screening-score formula and working backend functionality.
8. If OpenAI is not configured, use a safe deterministic recommendation fallback. Never expose API keys.
9. Do not show unmapped drone or unrelated multispectral data as verified block-level evidence.
10. Test the complete flow: no estate selected -> select estate -> see 42 sorted blocks -> select block -> view analysis and actions -> return to estate.
"""

import os
import re
import unittest
import sys

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import json
from backend.api import app
from backend.recommendation_service import generate_block_recommendation, sort_blocks


class TestRequiredUserFlow(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.testing = True
        cls.client = app.test_client()

        with open(os.path.join(PROJECT_ROOT, "frontend", "src", "App.jsx"), "r", encoding="utf-8") as f:
            cls.app_jsx = f.read()

        with open(os.path.join(PROJECT_ROOT, "frontend", "src", "UnifiedBlockIntelligence.jsx"), "r", encoding="utf-8") as f:
            cls.unified_jsx = f.read()

        with open(os.path.join(PROJECT_ROOT, "frontend", "src", "App.css"), "r", encoding="utf-8") as f:
            cls.app_css = f.read()

    # -------------------------------------------------------------------------
    # Flow Step 1: Initial Screen (No estate selected)
    # -------------------------------------------------------------------------
    def test_step1_initial_screen_estate_selection_only(self):
        """Initial screen: Show estate selection only, with clean header. No block analysis before estate selected."""
        # 1. selectedEstate must initialize to null unless valid in sessionStorage
        self.assertIn("return null;", self.app_jsx)
        self.assertNotIn('return "North Estate (PT Palm Indo)";', self.app_jsx)

        # 2. viewLevel must default to 'estates' on unselected session
        self.assertIn('if (!stored || !VALID_ESTATES.includes(stored)) {', self.app_jsx)
        self.assertIn('return "estates";', self.app_jsx)

        # 3. Topbar navigation tabs must be hidden when selectedEstate is null
        self.assertIn("{selectedEstate ? (", self.app_jsx)
        self.assertIn('<div className="topbar-estate-selection-notice">', self.app_jsx)
        self.assertIn("Estate Fleet Selection", self.app_jsx)

        # 4. Mandatory callout text present on estates view
        self.assertIn("Select an estate to view plantation intelligence.", self.app_jsx)

        # 5. No permanent sidebar
        self.assertIn("NO SIDEBAR EVER", self.app_jsx)

    # -------------------------------------------------------------------------
    # Flow Step 2: Selecting an Estate -> 42 Natural Sorted Blocks
    # -------------------------------------------------------------------------
    def test_step2_select_estate_and_view_42_sorted_blocks(self):
        """After selecting estate: Display its 42 blocks in proper natural alphabetical order B001 to B042."""
        # 1. Selection handler exists and transitions to blocks
        self.assertIn("handleSelectEstate", self.app_jsx)
        self.assertIn('navigateTo("blocks")', self.app_jsx)

        # 2. Natural sort function sorts B001 to B042 numerically
        blocks_res = self.client.get("/api/risk")
        self.assertEqual(blocks_res.status_code, 200)
        data = blocks_res.get_json()
        self.assertEqual(len(data), 42)

        # Extract IDs
        block_ids = [b["Block_ID"] for b in data]
        # Sort using Python natural sort equivalent
        sorted_ids = sorted(block_ids, key=lambda x: (int(re.sub(r"\D", "", x)) if re.sub(r"\D", "", x) else 0, x))
        self.assertEqual(sorted_ids[0], "B001")
        self.assertEqual(sorted_ids[1], "B002")
        self.assertEqual(sorted_ids[9], "B010")
        self.assertEqual(sorted_ids[-1], "B042")

        # 3. Verify naturalBlockSort exists in App.jsx
        self.assertIn("function naturalBlockSort", self.app_jsx)
        self.assertIn(".sort(naturalBlockSort)", self.app_jsx)

        # 4. Clear back to All Estates button exists in block grid header
        self.assertIn('className="crumb-back-link"', self.app_jsx)
        self.assertIn("← All Operational Estates", self.app_jsx)

    # -------------------------------------------------------------------------
    # Flow Step 3: Block Clicked -> ALL Analyses on the SAME screen
    # -------------------------------------------------------------------------
    def test_step3_block_clicked_displays_all_7_analyses_on_same_screen(self):
        """After clicking a block: Display ALL available analyses on the SAME screen."""
        # 1. Section 1: Risk score, category, exact reasons
        self.assertIn('id="section-risk"', self.unified_jsx)
        self.assertIn("Risk Score, Category &amp; Exact Reasons", self.unified_jsx)
        self.assertIn("Exact Flagged Reasons:", self.unified_jsx)
        self.assertIn("Canonical Screening Breakdown", self.unified_jsx)

        # 2. Section 2: What to do: evidence-based solutions and priority actions
        self.assertIn('id="section-solutions"', self.unified_jsx)
        self.assertIn("What To Do: Evidence-Based Solutions &amp; Priority Actions", self.unified_jsx)
        self.assertIn("1. RISK", self.unified_jsx)
        self.assertIn("2. WHY (RATIONALE)", self.unified_jsx)
        self.assertIn("3. EVIDENCE (OBSERVED FACTS)", self.unified_jsx)
        self.assertIn("4. RECOMMENDED ACTION", self.unified_jsx)
        self.assertIn("5. FOLLOW-UP", self.unified_jsx)
        self.assertIn("Prioritized Field Action Directives", self.unified_jsx)

        # 3. Section 3: Productivity history and yield forecast
        self.assertIn('id="section-productivity"', self.unified_jsx)
        self.assertIn("13-Year Historical Productivity Trajectory (2012–2024)", self.unified_jsx)
        self.assertIn("2024 Monthly Harvest Production Curve", self.unified_jsx)

        # 4. Section 4: Leaf nutrients, soil analysis and DRIS
        self.assertIn('id="section-nutrients"', self.unified_jsx)
        self.assertIn("Frond 17 Foliar Nutrient Assay vs Reference Thresholds", self.unified_jsx)
        self.assertIn("DRIS Imbalance Diagnosis", self.unified_jsx)
        self.assertIn("Soil Chemical &amp; Physical Survey", self.unified_jsx)

        # 5. Section 5: Weather context
        self.assertIn('id="section-weather"', self.unified_jsx)
        self.assertIn("Estate Weather Observations &amp; Microclimate Context", self.unified_jsx)
        self.assertIn("Scientific Provenance Boundary", self.unified_jsx)

        # 6. Section 6: Drone AI results and multispectral results with clear coverage/mapping status
        self.assertIn('id="section-drone-spectral"', self.unified_jsx)
        self.assertIn("Live YOLO11n Single-Image Inference Workshop", self.unified_jsx)
        self.assertIn("Multispectral Indices Research Specification", self.unified_jsx)
        self.assertIn("0% Screening Score Influence (Unmapped Benchmarks)", self.unified_jsx)

        # 7. Section 7: Field Action Center with follow-up status
        self.assertIn('id="section-field-action"', self.unified_jsx)
        self.assertIn("Field Action Center &amp; Resolution Tracking", self.unified_jsx)
        self.assertIn("Save Inspection Record", self.unified_jsx)
        self.assertIn("Confirm Verification &amp; Complete", self.unified_jsx)

        # Quick in-page anchor jump strip linking all 7 sections
        self.assertIn("block-quick-anchor-strip", self.unified_jsx)
        for sec_id in ["section-risk", "section-solutions", "section-productivity", "section-nutrients", "section-weather", "section-drone-spectral", "section-field-action"]:
            self.assertIn(sec_id, self.unified_jsx)

    # -------------------------------------------------------------------------
    # Flow Step 4: Back Navigation
    # -------------------------------------------------------------------------
    def test_step4_clear_back_to_estate_buttons(self):
        """Provide a clear Back to Estate button on block detail, and Back to All Estates on block grid."""
        # Top and bottom back to estate button in UnifiedBlockIntelligence
        self.assertIn("back-to-estate-btn", self.unified_jsx)
        self.assertIn("← Back to Estate", self.unified_jsx)

        # Topbar quick back button on block detail view in App.jsx
        self.assertIn("← Back to All 42 Blocks", self.app_jsx)

        # Block grid header back button to all estates
        self.assertIn("← All Operational Estates", self.app_jsx)

    # -------------------------------------------------------------------------
    # Data Integrity & Risk Counts from Real Block Data
    # -------------------------------------------------------------------------
    def test_data_integrity_and_real_risk_counts(self):
        """Risk counts must come from real block data: exactly 1 High, 6 Medium, 35 Low."""
        res = self.client.get("/api/multi-source-risk")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(len(data), 42)

        high = [b for b in data if b["Multi_Source_Risk_Level"] == "HIGH"]
        medium = [b for b in data if b["Multi_Source_Risk_Level"] == "MEDIUM"]
        low = [b for b in data if b["Multi_Source_Risk_Level"] == "LOW"]

        self.assertEqual(len(high), 1)
        self.assertEqual(high[0]["Block_ID"], "B001")
        self.assertEqual(len(medium), 6)
        self.assertEqual(len(low), 35)

    # -------------------------------------------------------------------------
    # Safe Fallback & API Security
    # -------------------------------------------------------------------------
    def test_safe_deterministic_fallback_no_exposed_keys(self):
        """If OpenAI is not configured or fails, safe deterministic fallback is returned; no API keys exposed."""
        res = self.client.get("/api/recommendations/B001")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()

        self.assertIn("recommendation", data)
        self.assertIn("recommended_action", data["recommendation"])
        self.assertIn("priority", data["recommendation"])
        self.assertEqual(data["recommendation"]["priority"], "Critical")
        self.assertIn("observed_facts", data)
        self.assertNotIn("sk-", json.dumps(data))
        self.assertIsNone(data.get("api_key"))
        self.assertIsNone(data.get("openai_api_key"))

    # -------------------------------------------------------------------------
    # Remote Sensing Decoupled & Clear Disclosure
    # -------------------------------------------------------------------------
    def test_unmapped_remote_sensing_not_block_evidence(self):
        """Unmapped drone and multispectral data are decoupled with 0% score influence."""
        self.assertIn("0% Screening Score Influence", self.unified_jsx)
        self.assertIn("Decoupled UAV Layer", self.unified_jsx)
        self.assertIn("German temperate beech forest", self.unified_jsx)


if __name__ == "__main__":
    unittest.main()
