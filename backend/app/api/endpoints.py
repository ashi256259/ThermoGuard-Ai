import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Query
from backend.app.schemas.schemas import (
    HotspotDetail,
    HotspotListItem,
    AnalyzeRequest,
    AnalyzeResponse,
    StatisticsResponse,
    FilterOptions,
    AlertBase,
    FIRMSIngestRequest,
    IngestionSummary,
    ProviderStatusResponse,
    DemoScenario,
    HotspotIntelligence
)
from backend.app.core.config import settings
from backend.app.services.pipeline_service import HotspotAnalysisService
from backend.app.services.ingestion_service import ingestion_service

router = APIRouter()
pipeline = HotspotAnalysisService()

@router.get("/health", response_model=Dict[str, Any])
def health_check():
    """System health check, data provider operational status, and SIH PS info."""
    provider_info = ingestion_service.get_provider_status()
    return {
        "status": "ok",
        "service": "ThermoGuard AI",
        "version": settings.VERSION,
        "sih_ps_id": "SIH26162",
        "organisation": "NTRO",
        "data_provider_mode": provider_info["system_mode"],
        "providers": {
            "firms": provider_info["firms"]["mode"],
            "osm": provider_info["osm"]["mode"],
            "landcover": provider_info["landcover"]["mode"]
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@router.get("/provider/status", response_model=Dict[str, Any])
def get_provider_status():
    """
    Returns consolidated health and integration status of external geospatial providers.
    Truthfully identifies DEMO_SAMPLE_DATA vs LIVE_API without exposing secrets.
    """
    return ingestion_service.get_provider_status()

@router.get("/scenarios", response_model=List[Dict[str, Any]])
def list_demo_scenarios():
    """
    Returns the calibrated SIH 2026 test scenarios (A through E).
    Provides benchmark coordinates and expected ML classification outcomes.
    """
    return ingestion_service.get_demo_scenarios()

@router.post("/ingest/firms", response_model=IngestionSummary)
def ingest_firms_data(request: FIRMSIngestRequest):
    """
    Ingests, validates, normalizes, deduplicates, and enriches raw NASA FIRMS thermal records.
    Performs real-time spatial joins with OSM facilities and ESA land cover.
    """
    summary = ingestion_service.ingest_firms_batch(
        raw_records=request.records,
        auto_enrich=request.auto_enrich if request.auto_enrich is not None else True,
        source_label="REST_API_INGEST"
    )
    return IngestionSummary(**summary)

@router.get("/ingest/stats", response_model=Dict[str, Any])
def get_ingestion_statistics():
    """Returns real-time ingestion pipeline metrics (received, accepted, rejected, deduplicated, enriched)."""
    return ingestion_service.get_provider_status()["metrics"]

@router.get("/hotspots", response_model=List[Dict[str, Any]])
def list_hotspots(
    source_class: Optional[str] = Query(None, description="Filter by predicted source class"),
    risk_score: Optional[str] = Query(None, description="Filter by risk level (LOW, MEDIUM, HIGH, CRITICAL)"),
    is_persistent: Optional[bool] = Query(None, description="Filter by temporal persistence"),
    min_confidence: Optional[float] = Query(0.0, description="Minimum prediction confidence (0.0 to 1.0)"),
    region: Optional[str] = Query(None, description="Geographic region identifier"),
    industrial_only: Optional[bool] = Query(None, description="Filter only industrial corridor events"),
    land_cover: Optional[str] = Query(None, description="Filter by land cover category"),
    min_lat: Optional[float] = Query(None, description="Bounding box min latitude"),
    max_lat: Optional[float] = Query(None, description="Bounding box max latitude"),
    min_lon: Optional[float] = Query(None, description="Bounding box min longitude"),
    max_lon: Optional[float] = Query(None, description="Bounding box max longitude")
):
    """
    Retrieve thermal events enriched with geospatial context, classification,
    and risk levels. Supports multi-criteria and bounding-box filtering.
    """
    bbox = None
    if None not in (min_lat, max_lat, min_lon, max_lon):
        bbox = [min_lon, min_lat, max_lon, max_lat]

    return ingestion_service.get_all_hotspots(
        source_class=source_class,
        risk_score=risk_score,
        min_confidence=min_confidence,
        region=region,
        bbox=bbox,
        is_persistent=is_persistent,
        industrial_only=industrial_only,
        land_cover=land_cover
    )

@router.get("/hotspots/{hotspot_id}")
def get_hotspot_by_id(hotspot_id: str):
    """Get complete enriched details for a specific thermal event."""
    h = ingestion_service.get_hotspot_by_id(hotspot_id)
    if h:
        return h
    raise HTTPException(status_code=404, detail=f"Hotspot with ID {hotspot_id} not found")

@router.get("/hotspots/{hotspot_id}/context")
def get_hotspot_context(hotspot_id: str):
    """Get geospatial and land-cover context for a thermal hotspot."""
    h = get_hotspot_by_id(hotspot_id)
    return {
        "event_id": hotspot_id,
        "geo_context": h["geo_context"]
    }

@router.get("/hotspots/{hotspot_id}/classification")
def get_hotspot_classification(hotspot_id: str):
    """Get ML prediction, confidence, risk score, and explainable evidence."""
    h = get_hotspot_by_id(hotspot_id)
    return {
        "event_id": hotspot_id,
        "classification": h["classification"]
    }

@router.get("/hotspots/{hotspot_id}/intelligence", response_model=HotspotIntelligence)
def get_hotspot_intelligence(hotspot_id: str):
    """
    Get comprehensive Phase 5 Explainability and Risk Intelligence breakdown:
    - Statistical Confidence Interpretation (bands, quality, margins, calibration notice)
    - Structured Categorized Evidence (thermal, spatial, temporal, class-specific)
    - Real Model Feature Contributions (Random Forest Gini importances with event values)
    - Deterministic Operational Risk Scoring (level, score, structured reasons, breakdown, action)
    - Synthesized Human-Readable Explanation
    """
    h = get_hotspot_by_id(hotspot_id)
    if "intelligence" in h and h["intelligence"]:
        return h["intelligence"]

    # If intelligence was not pre-built, synthesize it on the fly
    event = h["event"]
    geo = h.get("geo_context")
    temp = h.get("temporal_profile")
    cls_obj = h.get("classification", {})
    features = cls_obj.get("feature_vector", {})

    top_features = pipeline.classifier.get_top_features_for_vector(features, top_n=6)
    
    return {
        "event_id": hotspot_id,
        "prediction": {
            "predicted_class": cls_obj.get("predicted_class", "Other"),
            "confidence": cls_obj.get("confidence", 0.5),
            "confidence_band": cls_obj.get("confidence_band", "MEDIUM"),
            "confidence_margin": cls_obj.get("confidence_margin", 0.0),
            "confidence_quality": cls_obj.get("confidence_quality", "MODERATE"),
            "quality_reason": "Synthesized from classification probabilities.",
            "interpretation_notice": "Model confidence reflects Random Forest multi-class ensemble consensus.",
            "model_version": cls_obj.get("model_version", "random_forest_v1.0.0"),
            "class_probabilities": cls_obj.get("class_probabilities", {}),
            "runner_up_class": None,
            "runner_up_probability": None
        },
        "evidence": cls_obj.get("structured_evidence") or {
            "thermal": [],
            "spatial": [],
            "temporal": [],
            "class_specific": [],
            "summary": cls_obj.get("evidence", [])
        },
        "feature_importance": top_features,
        "risk": {
            "score": cls_obj.get("risk_value", 50.0),
            "level": cls_obj.get("risk_score", "MEDIUM"),
            "reasons": cls_obj.get("risk_reasons", []),
            "breakdown": cls_obj.get("risk_breakdown", {}),
            "action_recommended": h.get("alert", {}).get("action_recommended") if h.get("alert") else "Routine monitoring"
        },
        "explanation": cls_obj.get("explanation", "Observation evaluated by ThermoGuard AI.")
    }

@router.get("/hotspots/{hotspot_id}/timeline")
def get_hotspot_timeline(hotspot_id: str):
    """
    Get historical temporal observations, satellite passes, and multi-temporal metrics
    derived deterministically by the Temporal Intelligence Engine.
    """
    timeline = ingestion_service.get_hotspot_timeline(hotspot_id)
    if not timeline:
        raise HTTPException(status_code=404, detail=f"Hotspot with ID {hotspot_id} not found")
    return timeline

@router.get("/hotspots/{hotspot_id}/temporal-profile")
def get_hotspot_temporal_profile(hotspot_id: str):
    """
    Get deep temporal intelligence profile: frequency, persistence duration, recurrence ratio,
    revisit intervals (mean/median), seasonality concentration, and ML feature vector.
    """
    profile = ingestion_service.get_temporal_profile(hotspot_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Hotspot with ID {hotspot_id} not found")
    return profile

@router.get("/statistics")
def get_statistics():
    """Get high-level operational statistics and executive KPI metrics."""
    return ingestion_service.get_statistics()

class AlertStatusUpdate(BaseModel):
    status: str

@router.get("/alerts")
def list_alerts(
    severity: Optional[str] = Query(None, description="Filter by alert severity (LOW, MEDIUM, HIGH, CRITICAL)"),
    status: Optional[str] = Query(None, description="Filter by alert status (ACTIVE, ACKNOWLEDGED, RESOLVED)")
):
    """List operational alerts with optional severity and lifecycle status filtering."""
    hotspots = ingestion_service.get_all_hotspots()
    alerts = []
    for h in hotspots:
        if h.get("alert"):
            alt = h["alert"]
            if severity and severity.upper() != "ALL" and alt.get("severity", "").upper() != severity.upper():
                continue
            if status and status.upper() != "ALL" and alt.get("status", "").upper() != status.upper():
                continue
            alerts.append(alt)
    return alerts

@router.patch("/alerts/{alert_id}/status")
@router.put("/alerts/{alert_id}/status")
@router.post("/alerts/{alert_id}/status")
def update_alert_status(alert_id: str, body: AlertStatusUpdate):
    """Update status of an operational alert (e.g., ACKNOWLEDGED, RESOLVED)."""
    try:
        updated = ingestion_service.update_alert_status(alert_id, body.status)
    except ValueError as ex:
        raise HTTPException(status_code=400, detail=str(ex))
    if not updated:
        raise HTTPException(status_code=404, detail=f"Alert with ID {alert_id} not found")
    return updated

@router.post("/analyze", response_model=AnalyzeResponse)
def analyze_custom_hotspot(request: AnalyzeRequest):
    """
    On-demand analysis of custom coordinates or ingested raw FIRMS observation.
    Executes full Geospatial -> Temporal -> Feature Engineering -> ML Inference -> Risk Scoring -> Explainable Evidence pipeline.
    """
    ev_id = f"te-custom-{str(uuid.uuid4())[:8]}"
    ev_dict = {
        "id": ev_id,
        "latitude": request.latitude,
        "longitude": request.longitude,
        "timestamp": (request.timestamp or datetime.now(timezone.utc)).isoformat(),
        "brightness": request.brightness,
        "frp": request.frp,
        "confidence": request.confidence or 85.0,
        "satellite": request.satellite or "VIIRS_SNPP",
        "source": "USER_SUBMITTED_INSPECTION"
    }

    result = pipeline.process_hotspot(ev_dict)
    cls_res = result["classification"]

    return AnalyzeResponse(
        event_id=ev_id,
        predicted_class=cls_res["predicted_class"],
        confidence=cls_res["confidence"],
        risk_score=cls_res["risk_score"],
        risk_value=cls_res["risk_value"],
        persistence_score=cls_res["persistence_score"],
        evidence=cls_res["evidence"],
        geo_context=result["geo_context"],
        temporal_summary=result["temporal_profile"],
        feature_vector=cls_res["feature_vector"]
    )

@router.get("/filters")
def get_filter_options():
    """Provides valid filter taxonomies and available geographic regions."""
    return {
        "classes": [
            "All",
            "Industrial Fire",
            "Gas Flare",
            "Agricultural Burning",
            "Wildfire",
            "Mining",
            "Other"
        ],
        "risk_levels": ["All", "LOW", "MEDIUM", "HIGH", "CRITICAL"],
        "regions": [
            {"id": "all_india", "name": "All India Overview", "center": [22.5, 78.5], "zoom": 5},
            {"id": "jamnagar_petro", "name": "Gujarat Petro Corridor (Jamnagar & Hazira)", "center": [22.3591, 69.8652], "zoom": 12},
            {"id": "punjab_agri", "name": "Punjab Stubble Burning Belt (Sangrur)", "center": [30.2451, 75.8341], "zoom": 11},
            {"id": "simlipal_forest", "name": "Simlipal Biosphere Forest Reserve", "center": [21.8450, 86.3210], "zoom": 10},
            {"id": "korba_mining", "name": "Korba Coalfield & Mining Basin", "center": [22.3425, 82.5942], "zoom": 12}
        ],
        "satellites": ["VIIRS_SNPP", "VIIRS_NOAA20", "MODIS_Aqua", "MODIS_Terra"]
    }

@router.get("/ml/model-info", response_model=Dict[str, Any])
def get_ml_model_info():
    """
    Returns full machine learning model inspection information:
    - Model algorithm, version, and training framework (scikit-learn)
    - Hyperparameters (n_estimators, max_depth, class_weight, etc.)
    - Canonical feature names and calculated feature importances (Gini impurity)
    - Legitimate held-out test evaluation metrics (accuracy, macro precision, recall, F1, confusion matrix)
    - Dataset provenance and limitations notice (SIH26162 development baseline)
    """
    return pipeline.classifier.get_model_metadata()

@router.post("/ml/predict", response_model=Dict[str, Any])
def ml_predict_direct(features: Dict[str, Any]):
    """
    Direct inference on an engineered feature dictionary using the trained scikit-learn Random Forest model.
    """
    pred_class, conf, probs = pipeline.classifier.predict(features)
    return {
        "predicted_class": pred_class,
        "confidence": conf,
        "class_probabilities": probs,
        "model_version": pipeline.classifier.version,
        "feature_importances": pipeline.classifier.get_feature_importances()
    }

