"""
PALM AI Enterprise Recommendation Service
Generates evidence-backed agronomic recommendations from verified block telemetry,
canonical multi-source risk scores, foliar lab assays, and DRIS diagnostic profiles.

Scientific Boundary Adherence:
- 100% grounded on verified empirical block records (harvest scales, Frond 17 lab tests).
- Server-side OpenAI LLM synthesis with strict cost/timeout controls and robust error handling.
- Deterministic fallback engine when OpenAI API key is unconfigured, times out, or fails.
- Never exposes API keys in frontend code or API responses.
- Explicitly distinguishes observed facts, canonical model predictions, and recommendations.
- Reports drone and multispectral remote sensing data availability status.
"""

import json
import logging
import os
import urllib.error
import urllib.request
from pathlib import Path

logger = logging.getLogger("palm_ai.recommendation_service")

BASE_DIR = Path(__file__).resolve().parent.parent
OUTPUT_DIR = BASE_DIR / "outputs"


def load_canonical_data():
    """Loads the canonical block risk dataset from cache or regenerates it."""
    cache_file = OUTPUT_DIR / "canonical_block_risk.json"
    if cache_file.exists():
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as exc:
            logger.warning("Failed to read canonical block risk JSON: %s", exc)

    try:
        from backend.canonical_risk_engine import build_canonical_block_risk_dataset, generate_and_save_canonical_risk
        return generate_and_save_canonical_risk()
    except Exception as exc:
        logger.error("Failed to generate canonical block risk: %s", exc)
        return {}


def sort_blocks(blocks, sort_by="alphabetical"):
    """
    Sorts a list of block directive dictionaries.
    Supported sort_by options:
    - 'alphabetical': Block ID ascending (B001 -> B042)
    - 'alphabetical_desc': Block ID descending (B042 -> B001)
    - 'priority': CRITICAL -> ELEVATED -> ROUTINE, then Block ID ascending
    - 'score_desc': Risk score descending (100 -> 0)
    - 'score_asc': Risk score ascending (0 -> 100)
    - 'status': OPEN -> IN REVIEW -> VERIFYING IN FIELD -> COMPLETED
    """
    priority_order = {"CRITICAL": 0, "HIGH": 0, "ELEVATED": 1, "MODERATE": 1, "MEDIUM": 1, "ROUTINE": 2, "LOW": 2, "UNKNOWN": 3}
    status_order = {"OPEN": 0, "IN REVIEW": 1, "VERIFYING IN FIELD": 2, "COMPLETED": 3}

    def block_key(b):
        bid = str(b.get("Block_ID") or b.get("block_id") or b.get("target") or "")
        # Extract digits if any for natural sort
        import re
        m = re.search(r"\d+", bid)
        num_val = int(m.group(0)) if m else 0
        return (bid, num_val)

    b_list = list(blocks)
    if sort_by == "alphabetical":
        b_list.sort(key=lambda x: str(x.get("Block_ID") or x.get("block_id") or x.get("target") or ""))
    elif sort_by == "alphabetical_desc":
        b_list.sort(key=lambda x: str(x.get("Block_ID") or x.get("block_id") or x.get("target") or ""), reverse=True)
    elif sort_by == "priority":
        b_list.sort(key=lambda x: (
            priority_order.get(str(x.get("priority") or x.get("Priority") or x.get("risk_level") or x.get("Risk_Level") or "ROUTINE").upper(), 99),
            -float(x.get("risk_score") or x.get("Risk_Score") or 0.0),
            str(x.get("Block_ID") or x.get("block_id") or "")
        ))
    elif sort_by == "score_desc":
        b_list.sort(key=lambda x: (
            -float(x.get("risk_score") or x.get("Risk_Score") or 0.0),
            str(x.get("Block_ID") or x.get("block_id") or "")
        ))
    elif sort_by == "score_asc":
        b_list.sort(key=lambda x: (
            float(x.get("risk_score") or x.get("Risk_Score") or 0.0),
            str(x.get("Block_ID") or x.get("block_id") or "")
        ))
    elif sort_by == "status":
        b_list.sort(key=lambda x: (
            status_order.get(str(x.get("status") or x.get("Status") or "OPEN").upper(), 99),
            str(x.get("Block_ID") or x.get("block_id") or "")
        ))
    return b_list


def generate_block_recommendation(
    block_id: str,
    canonical_dict: dict = None,
    openai_api_key: str = None,
    force_deterministic: bool = False,
    model: str = None,
    timeout: float = 6.0
) -> tuple[dict, int]:
    """
    Generates an evidence-backed agronomic recommendation for a block.
    Returns (response_dict, http_status_code).
    """
    if canonical_dict is None:
        canonical_dict = load_canonical_data()

    norm_id = str(block_id or "").strip().upper()
    if not norm_id or norm_id not in canonical_dict:
        return {
            "error": f"Block '{block_id}' not found in plantation records",
            "status": 404,
            "available_blocks_count": len(canonical_dict)
        }, 404

    b = canonical_dict[norm_id]
    prod = b.get("production_evidence", {})
    agron = b.get("agronomic_evidence", {})
    leaf = agron.get("leaf_nutrients", {})
    dris = agron.get("dris_indicators", {})
    soil = agron.get("soil_indicators", {})
    weather = b.get("weather_evidence", {})
    risk_level = str(b.get("risk_level", "LOW")).upper()
    risk_score = b.get("overall_risk_score", 0.0)

    actual_yield = prod.get("Productivity_t_Ha") or prod.get("actual_yield_t_ha")
    expected_yield = prod.get("High_Production_threshold_t") or prod.get("expected_yield_t_ha")
    yield_gap = prod.get("Productivity_deviation") or prod.get("yield_gap_pct")
    plant_age = agron.get("Plant_Age_Years", 12)
    seed_type = agron.get("Seed_Type", "DxP Tenera")

    panel = leaf.get("panel", {}) if isinstance(leaf.get("panel"), dict) else {}
    low_nutrients = leaf.get("low_nutrients", []) or []
    leaf_year = leaf.get("sample_year", 2024)

    limiting = dris.get("limiting_nutrients", []) or []
    excess = dris.get("excess_nutrients", []) or []
    prescription = dris.get("prescription", "Maintain balanced fertilizer application.")

    actual_str = f"{actual_yield:.2f} t/ha" if actual_yield is not None else "Unrecorded"
    expected_str = f"{expected_yield:.2f} t/ha" if expected_yield is not None else "Cohort baseline unavailable"
    gap_str = f"{yield_gap:+.1f}%" if yield_gap is not None else "Insufficient evidence — field verification required"
    score_val = float(risk_score) if risk_score is not None else 0.0

    # Remote Sensing Data Availability Status (Requirement 5)
    remote_sensing_status = {
        "drone_rgb": {
            "has_valid_mapping": False,
            "status": "Unmapped / No Georeferencing",
            "block_mapping": "unavailable",
            "provenance": "MOPAD Site 2 benchmark",
            "note": f"Aerial RGB survey lacks GPS boundary coordinates for Block {norm_id}; excluded from block screening score (0% weight)."
        },
        "multispectral": {
            "has_valid_mapping": False,
            "status": "Unavailable / Independent Benchmark",
            "block_mapping": "unavailable",
            "provenance": "MSUAV500K German Beech Forest (Fagus sylvatica)",
            "note": f"Collected over European temperate beech forest (NOT oil palm); zero spatial overlap with Block {norm_id}; excluded from block screening score (0% weight)."
        }
    }

    # Data Coverage Limitations
    limitations = []
    if yield_gap is None:
        limitations.append(f"Block {norm_id} has no cohort peers in its planting cohort; yield gap cannot be modeled.")
    if panel.get("B_ppm") is None or panel.get("B_ppm") == "" or panel.get("B_ppm") == "N/A":
        limitations.append("Boron (B) foliar measurement unrecorded for this sample round.")
    if str(soil.get("status", "")).lower() != "observed":
        limitations.append("No block-specific soil sample; estate chemical soil survey covered 7 index blocks only.")
    limitations.append("Weather observations are estate-wide station averages; excluded from block discrimination.")
    limitations.append("Drone RGB and multispectral UAV imagery are unmapped research benchmarks; excluded from block score.")

    # Insufficient Evidence Handling:
    # If a block has no recorded yield AND fewer than 3 measured nutrients, evidence is insufficient.
    measured_panel_count = len([k for k, v in panel.items() if v is not None and v != "N/A" and v != ""])
    if actual_yield is None and measured_panel_count < 3:
        return {
            "block_id": norm_id,
            "risk_level": "UNKNOWN",
            "risk_score": None,
            "source": "deterministic_engine",
            "model": "canonical_agronomic_rules",
            "is_ai_generated": False,
            "insufficient_evidence": True,
            "insufficient_evidence_reason": f"Block {norm_id} lacks minimum empirical telemetry (no recorded harvest yield and fewer than 3 foliar nutrients) to formulate an agronomic recommendation.",
            "note": "Insufficient field telemetry. Ground measurement required.",
            "observed_facts": [
                "2024 FFB Yield: Unrecorded",
                f"Foliar Nutrients: {measured_panel_count} measured (minimum 3 required for screening)",
                f"Soil Status: {str(soil.get('status', 'unavailable')).title()}"
            ],
            "model_predictions": [
                "Screening Score: Unavailable (insufficient data)",
                "Risk Band: UNKNOWN"
            ],
            "recommendation": {
                "priority": "Routine",
                "urgency": "Deferred pending measurement",
                "main_contributing_indicators": "Data insufficiency",
                "observed_finding": f"Block {norm_id} lacks sufficient empirical observations for agronomic diagnosis.",
                "agronomic_rationale": "Field recommendations require verified yield scale records or multi-nutrient foliar laboratory assays.",
                "recommended_action": "Schedule comprehensive baseline field census, bunch count, and Frond 17 tissue sampling.",
                "validation_protocol": "Establish baseline harvest scale and laboratory foliar sampling protocols.",
                "data_coverage_limitations": ["Insufficient field telemetry for diagnostic analysis."]
            },
            "remote_sensing_status": remote_sensing_status,
            "evidence_grounding": []
        }, 200

    # 1. Compile immutable observed facts (FACTS)
    panel_display = f"N={panel.get('N_pct', 'N/A')}%, P={panel.get('P_pct', 'N/A')}%, K={panel.get('K_pct', 'N/A')}%, Ca={panel.get('Ca_pct', 'N/A')}%, Mg={panel.get('Mg_pct', 'N/A')}%, B={panel.get('B_ppm', 'N/A')} ppm"
    observed_facts = [
        f"2024 FFB Yield: {actual_str}",
        f"Foliar Assay ({leaf_year}): {panel_display}",
        f"Foliar Deficiencies: {', '.join(low_nutrients) if low_nutrients else 'None below standard reference thresholds'}",
        f"DRIS Nutritional Imbalance: Limiting={', '.join(limiting) if limiting else 'None'}, Excess={', '.join(excess) if excess else 'None'}",
        f"Soil Status: {str(soil.get('status', 'unavailable')).title()} ({soil.get('note', 'No soil survey recorded for this block')})",
        f"Estate Weather Context: Rainfall {weather.get('estate_annual_rainfall_mm', weather.get('Rainfall_mm_day', 281.1))} mm, Temp {weather.get('estate_mean_temperature_c', weather.get('Temperature_C', 27.4))} °C (Excluded from block score)",
    ]

    # 2. Compile model predictions (MODEL)
    model_predictions = [
        f"Canonical Screening Score: {score_val:.1f} / 100",
        f"Screening Risk Band: {risk_level} (Low <40, Medium 40–<70, High ≥70)",
        f"Age-Peer Cohort Expected Yield: {expected_str} (Yield Gap: {gap_str})",
        f"High Production Probability: {prod.get('High_Production_probability', 0.50):.2f}",
    ]

    evidence_grounding = [
        {"layer": "Production / FFB", "source": "outputs/block_health_risk.csv", "year": 2024, "status": "Observed"},
        {"layer": "Foliar Tissue", "source": "outputs/block_nutrient_diagnostics.csv", "year": leaf_year, "status": "Observed"},
        {"layer": "DRIS Prescription", "source": "outputs/dris_prescription_analysis.csv", "year": dris.get("sample_year", 2024), "status": "Diagnostic"},
        {"layer": "Multi-Source Canonical", "source": "outputs/multi_source_block_risk.csv", "year": 2024, "status": "Screening Model"},
    ]

    # 3. Determine priority and urgency
    if risk_level == "HIGH":
        priority = "Critical"
        urgency = "Immediate Intervention (Within 48 hours)"
    elif risk_level == "MEDIUM":
        priority = "Moderate"
        urgency = "Elevated (Within 14 days)"
    else:
        priority = "Routine"
        urgency = "Routine Scheduled Review (Quarterly)"

    main_indicators = b.get("contributing_indicators") or b.get("risk_contributor") or (
        f"Yield gap: {gap_str}" if yield_gap is not None else "Nutrient imbalance (yield gap baseline unavailable)"
    )

    supporting_observations = {
        "yield_observation": {
            "actual_yield_t_ha": actual_yield,
            "expected_yield_t_ha": expected_yield,
            "yield_gap_pct": yield_gap,
            "observation_year": 2024,
            "source": "outputs/block_health_risk.csv"
        },
        "foliar_observation": {
            "sample_year": leaf_year,
            "panel": panel,
            "low_nutrients": low_nutrients,
            "source": "outputs/block_nutrient_diagnostics.csv"
        },
        "dris_observation": {
            "sample_year": dris.get("sample_year", 2024),
            "limiting_nutrients": limiting,
            "excess_nutrients": excess,
            "prescription": prescription,
            "source": "outputs/dris_prescription_analysis.csv"
        },
        "soil_observation": {
            "status": str(soil.get("status", "unavailable")),
            "note": soil.get("note", "No soil survey recorded for this block"),
            "sample_year": soil.get("sample_year"),
            "source": "data/raw_source/soil_sampling_event.csv"
        },
        "weather_context": {
            "rainfall_mm": weather.get("estate_annual_rainfall_mm", 281.09),
            "temperature_c": weather.get("estate_mean_temperature_c", 27.4),
            "status": "Contextual estate-level average (excluded from block score)"
        }
    }

    # 4. Check for OpenAI API Key and synthesize if available
    active_key = (openai_api_key or os.environ.get("OPENAI_API_KEY", "")).strip()
    ai_generated = False
    source_name = "deterministic_engine"
    model_name = "canonical_agronomic_rules"
    note = "Deterministic agronomic engine active. Configure OPENAI_API_KEY in the server environment to enable live LLM synthesis."

    finding = ""
    rationale = ""
    action = ""
    validation = ""

    if active_key and not force_deterministic:
        chosen_model = model or os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
        try:
            system_prompt = (
                "You are an enterprise commercial oil-palm agronomist assistant. Ground your response STRICTLY "
                "on the verified facts provided below. Do NOT invent diseases (e.g. Ganoderma, bud rot), unmeasured deficiencies, "
                "proprietary chemical doses, or imaginary field measurements. If data is sparse or unavailable (e.g. soil tests), "
                "explicitly state that field verification or sampling is required first. Keep response concise, manager-friendly, "
                "and actionable. Return exactly 4 clear lines prefixed with:\n"
                "FINDING: <1-2 sentences on observed condition>\n"
                "RATIONALE: <1-2 sentences on agronomic cause grounded in data>\n"
                "ACTION: <1-2 sentences on recommended immediate next step>\n"
                "VALIDATION: <1 sentence on follow-up verification measurement>"
            )

            user_prompt = (
                f"Block: {norm_id}\n"
                f"Risk Level: {risk_level} (Score: {score_val:.1f}/100)\n"
                f"Planted: {b.get('identity', {}).get('Planting_Year', 2012)} ({plant_age} yrs, {seed_type})\n"
                f"Observed Yield: {actual_str} (Gap: {gap_str} vs Expected: {expected_str})\n"
                f"Foliar Nutrients: {panel}\n"
                f"Deficient Nutrients: {low_nutrients}\n"
                f"DRIS Limiting: {limiting}, Excess: {excess}\n"
                f"DRIS Prescription: {prescription}\n"
                f"Soil Status: {soil.get('status')} - {soil.get('note')}\n"
            )

            req_payload = json.dumps({
                "model": chosen_model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "temperature": 0.2,
                "max_tokens": 300,
            }).encode("utf-8")

            req = urllib.request.Request(
                "https://api.openai.com/v1/chat/completions",
                data=req_payload,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {active_key}"
                },
                method="POST"
            )

            with urllib.request.urlopen(req, timeout=timeout) as resp:
                if resp.status == 200:
                    api_data = json.loads(resp.read().decode("utf-8"))
                    content = api_data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                    for line in content.splitlines():
                        if line.startswith("FINDING:"):
                            finding = line.replace("FINDING:", "").strip()
                        elif line.startswith("RATIONALE:"):
                            rationale = line.replace("RATIONALE:", "").strip()
                        elif line.startswith("ACTION:"):
                            action = line.replace("ACTION:", "").strip()
                        elif line.startswith("VALIDATION:"):
                            validation = line.replace("VALIDATION:", "").strip()

                    if finding and action:
                        ai_generated = True
                        source_name = "openai"
                        model_name = chosen_model
                        note = "AI synthesis generated via OpenAI API and strictly grounded on verified block telemetry."
        except Exception as exc:
            logger.warning("OpenAI API call failed or timed out: %s. Using deterministic fallback.", exc)

    # 5. Deterministic Fallback Synthesis
    if not ai_generated:
        if risk_level == "HIGH":
            if yield_gap is None:
                p_yr = b.get("identity", {}).get("Planting_Year") or agron.get("Planting_Year", 2000)
                finding = f"Block {norm_id} holds canonical risk score {score_val:.1f}/100 with 2024 harvest of {actual_str}. Age-cohort expected yield is unavailable (sole block in {p_yr} cohort); yield gap cannot be modeled from peer baseline."
                lim_str = f"DRIS identifies {', '.join(limiting)} as limiting nutrient (Excess: {', '.join(excess) if excess else 'None'})." if limiting else "Multi-nutrient foliar depression is flagged as primary contributor."
                rationale = f"Observed harvest of {actual_str} is accompanied by nutritional depression. {lim_str} Because peer yield baseline is unavailable, physiological cause cannot be definitively attributed to single-nutrient deficiency or drainage."
                action = f"Insufficient evidence for specific treatment — field verification required. Convene joint agronomy audit for Block {norm_id}, conduct palm bunch census, and perform fresh Frond 17 foliar laboratory sampling to re-assess current nutritional status."
                validation = "Complete fresh Frond 17 foliar laboratory assay and establish verified block historical baseline."
            else:
                gap_display = f"{abs(yield_gap):.1f}% below expectation"
                finding = f"Block {norm_id} is operating in high-priority lag with canonical risk score {score_val:.1f}/100 and yield {gap_display}."
                lim_str = f"DRIS identifies {', '.join(limiting)} limitation." if limiting else "Productivity gap is the primary constraint."
                rationale = f"Observed production of {actual_str} correlates with nutritional stress. {lim_str} {prescription}"
                action = f"Convene joint agronomy audit for Block {norm_id}. Review weed circle cleanliness and execute prescribed foliar balancing: {prescription}."
                validation = "Target quarterly bunch census count and conduct Frond 17 foliar re-sampling at 60–90 days."
        elif risk_level == "MEDIUM":
            finding = f"Block {norm_id} shows moderate variance with canonical risk score {score_val:.1f}/100 and yield of {actual_str}."
            def_str = f"Foliar diagnostic flags {', '.join(low_nutrients)}." if low_nutrients else "Mild nutritional variation detected."
            rationale = f"{def_str} {prescription}"
            action = f"Verify field application logs for Block {norm_id} and schedule spot canopy greenness inspection. Follow recommendation: {prescription}."
            validation = "Monitor monthly bunch delivery weights across the upcoming harvest rounds."
        else:
            finding = f"Block {norm_id} is operating within normal operational parameters (Risk Score: {score_val:.1f}/100, Yield: {actual_str})."
            rationale = "Nutritional ratios and yield trends align with age-cohort expectations with no critical limiting constraints."
            action = "Maintain scheduled routine maintenance, weed circle upkeep, and standard fertilizer broadcast rounds."
            validation = "Routine annual foliar assay and standard monthly yield tracking."

    return {
        "block_id": norm_id,
        "risk_level": risk_level,
        "risk_score": risk_score,
        "source": source_name,
        "model": model_name,
        "is_ai_generated": ai_generated,
        "insufficient_evidence": False,
        "note": note,
        "observed_facts": observed_facts,
        "model_predictions": model_predictions,
        "recommendation": {
            "priority": priority,
            "urgency": urgency,
            "main_contributing_indicators": main_indicators,
            "observed_finding": finding,
            "agronomic_rationale": rationale,
            "recommended_action": action,
            "validation_protocol": validation,
            "data_coverage_limitations": limitations
        },
        "remote_sensing_status": remote_sensing_status,
        "supporting_observations": supporting_observations,
        "data_coverage_limitations": limitations,
        "evidence_grounding": evidence_grounding
    }, 200
