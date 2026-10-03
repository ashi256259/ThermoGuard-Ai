/**
 * ThermoGuard AI - API Client Service
 * Configured with dynamic VITE_API_BASE_URL
 * Defaults to same-origin in development/production proxies
 */




import { ThermalSourceFingerprint, SmartAlertPriority } from "../types";

const apiFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const res = await fetch(input, init);
  if (res.status === 401) {
    const clone = res.clone();
    try {
      const json = await clone.json();
      if (json.error === "SESSION_EXPIRED_OR_INVALID" || (json.message && json.message.includes("Session token is invalid"))) {
        localStorage.removeItem("thermoguard_auth_token");
        window.location.reload();
      }
    } catch (e) {}
  }
  return res;
};

const API_BASE_URL = (((import.meta as any).env?.VITE_API_BASE_URL as string) || "").replace(/\/$/, "");

function getAuthHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    ...extraHeaders
  };
  try {
    const token = localStorage.getItem("thermoguard_auth_token");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  } catch {
    // Ignore localStorage restrictions
  }
  return headers;
}

export interface HealthResponse {
  status: "ok" | "healthy" | "error";
  service: string;
  version: string;
  sih_ps_id?: string;
  organisation?: string;
  data_provider_mode?: string;
  timestamp?: string;
}

export interface HotspotItem {
  event: {
    id: string;
    latitude: number;
    longitude: number;
    timestamp: string;
    brightness: number;
    frp: number;
    confidence: number;
    satellite: string;
    source: string;
    cluster_id: string;
    daynight: "D" | "N";
  };
  geo_context: {
    nearest_industrial_facility: string;
    facility_type: string;
    distance_to_industry: number;
    land_cover: string;
    nearby_infrastructure?: string;
    distance_to_infrastructure?: number;
    nearby_road?: string;
    distance_to_road?: number;
    spatial_flags?: {
      is_industrial_zone: boolean;
      is_forest_zone: boolean;
      is_farmland_zone: boolean;
      is_mining_zone: boolean;
    };
  };
  temporal_profile: {
    cluster_id: string;
    first_seen: string;
    observation_count: number;
    frequency_per_week: number;
    recurrence_ratio: number;
    persistence_days: number;
    seasonal_pattern?: string;
    is_persistent: boolean;
  };
  classification: {
    predicted_class: "Industrial Fire" | "Gas Flare" | "Agricultural Burning" | "Wildfire" | "Mining" | "Other" | "ML_UNAVAILABLE";
    confidence: number;
    risk_score: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    risk_value: number;
    persistence_score: number;
    model_version: string;
    evidence: string[];
    feature_vector?: Record<string, number>;
    class_probabilities?: Record<string, number>;
    risk_breakdown?: {
      thermal_intensity_score: number;
      hazard_proximity_score: number;
      source_type_hazard_score: number;
      temporal_urgency_score: number;
    };
  };
  alert?: {
    id: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    title: string;
    description: string;
    facility_name?: string;
    action_recommended?: string;
    status: string;
    created_at: string;
    priority_score?: number;
    priority_level?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | string;
    priority_factors?: string[];
  };
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
  last_updated?: string;
}

export interface FilterOptionsData {
  classes: string[];
  risk_levels: string[];
  regions: Array<{ id: string; name: string; center: [number, number]; zoom: number }>;
  satellites: string[];
}

export const apiService = {
  /** Check backend health status */
  async checkHealth(): Promise<HealthResponse> {
    const url = `${API_BASE_URL}/api/health`;
    const res = await apiFetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`Health check failed with status: ${res.status}`);
    }
    return res.json();
  },

  /** Fetch filtered thermal hotspots */
  async getHotspots(params?: {
    source_class?: string;
    risk_score?: string;
    min_confidence?: number;
    region?: string;
    is_persistent?: boolean | string;
    industrial_only?: boolean | string;
    land_cover?: string;
    min_frp?: number;
    max_frp?: number;
  }): Promise<HotspotItem[]> {
    const query = new URLSearchParams();
    if (params?.source_class && params.source_class !== "All" && params.source_class !== "ALL") query.append("source_class", params.source_class);
    if (params?.risk_score && params.risk_score !== "All" && params.risk_score !== "ALL") query.append("risk_score", params.risk_score);
    if (params?.min_confidence !== undefined && params.min_confidence !== null) query.append("min_confidence", params.min_confidence.toString());
    if (params?.region && params.region !== "all_india" && params.region !== "All") query.append("region", params.region);
    if (params?.is_persistent !== undefined && params.is_persistent !== "All") query.append("is_persistent", params.is_persistent.toString());
    if (params?.industrial_only) query.append("industrial_only", params.industrial_only.toString());
    if (params?.land_cover && params.land_cover !== "All") query.append("land_cover", params.land_cover);
    if (params?.min_frp !== undefined) query.append("min_frp", params.min_frp.toString());
    if (params?.max_frp !== undefined) query.append("max_frp", params.max_frp.toString());

    const qs = query.toString();
    const url = `${API_BASE_URL}/api/hotspots${qs ? `?${qs}` : ""}`;
    const res = await apiFetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch hotspots: ${res.status}`);
    }
    return res.json();
  },

  /** Get specific hotspot details */
  async getHotspotById(id: string): Promise<HotspotItem> {
    const res = await apiFetch(`${API_BASE_URL}/api/hotspots/${id}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch hotspot ${id}`);
    }
    return res.json();
  },

  /** Get specific hotspot geo-context */
  async getHotspotContext(id: string): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/hotspots/${id}/context`);
    if (!res.ok) {
      throw new Error(`Failed to fetch context for hotspot ${id}`);
    }
    return res.json();
  },

  /** Get specific hotspot ML classification */
  async getHotspotClassification(id: string): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/hotspots/${id}/classification`);
    if (!res.ok) {
      throw new Error(`Failed to fetch classification for hotspot ${id}`);
    }
    return res.json();
  },

  /** Get specific hotspot explainability intelligence dossier */
  async getHotspotIntelligence(id: string): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/hotspots/${id}/intelligence`);
    if (!res.ok) {
      throw new Error(`Failed to fetch intelligence for hotspot ${id}`);
    }
    return res.json();
  },

  /** Get specific hotspot temporal profile */
  async getHotspotTemporalProfile(id: string): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/hotspots/${id}/temporal-profile`);
    if (!res.ok) {
      throw new Error(`Failed to fetch temporal profile for hotspot ${id}`);
    }
    return res.json();
  },

  /** Get multi-temporal observation timeline for a hotspot */
  async getHotspotTimeline(id: string, days?: number | string): Promise<{
    event_id: string;
    cluster_id: string;
    temporal_profile: any;
    time_range?: {
      days_requested: number | string;
      earliest_pass: string;
      latest_pass: string;
      span_days: number;
    };
    summary?: {
      total_passes: number;
      active_days: number;
      avg_frp: number;
      max_frp: number;
      min_frp: number;
      avg_brightness: number;
      day_passes: number;
      night_passes: number;
      satellites: string[];
    };
    observation_history: Array<{
      id?: string;
      date: string;
      timestamp?: string;
      frp: number;
      brightness: number;
      satellite: string;
      confidence?: number;
      daynight?: string;
    }>;
  }> {
    const qs = days ? `?days=${days}` : "";
    const res = await apiFetch(`${API_BASE_URL}/api/hotspots/${id}/timeline${qs}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch timeline for hotspot ${id}`);
    }
    return res.json();
  },

  /** Get high-level KPI statistics */
  async getStatistics(): Promise<StatisticsData> {
    const res = await apiFetch(`${API_BASE_URL}/api/statistics`);
    if (!res.ok) {
      throw new Error(`Failed to fetch statistics: ${res.status}`);
    }
    return res.json();
  },

  /** Get operational alerts with optional filtering */
  async getAlerts(params?: { severity?: string; status?: string }): Promise<any[]> {
    const query = new URLSearchParams();
    if (params?.severity && params.severity !== "All" && params.severity !== "ALL") query.append("severity", params.severity);
    if (params?.status && params.status !== "All" && params.status !== "ALL") query.append("status", params.status);

    const qs = query.toString();
    const url = `${API_BASE_URL}/api/alerts${qs ? `?${qs}` : ""}`;
    const res = await apiFetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch alerts: ${res.status}`);
    }
    return res.json();
  },

  /** Update lifecycle status of an operational alert */
  async updateAlertStatus(alertId: string, status: string, notes?: string, assignedTeam?: string): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/alerts/${alertId}/status`, {
      method: "PATCH",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ status, notes, assigned_team: assignedTeam })
    });
    if (!res.ok) {
      // Fallback to PUT
      const putRes = await apiFetch(`${API_BASE_URL}/api/alerts/${alertId}/status`, {
        method: "PUT",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status, notes, assigned_team: assignedTeam })
      });
      if (!putRes.ok) {
        const errJson = await putRes.json().catch(() => ({}));
        throw new Error(errJson.message || `Failed to update alert ${alertId} status: ${putRes.status}`);
      }
      return putRes.json();
    }
    return res.json();
  },

  /** Assign operational response team to an alert */
  async assignAlertTeam(alertId: string, team: string, notes?: string): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/alerts/${alertId}/assign`, {
      method: "POST",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ team, notes })
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || `Failed to assign team to alert ${alertId}: ${res.status}`);
    }
    return res.json();
  },

  /** Execute formal incident alert command action (ACKNOWLEDGE, ASSIGN, INVESTIGATE, RESOLVE, REOPEN, ESCALATE) */
  async executeAlertAction(alertId: string, action: string, notes?: string, team?: string): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/alerts/${alertId}/action`, {
      method: "POST",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ action, notes, team })
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || `Failed to execute action on alert ${alertId}: ${res.status}`);
    }
    return res.json();
  },

  /** Administrative Overview Telemetry */
  async getAdminOverview(): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/admin/overview`, {
      headers: getAuthHeaders({ Accept: "application/json" })
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || `Failed to fetch admin overview: ${res.status}`);
    }
    return res.json();
  },

  /** Detailed System Health Metrics */
  async getAdminSystemHealth(): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/admin/system-health`, {
      headers: getAuthHeaders({ Accept: "application/json" })
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || `Failed to fetch system health: ${res.status}`);
    }
    return res.json();
  },

  /** List all registered users (Admin only) */
  async getAdminUsers(): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/admin/users`, {
      headers: getAuthHeaders({ Accept: "application/json" })
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || `Failed to fetch user list: ${res.status}`);
    }
    return res.json();
  },

  /** Create a new user (Admin only) */
  async createAdminUser(userData: {
    username: string;
    email: string;
    name: string;
    password: string;
    role: string;
    department?: string;
  }): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/admin/users`, {
      method: "POST",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(userData)
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || `Failed to create user: ${res.status}`);
    }
    return res.json();
  },

  /** Update user role & clearance (Admin only) */
  async updateAdminUserRole(userId: string, role: string, clearanceLevel?: string): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/admin/users/${userId}/role`, {
      method: "PATCH",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ role, clearance_level: clearanceLevel })
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || `Failed to update user role: ${res.status}`);
    }
    return res.json();
  },

  /** Delete a user account (Admin only) */
  async deleteAdminUser(userId: string): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/admin/users/${userId}`, {
      method: "DELETE",
      headers: getAuthHeaders({ Accept: "application/json" })
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || `Failed to delete user: ${res.status}`);
    }
    return res.json();
  },

  /** List active user sessions (Admin only) */
  async getAdminSessions(): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/admin/sessions`, {
      headers: getAuthHeaders({ Accept: "application/json" })
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || `Failed to fetch active sessions: ${res.status}`);
    }
    return res.json();
  },

  /** Revoke an active session token (Admin only) */
  async revokeAdminSession(token: string): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/admin/sessions/revoke`, {
      method: "POST",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ token })
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || `Failed to revoke session: ${res.status}`);
    }
    return res.json();
  },

  /** Get system admin configurations */
  async getAdminConfig(): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/admin/config`, {
      headers: getAuthHeaders({ Accept: "application/json" })
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || `Failed to fetch admin config: ${res.status}`);
    }
    return res.json();
  },

  /** Update system admin configurations */
  async updateAdminConfig(config: Record<string, any>): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/admin/config`, {
      method: "PUT",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(config)
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || `Failed to save admin configuration: ${res.status}`);
    }
    return res.json();
  },

  /** Toggle or set data mode (LIVE vs DEMO) */
  async toggleAdminDataMode(mode?: "LIVE" | "DEMO" | "LIVE_SATELLITE_API" | "DEMO_SAMPLE_DATA"): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/admin/toggle-data-mode`, {
      method: "POST",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ mode })
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || `Failed to toggle data mode: ${res.status}`);
    }
    return res.json();
  },

  /** Test provider connectivity diagnostics */
  async testAdminProvider(provider: string): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/admin/provider/test`, {
      method: "POST",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ provider })
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || `Failed to test provider: ${res.status}`);
    }
    return res.json();
  },

  /** Get machine learning model metadata & feature weights */
  async getMlModelInfo(): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/ml/model-info`);
    if (!res.ok) {
      throw new Error(`Failed to fetch ML model info: ${res.status}`);
    }
    return res.json();
  },

  /** Execute direct ML tabular inference on feature vector */
  async predictMlDirect(features: Record<string, number>): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/ml/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ features })
    });
    if (!res.ok) {
      throw new Error(`Direct ML prediction failed: ${res.status}`);
    }
    return res.json();
  },

  /** Get available filter taxonomies */
  async getFilters(): Promise<FilterOptionsData> {
    const res = await apiFetch(`${API_BASE_URL}/api/filters`);
    if (!res.ok) {
      throw new Error(`Failed to fetch filters: ${res.status}`);
    }
    return res.json();
  },

  /** Analyze ad-hoc custom coordinates */
  async analyzeCustom(payload: {
    latitude: number;
    longitude: number;
    brightness: number;
    frp: number;
    confidence?: number;
    satellite?: string;
  }): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      throw new Error(`Custom analysis failed with status: ${res.status}`);
    }
    return res.json();
  },

  /** Get data provider integration status */
  async getProviderStatus(validate: boolean = false): Promise<any> {
    const url = validate ? `${API_BASE_URL}/api/provider/status?validate=true` : `${API_BASE_URL}/api/provider/status`;
    const res = await apiFetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch provider status: ${res.status}`);
    }
    return res.json();
  },

  /** Active live verification check against NASA FIRMS API */
  async checkFirmsConnectivity(key?: string, force: boolean = false): Promise<any> {
    const params = new URLSearchParams();
    if (key) params.append("key", key);
    if (force) params.append("force", "true");
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await apiFetch(`${API_BASE_URL}/api/provider/firms-check${query}`);
    return res.json();
  },

  /** Get automatic ingestion status & metrics */
  async getIngestionStatus(): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/ingest/status`);
    if (!res.ok) {
      throw new Error(`Failed to fetch ingestion status: ${res.status}`);
    }
    return res.json();
  },

  /** Trigger on-demand live NASA FIRMS ingestion */
  async triggerLiveIngestion(bbox?: string, source?: string): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/ingest/firms-live`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bbox, source })
    });
    if (!res.ok) {
      throw new Error(`Live ingestion failed with status: ${res.status}`);
    }
    return res.json();
  },

  /** Get SIH 2026 test scenarios A-E */
  async getScenarios(): Promise<any[]> {
    const res = await apiFetch(`${API_BASE_URL}/api/scenarios`);
    if (!res.ok) {
      throw new Error(`Failed to fetch scenarios: ${res.status}`);
    }
    return res.json();
  },

  /** Load a specific SIH test scenario into the active store */
  async loadScenario(scenarioId: string): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/scenarios/${scenarioId}/load`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    if (!res.ok) {
      throw new Error(`Failed to load scenario: ${res.status}`);
    }
    return res.json();
  },

  /** Reset data store to calibrated demo baseline */
  async resetDemo(): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/scenarios/reset-demo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    if (!res.ok) {
      throw new Error(`Failed to reset demo: ${res.status}`);
    }
    return res.json();
  },

  /** Ingest batch of NASA FIRMS records */
  async ingestFirmsRecords(records: any[], autoEnrich: boolean = true): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/ingest/firms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records, auto_enrich: autoEnrich })
    });
    if (!res.ok) {
      throw new Error(`FIRMS ingestion failed with status: ${res.status}`);
    }
    return res.json();
  },

  /** Get ML model metadata and specification */
  async getModelInfo(): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/ml/model-info`);
    if (!res.ok) {
      throw new Error(`Failed to fetch ML model info: ${res.status}`);
    }
    return res.json();
  },

  /** Get ingestion pipeline statistics */
  async getIngestionStats(): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/ingest/stats`);
    if (!res.ok) {
      throw new Error(`Failed to fetch ingestion stats: ${res.status}`);
    }
    return res.json();
  },

  /** Priority 6: Submit Analyst Human Verification / Classification decision */
  async verifyThermalEvent(
    eventId: string,
    params: {
      status: "CONFIRMED" | "RECLASSIFIED" | "NEEDS_REVIEW";
      verified_class?: string;
      reason?: string;
    }
  ): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/events/${eventId}/verify`, {
      method: "POST",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || `Verification failed with status: ${res.status}`);
    }
    return res.json();
  },

  /** Get Verification status and audit history for an event */
  async getEventVerification(eventId: string): Promise<any> {
    const res = await apiFetch(`${API_BASE_URL}/api/events/${eventId}/verification`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch verification for ${eventId}: ${res.status}`);
    }
    return res.json();
  }
};
