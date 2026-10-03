import { ThermalSourceFingerprint, SmartAlertPriority, RiskLevel } from "../types";

/**
 * Maps raw land-cover identifier strings into clean, operational GIS descriptions.
 */
export function formatLandCoverLabel(landCover?: string): string {
  if (!landCover) return "Data unavailable";
  const lc = landCover.toLowerCase().trim();
  switch (lc) {
    case "industrial":
      return "Industrial / Petrochemical Zone";
    case "refinery":
      return "Refinery / Hydrocarbon Complex";
    case "cropland":
    case "agricultural":
      return "Agricultural Cropland";
    case "dense_forest":
    case "forest":
      return "Dense Forest Reserve";
    case "mining_pit":
    case "mining":
      return "Open-cast Mining Pit";
    case "open_land":
    case "barren":
      return "Open Shrub / Barren Land";
    case "urban":
      return "Urban / Commercial Built-up";
    default:
      return landCover
        .split(/[_-]/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
  }
}

/**
 * Computes a deterministic THERMAL SOURCE FINGERPRINT from raw observation,
 * spatial context, and temporal intelligence.
 *
 * Rules:
 * - NEVER hardcode example numbers or days.
 * - Explicitly state "Insufficient observations" or "Data unavailable" when data is missing.
 */
export function computeThermalFingerprint(
  event: any,
  geoContext: any,
  temporalProfile: any,
  classification?: any
): ThermalSourceFingerprint {
  const obsCount = typeof temporalProfile?.observation_count === "number" ? temporalProfile.observation_count : 1;
  const isDataInsufficient =
    temporalProfile?.status === "TEMPORAL_DATA_INSUFFICIENT" || obsCount <= 1;

  // 1. Persistence Metric
  let persistence: "Low" | "Medium" | "High" | "Insufficient observations" = "Insufficient observations";
  let persistenceLevel: "LOW" | "MEDIUM" | "HIGH" | "INSUFFICIENT_DATA" = "INSUFFICIENT_DATA";

  const persistenceDays =
    typeof temporalProfile?.persistence_days === "number" ? temporalProfile.persistence_days : 0;
  const persistenceScore =
    typeof temporalProfile?.persistence_score === "number" ? temporalProfile.persistence_score : 0;
  const isPersistent = Boolean(temporalProfile?.is_persistent);

  if (isDataInsufficient) {
    persistence = "Insufficient observations";
    persistenceLevel = "INSUFFICIENT_DATA";
  } else if (persistenceDays >= 30 || persistenceScore >= 0.7 || (isPersistent && persistenceDays >= 20)) {
    persistence = "High";
    persistenceLevel = "HIGH";
  } else if (persistenceDays >= 7 || persistenceScore >= 0.3 || isPersistent) {
    persistence = "Medium";
    persistenceLevel = "MEDIUM";
  } else {
    persistence = "Low";
    persistenceLevel = "LOW";
  }

  // 2. Recurrence Metric
  let recurrence = "Insufficient observations";
  const recurrenceRatio =
    typeof temporalProfile?.recurrence_ratio === "number" ? temporalProfile.recurrence_ratio : null;
  const freqPerWeek =
    typeof temporalProfile?.frequency_per_week === "number" ? temporalProfile.frequency_per_week : null;

  if (isDataInsufficient) {
    recurrence = "Insufficient observations";
  } else if (recurrenceRatio !== null && recurrenceRatio > 0) {
    const pct = Math.round(recurrenceRatio * 100);
    const passes = freqPerWeek !== null ? ` (${freqPerWeek.toFixed(1)} passes/wk)` : "";
    recurrence = `${pct}%${passes}`;
  } else if (freqPerWeek !== null && freqPerWeek > 0) {
    recurrence = `${freqPerWeek.toFixed(1)} passes/week`;
  } else {
    recurrence = "Low (<1 pass/wk)";
  }

  // 3. Active Days Metric
  let activeDays: number | string = "Insufficient observations";
  if (typeof temporalProfile?.active_days === "number" && temporalProfile.active_days > 0) {
    activeDays = temporalProfile.active_days;
  } else if (persistenceDays > 0) {
    activeDays = persistenceDays;
  } else if (obsCount === 1) {
    activeDays = 1;
  }

  // 4. Temporal Pattern Metric
  let temporalPattern: "Recurrent" | "Episodic" | "Persistent" | "Isolated" | "Temporal Pattern Uncertain" | string =
    "Temporal Pattern Uncertain";

  if (isDataInsufficient) {
    temporalPattern = "Isolated";
  } else if (isPersistent || persistenceDays >= 21) {
    temporalPattern = "Persistent";
  } else if ((recurrenceRatio !== null && recurrenceRatio >= 0.35) || (freqPerWeek !== null && freqPerWeek >= 2.0)) {
    temporalPattern = "Recurrent";
  } else if (obsCount >= 2) {
    temporalPattern = "Episodic";
  } else {
    temporalPattern = "Temporal Pattern Uncertain";
  }

  // 5. Night Activity Metric
  let nightActivity = "Data unavailable";
  const daynight = event?.daynight;
  if (daynight === "N") {
    nightActivity = "Night Detection (Confirmed)";
  } else if (daynight === "D") {
    nightActivity = "Daytime Pass Only";
  } else if (typeof daynight === "string" && daynight.trim().length > 0) {
    nightActivity = daynight;
  }

  // 6. Industrial Proximity Metric
  let industrialProximityM: number | null = null;
  let industrialProximityLabel = "No industrial facility within 50 km";
  const rawDist = geoContext?.distance_to_industry;
  const facilityName = geoContext?.nearest_industrial_facility;

  if (typeof rawDist === "number" && rawDist < 50000) {
    industrialProximityM = Math.round(rawDist);
    if (facilityName && facilityName !== "None within 50 km" && facilityName !== "Unknown") {
      if (rawDist < 1000) {
        industrialProximityLabel = `${Math.round(rawDist)} m to ${facilityName}`;
      } else {
        industrialProximityLabel = `${(rawDist / 1000).toFixed(1)} km to ${facilityName}`;
      }
    } else {
      industrialProximityLabel = rawDist < 1000 ? `${Math.round(rawDist)} m` : `${(rawDist / 1000).toFixed(1)} km`;
    }
  } else {
    industrialProximityLabel = "Remote (>50 km from industrial facility)";
  }

  // 7. Land-Cover Metric
  const landCover = formatLandCoverLabel(geoContext?.land_cover);

  // 8. Cluster Density Metric
  let clusterDensity = "Single isolated hotspot";
  if (obsCount > 1) {
    clusterDensity = `${obsCount} observations in spatial cluster (~4.5 km²)`;
  } else {
    clusterDensity = "Single isolated observation (1 overpass)";
  }

  // 9. Thermal Intensity Metric
  const frp = typeof event?.frp === "number" ? event.frp : 0;
  const brightness = typeof event?.brightness === "number" ? event.brightness : 0;
  const thermalIntensity = `${frp.toFixed(1)} MW (${brightness.toFixed(1)} K)`;

  // 10. Derived Fingerprint Summary Pattern
  let summaryPattern = "Thermal Anomaly";
  const predClass = classification?.predicted_class || "";
  const lcKey = (geoContext?.land_cover || "").toLowerCase();

  if (isDataInsufficient) {
    if (industrialProximityM !== null && industrialProximityM <= 1000) {
      summaryPattern = "Isolated Industrial Thermal Hotspot";
    } else if (lcKey === "dense_forest" || lcKey === "forest") {
      summaryPattern = "Isolated Forest Thermal Anomaly";
    } else if (lcKey === "cropland" || lcKey === "agricultural") {
      summaryPattern = "Isolated Cropland Thermal Event";
    } else {
      summaryPattern = "Isolated Thermal Event";
    }
  } else if (predClass === "Gas Flare" || (industrialProximityM !== null && industrialProximityM <= 1500 && isPersistent)) {
    summaryPattern = "Persistent Industrial Hydrocarbon Flare";
  } else if (predClass === "Industrial Fire") {
    summaryPattern = "Acute Industrial Fire Hazard";
  } else if (industrialProximityM !== null && industrialProximityM <= 2500 && (temporalPattern === "Recurrent" || temporalPattern === "Persistent")) {
    summaryPattern = "Recurrent Industrial Thermal Source";
  } else if (predClass === "Wildfire" || lcKey === "dense_forest" || lcKey === "forest") {
    summaryPattern = isPersistent ? "Sustained Active Wildfire Complex" : "Active Forest Vegetation Fire Front";
  } else if (predClass === "Agricultural Burning" || lcKey === "cropland" || lcKey === "agricultural") {
    summaryPattern = "Seasonal Agricultural Biomass Burning";
  } else if (predClass === "Mining" || lcKey === "mining_pit" || lcKey === "mining") {
    summaryPattern = "Recurrent Subsurface Mining Thermal Anomaly";
  } else if (temporalPattern === "Persistent") {
    summaryPattern = "Persistent Surface Thermal Source";
  } else if (temporalPattern === "Recurrent") {
    summaryPattern = "Recurrent Multi-Pass Thermal Source";
  } else {
    summaryPattern = "Episodic Surface Thermal Event";
  }

  return {
    persistence,
    persistence_level: persistenceLevel,
    recurrence,
    active_days: activeDays,
    temporal_pattern: temporalPattern,
    night_activity: nightActivity,
    industrial_proximity_m: industrialProximityM,
    industrial_proximity_label: industrialProximityLabel,
    land_cover: landCover,
    cluster_density: clusterDensity,
    thermal_intensity: thermalIntensity,
    summary_pattern: summaryPattern
  };
}

/**
 * Computes deterministic SMART ALERT PRIORITIZATION:
 * Priority Score (0–100) + Level (CRITICAL / HIGH / MEDIUM / LOW) + Explainable Factors.
 */
export function computeSmartPriority(
  event: any,
  geoContext: any,
  temporalProfile: any,
  classification: any
): SmartAlertPriority {
  const frp = typeof event?.frp === "number" ? event.frp : 5.0;
  const brightness = typeof event?.brightness === "number" ? event.brightness : 315.0;
  const distM = typeof geoContext?.distance_to_industry === "number" ? geoContext.distance_to_industry : 50000;
  const facilityName = geoContext?.nearest_industrial_facility || "Industrial Facility";
  const predClass = classification?.predicted_class || "Other";
  const confidence = typeof classification?.confidence === "number" ? classification.confidence : 0.5;
  const obsCount = typeof temporalProfile?.observation_count === "number" ? temporalProfile.observation_count : 1;
  const persistenceDays = typeof temporalProfile?.persistence_days === "number" ? temporalProfile.persistence_days : 0;
  const isPersistent = Boolean(temporalProfile?.is_persistent);
  const recurrenceRatio = typeof temporalProfile?.recurrence_ratio === "number" ? temporalProfile.recurrence_ratio : 0;
  const landCover = (geoContext?.land_cover || "").toLowerCase();

  const factors: string[] = [];

  // 1. Thermal Intensity Component (30% weight)
  const frpRatio = Math.min(1.0, frp / 120.0);
  const brightRatio = Math.min(1.0, Math.max(0, (brightness - 310.0) / 85.0));
  const sThermal = Math.round((0.65 * frpRatio + 0.35 * brightRatio) * 100);

  if (frp >= 50.0) {
    factors.push(`Intense radiative power (${frp.toFixed(1)} MW)`);
  } else if (frp >= 20.0) {
    factors.push(`Moderate radiative power (${frp.toFixed(1)} MW)`);
  }
  if (brightness >= 340.0) {
    factors.push(`Elevated brightness temperature (${brightness.toFixed(1)} K)`);
  }

  // 2. Proximity & Infrastructure Exposure Component (25% weight)
  let sProximity = 5;
  if (distM <= 300) {
    sProximity = 100;
    factors.push(`Immediate industrial installation perimeter (${Math.round(distM)} m to ${facilityName})`);
  } else if (distM <= 1000) {
    sProximity = 80;
    factors.push(`Industrial facility buffer zone (${Math.round(distM)} m to ${facilityName})`);
  } else if (distM <= 3000) {
    sProximity = 55;
    factors.push(`Industrial corridor proximity (${(distM / 1000).toFixed(1)} km to ${facilityName})`);
  } else if (distM <= 10000) {
    sProximity = 25;
  } else {
    sProximity = 5;
  }

  if (landCover === "dense_forest" || landCover === "forest") {
    if (frp >= 30.0) {
      sProximity = Math.max(sProximity, 85);
      factors.push("Dense forest canopy exposure (elevated biomass fire spread risk)");
    }
  } else if (landCover === "industrial" || landCover === "refinery") {
    sProximity = Math.max(sProximity, 75);
    factors.push("Designated petrochemical / industrial land-use zoning");
  }

  // 3. ML Classification & Operational Hazard Component (25% weight)
  const classHazardWeights: Record<string, number> = {
    "Industrial Fire": 100,
    "Wildfire": 90,
    "Mining": 55,
    "Agricultural Burning": 40,
    "Gas Flare": 30, // controlled stack unless in critical perimeter
    "Other": 35,
    "ML_UNAVAILABLE": 35
  };

  const baseHazard = classHazardWeights[predClass] ?? 35;
  const sClassHazard = Math.round(baseHazard * (0.7 + 0.3 * Math.min(1.0, confidence)));

  if (predClass === "Industrial Fire") {
    factors.push("Uncontrolled industrial fire classification");
  } else if (predClass === "Wildfire") {
    factors.push("Active wildfire / vegetation fire signature");
  } else if (predClass === "Gas Flare" && distM <= 800) {
    factors.push("Operational hydrocarbon flare stack in registered facility");
  }

  if (confidence >= 0.80) {
    factors.push(`High ML ensemble confidence (${Math.round(confidence * 100)}%)`);
  }

  // 4. Temporal Urgency & Persistence Component (20% weight)
  let sTemporal = 30;
  if (isPersistent || persistenceDays >= 21) {
    sTemporal = 85;
    factors.push(`Persistent thermal source (${persistenceDays} active days, ${obsCount} passes)`);
  } else if (obsCount <= 2 && sThermal >= 55) {
    sTemporal = 90; // Sudden acute surge!
    factors.push("Acute sudden-onset thermal surge (rapid emergence requiring priority validation)");
  } else if (obsCount >= 3 && recurrenceRatio >= 0.35) {
    sTemporal = 70;
    factors.push(`Recurrent multi-pass thermal history (${obsCount} overpass detections)`);
  } else if (obsCount <= 1) {
    sTemporal = 40;
    factors.push("Single-pass detection awaiting orbital confirmation");
  }

  // Composite Normalized Score (0 - 100)
  let compositeScore = Math.round(
    0.30 * sThermal + 0.25 * sProximity + 0.25 * sClassHazard + 0.20 * sTemporal
  );

  // Safety Overrides
  if (predClass === "Industrial Fire" && (distM <= 600 || frp >= 50)) {
    compositeScore = Math.max(compositeScore, 82);
  }
  if (predClass === "Wildfire" && (frp >= 40 || brightness >= 345)) {
    compositeScore = Math.max(compositeScore, 75);
  }

  compositeScore = Math.max(5, Math.min(100, compositeScore));

  // Threshold Mapping:
  // 80 - 100 => CRITICAL
  // 60 - 79  => HIGH
  // 35 - 59  => MEDIUM
  // 0 - 34   => LOW
  let level: RiskLevel = "LOW";
  if (compositeScore >= 80) {
    level = "CRITICAL";
  } else if (compositeScore >= 60) {
    level = "HIGH";
  } else if (compositeScore >= 35) {
    level = "MEDIUM";
  } else {
    level = "LOW";
  }

  // Ensure factors array has meaningful items
  if (factors.length === 0) {
    factors.push("Routine baseline monitoring threshold; low radiative hazard profile");
  }

  // Deduplicate and limit to top 4 most distinct factors
  const uniqueFactors = Array.from(new Set(factors)).slice(0, 4);

  return {
    score: compositeScore,
    level,
    factors: uniqueFactors
  };
}
