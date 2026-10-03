import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from backend.app.data_providers.firms_provider import DemoFIRMSDataProvider
from backend.app.data_providers.osm_provider import DemoOSMDataProvider
from backend.app.data_providers.landcover_provider import DemoLandCoverProvider
from backend.app.geospatial.geo_engine import GeospatialContextEngine
from backend.app.temporal.temporal_engine import TemporalBehaviourEngine
from backend.app.ml.feature_engineering import FeatureEngineeringPipeline
from backend.app.ml.model_inference import ThermalSourceClassifier
from backend.app.ml.risk_scorer import RiskScoringEngine
from backend.app.ml.evidence_explainer import ExplainableEvidenceGenerator
from backend.app.ml.confidence_interpreter import ConfidenceInterpreter

class HotspotAnalysisService:
    """
    End-to-End Thermal Hotspot Analysis Pipeline:
    NASA FIRMS -> Ingestion -> Geo Context -> Temporal -> ML Classification -> Risk -> Evidence -> Intelligence
    """
    def __init__(self):
        self.firms_provider = DemoFIRMSDataProvider()
        self.osm_provider = DemoOSMDataProvider()
        self.landcover_provider = DemoLandCoverProvider()
        self.geo_engine = GeospatialContextEngine(self.osm_provider, self.landcover_provider)
        self.temporal_engine = TemporalBehaviourEngine()
        self.classifier = ThermalSourceClassifier()

    def process_hotspot(
        self,
        event_dict: Dict[str, Any],
        cluster_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Runs the full Phase 1-5 pipeline for a single thermal event.
        """
        lat = float(event_dict["latitude"])
        lon = float(event_dict["longitude"])
        brightness = float(event_dict.get("brightness", 340.0))
        frp = float(event_dict.get("frp", 30.0))
        conf = float(event_dict.get("confidence", 80.0))

        # 1. Geospatial Contextualization
        geo_ctx = self.geo_engine.enrich_thermal_event(lat, lon)

        # 2. Temporal Behavior Modeling
        cid = cluster_id or event_dict.get("cluster_id")
        temp_prof = self.temporal_engine.evaluate_temporal_profile(
            cluster_id=cid,
            latitude=lat,
            longitude=lon,
            dist_industry=geo_ctx["distance_to_industry"]
        )

        # 3. Feature Engineering
        features = FeatureEngineeringPipeline.extract_features(
            thermal=event_dict,
            geo_context=geo_ctx,
            temporal=temp_prof
        )

        # 4. ML Classification (Random Forest)
        pred_class, model_conf, prob_dist = self.classifier.predict(features)

        # 5. Statistical Confidence Interpretation (Bands, Margin, Quality, Calibration Notice)
        conf_info = ConfidenceInterpreter.interpret_confidence(
            predicted_class=pred_class,
            class_probabilities=prob_dist,
            has_full_context=bool(geo_ctx.get("distance_to_industry") is not None)
        )

        # 6. Transparent Operational Risk Scoring (Independent of model confidence)
        infra_dist = geo_ctx.get("distance_to_infrastructure")
        fac_count = geo_ctx.get("contextual_attributes", {}).get("facilities_within_10km", 0)
        risk_band, risk_val, risk_breakdown, risk_reasons, action_recommended = RiskScoringEngine.calculate_risk(
            predicted_class=pred_class,
            frp=frp,
            brightness=brightness,
            distance_to_industry_m=geo_ctx["distance_to_industry"],
            persistence_days=temp_prof["persistence_days"],
            recurrence_ratio=temp_prof["recurrence_ratio"],
            distance_to_infrastructure_m=infra_dist,
            facility_count=fac_count
        )

        # Persistence score normalized 0.0 - 1.0
        persistence_score = min(1.0, temp_prof["persistence_days"] / 60.0)

        # 7. Structured Categorized Evidence (Thermal, Spatial, Temporal, Class Specific)
        structured_evidence = ExplainableEvidenceGenerator.generate_structured_evidence(
            predicted_class=pred_class,
            thermal=event_dict,
            geo_context=geo_ctx,
            temporal=temp_prof,
            feature_vector=features
        )
        flat_evidence = structured_evidence["summary"]

        # 8. Concise Human-Readable Explanation
        explanation = ExplainableEvidenceGenerator.generate_explanation(
            predicted_class=pred_class,
            confidence=model_conf,
            confidence_band=conf_info["confidence_band"],
            risk_level=risk_band,
            risk_score=risk_val,
            evidence=structured_evidence,
            risk_reasons=risk_reasons
        )

        # 9. Model Feature Contributions (Top Contributing Features)
        top_features = self.classifier.get_top_features_for_vector(features, top_n=6)

        # 10. Synthesized Alert object if Risk is HIGH or CRITICAL
        alert_obj = None
        if risk_band in ["HIGH", "CRITICAL"]:
            alert_obj = {
                "id": f"alt-{event_dict.get('id', str(uuid.uuid4())[:8])}",
                "event_id": event_dict.get("id", "ad-hoc"),
                "title": f"{risk_band} RISK HAZARD: {pred_class} at {geo_ctx['nearest_industrial_facility']}",
                "description": f"Radiative surge of {frp} MW detected. {flat_evidence[0] if flat_evidence else ''}",
                "severity": risk_band,
                "status": "ACTIVE",
                "facility_name": geo_ctx["nearest_industrial_facility"],
                "action_recommended": action_recommended,
                "created_at": datetime.now(timezone.utc).isoformat()
            }

        return {
            "event": event_dict,
            "geo_context": geo_ctx,
            "temporal_profile": temp_prof,
            "classification": {
                "predicted_class": pred_class,
                "confidence": model_conf,
                "risk_score": risk_band,
                "risk_value": risk_val,
                "persistence_score": round(persistence_score, 2),
                "model_version": self.classifier.version,
                "evidence": flat_evidence,
                "feature_vector": features,
                "class_probabilities": prob_dist,
                "risk_breakdown": risk_breakdown,
                # Phase 5 enriched fields
                "confidence_band": conf_info["confidence_band"],
                "confidence_margin": conf_info["confidence_margin"],
                "confidence_quality": conf_info["confidence_quality"],
                "interpretation_notice": conf_info["interpretation_notice"],
                "structured_evidence": structured_evidence,
                "risk_reasons": risk_reasons,
                "explanation": explanation
            },
            "alert": alert_obj,
            "intelligence": {
                "event_id": event_dict.get("id", "ad-hoc"),
                "prediction": {
                    "predicted_class": pred_class,
                    "confidence": model_conf,
                    "confidence_band": conf_info["confidence_band"],
                    "confidence_margin": conf_info["confidence_margin"],
                    "confidence_quality": conf_info["confidence_quality"],
                    "quality_reason": conf_info["quality_reason"],
                    "interpretation_notice": conf_info["interpretation_notice"],
                    "model_version": self.classifier.version,
                    "class_probabilities": prob_dist,
                    "runner_up_class": conf_info["runner_up_class"],
                    "runner_up_probability": conf_info["runner_up_probability"]
                },
                "evidence": structured_evidence,
                "feature_importance": top_features,
                "risk": {
                    "score": risk_val,
                    "level": risk_band,
                    "reasons": risk_reasons,
                    "breakdown": risk_breakdown,
                    "action_recommended": action_recommended
                },
                "explanation": explanation
            }
        }

    def get_all_analyzed_hotspots(self) -> List[Dict[str, Any]]:
        """Fetch demo/sample FIRMS records and run pipeline on all."""
        raw_events = self.firms_provider.fetch_hotspots()
        results = []
        for ev in raw_events:
            results.append(self.process_hotspot(ev, cluster_id=ev.get("cluster_id")))
        return results

    def get_hotspot_intelligence(self, hotspot_id: str) -> Optional[Dict[str, Any]]:
        """Fetch full intelligence breakdown for a specific hotspot id."""
        all_hotspots = self.get_all_analyzed_hotspots()
        for h in all_hotspots:
            if h["event"].get("id") == hotspot_id:
                return h.get("intelligence")
        return None
