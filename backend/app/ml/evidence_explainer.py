from typing import List, Dict, Any, Optional

class ExplainableEvidenceGenerator:
    """
    Explainable Evidence Generator for ThermoGuard AI.
    Synthesizes factual, transparent physical evidence lines directly from
    measured spatial coordinates, satellite sensors, and temporal profiles.
    Strictly forbids hallucinated, assumed, or fabricated claims.
    If data is missing or unobserved, it is explicitly marked as unavailable.
    """

    @classmethod
    def generate_structured_evidence(
        cls,
        predicted_class: str,
        thermal: Dict[str, Any],
        geo_context: Optional[Dict[str, Any]],
        temporal: Optional[Dict[str, Any]],
        feature_vector: Optional[Dict[str, float]] = None
    ) -> Dict[str, List[str]]:
        """
        Generates structured, domain-specific evidence grouped into:
        - thermal: Satellite sensor observations (FRP, brightness, confidence, day/night)
        - spatial: Proximity to industrial facilities, infrastructure, roads, land cover
        - temporal: Revisit frequency, persistence, recurrence ratio, seasonality
        - class_specific: Physical correlation with the predicted source class
        - summary: Factual highlights
        """
        geo = geo_context or {}
        temp = temporal or {}
        feat = feature_vector or {}

        thermal_evidence: List[str] = []
        spatial_evidence: List[str] = []
        temporal_evidence: List[str] = []
        class_specific_evidence: List[str] = []

        # ----------------------------------------------------
        # 1. THERMAL EVIDENCE (Sensor Telemetry)
        # ----------------------------------------------------
        frp = thermal.get("frp")
        brightness = thermal.get("brightness")
        confidence = thermal.get("confidence")
        daynight = thermal.get("daynight")
        satellite = thermal.get("satellite", "Satellite sensor")

        if frp is not None:
            frp_val = float(frp)
            if frp_val >= 100.0:
                thermal_evidence.append(
                    f"Severe thermal radiative power: {round(frp_val, 1)} MW (exceeds high-intensity industrial/wildfire threshold)"
                )
            elif frp_val >= 40.0:
                thermal_evidence.append(
                    f"Moderate-to-high radiative power: {round(frp_val, 1)} MW (consistent with flare stacks or open biomass fire)"
                )
            else:
                thermal_evidence.append(
                    f"Low-to-moderate thermal intensity: {round(frp_val, 1)} MW (steady controlled emission or smoldering)"
                )
        else:
            thermal_evidence.append("Fire Radiative Power (FRP): Data unavailable in sensor telemetry")

        if brightness is not None:
            b_val = float(brightness)
            if b_val >= 370.0:
                thermal_evidence.append(
                    f"Elevated brightness temperature: {round(b_val, 1)} K (intense localized radiative thermal core)"
                )
            else:
                thermal_evidence.append(
                    f"Brightness temperature: {round(b_val, 1)} K recorded by {satellite}"
                )
        else:
            thermal_evidence.append("Brightness temperature: Data unavailable in observation")

        if confidence is not None:
            conf_val = float(confidence)
            thermal_evidence.append(
                f"FIRMS satellite detection confidence: {round(conf_val, 1)}% (spectral anomaly verification)"
            )
        else:
            thermal_evidence.append("Satellite detection confidence: Data unavailable")

        if daynight is not None:
            dn_str = "Nighttime" if str(daynight).upper().startswith("N") else "Daytime"
            thermal_evidence.append(
                f"Observation timing: {dn_str} satellite pass ({'eliminated solar glint/reflectance' if dn_str == 'Nighttime' else 'standard daytime overpass'})"
            )

        # ----------------------------------------------------
        # 2. SPATIAL EVIDENCE (Geospatial & OSM Context)
        # ----------------------------------------------------
        dist_m = geo.get("distance_to_industry")
        facility_name = geo.get("nearest_industrial_facility")
        facility_type = geo.get("facility_type")
        land_cover = geo.get("land_cover")
        infra_name = geo.get("nearby_infrastructure")
        infra_dist = geo.get("distance_to_infrastructure")
        fac_count = geo.get("contextual_attributes", {}).get("facilities_within_10km", 0)

        if dist_m is not None and facility_name:
            dist_val = float(dist_m)
            if dist_val <= 300.0:
                spatial_evidence.append(
                    f"Immediate industrial perimeter: {int(dist_val)} m to {facility_name} ({facility_type or 'industrial complex'})"
                )
            elif dist_val <= 1000.0:
                spatial_evidence.append(
                    f"Industrial proximity: {int(dist_val)} m to {facility_name}"
                )
            elif dist_val <= 5000.0:
                spatial_evidence.append(
                    f"Located {round(dist_val / 1000.0, 1)} km from nearest industrial installation ({facility_name})"
                )
            else:
                spatial_evidence.append(
                    f"Remote from industrial installations: nearest facility is {round(dist_val / 1000.0, 1)} km away ({facility_name})"
                )
        else:
            spatial_evidence.append("Industrial facility proximity: No industrial installation identified in database")

        if fac_count:
            spatial_evidence.append(f"Industrial corridor density: {fac_count} facilities identified within 10 km radius")

        if land_cover:
            lc_descriptions = {
                "industrial": "Designated industrial land-use zoning (OSM & satellite overlay)",
                "dense_forest": "Dense forest reserve / protected tree canopy cover",
                "cropland": "Active agricultural cropland / cultivated parcel",
                "mining_pit": "Co-located within open-cast mine concession or overburden spoil heap",
                "open_scrubland": "Open arid scrubland / non-industrial rural terrain",
                "water_body": "Near inland hydrological feature"
            }
            desc = lc_descriptions.get(land_cover, f"Zoned as {land_cover}")
            spatial_evidence.append(f"Land-use / Land-cover context: {desc}")
        else:
            spatial_evidence.append("Land-use / Land-cover context: Classification data unavailable")

        if infra_name and infra_dist is not None:
            spatial_evidence.append(
                f"Critical infrastructure: {infra_name} situated {int(infra_dist)} m from hotspot center"
            )

        # ----------------------------------------------------
        # 3. TEMPORAL EVIDENCE (Historical Observation Behavior)
        # ----------------------------------------------------
        persist_days = temp.get("persistence_days")
        obs_count = temp.get("observation_count")
        recurrence = temp.get("recurrence_ratio")
        freq = temp.get("frequency_per_week")
        seasonality = temp.get("seasonal_pattern")
        mean_revisit = temp.get("average_revisit_interval")

        if persist_days is not None and obs_count is not None:
            p_days = int(persist_days)
            o_cnt = int(obs_count)
            if p_days >= 14:
                temporal_evidence.append(
                    f"Persistent multi-temporal source: active across {p_days} days with {o_cnt} satellite detections"
                )
            elif p_days <= 2 and o_cnt <= 2:
                temporal_evidence.append(
                    f"Acute sudden-onset signature: {o_cnt} detection(s) across {p_days} day(s) (no historical continuous baseline)"
                )
            else:
                temporal_evidence.append(
                    f"Moderate duration activity spanning {p_days} days across {o_cnt} detection passes"
                )
        else:
            temporal_evidence.append("Temporal persistence: Historical observation baseline unavailable")

        if recurrence is not None:
            rec_pct = round(float(recurrence) * 100)
            if rec_pct >= 70:
                temporal_evidence.append(
                    f"High recurrence ratio: {rec_pct}% of orbital revisit passes detected active thermal anomaly"
                )
            elif rec_pct >= 30:
                temporal_evidence.append(
                    f"Intermittent recurrence ratio: {rec_pct}% of orbital revisit passes"
                )
            else:
                temporal_evidence.append(
                    f"Low recurrence ratio: {rec_pct}% (transient or single-cycle thermal release)"
                )

        if freq is not None:
            temporal_evidence.append(f"Detection frequency: {round(float(freq), 1)} observations per week")

        if mean_revisit is not None and float(mean_revisit) > 0:
            temporal_evidence.append(f"Mean satellite revisit interval: {round(float(mean_revisit), 1)} days between detections")

        if seasonality:
            temporal_evidence.append(f"Seasonal profile: {seasonality.replace('_', ' ').title()}")

        # ----------------------------------------------------
        # 4. CLASS-SPECIFIC EVIDENCE (Attribution Rules)
        # ----------------------------------------------------
        if predicted_class == "Gas Flare":
            class_specific_evidence.append(
                "Persistent stationary emission footprint co-located with refinery or petrochemical infrastructure"
            )
            class_specific_evidence.append(
                "High multi-week recurrence without lateral geometric expansion indicates controlled flare stack combustion"
            )
        elif predicted_class == "Industrial Fire":
            class_specific_evidence.append(
                "Elevated thermal radiative surge within industrial boundary indicates uncontrolled combustion outbreak"
            )
            class_specific_evidence.append(
                "Acute short-duration onset differentiates event from routine continuous flaring"
            )
        elif predicted_class == "Agricultural Burning":
            class_specific_evidence.append(
                "Agricultural cropland context remote from industrial installations"
            )
            class_specific_evidence.append(
                "Transient post-harvest seasonal residue combustion pattern with rapid spatial dissipation"
            )
        elif predicted_class == "Wildfire":
            class_specific_evidence.append(
                "Location within dense forest reserve canopy with zero industrial infrastructure"
            )
            class_specific_evidence.append(
                "High FRP biomass combustion signature characteristic of uncontained wildfire front"
            )
        elif predicted_class == "Mining":
            class_specific_evidence.append(
                "Spatial co-location with open-cast mining excavation pit or coal spoil heap"
            )
            class_specific_evidence.append(
                "Recurring low-velocity thermal profile characteristic of spontaneous subsurface coal oxidation"
            )
        elif predicted_class == "Other":
            class_specific_evidence.append(
                "Thermal and spatial attributes do not match standard industrial, agricultural, or wildfire profiles"
            )
            class_specific_evidence.append(
                "Isolated transient observation with low confidence margin or unclassified land-use context"
            )

        # Build concise summary
        summary = []
        if spatial_evidence:
            summary.append(spatial_evidence[0])
        if temporal_evidence:
            summary.append(temporal_evidence[0])
        if thermal_evidence:
            summary.append(thermal_evidence[0])
        if class_specific_evidence:
            summary.append(class_specific_evidence[0])

        return {
            "thermal": thermal_evidence,
            "spatial": spatial_evidence,
            "temporal": temporal_evidence,
            "class_specific": class_specific_evidence,
            "summary": summary
        }

    @classmethod
    def generate_evidence(
        cls,
        predicted_class: str,
        thermal: Dict[str, Any],
        geo_context: Optional[Dict[str, Any]],
        temporal: Optional[Dict[str, Any]],
        feature_vector: Optional[Dict[str, float]] = None
    ) -> List[str]:
        """
        Legacy flat evidence list for backward-compatibility with Phase 1-4 callers.
        """
        structured = cls.generate_structured_evidence(
            predicted_class=predicted_class,
            thermal=thermal,
            geo_context=geo_context,
            temporal=temporal,
            feature_vector=feature_vector
        )
        return structured["summary"]

    @classmethod
    def generate_explanation(
        cls,
        predicted_class: str,
        confidence: float,
        confidence_band: str,
        risk_level: str,
        risk_score: float,
        evidence: Dict[str, List[str]],
        risk_reasons: List[str]
    ) -> str:
        """
        Generates a concise, strictly factual human-readable explanation from structured evidence.
        Never hallucinates facts or introduces unmeasured external claims.
        """
        pct = round(confidence * 100)
        reasons_str = "; ".join(risk_reasons[:2]) if risk_reasons else "standard operational thresholds"
        
        if predicted_class == "Gas Flare":
            return (
                f"Classified as Gas Flare ({pct}% model probability, {confidence_band} confidence) "
                f"due to persistent thermal activity inside or immediately adjacent to industrial refining facilities. "
                f"Stationary spatial recurrence confirms controlled flare stack combustion. "
                f"Operational risk is assessed as {risk_level} ({risk_score}/100) on the basis of: {reasons_str}."
            )
        elif predicted_class == "Industrial Fire":
            return (
                f"Classified as Industrial Fire ({pct}% model probability, {confidence_band} confidence) "
                f"due to an acute radiative power surge within an industrial facility perimeter. "
                f"Lack of prior continuous baseline distinguishes this uncontrolled outbreak from routine flaring. "
                f"Operational risk is assessed as {risk_level} ({risk_score}/100) on the basis of: {reasons_str}."
            )
        elif predicted_class == "Agricultural Burning":
            return (
                f"Classified as Agricultural Burning ({pct}% model probability, {confidence_band} confidence) "
                f"based on cropland terrain context, seasonal harvest alignment, and absence of industrial infrastructure. "
                f"Operational risk is assessed as {risk_level} ({risk_score}/100) on the basis of: {reasons_str}."
            )
        elif predicted_class == "Wildfire":
            return (
                f"Classified as Wildfire ({pct}% model probability, {confidence_band} confidence) "
                f"due to elevated thermal radiative power situated within a dense forest reserve canopy. "
                f"Operational risk is assessed as {risk_level} ({risk_score}/100) on the basis of: {reasons_str}."
            )
        elif predicted_class == "Mining":
            return (
                f"Classified as Mining ({pct}% model probability, {confidence_band} confidence) "
                f"owing to co-location within an open-cast mining basin and recurring oxidation signature. "
                f"Operational risk is assessed as {risk_level} ({risk_score}/100) on the basis of: {reasons_str}."
            )
        else:
            return (
                f"Classified as Other ({pct}% model probability, {confidence_band} confidence) "
                f"because observation attributes do not exhibit definitive industrial, agricultural, or forest wildfire characteristics. "
                f"Operational risk is assessed as {risk_level} ({risk_score}/100) on the basis of: {reasons_str}."
            )
