from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class ThermalEventBase(BaseModel):
    id: str
    latitude: float
    longitude: float
    timestamp: datetime
    brightness: float
    frp: float
    confidence: float
    satellite: str
    source: str
    cluster_id: Optional[str] = None
    daynight: Optional[str] = "D"

class GeoContextBase(BaseModel):
    nearest_industrial_facility: str
    facility_type: str
    distance_to_industry: float # meters
    land_cover: str
    nearby_infrastructure: Optional[str] = None
    distance_to_infrastructure: Optional[float] = None
    nearby_road: Optional[str] = None
    distance_to_road: Optional[float] = None
    contextual_attributes: Dict[str, Any] = Field(default_factory=dict)

class TemporalProfileBase(BaseModel):
    cluster_id: str
    first_seen: datetime
    last_seen: datetime
    observation_count: int
    frequency_per_week: float
    recurrence_ratio: float
    persistence_days: int
    seasonal_pattern: Optional[str] = None
    is_persistent: bool

class ClassificationBase(BaseModel):
    predicted_class: str
    confidence: float # 0.0 - 1.0
    risk_score: str   # 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    risk_value: float # 0 - 100
    persistence_score: float # 0.0 - 1.0
    model_version: str
    evidence: List[str]
    feature_vector: Dict[str, float]
    # Phase 5 Explainability & Risk Intelligence extensions
    confidence_band: Optional[str] = "HIGH"
    confidence_margin: Optional[float] = 0.0
    confidence_quality: Optional[str] = "STRONG"
    interpretation_notice: Optional[str] = None
    structured_evidence: Optional[Dict[str, List[str]]] = None
    risk_reasons: Optional[List[str]] = None
    risk_breakdown: Optional[Dict[str, float]] = None
    class_probabilities: Optional[Dict[str, float]] = None
    explanation: Optional[str] = None

class PredictionIntelligence(BaseModel):
    predicted_class: str
    confidence: float
    confidence_band: str # 'LOW', 'MEDIUM', 'HIGH'
    confidence_margin: float
    confidence_quality: str # 'STRONG', 'MODERATE', 'WEAK'
    quality_reason: Optional[str] = None
    interpretation_notice: str
    model_version: str
    class_probabilities: Dict[str, float]
    runner_up_class: Optional[str] = None
    runner_up_probability: Optional[float] = None

class StructuredEvidence(BaseModel):
    thermal: List[str]
    spatial: List[str]
    temporal: List[str]
    class_specific: List[str]
    summary: List[str]

class TopFeatureImportance(BaseModel):
    feature: str
    importance: float
    value: Optional[float] = None
    description: Optional[str] = None

class RiskIntelligence(BaseModel):
    score: float
    level: str # 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    reasons: List[str]
    breakdown: Dict[str, float]
    action_recommended: Optional[str] = None

class HotspotIntelligence(BaseModel):
    event_id: str
    prediction: PredictionIntelligence
    evidence: StructuredEvidence
    feature_importance: List[TopFeatureImportance]
    risk: RiskIntelligence
    explanation: str

class AlertBase(BaseModel):
    id: str
    event_id: str
    title: str
    description: str
    severity: str # 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    status: str   # 'ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'
    facility_name: Optional[str] = None
    action_recommended: Optional[str] = None
    created_at: datetime

class HotspotDetail(BaseModel):
    event: ThermalEventBase
    geo_context: GeoContextBase
    temporal_profile: TemporalProfileBase
    classification: ClassificationBase
    alert: Optional[AlertBase] = None

class HotspotListItem(BaseModel):
    id: str
    latitude: float
    longitude: float
    timestamp: datetime
    brightness: float
    frp: float
    confidence: float
    predicted_class: str
    risk_score: str
    persistence_days: int
    is_persistent: bool
    nearest_industry: str
    distance_to_industry: float
    land_cover: str

class AnalyzeRequest(BaseModel):
    latitude: float
    longitude: float
    brightness: float
    frp: float
    confidence: Optional[float] = 85.0
    satellite: Optional[str] = "VIIRS_SNPP"
    timestamp: Optional[datetime] = None

class AnalyzeResponse(BaseModel):
    event_id: str
    predicted_class: str
    confidence: float
    risk_score: str
    risk_value: float
    persistence_score: float
    evidence: List[str]
    geo_context: GeoContextBase
    temporal_summary: Dict[str, Any]
    feature_vector: Dict[str, float]

class StatisticsResponse(BaseModel):
    total_hotspots: int
    high_risk_count: int
    persistent_sources: int
    industrial_sources: int
    wildfires: int
    agricultural_burns: int
    active_alerts: int
    data_provider_mode: str
    last_updated: datetime

class FilterOptions(BaseModel):
    classes: List[str]
    risk_levels: List[str]
    regions: List[Dict[str, Any]]
    satellites: List[str]

class FIRMSIngestRequest(BaseModel):
    records: List[Dict[str, Any]]
    auto_enrich: Optional[bool] = True

class IngestionSummary(BaseModel):
    status: str
    records_received: int
    records_accepted: int
    records_rejected: int
    records_deduplicated: int
    records_enriched: int
    validation_errors: List[str] = []
    ingested_ids: List[str] = []
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class ProviderStatusResponse(BaseModel):
    system_mode: str
    firms: Dict[str, Any]
    osm: Dict[str, Any]
    landcover: Dict[str, Any]
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class DemoScenario(BaseModel):
    id: str
    code: str
    title: str
    category: str
    location: str
    latitude: float
    longitude: float
    expected_class: str
    expected_risk: str
    description: str
    key_evidence: List[str]
