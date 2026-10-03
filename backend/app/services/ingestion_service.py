import logging
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple

from backend.app.data_providers.firms_provider import (
    DemoFIRMSProvider,
    RealFIRMSProvider,
    validate_and_normalize_firms_record,
    deduplicate_firms_records
)
from backend.app.data_providers.osm_provider import DemoOSMProvider, RealOSMProvider
from backend.app.data_providers.landcover_provider import DemoLandCoverProvider, RealLandCoverProvider
from backend.app.geospatial.geo_engine import GeospatialContextEngine
from backend.app.temporal.temporal_engine import TemporalBehaviourEngine
from backend.app.ml.feature_engineering import FeatureEngineeringPipeline
from backend.app.ml.model_inference import ThermalSourceClassifier
from backend.app.ml.risk_scorer import RiskScoringEngine
from backend.app.ml.evidence_explainer import ExplainableEvidenceGenerator
from backend.app.ml.confidence_interpreter import ConfidenceInterpreter
from backend.app.core.config import settings
from backend.app.core.database import get_engine, SessionLocal
from backend.app.models.models import (
    Base,
    ThermalEvent,
    GeoContext,
    TemporalProfile,
    Classification,
    Alert,
    IndustrialFacility
)

logger = logging.getLogger("thermoguard.ingestion")

class IngestionService:
    """
    Ingestion & Geospatial Contextualization Service for ThermoGuard AI.
    Handles data validation, spatial normalization, deduplication, geospatial enrichment,
    PostGIS/database persistence, and pipeline orchestration.
    """
    def __init__(self):
        # Initialize providers according to application settings
        if settings.DATA_PROVIDER_MODE == "LIVE_API":
            self.firms_provider = RealFIRMSProvider()
            self.osm_provider = RealOSMProvider()
            self.landcover_provider = RealLandCoverProvider()
        else:
            self.firms_provider = DemoFIRMSProvider()
            self.osm_provider = DemoOSMProvider()
            self.landcover_provider = DemoLandCoverProvider()

        self.geo_engine = GeospatialContextEngine(self.osm_provider, self.landcover_provider)
        self.temporal_engine = TemporalBehaviourEngine()
        self.classifier = ThermalSourceClassifier()

        # In-memory fast registry ensuring instant retrieval even in headless / memory mode
        self._events_registry: Dict[str, Dict[str, Any]] = {}
        self._metrics = {
            "total_received": 0,
            "total_accepted": 0,
            "total_rejected": 0,
            "total_deduplicated": 0,
            "total_enriched": 0,
            "last_ingestion_time": None
        }

        # Seed initial calibrated scenarios and database tables
        self._initialize_database()
        self._seed_initial_data()

    def _initialize_database(self):
        """Initializes database schema and populates base industrial facilities."""
        try:
            engine = get_engine()
            Base.metadata.create_all(bind=engine)
            
            # Seed industrial facilities into database
            if SessionLocal:
                db = SessionLocal()
                try:
                    for fac in DemoOSMProvider.FACILITY_DATABASE:
                        existing = db.query(IndustrialFacility).filter(IndustrialFacility.id == fac["id"]).first()
                        if not existing:
                            wkt = f"POINT({fac['longitude']} {fac['latitude']})"
                            facility_record = IndustrialFacility(
                                id=fac["id"],
                                name=fac["name"],
                                facility_type=fac["facility_type"],
                                latitude=fac["latitude"],
                                longitude=fac["longitude"],
                                geometry=wkt,
                                operator=fac.get("operator"),
                                tags=fac.get("tags", {})
                            )
                            db.add(facility_record)
                    db.commit()
                except Exception as ex:
                    db.rollback()
                    logger.warning(f"Could not seed industrial facilities to DB: {ex}")
                finally:
                    db.close()
        except Exception as e:
            logger.warning(f"Database table creation skipped: {e}")

    def _seed_initial_data(self):
        """Seeds curated demo scenarios A to E into the active analysis registry."""
        demo_events = self.firms_provider.fetch_hotspots()
        self.ingest_firms_batch(demo_events, auto_enrich=True, source_label="DEMO_BOOTSTRAP")

    def ingest_firms_batch(
        self,
        raw_records: List[Dict[str, Any]],
        auto_enrich: bool = True,
        source_label: str = "API_INGEST"
    ) -> Dict[str, Any]:
        """
        Validates, normalizes, deduplicates, enriches and persists a batch of NASA FIRMS records.
        """
        received_count = len(raw_records)
        accepted_records = []
        validation_errors = []

        self._metrics["total_received"] += received_count

        # 1. Validation and Normalization
        for idx, rec in enumerate(raw_records):
            normalized, err = validate_and_normalize_firms_record(rec)
            if normalized:
                accepted_records.append(normalized)
            else:
                validation_errors.append(f"Record #{idx}: {err}")

        rejected_count = len(validation_errors)
        self._metrics["total_rejected"] += rejected_count

        # 2. Deduplication
        deduped_records, dedup_count = deduplicate_firms_records(accepted_records)
        self._metrics["total_deduplicated"] += dedup_count
        accepted_count = len(deduped_records)
        self._metrics["total_accepted"] += accepted_count

        # 3. Enrichment and Pipeline Processing
        ingested_ids = []
        enriched_count = 0

        for item in deduped_records:
            event_id = item["id"]
            lat = item["latitude"]
            lon = item["longitude"]
            cluster_id = item.get("cluster_id") or f"cls-{round(lat, 2)}_{round(lon, 2)}"
            frp = item["frp"]
            brightness = item["brightness"]
            confidence = item["confidence"]

            if auto_enrich:
                # 3a. Geospatial Context
                geo_ctx = self.geo_engine.enrich_thermal_event(lat, lon)

                # 3b. Temporal Profile
                temp_prof = self.temporal_engine.evaluate_temporal_profile(
                    cluster_id=cluster_id,
                    latitude=lat,
                    longitude=lon,
                    dist_industry=geo_ctx["distance_to_industry"]
                )

                # 3c. Feature Vector
                features = FeatureEngineeringPipeline.extract_features(
                    thermal=item,
                    geo_context=geo_ctx,
                    temporal=temp_prof
                )

                # 3d. ML Inference
                pred_class, model_conf, prob_dist = self.classifier.predict(features)

                # 3e. Statistical Confidence Interpretation
                conf_info = ConfidenceInterpreter.interpret_confidence(
                    predicted_class=pred_class,
                    class_probabilities=prob_dist,
                    has_full_context=bool(geo_ctx.get("distance_to_industry") is not None)
                )

                # 3f. Operational Risk Intelligence
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

                persistence_score = min(1.0, temp_prof["persistence_days"] / 60.0)

                # 3g. Structured Categorized Explainable Evidence
                structured_evidence = ExplainableEvidenceGenerator.generate_structured_evidence(
                    predicted_class=pred_class,
                    thermal=item,
                    geo_context=geo_ctx,
                    temporal=temp_prof,
                    feature_vector=features
                )
                flat_evidence = structured_evidence["summary"]

                # 3h. Synthesized Human-Readable Explanation
                explanation = ExplainableEvidenceGenerator.generate_explanation(
                    predicted_class=pred_class,
                    confidence=model_conf,
                    confidence_band=conf_info["confidence_band"],
                    risk_level=risk_band,
                    risk_score=risk_val,
                    evidence=structured_evidence,
                    risk_reasons=risk_reasons
                )

                # 3i. Top Feature Contributions
                top_features = self.classifier.get_top_features_for_vector(features, top_n=6)

                # 3j. Alert Generation
                alert_obj = None
                if risk_band in ["HIGH", "CRITICAL"]:
                    alert_obj = {
                        "id": f"alt-{event_id}",
                        "event_id": event_id,
                        "title": f"{risk_band} RISK: {pred_class} at {geo_ctx['nearest_industrial_facility']}",
                        "description": f"Thermal intensity {frp} MW with {flat_evidence[0] if flat_evidence else 'detected anomaly'}.",
                        "severity": risk_band,
                        "status": "ACTIVE",
                        "facility_name": geo_ctx["nearest_industrial_facility"],
                        "action_recommended": action_recommended,
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }

                enriched_entity = {
                    "event": item,
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
                        "event_id": event_id,
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
                    },
                    "scenario": item.get("scenario")
                }
                enriched_count += 1
            else:
                enriched_entity = {
                    "event": item,
                    "geo_context": None,
                    "temporal_profile": None,
                    "classification": None,
                    "alert": None
                }

            # Register in-memory
            self._events_registry[event_id] = enriched_entity
            ingested_ids.append(event_id)

            # Persist to database if connection available
            self._persist_to_database(enriched_entity)

        self._metrics["total_enriched"] += enriched_count
        self._metrics["last_ingestion_time"] = datetime.now(timezone.utc).isoformat()

        return {
            "status": "SUCCESS" if accepted_count > 0 else ("PARTIAL_FAILURE" if validation_errors else "EMPTY"),
            "records_received": received_count,
            "records_accepted": accepted_count,
            "records_rejected": rejected_count,
            "records_deduplicated": dedup_count,
            "records_enriched": enriched_count,
            "validation_errors": validation_errors[:20],
            "ingested_ids": ingested_ids,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

    def _persist_to_database(self, entity: Dict[str, Any]):
        """Persists enriched thermal event, geo context, temporal profile, classification, and alert to DB."""
        if not SessionLocal:
            return

        db = SessionLocal()
        try:
            ev = entity["event"]
            ev_id = ev["id"]
            wkt_geom = f"POINT({ev['longitude']} {ev['latitude']})"

            # 1. ThermalEvent
            ts_val = ev.get("timestamp")
            if isinstance(ts_val, str):
                try:
                    ts_dt = datetime.fromisoformat(ts_val.replace("Z", "+00:00"))
                except Exception:
                    ts_dt = datetime.utcnow()
            else:
                ts_dt = ts_val or datetime.utcnow()

            db_event = db.query(ThermalEvent).filter(ThermalEvent.id == ev_id).first()
            if not db_event:
                db_event = ThermalEvent(
                    id=ev_id,
                    latitude=ev["latitude"],
                    longitude=ev["longitude"],
                    timestamp=ts_dt,
                    brightness=ev["brightness"],
                    frp=ev["frp"],
                    confidence=ev["confidence"],
                    satellite=ev["satellite"],
                    source=ev.get("source", "INGEST_SERVICE"),
                    geometry=wkt_geom,
                    cluster_id=ev.get("cluster_id"),
                    daynight=ev.get("daynight", "D")
                )
                db.add(db_event)
            else:
                db_event.brightness = ev["brightness"]
                db_event.frp = ev["frp"]
                db_event.confidence = ev["confidence"]

            # 2. GeoContext
            gc = entity.get("geo_context")
            if gc:
                db_gc = db.query(GeoContext).filter(GeoContext.event_id == ev_id).first()
                nearest_fac_id = gc.get("facility_id")
                if not db_gc:
                    db_gc = GeoContext(
                        id=f"gc-{ev_id}",
                        event_id=ev_id,
                        nearest_facility_id=nearest_fac_id,
                        nearest_industrial_facility=gc["nearest_industrial_facility"],
                        facility_type=gc["facility_type"],
                        distance_to_facility=gc["distance_to_industry"],
                        land_cover=gc["land_cover"],
                        nearby_infrastructure=gc.get("nearby_infrastructure"),
                        distance_to_infrastructure=gc.get("distance_to_infrastructure"),
                        nearby_road=gc.get("nearby_road"),
                        distance_to_road=gc.get("distance_to_road"),
                        contextual_attributes=gc.get("contextual_attributes", {})
                    )
                    db.add(db_gc)
                else:
                    db_gc.distance_to_facility = gc["distance_to_industry"]
                    db_gc.land_cover = gc["land_cover"]

            # 3. TemporalProfile
            tp = entity.get("temporal_profile")
            if tp:
                cid = tp.get("cluster_id", ev.get("cluster_id", ev_id))
                db_tp = db.query(TemporalProfile).filter(TemporalProfile.cluster_id == cid).first()
                if not db_tp:
                    db_tp = TemporalProfile(
                        id=f"tp-{cid}",
                        cluster_id=cid,
                        observation_count=tp.get("observation_count", 1),
                        frequency=tp.get("frequency_per_week", 1.0),
                        recurrence=tp.get("recurrence_ratio", 0.0),
                        persistence_days=tp.get("persistence_days", 1),
                        seasonal_information=tp.get("seasonal_pattern"),
                        first_seen=datetime.utcnow(),
                        last_seen=datetime.utcnow(),
                        is_persistent=tp.get("is_persistent", False)
                    )
                    db.add(db_tp)

            # 4. Classification
            clf = entity.get("classification")
            if clf:
                db_clf = db.query(Classification).filter(Classification.event_id == ev_id).first()
                if not db_clf:
                    db_clf = Classification(
                        id=f"clf-{ev_id}",
                        event_id=ev_id,
                        predicted_class=clf["predicted_class"],
                        confidence=clf["confidence"],
                        risk_score=clf["risk_score"],
                        risk_value=clf["risk_value"],
                        persistence_score=clf["persistence_score"],
                        evidence=clf["evidence"],
                        feature_vector=clf["feature_vector"],
                        model_version=clf["model_version"]
                    )
                    db.add(db_clf)

            # 5. Alert
            alt = entity.get("alert")
            if alt:
                db_alt = db.query(Alert).filter(Alert.event_id == ev_id).first()
                if not db_alt:
                    db_alt = Alert(
                        id=alt["id"],
                        event_id=ev_id,
                        severity=alt["severity"],
                        status=alt["status"],
                        message=alt["description"],
                        facility_name=alt["facility_name"],
                        action_recommended=alt["action_recommended"]
                    )
                    db.add(db_alt)

            db.commit()
        except Exception as e:
            db.rollback()
            logger.debug(f"DB persistence note: {e}")
        finally:
            db.close()

    def update_alert_status(self, alert_id: str, new_status: str) -> Optional[Dict[str, Any]]:
        """Updates the lifecycle status of an operational alert (e.g. ACTIVE, ACKNOWLEDGED, RESOLVED)."""
        status_norm = new_status.upper()
        if status_norm == "NEW":
            status_norm = "ACTIVE"
        if status_norm not in ["ACTIVE", "ACKNOWLEDGED", "RESOLVED"]:
            raise ValueError(f"Invalid alert status: {new_status}")

        for entity in self._events_registry.values():
            alert = entity.get("alert")
            if alert and alert.get("id") == alert_id:
                alert["status"] = status_norm
                alert["updated_at"] = datetime.now(timezone.utc).isoformat()

                if SessionLocal:
                    db = SessionLocal()
                    try:
                        db_alt = db.query(Alert).filter(Alert.id == alert_id).first()
                        if db_alt:
                            db_alt.status = status_norm
                            db.commit()
                    except Exception as e:
                        db.rollback()
                        logger.debug(f"DB alert update note: {e}")
                    finally:
                        db.close()
                return alert
        return None

    def get_all_hotspots(
        self,
        source_class: Optional[str] = None,
        risk_score: Optional[str] = None,
        min_confidence: Optional[float] = None,
        region: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        bbox: Optional[List[float]] = None,
        is_persistent: Optional[bool] = None,
        industrial_only: Optional[bool] = None,
        land_cover: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Queries and filters enriched hotspots from the active registry."""
        results = list(self._events_registry.values())

        if source_class and source_class != "ALL":
            results = [r for r in results if r.get("classification", {}).get("predicted_class", "").lower() == source_class.lower()]

        if risk_score and risk_score != "ALL":
            results = [r for r in results if r.get("classification", {}).get("risk_score", "").upper() == risk_score.upper()]

        if min_confidence is not None:
            results = [r for r in results if r.get("classification", {}).get("confidence", 0.0) >= min_confidence]

        if is_persistent is not None:
            results = [r for r in results if r.get("temporal_profile", {}).get("is_persistent") == is_persistent]

        if industrial_only:
            results = [r for r in results if r.get("geo_context", {}).get("spatial_flags", {}).get("is_industrial_zone") is True]

        if land_cover and land_cover != "ALL":
            results = [r for r in results if r.get("geo_context", {}).get("land_cover") == land_cover]

        if bbox and len(bbox) == 4:
            min_lon, min_lat, max_lon, max_lat = bbox
            results = [
                r for r in results
                if min_lat <= r["event"]["latitude"] <= max_lat and min_lon <= r["event"]["longitude"] <= max_lon
            ]

        if region and region != "ALL":
            # Regional filtering heuristic based on Indian geography
            r_lower = region.lower()
            if "gujarat" in r_lower or "west" in r_lower:
                results = [r for r in results if 68.0 <= r["event"]["longitude"] <= 74.0 and 20.0 <= r["event"]["latitude"] <= 24.5]
            elif "punjab" in r_lower or "north" in r_lower:
                results = [r for r in results if 74.0 <= r["event"]["longitude"] <= 77.5 and 29.5 <= r["event"]["latitude"] <= 32.5]
            elif "odisha" in r_lower or "east" in r_lower:
                results = [r for r in results if 83.0 <= r["event"]["longitude"] <= 87.5 and 19.0 <= r["event"]["latitude"] <= 22.5]
            elif "central" in r_lower or "chhattisgarh" in r_lower:
                results = [r for r in results if 80.0 <= r["event"]["longitude"] <= 84.0 and 21.0 <= r["event"]["latitude"] <= 24.0]

        return results

    def get_hotspot_by_id(self, hotspot_id: str) -> Optional[Dict[str, Any]]:
        """Fetches an individual hotspot by ID with complete context, temporal and classification entities."""
        if hotspot_id in self._events_registry:
            return self._events_registry[hotspot_id]

        scenario_alias_map = {
            "te-scen-a1": "te-jam-101",
            "scen-a1": "te-jam-101",
            "te-scen-a2": "te-haz-201",
            "scen-a2": "te-haz-201",
            "te-scen-b1": "te-pnb-301",
            "scen-b1": "te-pnb-301",
            "te-scen-c1": "te-sim-401",
            "scen-c1": "te-sim-401",
            "te-scen-d1": "te-ang-501",
            "scen-d1": "te-ang-501",
            "te-scen-d2": "te-krb-601",
            "scen-d2": "te-krb-601",
            "te-scen-e1": "te-tra-701",
            "scen-e1": "te-tra-701",
        }
        target_id = scenario_alias_map.get(hotspot_id)
        if target_id and target_id in self._events_registry:
            return self._events_registry[target_id]

        return None

    def get_hotspot_timeline(self, hotspot_id: str) -> Optional[Dict[str, Any]]:
        """
        Returns full temporal timeline and historical passes for a specific thermal event.
        Derives real metrics using TemporalIntelligenceEngine.
        """
        hotspot = self.get_hotspot_by_id(hotspot_id)
        if not hotspot:
            return None

        temp_prof = hotspot.get("temporal_profile") or {}
        cluster_id = temp_prof.get("cluster_id") or hotspot.get("event", {}).get("cluster_id") or f"cls-{hotspot_id}"

        # Retrieve chronological observations from the temporal engine
        history = self.temporal_engine.get_cluster_timeline(cluster_id, event_id=hotspot_id)

        # If history is empty (e.g. ad-hoc event), populate with current event pass
        if not history:
            ev = hotspot.get("event", {})
            history = [{
                "date": ev.get("timestamp", "")[:10] if ev.get("timestamp") else datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                "timestamp": ev.get("timestamp", datetime.now(timezone.utc).isoformat()),
                "frp": float(ev.get("frp", 20.0)),
                "brightness": float(ev.get("brightness", 330.0)),
                "confidence": float(ev.get("confidence", 80.0)),
                "satellite": str(ev.get("satellite", "VIIRS_SNPP")),
                "latitude": float(ev.get("latitude", 0.0)),
                "longitude": float(ev.get("longitude", 0.0)),
                "event_id": hotspot_id
            }]

        return {
            "event_id": hotspot_id,
            "cluster_id": cluster_id,
            "temporal_profile": temp_prof,
            "observation_history": history
        }

    def get_temporal_profile(self, hotspot_id: str) -> Optional[Dict[str, Any]]:
        """Returns the complete temporal intelligence profile for an event."""
        hotspot = self.get_hotspot_by_id(hotspot_id)
        if not hotspot:
            return None
        return {
            "event_id": hotspot_id,
            "cluster_id": hotspot.get("temporal_profile", {}).get("cluster_id"),
            "temporal_profile": hotspot.get("temporal_profile")
        }

    def get_provider_status(self) -> Dict[str, Any]:
        """Returns consolidated data provider health, configured status, and operational notice."""
        return {
            "system_mode": settings.DATA_PROVIDER_MODE,
            "firms": self.firms_provider.get_provider_status(),
            "osm": self.osm_provider.get_provider_status(),
            "landcover": self.landcover_provider.get_provider_status(),
            "metrics": self._metrics,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

    def get_statistics(self) -> Dict[str, Any]:
        """Computes executive operational KPIs across the active catalog."""
        all_spots = list(self._events_registry.values())
        total = len(all_spots)
        high_risk = sum(1 for s in all_spots if s.get("classification", {}).get("risk_score") in ["HIGH", "CRITICAL"])
        persistent = sum(1 for s in all_spots if s.get("temporal_profile", {}).get("is_persistent") is True)
        industrial = sum(1 for s in all_spots if s.get("classification", {}).get("predicted_class") in ["Industrial Fire", "Gas Flare"])
        wildfires = sum(1 for s in all_spots if s.get("classification", {}).get("predicted_class") == "Wildfire")
        agri = sum(1 for s in all_spots if s.get("classification", {}).get("predicted_class") == "Agricultural Burning")
        alerts = [s["alert"] for s in all_spots if s.get("alert")]

        return {
            "total_hotspots": total,
            "high_risk_count": high_risk,
            "persistent_sources": persistent,
            "industrial_sources": industrial,
            "wildfires": wildfires,
            "agricultural_burns": agri,
            "active_alerts": len(alerts),
            "data_provider_mode": settings.DATA_PROVIDER_MODE,
            "last_updated": datetime.now(timezone.utc).isoformat()
        }

    def get_demo_scenarios(self) -> List[Dict[str, Any]]:
        """Returns calibrated demo scenarios catalog for SIH 2026 evaluation."""
        return [
            {
                "id": "scen-a1",
                "code": "SCENARIO_A1",
                "name": "Jamnagar Refinery Continuous Gas Flare",
                "title": "Jamnagar Refinery Continuous Gas Flare",
                "category": "Industrial Flare",
                "location": "Jamnagar, Gujarat",
                "region": "Gujarat Petro Corridor",
                "latitude": 22.3591,
                "longitude": 69.8652,
                "center": [22.3591, 69.8652],
                "zoom": 13,
                "expected_class": "Gas Flare",
                "target_class": "Gas Flare",
                "expected_risk": "MEDIUM",
                "risk": "MEDIUM",
                "sample_event_id": "te-scen-a1",
                "description": "Continuous flare stack combustion inside major crude refinery perimeter. High persistence, recurrent nighttime observations.",
                "key_insight": "Refinery within 110 m, 95% 45-day recurrence with stable FRP indicates controlled flare stack combustion rather than an uncontained fire.",
                "key_evidence": [
                    "Distance to refinery facility: ~110 m",
                    "Surrounding land-cover: Industrial zone (0.85)",
                    "Observation recurrence: 95% across 45-day window",
                    "Controlled combustion signature"
                ]
            },
            {
                "id": "scen-a2",
                "code": "SCENARIO_A2",
                "name": "Hazira Petrochemicals Industrial Fire Emergency",
                "title": "Hazira Petrochemicals Industrial Fire Emergency",
                "category": "Industrial Emergency",
                "location": "Hazira, Gujarat",
                "region": "Gujarat Petro Corridor",
                "latitude": 21.1145,
                "longitude": 72.6732,
                "center": [21.1145, 72.6732],
                "zoom": 13,
                "expected_class": "Industrial Fire",
                "target_class": "Industrial Fire",
                "expected_risk": "CRITICAL",
                "risk": "CRITICAL",
                "sample_event_id": "te-scen-a2",
                "description": "Sudden intense thermal radiative surge inside chemical plant and storage battery. Low historical recurrence but extreme FRP spike.",
                "key_insight": "Sudden 142.5 MW FRP surge at chemical facility with zero historical recurrence triggers immediate CRITICAL hazard dispatch.",
                "key_evidence": [
                    "Distance to chemical plant: ~180 m",
                    "Fire Radiative Power: 142.5 MW (Severe surge)",
                    "No prior persistent signature (Sudden outbreak)",
                    "Immediate emergency notification recommended"
                ]
            },
            {
                "id": "scen-b",
                "code": "SCENARIO_B",
                "name": "Sangrur Agricultural Stubble Burning",
                "title": "Sangrur Agricultural Stubble Burning",
                "category": "Agricultural Burning",
                "location": "Sangrur, Punjab",
                "region": "Punjab Stubble Belt",
                "latitude": 30.2451,
                "longitude": 75.8341,
                "center": [30.2451, 75.8341],
                "zoom": 12,
                "expected_class": "Agricultural Burning",
                "target_class": "Agricultural Burning",
                "expected_risk": "LOW",
                "risk": "LOW",
                "sample_event_id": "te-scen-b",
                "description": "Post-harvest paddy straw combustion over agricultural cropland. Seasonal cluster, remote from industrial infrastructure.",
                "key_insight": "Cropland context (>45 km from any industrial plant) during harvest season confirms transient open-field residue combustion.",
                "key_evidence": [
                    "Land-cover context: Cropland (0.94)",
                    "Distance to industrial facility: > 45 km",
                    "Transient multi-day cluster during harvest window",
                    "Moderate FRP with fast spatial dispersion"
                ]
            },
            {
                "id": "scen-c",
                "code": "SCENARIO_C",
                "name": "Simlipal Biosphere Canopy Wildfire",
                "title": "Simlipal Biosphere Canopy Wildfire",
                "category": "Wildfire",
                "location": "Mayurbhanj, Odisha",
                "region": "Simlipal Forest Reserve",
                "latitude": 21.8450,
                "longitude": 86.3210,
                "center": [21.8450, 86.3210],
                "zoom": 11,
                "expected_class": "Wildfire",
                "target_class": "Wildfire",
                "expected_risk": "HIGH",
                "risk": "HIGH",
                "sample_event_id": "te-scen-c",
                "description": "Large forest fire spread inside biosphere protected reserve. Dense tree cover, high FRP, zero industrial infrastructure.",
                "key_insight": "Dense forest reserve canopy (>100 km from industries) with 92.4 MW FRP front advancing across tree canopy.",
                "key_evidence": [
                    "Land-cover context: Dense forest reserve (0.88)",
                    "Distance to industrial facility: > 100 km",
                    "Elevated Fire Radiative Power (92.4 MW)",
                    "Spatial grouping indicates propagating fire front"
                ]
            },
            {
                "id": "scen-d",
                "code": "SCENARIO_D",
                "name": "Korba Opencast Coal Seam Combustion",
                "title": "Korba Opencast Coal Seam Combustion",
                "category": "Mining Context",
                "location": "Korba, Chhattisgarh",
                "region": "Korba Coalfield Basin",
                "latitude": 22.3425,
                "longitude": 82.5942,
                "center": [22.3425, 82.5942],
                "zoom": 12,
                "expected_class": "Mining",
                "target_class": "Mining",
                "expected_risk": "MEDIUM",
                "risk": "MEDIUM",
                "sample_event_id": "te-scen-d",
                "description": "Sub-surface spontaneous coal seam oxidation within open-cast pit spoil heaps. Recurrent nighttime observations.",
                "key_insight": "Mining spoil heaps adjacent to open-cast pit with continuous multi-week thermal signature confirms coal seam oxidation.",
                "key_evidence": [
                    "Distance to coal pithead: ~110 m",
                    "Land-cover context: Mining pit / spoil heaps (0.82)",
                    "Continuous long-duration recurrence",
                    "Low-velocity smoldering combustion"
                ]
            },
            {
                "id": "scen-e",
                "code": "SCENARIO_E",
                "name": "Transient Rural Biomass Hotspot",
                "title": "Transient Rural Biomass Hotspot",
                "category": "Other / Transient",
                "location": "Rural Rajasthan",
                "region": "Western Scrubland",
                "latitude": 26.8920,
                "longitude": 75.8140,
                "center": [26.8920, 75.8140],
                "zoom": 12,
                "expected_class": "Other",
                "target_class": "Other",
                "expected_risk": "LOW",
                "risk": "LOW",
                "sample_event_id": "te-scen-e",
                "description": "Isolated single-pass thermal anomaly in semi-arid open land. Transient brick kiln or localized biomass burning.",
                "key_insight": "Single satellite pass in open scrubland with low FRP and zero recurrence classifies anomaly as transient non-hazardous source.",
                "key_evidence": [
                    "Land-cover context: Open land / scrubland",
                    "Zero prior recurrence (Single observation pass)",
                    "Low FRP (14.5 MW)",
                    "Classified as transient source"
                ]
            }
        ]

# Global singleton instance
ingestion_service = IngestionService()
