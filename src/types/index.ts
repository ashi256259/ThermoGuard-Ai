export type SourceClass =
  | "Industrial Fire"
  | "Gas Flare"
  | "Agricultural Burning"
  | "Wildfire"
  | "Mining"
  | "Other"
  | "ML_UNAVAILABLE";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface ThermalEvent {
  id: string;
  latitude: floatNumber;
  longitude: floatNumber;
  timestamp: string;
  brightness: number; // Kelvin
  frp: number;        // MW
  confidence: number; // 0 - 100%
  satellite: string;
  source: string;
  cluster_id?: string;
  daynight?: "D" | "N";
}

export type floatNumber = number;

export interface GeoContext {
  nearest_industrial_facility: string;
  facility_type: string;
  distance_to_industry: number; // in meters
  land_cover: string;
  nearby_infrastructure?: string;
  distance_to_infrastructure?: number;
  nearby_road?: string;
  distance_to_road?: number;
  contextual_attributes?: Record<string, any>;
  spatial_flags?: {
    is_industrial_zone: boolean;
    is_forest_zone: boolean;
    is_farmland_zone: boolean;
    is_mining_zone: boolean;
    facility_operator?: string;
  };
}

export interface TemporalProfile {
  cluster_id: string;
  first_seen: string;
  last_seen: string;
  observation_count: number;
  frequency_per_week: number;
  recurrence_ratio: number;
  persistence_days: number;
  seasonal_pattern?: string;
  is_persistent: boolean;
  active_days?: number;
  active_duration_hours?: number;
  average_revisit_hours?: number | null;
  median_revisit_hours?: number | null;
  min_revisit_hours?: number | null;
  max_revisit_hours?: number | null;
  recurrence_count?: number;
  persistence_score?: number;
  persistence_class?: "TRANSIENT" | "INTERMITTENT" | "PERSISTENT";
  seasonality_score?: number;
  seasonal_concentration?: number;
  peak_month?: number | null;
  active_day_ratio?: number;
  ml_features?: Record<string, number>;
}

export interface StructuredEvidence {
  thermal: string[];
  spatial: string[];
  temporal: string[];
  class_specific: string[];
  summary: string[];
}

export type ConfidenceBand = "LOW" | "MEDIUM" | "HIGH";
export type ConfidenceQuality = "STRONG" | "MODERATE" | "WEAK";

export interface FeatureContribution {
  feature: string;
  importance: number;
  value?: number | null;
  description?: string;
}

export interface PredictionIntelligence {
  predicted_class: SourceClass;
  confidence: number;
  confidence_band: ConfidenceBand;
  confidence_margin: number;
  confidence_quality: ConfidenceQuality;
  quality_reason?: string;
  interpretation_notice: string;
  model_version: string;
  class_probabilities: Record<string, number>;
  runner_up_class?: string | null;
  runner_up_probability?: number | null;
}

export interface RiskIntelligence {
  score: number;
  level: RiskLevel;
  reasons: string[];
  breakdown: Record<string, number>;
  action_recommended?: string;
}

export interface HotspotIntelligence {
  event_id: string;
  prediction: PredictionIntelligence;
  evidence: StructuredEvidence;
  feature_importance: FeatureContribution[];
  risk: RiskIntelligence;
  explanation: string;
}

export interface ClassificationResult {
  predicted_class: SourceClass;
  confidence: number; // 0.0 - 1.0
  risk_score: RiskLevel;
  risk_value: number; // 0 - 100
  persistence_score: number;
  model_version: string;
  evidence: string[];
  feature_vector: Record<string, number>;
  class_probabilities?: Record<string, number>;
  risk_breakdown?: {
    thermal_intensity_score: number;
    hazard_proximity_score: number;
    source_type_hazard_score: number;
    temporal_urgency_score: number;
    infrastructure_hazard_score?: number;
  };
  confidence_band?: ConfidenceBand;
  confidence_margin?: number;
  confidence_quality?: ConfidenceQuality;
  interpretation_notice?: string;
  structured_evidence?: StructuredEvidence;
  risk_reasons?: string[];
  explanation?: string;
  // Priority 6: Human Verification / Analyst Review
  verification_status?: VerificationStatus;
  verified_class?: SourceClass | string | null;
  verified_by?: string | null;
  verified_by_name?: string | null;
  verified_at?: string | null;
  verification_reason?: string | null;
  verification_audit_trail?: VerificationAuditEntry[];
}

export type VerificationStatus = "UNVERIFIED" | "CONFIRMED" | "RECLASSIFIED" | "NEEDS_REVIEW";

export interface VerificationAuditEntry {
  timestamp: string;
  action: VerificationStatus | string;
  performed_by: string;
  user_id?: string;
  badge_number?: string | null;
  previous_status?: VerificationStatus | string;
  ai_predicted_class?: string;
  verified_class?: string | null;
  reason?: string | null;
}

export type IncidentStatus = "NEW" | "ACTIVE" | "ACKNOWLEDGED" | "ASSIGNED" | "INVESTIGATING" | "RESOLVED";

export type ResponseTeamType =
  | "Industrial Emergency Response"
  | "Forest Fire Response"
  | "Field Inspection"
  | "GIS Verification";

export interface AlertAuditEntry {
  timestamp: string;
  action: string;
  performed_by: string;
  notes?: string;
}

export interface AlertItem {
  id: string;
  event_id: string;
  title: string;
  description: string;
  severity: RiskLevel;
  status: IncidentStatus;
  incident_status?: IncidentStatus;
  facility_name?: string;
  action_recommended?: string;
  assigned_team?: ResponseTeamType | string | null;
  assigned_by?: string | null;
  assigned_at?: string | null;
  acknowledged_by?: string | null;
  acknowledged_at?: string | null;
  resolved_by?: string | null;
  resolved_at?: string | null;
  resolution_notes?: string | null;
  audit_trail?: AlertAuditEntry[];
  created_at: string;
  updated_at?: string;
  // Smart Alert Prioritization
  priority_score?: number;
  priority_level?: RiskLevel;
  priority_factors?: string[];
}

export interface ThermalSourceFingerprint {
  persistence: "Low" | "Medium" | "High" | "Insufficient observations";
  persistence_level: "LOW" | "MEDIUM" | "HIGH" | "INSUFFICIENT_DATA";
  recurrence: string;
  active_days: number | string;
  temporal_pattern: "Recurrent" | "Episodic" | "Persistent" | "Isolated" | "Temporal Pattern Uncertain" | string;
  night_activity: string;
  industrial_proximity_m: number | null;
  industrial_proximity_label: string;
  land_cover: string;
  cluster_density: string;
  thermal_intensity: string;
  summary_pattern: string;
}

export interface SmartAlertPriority {
  score: number; // 0 - 100
  level: RiskLevel; // "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  factors: string[];
}

export interface HotspotRecord {
  event: ThermalEvent;
  geo_context: GeoContext;
  temporal_profile: TemporalProfile;
  classification: ClassificationResult;
  alert?: AlertItem;
  intelligence?: HotspotIntelligence;
  fingerprint?: ThermalSourceFingerprint;
  priority?: SmartAlertPriority;
}

export interface StatisticsData {
  total_hotspots: number;
  high_risk_count: number;
  persistent_sources: number;
  industrial_sources: number;
  wildfires: number;
  agricultural_burns: number;
  active_alerts: number;
  data_provider_mode: string;
  last_updated: string;
  by_class?: Record<string, number>;
  by_risk?: Record<string, number>;
  live_count?: number;
  demo_count?: number;
}

export interface DemoScenario {
  id: string;
  name: string;
  description: string;
  region: string;
  target_class: SourceClass;
  risk: RiskLevel;
  center: [number, number];
  zoom: number;
  sample_event_id: string;
  key_insight: string;
}
