from typing import Dict, Any, Tuple, List, Optional

class RiskScoringEngine:
    """
    Transparent Operational Risk Intelligence Engine for ThermoGuard AI.
    Computes a deterministic situational hazard index (0 to 100) independent of classification confidence.
    
    Formula:
    Risk Index = (W_thermal * S_thermal) +
                 (W_proximity * S_proximity) +
                 (W_source * S_source) +
                 (W_temporal * S_temporal)
                 
    Mathematically Normalized Weights (normalized from base 30%, 25%, 25%, 12%, sum=92%):
    - W_thermal   = 30 / 92 ≈ 0.326087 (32.61%)
    - W_proximity = 25 / 92 ≈ 0.271739 (27.17%)
    - W_source    = 25 / 92 ≈ 0.271739 (27.17%)
    - W_temporal  = 12 / 92 ≈ 0.130435 (13.04%)
    Total = 1.0 (100.0%)
                 
    Risk Bands:
    - 0.0 to 35.0   -> LOW       (Routine surveillance / Informational)
    - 35.1 to 65.0  -> MEDIUM    (Surveillance monitoring / Logged)
    - 65.1 to 85.0  -> HIGH      (Priority inspection & alert dispatch)
    - 85.1 to 100.0 -> CRITICAL  (Emergency response dispatch / Immediate notification)
    """

    WEIGHTS = {
        "thermal_intensity": 0.30 / 0.92,
        "hazard_proximity": 0.25 / 0.92,
        "source_hazard": 0.25 / 0.92,
        "temporal_behavior": 0.12 / 0.92
    }

    SOURCE_HAZARD_FACTORS = {
        "Industrial Fire": 1.00,       # Severe threat to human life, capital, and catastrophic explosion
        "Wildfire": 0.85,              # Fast-moving threat to forest canopy, biodiversity, settlements
        "Mining": 0.50,                # Spontaneous sub-surface coal seam oxidation hazard
        "Agricultural Burning": 0.35,  # Regional particulate air quality and stubble hazard
        "Other": 0.30,                 # Non-standard or transient thermal anomaly
        "Gas Flare": 0.25              # Controlled, engineered routine industrial exhaust
    }

    @classmethod
    def calculate_risk(
        cls,
        predicted_class: str,
        frp: float,
        brightness: float,
        distance_to_industry_m: float,
        persistence_days: int,
        recurrence_ratio: float,
        distance_to_infrastructure_m: Optional[float] = None,
        facility_count: int = 0
    ) -> Tuple[str, float, Dict[str, float], List[str], str]:
        """
        Calculates normalized risk score (0-100), categorical band, component breakdown,
        structured reasons, and actionable response recommendations.
        """
        reasons: List[str] = []

        # ----------------------------------------------------
        # 1. Thermal Intensity Component (0 - 100)
        # ----------------------------------------------------
        # FRP scaled from 0 to 150 MW; Brightness scaled from 310 to 400 K
        frp_norm = min(100.0, (frp / 150.0) * 100.0)
        bright_norm = min(100.0, max(0.0, (brightness - 310.0) / 90.0) * 100.0)
        s_thermal = round(0.65 * frp_norm + 0.35 * bright_norm, 1)

        if frp >= 100.0:
            reasons.append(f"Severe thermal radiative power ({round(frp, 1)} MW) exceeds emergency surge threshold (100 MW)")
        elif frp >= 45.0:
            reasons.append(f"Elevated radiative intensity ({round(frp, 1)} MW) indicative of vigorous combustion")
        else:
            reasons.append(f"Thermal radiative power ({round(frp, 1)} MW) remains within moderate non-critical range")

        # ----------------------------------------------------
        # 2. Industrial Hazard Proximity Component (0 - 100)
        # ----------------------------------------------------
        if distance_to_industry_m <= 300.0:
            s_proximity = 100.0
            reasons.append(f"Immediate proximity ({int(distance_to_industry_m)} m) to major industrial installation")
        elif distance_to_industry_m <= 1000.0:
            s_proximity = 80.0
            reasons.append(f"Close proximity ({int(distance_to_industry_m)} m) to industrial facilities")
        elif distance_to_industry_m <= 3000.0:
            s_proximity = 50.0
            reasons.append(f"Intermediate distance ({round(distance_to_industry_m/1000.0, 1)} km) from industrial perimeter")
        elif distance_to_industry_m <= 10000.0:
            s_proximity = 20.0
            reasons.append(f"Perimeter buffer distance ({round(distance_to_industry_m/1000.0, 1)} km) from nearest facility")
        else:
            s_proximity = 5.0
            reasons.append(f"Remote location ({round(distance_to_industry_m/1000.0, 1)} km from nearest industrial complex)")

        # Controlled flare discount: if classified as planned Gas Flare, proximity hazard is controlled
        if predicted_class == "Gas Flare":
            s_proximity = s_proximity * 0.35
            reasons.append("Proximity risk attenuated: stationary location aligns with designated flare stack containment")

        # ----------------------------------------------------
        # 3. Inherent Source Type Hazard (0 - 100)
        # ----------------------------------------------------
        hazard_mult = cls.SOURCE_HAZARD_FACTORS.get(predicted_class, 0.30)
        s_source = round(hazard_mult * 100.0, 1)

        if predicted_class == "Industrial Fire":
            reasons.append("Critical source classification: uncontrolled industrial fires present immediate explosion and life-safety hazards")
        elif predicted_class == "Wildfire":
            reasons.append("High source hazard: active forest wildfire presents ecological destruction and propagation risks")
        elif predicted_class == "Mining":
            reasons.append("Moderate source hazard: subsurface coal oxidation presents smoldering coal bed methane ignition risks")
        elif predicted_class == "Agricultural Burning":
            reasons.append("Moderate source hazard: open crop stubble burning poses severe seasonal particulate air pollution (AQI impact)")
        elif predicted_class == "Gas Flare":
            reasons.append("Low operational threat: planned combustion designed for refinery pressure management")

        # ----------------------------------------------------
        # 4. Temporal Behavior & Urgency Component (0 - 100)
        # ----------------------------------------------------
        # Sudden-onset high-FRP spikes are acute emergencies;
        # Continuous long-duration steady flares are routine;
        # Continuous unattended forest/industrial burns are compounding risks.
        if persistence_days <= 2 and s_thermal >= 55.0:
            s_temporal = 90.0
            reasons.append("Acute sudden onset: abrupt thermal surge without prior continuous baseline indicates active ignition event")
        elif persistence_days >= 30 and predicted_class == "Gas Flare":
            s_temporal = 25.0
            reasons.append("Long-term historical persistence confirms routine steady-state operational flaring")
        elif persistence_days >= 20 and predicted_class in ["Wildfire", "Industrial Fire"]:
            s_temporal = 85.0
            reasons.append(f"Uncontained multi-week persistence ({persistence_days} days) signals failing containment")
        elif persistence_days <= 3:
            s_temporal = 40.0
            reasons.append("Short duration / transient observation window")
        else:
            s_temporal = 50.0

        # ----------------------------------------------------
        # 5. Critical Infrastructure Proximity Component (0 - 100)
        # ----------------------------------------------------
        if distance_to_infrastructure_m is not None:
            if distance_to_infrastructure_m <= 250.0:
                s_infra = 100.0
                reasons.append(f"High infrastructure threat: within {int(distance_to_infrastructure_m)} m of pipeline / energy transmission line")
            elif distance_to_infrastructure_m <= 1000.0:
                s_infra = 65.0
            elif distance_to_infrastructure_m <= 3000.0:
                s_infra = 35.0
            else:
                s_infra = 10.0
        else:
            s_infra = 20.0  # Baseline neutral

        # ----------------------------------------------------
        # Total Weighted Composite Risk Index (0 - 100)
        # Normalized weights: 30/92 thermal, 25/92 proximity, 25/92 source, 12/92 temporal
        # ----------------------------------------------------
        total_risk = (
            cls.WEIGHTS["thermal_intensity"] * s_thermal +
            cls.WEIGHTS["hazard_proximity"] * s_proximity +
            cls.WEIGHTS["source_hazard"] * s_source +
            cls.WEIGHTS["temporal_behavior"] * s_temporal
        )
        total_risk = round(min(100.0, max(0.0, total_risk)), 1)

        # Map to Categorical Operational Risk Band
        if total_risk >= 85.0:
            band = "CRITICAL"
            action = (
                "EMERGENCY DISPATCH: Activate Tier-3 industrial emergency response; "
                "alert district fire control room, facility safety commissioner, and state disaster management authority."
            )
        elif total_risk >= 65.0:
            band = "HIGH"
            action = (
                "PRIORITY SURVEILLANCE: Deploy rapid aerial/field verification units; "
                "establish containment perimeter and monitor thermal progression on next orbital pass."
            )
        elif total_risk >= 35.0:
            band = "MEDIUM"
            action = (
                "ROUTINE MONITORING: Log observation parameters in the district environmental registry; "
                "verify emission limits against regulatory industrial permits."
            )
        else:
            band = "LOW"
            action = (
                "INFORMATIONAL LOGGING: Transient or controlled thermal source; "
                "no field dispatch required, continue scheduled satellite surveillance."
            )

        breakdown = {
            "thermal_intensity_score": round(s_thermal, 1),
            "hazard_proximity_score": round(s_proximity, 1),
            "source_type_hazard_score": round(s_source, 1),
            "temporal_urgency_score": round(s_temporal, 1)
        }

        return band, total_risk, breakdown, reasons, action
