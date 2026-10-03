import fs from "fs";
import path from "path";

export interface RawObservation {
  id: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  brightness: number;
  frp: number;
  confidence: number;
  satellite?: string;
  source?: string;
  cluster_id?: string;
  daynight?: string;
}

export interface ClusterCentroid {
  cluster_id: string;
  centroid_lat: number;
  centroid_lon: number;
  latest_timestamp: string;
  earliest_timestamp: string;
  observation_count: number;
}

export interface TemporalProfileResult {
  cluster_id: string;
  status: "SUCCESS" | "TEMPORAL_DATA_INSUFFICIENT";
  behaviour: "Persistent" | "Transient" | "Insufficient Data";
  first_seen: string;
  last_seen: string;
  first_observed_at: string;
  last_observed_at: string;
  observation_count: number;
  active_days: number;
  inactive_days: number;
  active_day_ratio: number;
  active_duration_days: number;
  active_duration_hours: number;
  persistence_days: number;
  persistence_score: number;
  persistence_class: "TRANSIENT" | "INTERMITTENT" | "PERSISTENT";
  is_persistent: boolean;
  frequency_per_week: number;
  observations_per_day: number;
  recurrence_count: number;
  recurrence_ratio: number;
  distinct_active_periods: number;
  average_revisit_hours: number | null;
  median_revisit_hours: number | null;
  min_revisit_hours: number | null;
  max_revisit_hours: number | null;
  seasonality_score: number;
  seasonal_concentration: number;
  seasonal_pattern: string;
  seasonality_flag: boolean;
  peak_month: number | null;
  active_months: number[];
  monthly_distribution: Record<string, number>;
  temporal_confidence: number;
  ml_features: {
    observation_count: number;
    active_days: number;
    active_duration: number;
    observation_frequency: number;
    recurrence_count: number;
    recurrence_ratio: number;
    average_revisit_interval: number;
    median_revisit_interval: number;
    persistence_score: number;
    seasonality_score: number;
    seasonal_concentration: number;
  };
}

// Configurable constants adhering to environment variables
export const TEMPORAL_CONFIG = {
  get CLUSTER_RADIUS_KM(): number {
    return parseFloat(process.env.TEMPORAL_CLUSTER_RADIUS_KM || "1.2");
  },
  get CLUSTER_WINDOW_HOURS(): number {
    return parseFloat(process.env.TEMPORAL_CLUSTER_WINDOW_HOURS || "720.0"); // 30 days
  },
  get INACTIVE_GAP_HOURS(): number {
    return parseFloat(process.env.TEMPORAL_INACTIVE_GAP_HOURS || "24.0");
  },
  get PERSISTENCE_DAYS_PERSISTENT(): number {
    return parseFloat(process.env.TEMPORAL_PERSISTENCE_DAYS_PERSISTENT || "21");
  },
  get PERSISTENCE_DAYS_TRANSIENT(): number {
    return parseFloat(process.env.TEMPORAL_PERSISTENCE_DAYS_TRANSIENT || "3");
  },
  get MIN_OBSERVATIONS_FOR_SEASONALITY(): number {
    return parseInt(process.env.TEMPORAL_MIN_OBSERVATIONS_FOR_SEASONALITY || "5", 10);
  }
};

/**
 * Calculates great-circle Haversine distance in kilometers between two lat/lon coordinates.
 */
export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371.0; // Earth mean radius in km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return R * c;
}

/**
 * Parses any ISO or date string safely to a UTC Date object.
 */
export function parseUtcDate(val: any): Date {
  if (val instanceof Date) return val;
  if (typeof val === "string") {
    try {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d;
    } catch {
      // ignore
    }
  }
  return new Date();
}

/**
 * Given a new observation point (lat, lon, timestamp) and existing cluster centroids,
 * identifies the closest matching cluster within TEMPORAL_CLUSTER_RADIUS_KM and window.
 * Returns existing cluster_id or creates a deterministic new cluster_id.
 */
export function findOrCreateSpatialCluster(
  lat: number,
  lon: number,
  timestampStr: string,
  existingCentroids: ClusterCentroid[],
  radiusKm?: number,
  windowHours?: number
): string {
  const rKm = radiusKm !== undefined ? radiusKm : TEMPORAL_CONFIG.CLUSTER_RADIUS_KM;
  const wH = windowHours !== undefined ? windowHours : TEMPORAL_CONFIG.CLUSTER_WINDOW_HOURS;
  const obsTime = parseUtcDate(timestampStr).getTime();

  let closestCluster: ClusterCentroid | null = null;
  let minDistance = Infinity;

  for (const c of existingCentroids) {
    const dist = haversineDistanceKm(lat, lon, c.centroid_lat, c.centroid_lon);
    if (dist <= rKm) {
      // Check temporal window: within window hours of latest or earliest cluster timestamp
      const cLatest = parseUtcDate(c.latest_timestamp).getTime();
      const timeDiffH = Math.abs(obsTime - cLatest) / (1000 * 3600);
      if (timeDiffH <= wH) {
        if (dist < minDistance) {
          minDistance = dist;
          closestCluster = c;
        }
      }
    }
  }

  if (closestCluster) {
    return closestCluster.cluster_id;
  }

  // Deterministic new cluster ID based on micro-coordinates
  const latHash = Math.abs(Math.round(lat * 1000)).toString(16);
  const lonHash = Math.abs(Math.round(lon * 1000)).toString(16);
  return `cls-st-${latHash}-${lonHash}`;
}

/**
 * Pure, unbiased temporal intelligence engine.
 * Calculates multi-temporal features directly from observed historical passes
 * in the database for a specific cluster.
 * 
 * Never fabricates observation counts, persistence duration, frequency or recurrence.
 * If data is insufficient (<2 observations), clearly marks state as TEMPORAL_DATA_INSUFFICIENT.
 */
export function calculateTemporalProfile(
  observations: RawObservation[],
  clusterId: string
): TemporalProfileResult {
  // 1. Deduplicate by unique ISO timestamp and sort chronologically
  const uniqueMap = new Map<string, { obs: RawObservation; date: Date }>();
  for (const o of observations) {
    const d = parseUtcDate(o.timestamp);
    const iso = d.toISOString();
    if (!uniqueMap.has(iso)) {
      uniqueMap.set(iso, { obs: o, date: d });
    }
  }

  const sorted = Array.from(uniqueMap.values()).sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
  const n_obs = sorted.length;

  // ---------------------------------------------------------------------
  // Case A: 0 Observations (Empty history)
  // ---------------------------------------------------------------------
  if (n_obs === 0) {
    const nowIso = new Date().toISOString();
    return {
      cluster_id: clusterId,
      status: "TEMPORAL_DATA_INSUFFICIENT",
      behaviour: "Insufficient Data",
      first_seen: nowIso,
      last_seen: nowIso,
      first_observed_at: nowIso,
      last_observed_at: nowIso,
      observation_count: 0,
      active_days: 0,
      inactive_days: 0,
      active_day_ratio: 0.0,
      active_duration_days: 0.0,
      active_duration_hours: 0.0,
      persistence_days: 1,
      persistence_score: 0.0,
      persistence_class: "TRANSIENT",
      is_persistent: false,
      frequency_per_week: 0.0,
      observations_per_day: 0.0,
      recurrence_count: 0,
      recurrence_ratio: 0.0,
      distinct_active_periods: 0,
      average_revisit_hours: null,
      median_revisit_hours: null,
      min_revisit_hours: null,
      max_revisit_hours: null,
      seasonality_score: 0.0,
      seasonal_concentration: 0.0,
      seasonal_pattern: "INSUFFICIENT_DATA",
      seasonality_flag: false,
      peak_month: null,
      active_months: [],
      monthly_distribution: {},
      temporal_confidence: 0.0,
      ml_features: {
        observation_count: 0,
        active_days: 0,
        active_duration: 0,
        observation_frequency: 0,
        recurrence_count: 0,
        recurrence_ratio: 0,
        average_revisit_interval: 0,
        median_revisit_interval: 0,
        persistence_score: 0,
        seasonality_score: 0,
        seasonal_concentration: 0
      }
    };
  }

  const dts = sorted.map((s) => s.date);
  const t_first = dts[0];
  const t_last = dts[dts.length - 1];

  const firstIso = t_first.toISOString();
  const lastIso = t_last.toISOString();

  const active_duration_sec = Math.max(0, (t_last.getTime() - t_first.getTime()) / 1000);
  const active_duration_days = Math.round((active_duration_sec / 86400) * 100) / 100;
  const active_duration_hours = Math.round((active_duration_sec / 3600) * 100) / 100;

  // Calendar dates (UTC)
  const calendar_dates = new Set(dts.map((d) => d.toISOString().slice(0, 10)));
  const active_days = calendar_dates.size;
  const calendar_span_days = Math.max(
    1,
    active_duration_days > 0 ? Math.ceil(active_duration_days) + 1 : 1
  );
  const inactive_days = Math.max(0, calendar_span_days - active_days);
  const active_day_ratio = Math.round(Math.min(1.0, active_days / calendar_span_days) * 1000) / 1000;

  // Observation frequency (passes / week)
  let frequency_per_week: number;
  if (active_duration_days >= 7.0) {
    frequency_per_week = Math.round((n_obs / (active_duration_days / 7.0)) * 100) / 100;
  } else if (active_duration_days >= 1.0) {
    frequency_per_week = Math.round(n_obs * (7.0 / active_duration_days) * 100) / 100;
  } else {
    frequency_per_week = Number(n_obs.toFixed(2));
  }
  const observations_per_day = Math.round((n_obs / Math.max(1, active_days)) * 100) / 100;

  // ---------------------------------------------------------------------
  // Case B: Exactly 1 Observation (Single-pass transient)
  // ---------------------------------------------------------------------
  if (n_obs === 1) {
    return {
      cluster_id: clusterId,
      status: "TEMPORAL_DATA_INSUFFICIENT",
      behaviour: "Insufficient Data",
      first_seen: firstIso,
      last_seen: lastIso,
      first_observed_at: firstIso,
      last_observed_at: lastIso,
      observation_count: 1,
      active_days: 1,
      inactive_days: 0,
      active_day_ratio: 1.0,
      active_duration_days: 0.0,
      active_duration_hours: 0.0,
      persistence_days: 1,
      persistence_score: 0.05,
      persistence_class: "TRANSIENT",
      is_persistent: false,
      frequency_per_week: 1.0,
      observations_per_day: 1.0,
      recurrence_count: 0,
      recurrence_ratio: 0.0,
      distinct_active_periods: 1,
      average_revisit_hours: null,
      median_revisit_hours: null,
      min_revisit_hours: null,
      max_revisit_hours: null,
      seasonality_score: 0.0,
      seasonal_concentration: 0.0,
      seasonal_pattern: "INSUFFICIENT_DATA",
      seasonality_flag: false,
      peak_month: t_first.getUTCMonth() + 1,
      active_months: [t_first.getUTCMonth() + 1],
      monthly_distribution: { [String(t_first.getUTCMonth() + 1)]: 1 },
      temporal_confidence: 0.30,
      ml_features: {
        observation_count: 1,
        active_days: 1,
        active_duration: 0.0,
        observation_frequency: 1.0,
        recurrence_count: 0,
        recurrence_ratio: 0.0,
        average_revisit_interval: 0.0,
        median_revisit_interval: 0.0,
        persistence_score: 0.05,
        seasonality_score: 0.0,
        seasonal_concentration: 0.0
      }
    };
  }

  // ---------------------------------------------------------------------
  // Case C: Multi-Observation History (>= 2 passes)
  // ---------------------------------------------------------------------
  const revisit_deltas: number[] = [];
  for (let i = 1; i < dts.length; i++) {
    const deltaH = (dts[i].getTime() - dts[i - 1].getTime()) / (1000 * 3600);
    revisit_deltas.push(deltaH);
  }

  const sumDelta = revisit_deltas.reduce((a, b) => a + b, 0);
  const average_revisit_hours = Math.round((sumDelta / revisit_deltas.length) * 100) / 100;

  const sortedDeltas = [...revisit_deltas].sort((a, b) => a - b);
  const mid = Math.floor(sortedDeltas.length / 2);
  const median_revisit_hours =
    sortedDeltas.length % 2 !== 0
      ? Math.round(sortedDeltas[mid] * 100) / 100
      : Math.round(((sortedDeltas[mid - 1] + sortedDeltas[mid]) / 2) * 100) / 100;

  const min_revisit_hours = Math.round(sortedDeltas[0] * 100) / 100;
  const max_revisit_hours = Math.round(sortedDeltas[sortedDeltas.length - 1] * 100) / 100;

  const gapThreshold = TEMPORAL_CONFIG.INACTIVE_GAP_HOURS; // 24.0 hours
  const inactive_gaps = revisit_deltas.filter((d) => d >= gapThreshold);
  const distinct_active_periods = 1 + inactive_gaps.length;
  const recurrence_count = inactive_gaps.length;

  let recurrence_ratio: number;
  if (active_duration_days < 1.0) {
    // Sudden onset acute flare/fire with passes a few hours apart today
    recurrence_ratio = Math.round(Math.min(0.15, n_obs * 0.05) * 1000) / 1000;
  } else {
    // Polar LEO satellite repeat period ~1.8 days
    const expected_passes = Math.max(1.0, active_duration_days / 1.8);
    recurrence_ratio =
      Math.round(Math.min(1.0, Math.max(0.05, n_obs / expected_passes)) * 1000) / 1000;
  }

  // Persistence calculation
  const persistence_days_val =
    active_duration_days > 0 ? Math.max(1, Math.ceil(active_duration_days)) : 1;

  const norm_duration = Math.min(1.0, active_duration_days / 60.0);
  const norm_count = Math.min(1.0, n_obs / 30.0);
  const continuity =
    active_duration_days < 2.0
      ? Math.min(1.0, active_duration_days / 7.0)
      : active_days / Math.max(1.0, persistence_days_val);
  const norm_recurrence = Math.min(1.0, recurrence_count / 10.0);

  const raw_score =
    0.40 * norm_duration +
    0.25 * norm_count +
    0.20 * continuity +
    0.15 * norm_recurrence;

  const persistence_score = Math.round(Math.max(0.0, Math.min(1.0, raw_score)) * 1000) / 1000;

  let persistence_class: "PERSISTENT" | "INTERMITTENT" | "TRANSIENT";
  let is_persistent: boolean;

  if (
    persistence_score >= 0.60 ||
    (active_duration_days >= TEMPORAL_CONFIG.PERSISTENCE_DAYS_PERSISTENT &&
      n_obs >= 8 &&
      active_days >= 8)
  ) {
    persistence_class = "PERSISTENT";
    is_persistent = true;
  } else if (
    persistence_score >= 0.20 ||
    active_duration_days >= TEMPORAL_CONFIG.PERSISTENCE_DAYS_TRANSIENT ||
    n_obs >= 3
  ) {
    persistence_class = "INTERMITTENT";
    is_persistent = false;
  } else {
    persistence_class = "TRANSIENT";
    is_persistent = false;
  }

  // Seasonality calculation
  const min_seasonality_obs = TEMPORAL_CONFIG.MIN_OBSERVATIONS_FOR_SEASONALITY;
  let seasonality_score = 0.0;
  let seasonal_concentration = 0.0;
  let seasonal_pattern = "INSUFFICIENT_DATA";
  let seasonality_flag = false;
  let peak_month: number | null = null;

  const months = dts.map((d) => d.getUTCMonth() + 1);
  const active_months = Array.from(new Set(months)).sort((a, b) => a - b);
  const monthly_dist: Record<string, number> = {};
  for (const m of active_months) {
    monthly_dist[String(m)] = months.filter((mon) => mon === m).length;
  }

  if (n_obs >= min_seasonality_obs && active_duration_days >= 14.0) {
    let bestM = active_months[0];
    let maxCount = -1;
    for (const m of active_months) {
      if (monthly_dist[String(m)] > maxCount) {
        maxCount = monthly_dist[String(m)];
        bestM = m;
      }
    }
    peak_month = bestM;

    const sortedCounts = Object.values(monthly_dist).sort((a, b) => b - a);
    const top2_sum = (sortedCounts[0] || 0) + (sortedCounts[1] || 0);
    const top2_share = top2_sum / n_obs;
    const base_uniform = 2.0 / 12.0;
    const scaled_conc = Math.max(0.0, (top2_share - base_uniform) / (1.0 - base_uniform));
    seasonal_concentration = Math.round(Math.min(1.0, scaled_conc) * 1000) / 1000;
    seasonality_score = seasonal_concentration;
    seasonality_flag = seasonal_concentration >= 0.60;

    const is_full_span = active_duration_days >= 40.0;
    if (
      is_full_span &&
      peak_month !== 10 &&
      peak_month !== 11 &&
      (seasonal_concentration < 0.85 || active_months.length >= 3)
    ) {
      seasonal_pattern = "year_round";
    } else if ((peak_month === 10 || peak_month === 11) && seasonal_concentration >= 0.50) {
      seasonal_pattern = "autumn_harvest";
    } else if ([2, 3, 4, 5].includes(peak_month) && seasonal_concentration >= 0.50) {
      seasonal_pattern = "dry_summer";
    } else if (seasonal_concentration >= 0.60) {
      seasonal_pattern = "seasonal_periodic";
    } else {
      seasonal_pattern = "intermittent_seasonal";
    }
  }

  // Temporal confidence based on observation depth
  const temporal_confidence = Math.round(
    Math.min(1.0, 0.30 + 0.70 * Math.min(1.0, n_obs / 10.0)) * 100
  ) / 100;

  const behaviour: "Persistent" | "Transient" | "Insufficient Data" = is_persistent
    ? "Persistent"
    : n_obs >= 2
    ? "Transient"
    : "Insufficient Data";

  return {
    cluster_id: clusterId,
    status: "SUCCESS",
    behaviour,
    first_seen: firstIso,
    last_seen: lastIso,
    first_observed_at: firstIso,
    last_observed_at: lastIso,
    observation_count: n_obs,
    active_days,
    inactive_days,
    active_day_ratio,
    active_duration_days,
    active_duration_hours,
    persistence_days: persistence_days_val,
    persistence_score,
    persistence_class,
    is_persistent,
    frequency_per_week,
    observations_per_day,
    recurrence_count,
    recurrence_ratio,
    distinct_active_periods,
    average_revisit_hours,
    median_revisit_hours,
    min_revisit_hours,
    max_revisit_hours,
    seasonality_score,
    seasonal_concentration,
    seasonal_pattern,
    seasonality_flag,
    peak_month,
    active_months,
    monthly_distribution: monthly_dist,
    temporal_confidence,
    ml_features: {
      observation_count: n_obs,
      active_days,
      active_duration: active_duration_days,
      observation_frequency: frequency_per_week,
      recurrence_count,
      recurrence_ratio,
      average_revisit_interval: average_revisit_hours !== null ? average_revisit_hours : 0.0,
      median_revisit_interval: median_revisit_hours !== null ? median_revisit_hours : 0.0,
      persistence_score,
      seasonality_score,
      seasonal_concentration
    }
  };
}
