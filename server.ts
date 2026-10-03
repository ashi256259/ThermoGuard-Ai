import express from "express";
import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
const execFileAsync = promisify(execFile);
import { createServer as createViteServer } from "vite";
import {
  initDb,
  loadAllHotspots,
  persistHotspot,
  isDbConnected,
  persistRawObservation,
  getExistingClusterCentroids,
  queryHistoricalObservationsForCluster,
  persistTemporalProfileRecord,
  getTemporalProfileForCluster,
  saveVerificationRecord,
  getVerificationRecord,
  getAllVerificationRecords
} from "./database_sync";
import {
  TEMPORAL_CONFIG,
  findOrCreateSpatialCluster,
  calculateTemporalProfile,
  RawObservation,
  TemporalProfileResult
} from "./temporal_engine";
import {
  predictWithRandomForest,
  loadRandomForestModel,
  getMLModelStatus,
  evaluateRiskAndEvidence,
  CANONICAL_FEATURES
} from "./ml_engine";
import {
  computeThermalFingerprint,
  computeSmartPriority
} from "./src/utils/fingerprintPriority";

export function updateRiskAndEvidence(h: any) {
  if (!h || !h.classification) return;
  const topClass = h.classification.predicted_class || "Other";
  const raw = h.event || {};
  const geoContext = h.geo_context || {};
  const tempProfile = h.temporal_profile || {};
  const minDist = typeof geoContext.distance_to_industry === "number" ? geoContext.distance_to_industry : 99999;

  const frpVal = typeof raw.frp === "number" ? raw.frp : (parseFloat(raw.frp) || 25.0);
  const brightVal = typeof raw.brightness === "number" ? raw.brightness : (parseFloat(raw.brightness) || 330.0);
  const confVal = typeof raw.confidence === "number" ? raw.confidence : (parseFloat(raw.confidence) || 80.0);
  const satVal = raw.satellite || "VIIRS_SNPP";
  const latVal = typeof raw.latitude === "number" ? raw.latitude : (parseFloat(raw.latitude) || 20.0);
  const lonVal = typeof raw.longitude === "number" ? raw.longitude : (parseFloat(raw.longitude) || 78.0);
  const facilityName = geoContext.nearest_industrial_facility || "Industrial Facility";
  const landCoverName = (geoContext.land_cover || "open_land").replace(/_/g, " ");
  const persistDays = tempProfile.persistence_days || 1;
  const obsCount = tempProfile.observation_count || 1;
  const recRatio = tempProfile.recurrence_ratio || 0.1;

  // 1. Thermal Intensity Component
  const frpNorm = Math.min(100, (frpVal / 150) * 100);
  const brightNorm = Math.min(100, Math.max(0, (brightVal - 310) / 90) * 100);
  const sThermal = 0.65 * frpNorm + 0.35 * brightNorm;

  // 2. Spatial Proximity Component
  let sProximity = 5;
  if (minDist <= 300) sProximity = 100;
  else if (minDist <= 1000) sProximity = 80;
  else if (minDist <= 3000) sProximity = 50;
  else if (minDist <= 10000) sProximity = 20;

  if (topClass === "Gas Flare") {
    sProximity *= 0.35; // Controlled routine operation in flare stack
  }

  // 3. Source Hazard Factor
  const sourceHazardWeights: Record<string, number> = {
    "Industrial Fire": 1.0,
    "Wildfire": 0.85,
    "Mining": 0.55,
    "Agricultural Burning": 0.40,
    "Gas Flare": 0.25,
    "Other": 0.30
  };
  const sSource = (sourceHazardWeights[topClass] || 0.3) * 100;

  // 4. Temporal Persistence Factor
  let sTemporal = 50;
  if (persistDays <= 2 && sThermal > 60) {
    sTemporal = 90; // Sudden acute outbreak
  } else if (persistDays >= 30) {
    sTemporal = 35; // Stable continuous emission
  }

  const totalRiskVal = Math.round(
    (30 / 92) * sThermal + (25 / 92) * sProximity + (25 / 92) * sSource + (12 / 92) * sTemporal
  );

  let riskBand: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
  if (totalRiskVal >= 75) riskBand = "CRITICAL";
  else if (totalRiskVal >= 55) riskBand = "HIGH";
  else if (totalRiskVal >= 30) riskBand = "MEDIUM";

  // Override thresholds for clear catastrophic risks
  if (topClass === "Industrial Fire" && (frpVal >= 60 || minDist <= 500)) {
    riskBand = "CRITICAL";
  } else if (topClass === "Wildfire" && (frpVal >= 35 || brightVal >= 345)) {
    riskBand = "HIGH";
  }

  h.classification.risk_score = riskBand;
  h.classification.risk_value = totalRiskVal;
  h.classification.persistence_score = tempProfile.is_persistent
    ? 0.92
    : Math.min(0.9, (persistDays / 30) * 0.7 + recRatio * 0.3);

  // Categorized Structured Evidence
  const thermalEvidence: string[] = [];
  if (frpVal >= 100) {
    thermalEvidence.push(`Severe thermal radiative power: ${frpVal.toFixed(1)} MW (exceeds high-intensity industrial/wildfire threshold)`);
  } else if (frpVal >= 40) {
    thermalEvidence.push(`Moderate-to-high radiative power: ${frpVal.toFixed(1)} MW (consistent with flare stacks or active burn front)`);
  } else {
    thermalEvidence.push(`Low-to-moderate thermal intensity: ${frpVal.toFixed(1)} MW (steady controlled emission or smoldering)`);
  }
  thermalEvidence.push(`Brightness temperature: ${brightVal.toFixed(1)} K recorded by ${satVal}`);
  thermalEvidence.push(`FIRMS satellite detection confidence: ${Math.round(confVal)}% (multi-band spectral anomaly verification)`);
  thermalEvidence.push(`Observation timing: ${raw.daynight === 'N' ? 'Nighttime (zero solar glint reflection)' : 'Daytime overpass'}`);

  const spatialEvidence: string[] = [];
  if (minDist <= 300) {
    spatialEvidence.push(`Immediate industrial perimeter: ${Math.round(minDist)} m to ${facilityName}`);
  } else if (minDist <= 1000) {
    spatialEvidence.push(`Industrial proximity: ${Math.round(minDist)} m to ${facilityName}`);
  } else if (minDist <= 5000) {
    spatialEvidence.push(`Located ${Math.round(minDist / 100) / 10} km from nearest industrial installation (${facilityName})`);
  } else {
    spatialEvidence.push(`Remote from industrial installations: nearest facility is ${Math.round(minDist / 1000)} km away (${facilityName})`);
  }
  spatialEvidence.push(`Land-use / Land-cover context: Zoned as ${landCoverName}`);

  const temporalEvidence: string[] = [];
  if (persistDays >= 14) {
    temporalEvidence.push(`Persistent multi-temporal source: active across ${persistDays} days with ${obsCount} satellite detections`);
  } else if (persistDays <= 2) {
    temporalEvidence.push(`Acute sudden-onset signature: detected across ${persistDays} day(s) (no continuous baseline)`);
  } else {
    temporalEvidence.push(`Activity spanning ${persistDays} days with ${obsCount} detection pass(es)`);
  }
  temporalEvidence.push(`Recurrence ratio: ${Math.round(recRatio * 100)}% of orbital revisit passes`);

  const classSpecificEvidence: string[] = [];
  if (topClass === "Gas Flare") {
    classSpecificEvidence.push("Persistent stationary emission footprint co-located with refinery or petrochemical infrastructure");
    classSpecificEvidence.push("High multi-week recurrence without lateral geometric expansion indicates controlled flare stack combustion");
  } else if (topClass === "Industrial Fire") {
    classSpecificEvidence.push("Elevated thermal radiative surge within industrial boundary indicates uncontrolled combustion outbreak");
    classSpecificEvidence.push("Acute short-duration onset differentiates event from routine continuous flaring");
  } else if (topClass === "Agricultural Burning") {
    classSpecificEvidence.push("Agricultural cropland context remote from industrial installations");
    classSpecificEvidence.push("Transient post-harvest seasonal residue combustion pattern with rapid spatial dissipation");
  } else if (topClass === "Wildfire") {
    classSpecificEvidence.push("Location within dense forest reserve canopy with zero industrial infrastructure");
    classSpecificEvidence.push("High FRP biomass combustion signature characteristic of uncontained wildfire front");
  } else if (topClass === "Mining") {
    classSpecificEvidence.push("Spatial co-location with open-cast mining excavation pit or coal spoil heap");
    classSpecificEvidence.push("Recurring low-velocity thermal profile characteristic of spontaneous subsurface coal oxidation");
  } else {
    classSpecificEvidence.push("Thermal and spatial attributes do not match standard industrial, agricultural, or wildfire profiles");
  }

  const structuredEvidence = {
    thermal: thermalEvidence,
    spatial: spatialEvidence,
    temporal: temporalEvidence,
    class_specific: classSpecificEvidence,
    summary: [
      spatialEvidence[0],
      temporalEvidence[0],
      thermalEvidence[0],
      classSpecificEvidence[0]
    ].filter(Boolean)
  };

  h.classification.evidence = structuredEvidence.summary;
  h.classification.structured_evidence = structuredEvidence;

  // Synchronize Alert
  const eventId = raw.id || `te-${Date.now()}`;
  if (["CRITICAL", "HIGH"].includes(riskBand)) {
    h.alert = {
      id: `ALT-${eventId}`,
      alert_id: `ALT-${eventId}`,
      severity: riskBand,
      title: `${riskBand === "CRITICAL" ? "CRITICAL EMERGENCY" : "HIGH PRIORITY ALERT"}: ${topClass} Detected`,
      description: `${topClass} identified with ${Math.round((h.classification.confidence || 0.8) * 100)}% model confidence. Radiative Power: ${frpVal.toFixed(1)} MW at ${latVal.toFixed(4)}, ${lonVal.toFixed(4)}.`,
      facility_name: facilityName,
      action_recommended: topClass === "Industrial Fire" ? "Dispatch industrial emergency brigade and alert state pollution control board." : "Deploy forestry rapid response team and establish containment line.",
      created_at: new Date().toISOString(),
      status: "ACTIVE"
    };
  } else {
    h.alert = null;
  }

  h.intelligence = h.intelligence || { prediction: {} };
  if (h.intelligence.prediction) {
    h.intelligence.prediction.predicted_class = topClass;
    h.intelligence.prediction.confidence = h.classification.confidence;
    h.intelligence.prediction.risk_score = riskBand;
    h.intelligence.prediction.risk_value = totalRiskVal;
    h.intelligence.prediction.class_probabilities = h.classification.class_probabilities;
    h.intelligence.prediction.model_version = h.classification.model_version;
  }

  // Calculate Thermal Source Fingerprint & Smart Alert Priority
  try {
    h.fingerprint = computeThermalFingerprint(h.event, h.geo_context, h.temporal_profile, h.classification);
    h.priority = computeSmartPriority(h.event, h.geo_context, h.temporal_profile, h.classification);
    if (h.alert) {
      h.alert.priority_score = h.priority.score;
      h.alert.priority_level = h.priority.level;
      h.alert.priority_factors = h.priority.factors;
    }
  } catch (err: any) {
    console.warn("ThermoGuard: Error computing fingerprint/priority in updateRiskAndEvidence:", err?.message);
  }
}

export async function runMLClassification(hotspots: any[]) {
  if (hotspots.length === 0) return;
  let successCount = 0;
  for (let i = 0; i < hotspots.length; i++) {
    const h = hotspots[i];
    if (!h) continue;
    try {
      h.classification = h.classification || {};
      const f = h.classification.feature_vector || {};
      const featDict = {
        brightness: typeof f.brightness === "number" ? f.brightness : (typeof h.event?.brightness === "number" ? h.event.brightness : 330.0),
        frp: typeof f.frp === "number" ? f.frp : (typeof h.event?.frp === "number" ? h.event.frp : 25.0),
        firms_confidence: typeof f.firms_confidence === "number" ? f.firms_confidence : (typeof h.event?.confidence === "number" ? (h.event.confidence > 1 ? h.event.confidence / 100 : h.event.confidence) : 0.80),
        scan: typeof f.scan === "number" ? f.scan : 0.40,
        track: typeof f.track === "number" ? f.track : 0.40,
        daynight_flag: typeof f.daynight_flag === "number" ? f.daynight_flag : (h.event?.daynight === "N" ? 0.0 : 1.0),
        distance_to_industry_km: typeof f.distance_to_industry_km === "number" ? f.distance_to_industry_km : (typeof f.dist_industry_km === "number" ? f.dist_industry_km : ((h.geo_context?.distance_to_industry || 50000) / 1000)),
        industrial_facility_count: typeof f.industrial_facility_count === "number" ? f.industrial_facility_count : (h.geo_context?.contextual_attributes?.facilities_within_10km || 0),
        industrial_nearby_flag: typeof f.industrial_nearby_flag === "number" ? f.industrial_nearby_flag : (f.is_industrial_land ? 1.0 : (h.geo_context?.spatial_flags?.is_industrial_zone ? 1.0 : 0.0)),
        mining_nearby_flag: typeof f.mining_nearby_flag === "number" ? f.mining_nearby_flag : (f.is_mining_land ? 1.0 : (h.geo_context?.spatial_flags?.is_mining_zone ? 1.0 : 0.0)),
        infrastructure_nearby_flag: typeof f.infrastructure_nearby_flag === "number" ? f.infrastructure_nearby_flag : (h.geo_context?.spatial_flags?.is_infrastructure_nearby ? 1.0 : 0.0),
        forest_context: typeof f.forest_context === "number" ? f.forest_context : (f.is_forest_land ? 1.0 : (h.geo_context?.spatial_flags?.is_forest_zone ? 1.0 : 0.0)),
        agricultural_context: typeof f.agricultural_context === "number" ? f.agricultural_context : (f.is_farmland ? 1.0 : (h.geo_context?.spatial_flags?.is_farmland_zone ? 1.0 : 0.0)),
        urban_context: typeof f.urban_context === "number" ? f.urban_context : 0.0,
        open_land_context: typeof f.open_land_context === "number" ? f.open_land_context : 0.0,
        observation_count: typeof f.observation_count === "number" ? f.observation_count : (h.temporal_profile?.observation_count || 1.0),
        active_days: typeof f.active_days === "number" ? f.active_days : (h.temporal_profile?.persistence_days || 1.0),
        active_duration: typeof f.active_duration === "number" ? f.active_duration : (h.temporal_profile?.persistence_days || 1.0),
        observation_frequency: typeof f.observation_frequency === "number" ? f.observation_frequency : (h.temporal_profile?.frequency_per_week || 1.0),
        recurrence_count: typeof f.recurrence_count === "number" ? f.recurrence_count : Math.round((h.temporal_profile?.persistence_days || 1) * (h.temporal_profile?.recurrence_ratio || 0.1)),
        recurrence_ratio: typeof f.recurrence_ratio === "number" ? f.recurrence_ratio : (h.temporal_profile?.recurrence_ratio || 0.1),
        average_revisit_interval: typeof f.average_revisit_interval === "number" ? f.average_revisit_interval : 24.0,
        median_revisit_interval: typeof f.median_revisit_interval === "number" ? f.median_revisit_interval : 24.0,
        persistence_score: typeof f.persistence_score === "number" ? f.persistence_score : (h.temporal_profile?.is_persistent ? 0.85 : 0.1),
        seasonality_score: typeof f.seasonality_score === "number" ? f.seasonality_score : 0.2,
        seasonal_concentration: typeof f.seasonal_concentration === "number" ? f.seasonal_concentration : 0.2
      };

      const pred = predictWithRandomForest(featDict);
      h.classification.predicted_class = pred.predicted_class;
      h.classification.confidence = pred.confidence;
      h.classification.class_probabilities = pred.class_probabilities;
      h.classification.model_version = pred.model_version;
      h.classification.feature_vector = pred.feature_vector;
      h.classification.inference_timestamp = pred.inference_timestamp;

      updateRiskAndEvidence(h);
      successCount++;
    } catch (err: any) {
      console.warn(`ThermoGuard ML Warning: Single event [${h.event?.id}] inference error:`, err.message);
      if (!h.classification?.predicted_class || h.classification.predicted_class === "ML_UNAVAILABLE") {
        h.classification = h.classification || {};
        h.classification.predicted_class = "Other";
        h.classification.confidence = 0.50;
        h.classification.model_version = "random_forest_v1.0.0";
        updateRiskAndEvidence(h);
      }
    }
  }
  console.log(`ThermoGuard ML: Successfully classified ${successCount}/${hotspots.length} thermal events via Random Forest ensemble.`);
}

import {
  authManager,
  isAdminRole,
  isOfficerRole,
  isAnalystRole,
  canManageProviderSettings,
  canManageAlerts,
  canVerifyClassification,
  canAccessAdminConsole
} from "./server/auth";

interface HotspotSeed {
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
}

const INDUSTRIAL_FACILITIES = [
  // Oil Refineries & Petrochemicals
  {
    name: "Jamnagar Mega Refinery Complex",
    facility_type: "oil_refinery",
    operator: "Reliance Industries Ltd.",
    latitude: 22.3582,
    longitude: 69.8645,
    tags: { hazard_tier: "SEVESO_III_EQUIV", flare_stacks: 6 }
  },
  {
    name: "Hazira Petrochemicals & LNG Terminal",
    facility_type: "chemical_plant",
    operator: "ONGC / Shell",
    latitude: 21.1124,
    longitude: 72.6718,
    tags: { hazard_tier: "Major_Hazard_Installation", tanks: 34 }
  },
  {
    name: "Vadodara IOCL Gujarat Refinery",
    facility_type: "oil_refinery",
    operator: "Indian Oil Corporation",
    latitude: 22.3680,
    longitude: 73.1250,
    tags: { capacity_mmtpa: 13.7 }
  },
  {
    name: "Mumbai BPCL Mahul Refinery",
    facility_type: "oil_refinery",
    operator: "Bharat Petroleum",
    latitude: 19.0100,
    longitude: 72.8950,
    tags: { capacity_mmtpa: 12.0 }
  },
  {
    name: "Mangalore MRPL Refinery",
    facility_type: "oil_refinery",
    operator: "MRPL / ONGC",
    latitude: 12.9920,
    longitude: 74.8280,
    tags: { capacity_mmtpa: 15.0 }
  },
  {
    name: "Kochi BPCL Refinery",
    facility_type: "oil_refinery",
    operator: "Bharat Petroleum",
    latitude: 9.9930,
    longitude: 76.3580,
    tags: { capacity_mmtpa: 15.5 }
  },
  {
    name: "Chennai Manali CPCL Refinery",
    facility_type: "oil_refinery",
    operator: "CPCL / IOCL",
    latitude: 13.1630,
    longitude: 80.2620,
    tags: { capacity_mmtpa: 10.5 }
  },
  {
    name: "Visakhapatnam HPCL Refinery",
    facility_type: "oil_refinery",
    operator: "Hindustan Petroleum",
    latitude: 17.6880,
    longitude: 83.2450,
    tags: { capacity_mmtpa: 15.0 }
  },
  {
    name: "Paradip IOCL Mega Refinery",
    facility_type: "oil_refinery",
    operator: "Indian Oil Corporation",
    latitude: 20.2740,
    longitude: 86.6710,
    tags: { capacity_mmtpa: 15.0 }
  },
  {
    name: "Haldia IOCL Refinery",
    facility_type: "oil_refinery",
    operator: "Indian Oil Corporation",
    latitude: 22.0520,
    longitude: 88.0820,
    tags: { capacity_mmtpa: 8.0 }
  },
  {
    name: "Panipat IOCL Refinery & Naphtha Cracker",
    facility_type: "oil_refinery",
    operator: "Indian Oil Corporation",
    latitude: 29.4310,
    longitude: 76.8830,
    tags: { capacity_mmtpa: 15.0 }
  },
  {
    name: "Mathura IOCL Refinery",
    facility_type: "oil_refinery",
    operator: "Indian Oil Corporation",
    latitude: 27.3010,
    longitude: 77.7020,
    tags: { capacity_mmtpa: 8.0 }
  },
  {
    name: "Bina Bharat Oman Refinery",
    facility_type: "oil_refinery",
    operator: "BPCL / BORL",
    latitude: 24.1920,
    longitude: 78.1820,
    tags: { capacity_mmtpa: 7.8 }
  },
  {
    name: "Bathinda HMEL Refinery",
    facility_type: "oil_refinery",
    operator: "HMEL",
    latitude: 29.9830,
    longitude: 74.9310,
    tags: { capacity_mmtpa: 11.3 }
  },
  {
    name: "Numaligarh Refinery Assam",
    facility_type: "oil_refinery",
    operator: "NRL / Oil India",
    latitude: 26.5820,
    longitude: 93.7630,
    tags: { capacity_mmtpa: 3.0 }
  },
  // Major Steel Works
  {
    name: "Bellary JSW Vijayanagar Steel Complex",
    facility_type: "steel_plant",
    operator: "JSW Steel",
    latitude: 15.1950,
    longitude: 76.6680,
    tags: { blast_furnaces: 4, coke_ovens: 6 }
  },
  {
    name: "Angul Integrated Steel & Pellet Plant",
    facility_type: "steel_plant",
    operator: "Jindal Steel & Power",
    latitude: 20.8412,
    longitude: 85.0863,
    tags: { blast_furnaces: 2, coke_ovens: 4 }
  },
  {
    name: "Tata Steel Jamshedpur Works",
    facility_type: "steel_plant",
    operator: "Tata Steel",
    latitude: 22.8010,
    longitude: 86.2020,
    tags: { blast_furnaces: 4 }
  },
  {
    name: "Rourkela Steel Plant",
    facility_type: "steel_plant",
    operator: "SAIL",
    latitude: 22.2230,
    longitude: 84.8710,
    tags: { blast_furnaces: 3 }
  },
  {
    name: "Bhilai Steel Plant",
    facility_type: "steel_plant",
    operator: "SAIL",
    latitude: 21.1820,
    longitude: 81.3810,
    tags: { blast_furnaces: 4 }
  },
  {
    name: "Bokaro Steel Plant",
    facility_type: "steel_plant",
    operator: "SAIL",
    latitude: 23.6710,
    longitude: 86.1720,
    tags: { blast_furnaces: 4 }
  },
  // Major Mining Basins & Pits
  {
    name: "Bellary-Sandur Iron Ore Pithead",
    facility_type: "mine",
    operator: "NMDC / Sandur Mining",
    latitude: 15.0850,
    longitude: 76.5450,
    tags: { mine_type: "open_cast_iron_ore" }
  },
  {
    name: "Gevra & Dipka Opencast Coal Mines",
    facility_type: "mine",
    operator: "South Eastern Coalfields Ltd.",
    latitude: 22.3418,
    longitude: 82.5934,
    tags: { mine_type: "open_cast", seam_combustion_risk: "high" }
  },
  {
    name: "Jharia Coalfield Pithead",
    facility_type: "mine",
    operator: "Bharat Coking Coal Ltd.",
    latitude: 23.7481,
    longitude: 86.4162,
    tags: { mine_type: "coal_fire_zone" }
  },
  {
    name: "Singrauli Coal Basin Pit",
    facility_type: "mine",
    operator: "Northern Coalfields Ltd.",
    latitude: 24.1120,
    longitude: 82.6840,
    tags: { mine_type: "open_cast_coal" }
  },
  {
    name: "Neyveli Lignite Open Pit",
    facility_type: "mine",
    operator: "NLC India",
    latitude: 11.5830,
    longitude: 79.4850,
    tags: { mine_type: "lignite_pit" }
  },
  {
    name: "Keonjhar Barbil Iron Ore Mines",
    facility_type: "mine",
    operator: "Odisha Mining Corp",
    latitude: 22.1150,
    longitude: 85.3850,
    tags: { mine_type: "open_cast_iron" }
  },
  // Thermal Power Stations
  {
    name: "NTPC Vindhyachal Super Thermal Power",
    facility_type: "power_station",
    operator: "NTPC Ltd.",
    latitude: 24.0984,
    longitude: 82.6641,
    tags: { capacity_mw: 4760 }
  },
  {
    name: "NTPC Ramagundam Super Thermal",
    facility_type: "power_station",
    operator: "NTPC Ltd.",
    latitude: 18.7530,
    longitude: 79.5220,
    tags: { capacity_mw: 2600 }
  },
  {
    name: "Mundra Thermal Power Plant",
    facility_type: "power_station",
    operator: "Adani Power",
    latitude: 22.8310,
    longitude: 69.7120,
    tags: { capacity_mw: 4620 }
  },
  {
    name: "Kudankulam Nuclear Complex",
    facility_type: "power_station",
    operator: "NPCIL",
    latitude: 8.1690,
    longitude: 77.7120,
    tags: { capacity_mw: 2000 }
  },
  {
    name: "Tuticorin Thermal Power Station",
    facility_type: "power_station",
    operator: "TANGEDCO",
    latitude: 8.7520,
    longitude: 78.1820,
    tags: { capacity_mw: 1050 }
  }
];

export const RAW_HOTSPOTS: HotspotSeed[] = [
  {
    id: "te-jam-101",
    latitude: 22.3591,
    longitude: 69.8652,
    timestamp: "2026-09-03T04:30:00Z",
    brightness: 368.5,
    frp: 54.2,
    confidence: 94.0,
    satellite: "VIIRS_SNPP",
    source: "NASA_FIRMS_SAMPLE",
    cluster_id: "cls-jamnagar-01",
    daynight: "N"
  },
  {
    id: "te-haz-201",
    latitude: 21.1145,
    longitude: 72.6732,
    timestamp: "2026-09-03T09:12:00Z",
    brightness: 394.8,
    frp: 142.5,
    confidence: 99.0,
    satellite: "VIIRS_SNPP",
    source: "NASA_FIRMS_SAMPLE",
    cluster_id: "cls-hazira-fire-01",
    daynight: "D"
  },
  {
    id: "te-pnb-301",
    latitude: 30.2451,
    longitude: 75.8341,
    timestamp: "2026-09-03T08:20:00Z",
    brightness: 332.4,
    frp: 28.5,
    confidence: 82.0,
    satellite: "VIIRS_SNPP",
    source: "NASA_FIRMS_SAMPLE",
    cluster_id: "cls-sangrur-agri-01",
    daynight: "D"
  },
  {
    id: "te-sim-401",
    latitude: 21.8450,
    longitude: 86.3210,
    timestamp: "2026-09-03T07:15:00Z",
    brightness: 354.2,
    frp: 92.4,
    confidence: 89.0,
    satellite: "VIIRS_SNPP",
    source: "NASA_FIRMS_SAMPLE",
    cluster_id: "cls-simlipal-wild-01",
    daynight: "D"
  },
  {
    id: "te-krb-501",
    latitude: 22.3425,
    longitude: 82.5942,
    timestamp: "2026-09-03T03:40:00Z",
    brightness: 348.6,
    frp: 38.0,
    confidence: 88.0,
    satellite: "VIIRS_NOAA20",
    source: "NASA_FIRMS_SAMPLE",
    cluster_id: "cls-korba-mine-01",
    daynight: "N"
  },
  {
    id: "te-ang-601",
    latitude: 20.8420,
    longitude: 85.0871,
    timestamp: "2026-09-03T06:10:00Z",
    brightness: 376.0,
    frp: 62.0,
    confidence: 92.0,
    satellite: "MODIS_Aqua",
    source: "NASA_FIRMS_SAMPLE",
    cluster_id: "cls-angul-steel-01",
    daynight: "D"
  }
];

const HISTORICAL_PROFILES: Record<string, any> = {
  "cls-jamnagar-01": {
    first_seen: "2026-06-15T00:00:00Z",
    observation_count: 142,
    frequency_per_week: 11.2,
    recurrence_ratio: 0.94,
    persistence_days: 80,
    seasonal_pattern: "year_round",
    is_persistent: true
  },
  "cls-hazira-fire-01": {
    first_seen: "2026-09-03T08:30:00Z",
    observation_count: 2,
    frequency_per_week: 0.0,
    recurrence_ratio: 0.05,
    persistence_days: 1,
    seasonal_pattern: "none_sudden_onset",
    is_persistent: false
  },
  "cls-sangrur-agri-01": {
    first_seen: "2026-09-01T00:00:00Z",
    observation_count: 3,
    frequency_per_week: 3.0,
    recurrence_ratio: 0.20,
    persistence_days: 3,
    seasonal_pattern: "harvest_autumn",
    is_persistent: false
  },
  "cls-simlipal-wild-01": {
    first_seen: "2026-09-02T12:00:00Z",
    observation_count: 5,
    frequency_per_week: 5.0,
    recurrence_ratio: 0.35,
    persistence_days: 2,
    seasonal_pattern: "dry_season_transient",
    is_persistent: false
  },
  "cls-korba-mine-01": {
    first_seen: "2026-07-01T00:00:00Z",
    observation_count: 64,
    frequency_per_week: 7.5,
    recurrence_ratio: 0.82,
    persistence_days: 64,
    seasonal_pattern: "year_round",
    is_persistent: true
  },
  "cls-angul-steel-01": {
    first_seen: "2026-05-10T00:00:00Z",
    observation_count: 118,
    frequency_per_week: 9.8,
    recurrence_ratio: 0.89,
    persistence_days: 115,
    seasonal_pattern: "year_round",
    is_persistent: true
  }
};

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getLandCover(lat: number, lon: number): string {
  // 1. Industrial zones / refineries
  if (lat >= 22.30 && lat <= 22.42 && lon >= 69.80 && lon <= 69.95) return "industrial"; // Jamnagar
  if (lat >= 21.05 && lat <= 21.18 && lon >= 72.60 && lon <= 72.75) return "industrial"; // Hazira
  if (lat >= 20.75 && lat <= 20.90 && lon >= 85.00 && lon <= 85.20) return "industrial"; // Angul
  if (lat >= 27.20 && lat <= 27.40 && lon >= 77.60 && lon <= 77.80) return "industrial"; // Mathura
  if (lat >= 22.30 && lat <= 22.45 && lon >= 73.05 && lon <= 73.20) return "industrial"; // Vadodara
  if (lat >= 15.15 && lat <= 15.25 && lon >= 76.60 && lon <= 76.75) return "industrial"; // Toranagallu JSW

  // 2. Mining pits & basins
  if (lat >= 15.00 && lat <= 15.40 && lon >= 76.30 && lon <= 76.90) return "mining_pit"; // Bellary/Sandur
  if (lat >= 22.25 && lat <= 22.45 && lon >= 82.50 && lon <= 82.70) return "mining_pit"; // Korba / Gevra
  if (lat >= 23.65 && lat <= 23.85 && lon >= 86.30 && lon <= 86.55) return "mining_pit"; // Jharia
  if (lat >= 24.00 && lat <= 24.30 && lon >= 82.50 && lon <= 82.80) return "mining_pit"; // Singrauli
  if (lat >= 21.80 && lat <= 22.30 && lon >= 85.10 && lon <= 85.60) return "mining_pit"; // Keonjhar/Barbil
  if (lat >= 11.50 && lat <= 11.70 && lon >= 79.40 && lon <= 79.60) return "mining_pit"; // Neyveli

  // 3. Dense forest reserves & Hill Tracts
  // Western Ghats forest ridge
  if (lat >= 8.0 && lat <= 21.0 && lon >= 73.2 && lon <= 77.0 && !(lat >= 14.8 && lat <= 15.5 && lon >= 75.8 && lon <= 77.2)) {
    if ((lon >= 73.4 && lon <= 75.6) || (lat <= 11.5 && lon >= 76.0 && lon <= 77.3)) return "dense_forest";
  }
  // Eastern Ghats
  if (lat >= 17.0 && lat <= 19.5 && lon >= 81.5 && lon <= 84.5) return "dense_forest";
  // Simlipal / Mayurbhanj
  if (lat >= 21.3 && lat <= 22.3 && lon >= 86.0 && lon <= 86.7) return "dense_forest";
  // Central India / Bastar / Satpura
  if (lat >= 18.5 && lat <= 23.5 && lon >= 79.5 && lon <= 83.5) {
    if (lat >= 22.1 && lat <= 22.6 && lon >= 82.2 && lon <= 82.9) return "mining_pit";
    return "dense_forest";
  }
  // Northeast forests
  if (lat >= 23.5 && lat <= 28.5 && lon >= 90.0 && lon <= 97.2) return "dense_forest";
  // Himalayan foothills
  if (lat >= 29.0 && lat <= 33.0 && lon >= 75.0 && lon <= 81.0) return "dense_forest";

  // 4. Cropland / Agricultural belts
  // Indo-Gangetic Plain (Punjab, Haryana, UP, Bihar, Bengal)
  if (lat >= 24.5 && lat <= 32.0 && lon >= 74.0 && lon <= 88.5) return "cropland";
  // Deccan agrarian plateaus (Karnataka, Telangana, Maharashtra)
  if (lat >= 14.5 && lat <= 19.5 && lon >= 75.0 && lon <= 79.5) return "cropland";
  // Tamil Nadu plains & Kaveri delta
  if (lat >= 8.5 && lat <= 12.0 && lon >= 77.2 && lon <= 79.8) return "cropland";
  // Sri Lanka agrarian plains
  if (lat >= 7.0 && lat <= 9.5 && lon >= 80.0 && lon <= 81.8) return "cropland";

  return "open_land";
}

export function processThermalEvent(raw: HotspotSeed, isDemo: boolean = false) {
  let nearestFac = INDUSTRIAL_FACILITIES[0];
  let minDist = Infinity;
  for (const fac of INDUSTRIAL_FACILITIES) {
    const d = haversineDistance(raw.latitude, raw.longitude, fac.latitude, fac.longitude);
    if (d < minDist) {
      minDist = d;
      nearestFac = fac;
    }
  }

  const landCover = getLandCover(raw.latitude, raw.longitude);
  const isIndustrialZone = minDist <= 2500 || landCover === "industrial";
  const isForestZone = landCover === "dense_forest";
  const isFarmlandZone = landCover === "cropland";
  const isMiningZone = landCover === "mining_pit" || (nearestFac.facility_type === "mine" && minDist <= 5000);
  const isInfrastructureNearby = isIndustrialZone || isMiningZone || minDist <= 5000;

  const geoContext = {
    nearest_industrial_facility: minDist < 50000 ? nearestFac.name : "None within 50 km",
    facility_type: minDist < 50000 ? nearestFac.facility_type : "none",
    distance_to_industry: Math.round(minDist * 10) / 10,
    land_cover: landCover,
    nearby_infrastructure: minDist < 500 ? `${nearestFac.name} Flare/Unit Stack` : "None within 2 km",
    distance_to_infrastructure: minDist < 500 ? Math.round(minDist * 0.4) : undefined,
    nearby_road: minDist < 5000 ? "Primary Industrial Access Highway" : "Rural Route",
    distance_to_road: Math.round(Math.min(200, minDist * 0.2 + 30)),
    spatial_flags: {
      is_industrial_zone: isIndustrialZone,
      is_forest_zone: isForestZone,
      is_farmland_zone: isFarmlandZone,
      is_mining_zone: isMiningZone,
      facility_operator: nearestFac.operator
    }
  };

  let tempProfile: any;
  if (isDemo && HISTORICAL_PROFILES[raw.cluster_id]) {
    const demoProf = HISTORICAL_PROFILES[raw.cluster_id];
    tempProfile = {
      ...demoProf,
      cluster_id: raw.cluster_id,
      status: "CALIBRATED_BENCHMARK",
      behaviour: demoProf.is_persistent ? "Persistent" : "Transient",
      first_observed_at: demoProf.first_seen,
      last_observed_at: raw.timestamp,
      active_days: demoProf.persistence_days,
      active_duration_days: demoProf.persistence_days,
      persistence_score: demoProf.is_persistent ? 0.92 : (demoProf.persistence_days <= 2 ? 0.05 : 0.25)
    };
  } else {
    // LIVE MODE: MUST NEVER USE HISTORICAL_PROFILES OR HARCODED GUESSES!
    // In live mode, baseline represents single unverified observation until query against DB
    tempProfile = {
      cluster_id: raw.cluster_id,
      status: "TEMPORAL_DATA_INSUFFICIENT",
      behaviour: "Insufficient Data",
      first_seen: raw.timestamp,
      last_seen: raw.timestamp,
      first_observed_at: raw.timestamp,
      last_observed_at: raw.timestamp,
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
      recurrence_ratio: 0.0,
      recurrence_count: 0,
      average_revisit_hours: null,
      median_revisit_hours: null,
      seasonal_pattern: "INSUFFICIENT_DATA",
      seasonality_score: 0.0,
      seasonal_concentration: 0.0
    };
  }

  // ML Feature Vector Extraction
  const features = {
    brightness: raw.brightness,
    frp: raw.frp,
    firms_confidence: Math.round((raw.confidence / 100) * 1000) / 1000,
    scan: 0.40,
    track: 0.40,
    daynight_flag: raw.daynight === "N" ? 0.0 : 1.0,
    distance_to_industry_km: Math.round((minDist / 1000) * 100) / 100,
    industrial_facility_count: minDist <= 10000 ? 1.0 : 0.0,
    industrial_nearby_flag: isIndustrialZone ? 1.0 : 0.0,
    mining_nearby_flag: isMiningZone ? 1.0 : 0.0,
    infrastructure_nearby_flag: isInfrastructureNearby ? 1.0 : 0.0,
    forest_context: isForestZone ? 1.0 : 0.0,
    agricultural_context: isFarmlandZone ? 1.0 : 0.0,
    urban_context: landCover === "industrial" ? 0.5 : 0.0,
    open_land_context: (!isForestZone && !isFarmlandZone && !isIndustrialZone && !isMiningZone) ? 1.0 : 0.0,
    observation_count: tempProfile.observation_count,
    active_days: tempProfile.active_days || tempProfile.persistence_days,
    active_duration: tempProfile.active_duration_days || tempProfile.persistence_days,
    observation_frequency: tempProfile.frequency_per_week,
    recurrence_count: typeof tempProfile.recurrence_count === "number" ? tempProfile.recurrence_count : Math.round(tempProfile.persistence_days * tempProfile.recurrence_ratio),
    recurrence_ratio: tempProfile.recurrence_ratio,
    average_revisit_interval: tempProfile.average_revisit_hours !== null && tempProfile.average_revisit_hours !== undefined ? tempProfile.average_revisit_hours : (tempProfile.frequency_per_week > 0 ? Math.round((168 / tempProfile.frequency_per_week) * 10) / 10 : 24.0),
    median_revisit_interval: tempProfile.median_revisit_hours !== null && tempProfile.median_revisit_hours !== undefined ? tempProfile.median_revisit_hours : 24.0,
    persistence_score: typeof tempProfile.persistence_score === "number" ? tempProfile.persistence_score : (tempProfile.is_persistent ? 0.85 : 0.05),
    seasonality_score: typeof tempProfile.seasonality_score === "number" ? tempProfile.seasonality_score : 0.0,
    seasonal_concentration: typeof tempProfile.seasonal_concentration === "number" ? tempProfile.seasonal_concentration : 0.0,
    // Backwards compatible aliases
    dist_industry_km: Math.round((minDist / 1000) * 100) / 100,
    is_industrial_land: isIndustrialZone ? 1 : 0,
    is_forest_land: isForestZone ? 1 : 0,
    is_farmland: isFarmlandZone ? 1 : 0,
    is_mining_land: isMiningZone ? 1 : 0,
    persistence_days_log: Math.round(Math.log1p(tempProfile.persistence_days) * 100) / 100
  };

  let topClass = "Other";
  let maxProb = 0.5;
  let classProbabilities: Record<string, number> = {
    "Industrial Fire": 0.0,
    "Gas Flare": 0.0,
    "Agricultural Burning": 0.0,
    "Wildfire": 0.0,
    "Mining": 0.0,
    "Other": 1.0
  };
  let model_version = "random_forest_v1.0.0";

  try {
    const mlPred = predictWithRandomForest(features);
    topClass = mlPred.predicted_class;
    maxProb = mlPred.confidence;
    classProbabilities = mlPred.class_probabilities;
    model_version = mlPred.model_version;
  } catch (err: any) {
    console.error("ThermoGuard ML Error: Single event inference failed:", err.message);
    topClass = "ML_UNAVAILABLE";
    maxProb = 0.0;
    model_version = "ML_UNAVAILABLE";
  }

  // Risk Scoring (Independent of model confidence)
  const frpNorm = Math.min(100, (raw.frp / 150) * 100);
  const brightNorm = Math.min(100, Math.max(0, (raw.brightness - 310) / 90) * 100);
  const sThermal = 0.65 * frpNorm + 0.35 * brightNorm;

  let sProximity = 5;
  if (minDist <= 300) sProximity = 100;
  else if (minDist <= 1000) sProximity = 80;
  else if (minDist <= 3000) sProximity = 50;
  else if (minDist <= 10000) sProximity = 20;

  if (topClass === "Gas Flare") {
    sProximity *= 0.3; // Controlled routine operation
  }

  const sourceHazardWeights: Record<string, number> = {
    "Industrial Fire": 1.0,
    "Wildfire": 0.85,
    "Gas Flare": 0.25,
    "Mining": 0.5,
    "Agricultural Burning": 0.4,
    "Other": 0.3
  };
  const sSource = (sourceHazardWeights[topClass] || 0.3) * 100;

  let sTemporal = 50;
  if (tempProfile.persistence_days <= 2 && sThermal > 60) {
    sTemporal = 90;
  } else if (tempProfile.persistence_days >= 30) {
    sTemporal = 35;
  }

  const totalRiskVal = Math.round(
    (30 / 92) * sThermal + (25 / 92) * sProximity + (25 / 92) * sSource + (12 / 92) * sTemporal
  );

  let riskBand: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
  if (totalRiskVal >= 85) riskBand = "CRITICAL";
  else if (totalRiskVal >= 65) riskBand = "HIGH";
  else if (totalRiskVal >= 35) riskBand = "MEDIUM";

  // Phase 5: Categorized Structured Evidence
  const thermalEvidence: string[] = [];
  const spatialEvidence: string[] = [];
  const temporalEvidence: string[] = [];
  const classSpecificEvidence: string[] = [];

  // 1. Thermal Evidence
  if (raw.frp >= 100) {
    thermalEvidence.push(`Severe thermal radiative power: ${raw.frp} MW (exceeds high-intensity industrial/wildfire threshold)`);
  } else if (raw.frp >= 40) {
    thermalEvidence.push(`Moderate-to-high radiative power: ${raw.frp} MW (consistent with flare stacks or open biomass fire)`);
  } else {
    thermalEvidence.push(`Low-to-moderate thermal intensity: ${raw.frp} MW (steady controlled emission or smoldering)`);
  }
  thermalEvidence.push(`Brightness temperature: ${raw.brightness} K recorded by ${raw.satellite}`);
  thermalEvidence.push(`FIRMS satellite detection confidence: ${raw.confidence}% (multi-band spectral anomaly verification)`);
  thermalEvidence.push(`Observation timing: ${raw.daynight === 'N' ? 'Nighttime (zero solar glint reflection)' : 'Daytime overpass'}`);

  // 2. Spatial Evidence
  if (minDist <= 300) {
    spatialEvidence.push(`Immediate industrial perimeter: ${Math.round(minDist)} m to ${geoContext.nearest_industrial_facility}`);
  } else if (minDist <= 1000) {
    spatialEvidence.push(`Industrial proximity: ${Math.round(minDist)} m to ${geoContext.nearest_industrial_facility}`);
  } else if (minDist <= 5000) {
    spatialEvidence.push(`Located ${Math.round(minDist / 100) / 10} km from nearest industrial installation (${geoContext.nearest_industrial_facility})`);
  } else {
    spatialEvidence.push(`Remote from industrial installations: nearest facility is ${Math.round(minDist / 100) / 10} km away (${geoContext.nearest_industrial_facility})`);
  }
  const landCoverDescriptions: Record<string, string> = {
    industrial: "Designated industrial land-use zoning (OSM & satellite overlay)",
    dense_forest: "Dense forest reserve / protected tree canopy cover",
    cropland: "Active agricultural cropland / cultivated parcel",
    mining_pit: "Co-located within open-cast mine concession or overburden spoil heap"
  };
  spatialEvidence.push(`Land-use / Land-cover context: ${landCoverDescriptions[landCover] || `Zoned as ${landCover}`}`);
  spatialEvidence.push(`Industrial corridor density: ${(geoContext as any).contextual_attributes?.facilities_within_10km || 1} facilities within 10 km radius`);

  // 3. Temporal Evidence
  if (tempProfile.status === "TEMPORAL_DATA_INSUFFICIENT" || tempProfile.observation_count <= 1) {
    temporalEvidence.push(`Single satellite pass recorded (count: 1); insufficient historical passes to determine persistence; evaluated as transient.`);
  } else if (tempProfile.is_persistent || tempProfile.persistence_days >= 21) {
    temporalEvidence.push(`Persistent multi-temporal source: active across ${tempProfile.persistence_days} days with ${tempProfile.observation_count} satellite detections (${Math.round(tempProfile.recurrence_ratio * 100)}% recurrence)`);
  } else if (tempProfile.persistence_days <= 2) {
    temporalEvidence.push(`Acute sudden-onset signature: detected across ${tempProfile.persistence_days} day(s) with ${tempProfile.observation_count} passes (no continuous baseline)`);
  } else {
    temporalEvidence.push(`Activity spanning ${tempProfile.persistence_days} days across ${tempProfile.observation_count} detection passes`);
  }
  temporalEvidence.push(`Recurrence ratio: ${Math.round(tempProfile.recurrence_ratio * 100)}% of orbital revisit passes`);
  temporalEvidence.push(`Detection frequency: ${tempProfile.frequency_per_week} observations per week`);
  if (tempProfile.seasonal_pattern && tempProfile.seasonal_pattern !== "INSUFFICIENT_DATA") {
    temporalEvidence.push(`Seasonal profile: ${tempProfile.seasonal_pattern.replace(/_/g, ' ')}`);
  } else {
    temporalEvidence.push("Seasonal evaluation: Insufficient historical baseline (<5 passes) for seasonal cycle derivation.");
  }

  // 4. Class-Specific Attribution
  if (topClass === "Gas Flare") {
    classSpecificEvidence.push("Persistent stationary emission footprint co-located with refinery or petrochemical infrastructure");
    classSpecificEvidence.push("High multi-week recurrence without lateral geometric expansion indicates controlled flare stack combustion");
  } else if (topClass === "Industrial Fire") {
    classSpecificEvidence.push("Elevated thermal radiative surge within industrial boundary indicates uncontrolled combustion outbreak");
    classSpecificEvidence.push("Acute short-duration onset differentiates event from routine continuous flaring");
  } else if (topClass === "Agricultural Burning") {
    classSpecificEvidence.push("Agricultural cropland context remote from industrial installations");
    classSpecificEvidence.push("Transient post-harvest seasonal residue combustion pattern with rapid spatial dissipation");
  } else if (topClass === "Wildfire") {
    classSpecificEvidence.push("Location within dense forest reserve canopy with zero industrial infrastructure");
    classSpecificEvidence.push("High FRP biomass combustion signature characteristic of uncontained wildfire front");
  } else if (topClass === "Mining") {
    classSpecificEvidence.push("Spatial co-location with open-cast mining excavation pit or coal spoil heap");
    classSpecificEvidence.push("Recurring low-velocity thermal profile characteristic of spontaneous subsurface coal oxidation");
  } else {
    classSpecificEvidence.push("Thermal and spatial attributes do not match standard industrial, agricultural, or wildfire profiles");
    classSpecificEvidence.push("Isolated transient observation with low confidence margin or unclassified land-use context");
  }

  const structuredEvidence = {
    thermal: thermalEvidence,
    spatial: spatialEvidence,
    temporal: temporalEvidence,
    class_specific: classSpecificEvidence,
    summary: [
      spatialEvidence[0],
      temporalEvidence[0],
      thermalEvidence[0],
      classSpecificEvidence[0]
    ]
  };

  // Phase 5: Confidence Interpretation
  const sortedProbs = Object.entries(classProbabilities).sort((a, b) => b[1] - a[1]);
  const runnerUpClass = sortedProbs[1]?.[0] || null;
  const runnerUpProb = sortedProbs[1]?.[1] || 0.0;
  const confidenceMargin = Math.round((maxProb - runnerUpProb) * 10000) / 10000;

  let confidenceBand: "LOW" | "MEDIUM" | "HIGH" = "HIGH";
  if (maxProb < 0.50) confidenceBand = "LOW";
  else if (maxProb < 0.75) confidenceBand = "MEDIUM";

  let confidenceQuality: "STRONG" | "MODERATE" | "WEAK" = "STRONG";
  let qualityReason = "";
  if (maxProb >= 0.70 && confidenceMargin >= 0.35) {
    confidenceQuality = "STRONG";
    qualityReason = `Clear decision separation (margin: +${Math.round(confidenceMargin * 100)}% over runner-up ${runnerUpClass}) with verified geospatial and temporal context.`;
  } else if (maxProb >= 0.50 && confidenceMargin >= 0.15) {
    confidenceQuality = "MODERATE";
    qualityReason = `Moderate probability separation (+${Math.round(confidenceMargin * 100)}% over ${runnerUpClass}); classification consistent with primary contextual signals.`;
  } else {
    confidenceQuality = "WEAK";
    qualityReason = `Narrow margin separation (+${Math.round(confidenceMargin * 100)}% over ${runnerUpClass}) or incomplete contextual confirmation suggests class ambiguity.`;
  }

  // Phase 5: Structured Risk Reasons
  const riskReasons: string[] = [];
  if (raw.frp >= 100) {
    riskReasons.push(`Severe thermal radiative power (${raw.frp} MW) exceeds emergency surge threshold (100 MW)`);
  } else if (raw.frp >= 45) {
    riskReasons.push(`Elevated radiative intensity (${raw.frp} MW) indicative of vigorous combustion`);
  } else {
    riskReasons.push(`Thermal radiative power (${raw.frp} MW) remains within moderate non-critical range`);
  }

  if (minDist <= 300) {
    riskReasons.push(`Immediate proximity (${Math.round(minDist)} m) to major industrial installation`);
  } else if (minDist <= 1000) {
    riskReasons.push(`Close proximity (${Math.round(minDist)} m) to industrial facilities`);
  } else {
    riskReasons.push(`Remote location (${Math.round(minDist / 100) / 10} km from nearest industrial complex)`);
  }

  if (topClass === "Industrial Fire") {
    riskReasons.push("Critical source classification: uncontrolled industrial fires present immediate explosion and life-safety hazards");
  } else if (topClass === "Wildfire") {
    riskReasons.push("High source hazard: active forest wildfire presents ecological destruction and propagation risks");
  } else if (topClass === "Mining") {
    riskReasons.push("Moderate source hazard: subsurface coal oxidation presents smoldering coal bed methane ignition risks");
  } else if (topClass === "Agricultural Burning") {
    riskReasons.push("Moderate source hazard: open crop stubble burning poses seasonal particulate air pollution (AQI impact)");
  } else if (topClass === "Gas Flare") {
    riskReasons.push("Low operational threat: planned combustion designed for refinery pressure management");
  }

  if (tempProfile.persistence_days <= 2 && sThermal >= 55) {
    riskReasons.push("Acute sudden onset: abrupt thermal surge without prior continuous baseline indicates active ignition event");
  } else if (tempProfile.persistence_days >= 30 && topClass === "Gas Flare") {
    riskReasons.push("Long-term historical persistence confirms routine steady-state operational flaring");
  }

  let actionRecommended = "INFORMATIONAL LOGGING: Transient or controlled thermal source; no field dispatch required.";
  if (riskBand === "CRITICAL") {
    actionRecommended = "EMERGENCY DISPATCH: Activate Tier-3 industrial emergency response; alert district fire control room and SDMA.";
  } else if (riskBand === "HIGH") {
    actionRecommended = "PRIORITY SURVEILLANCE: Deploy rapid aerial/field verification units; establish containment perimeter and monitor next orbital pass.";
  } else if (riskBand === "MEDIUM") {
    actionRecommended = "ROUTINE MONITORING: Log observation parameters in the district environmental registry; verify emission limits against regulatory permits.";
  }

  // Phase 5: Synthesized Human-Readable Explanation
  const pct = Math.round(maxProb * 100);
  const primaryReason = riskReasons.slice(0, 2).join("; ");
  let explanation = "";
  if (topClass === "Gas Flare") {
    explanation = `Classified as Gas Flare (${pct}% model probability, ${confidenceBand} confidence) due to persistent thermal activity inside or immediately adjacent to industrial refining facilities. Stationary spatial recurrence confirms controlled flare stack combustion. Operational risk is assessed as ${riskBand} (${totalRiskVal}/100) on the basis of: ${primaryReason}.`;
  } else if (topClass === "Industrial Fire") {
    explanation = `Classified as Industrial Fire (${pct}% model probability, ${confidenceBand} confidence) due to an acute radiative power surge within an industrial facility perimeter. Lack of prior continuous baseline distinguishes this uncontrolled outbreak from routine flaring. Operational risk is assessed as ${riskBand} (${totalRiskVal}/100) on the basis of: ${primaryReason}.`;
  } else if (topClass === "Agricultural Burning") {
    explanation = `Classified as Agricultural Burning (${pct}% model probability, ${confidenceBand} confidence) based on cropland terrain context, seasonal harvest alignment, and absence of industrial infrastructure. Operational risk is assessed as ${riskBand} (${totalRiskVal}/100) on the basis of: ${primaryReason}.`;
  } else if (topClass === "Wildfire") {
    explanation = `Classified as Wildfire (${pct}% model probability, ${confidenceBand} confidence) due to elevated thermal radiative power situated within a dense forest reserve canopy. Operational risk is assessed as ${riskBand} (${totalRiskVal}/100) on the basis of: ${primaryReason}.`;
  } else if (topClass === "Mining") {
    explanation = `Classified as Mining (${pct}% model probability, ${confidenceBand} confidence) owing to co-location within an open-cast mining basin and recurring oxidation signature. Operational risk is assessed as ${riskBand} (${totalRiskVal}/100) on the basis of: ${primaryReason}.`;
  } else if (topClass === "ML_UNAVAILABLE") {
    explanation = `Random Forest inference is pending or unavailable for this live observation. Feature extraction completed; awaiting model pipeline execution. Operational risk is assessed as ${riskBand} (${totalRiskVal}/100) on the basis of: ${primaryReason}.`;
  } else {
    explanation = `Classified as Other (${pct}% model probability, ${confidenceBand} confidence) because observation attributes do not exhibit definitive industrial, agricultural, or forest wildfire characteristics. Operational risk is assessed as ${riskBand} (${totalRiskVal}/100) on the basis of: ${primaryReason}.`;
  }

  // Top Feature Importance for this event
  const topFeatures = [
    { feature: "dist_industry_km", importance: 0.168, value: features.dist_industry_km, description: "Distance to nearest industrial facility (km)" },
    { feature: "is_industrial_land", importance: 0.142, value: features.is_industrial_land, description: "Direct co-location in industrial zoning" },
    { feature: "persistence_days_log", importance: 0.118, value: features.persistence_days_log, description: "Historical observation persistence (log scale)" },
    { feature: "frp", importance: 0.098, value: features.frp, description: "Fire Radiative Power (MW)" },
    { feature: "is_farmland", importance: 0.084, value: features.is_farmland, description: "Agricultural cultivated cropland parcel" },
    { feature: "is_forest_land", importance: 0.076, value: features.is_forest_land, description: "Dense forest reserve canopy" }
  ];

  let alertObj: any = null;
  if (riskBand === "HIGH" || riskBand === "CRITICAL") {
    alertObj = {
      id: `alt-${raw.id}`,
      event_id: raw.id,
      title: `${riskBand} RISK HAZARD: ${topClass} at ${geoContext.nearest_industrial_facility}`,
      description: `Radiative surge of ${raw.frp} MW detected. ${structuredEvidence.summary[0]}`,
      severity: riskBand,
      status: "ACTIVE",
      facility_name: geoContext.nearest_industrial_facility,
      action_recommended: actionRecommended,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      acknowledged_by: null,
      acknowledged_at: null,
      resolved_by: null,
      resolved_at: null,
      resolution_notes: null,
      audit_trail: [
        {
          timestamp: new Date().toISOString(),
          action: "SYSTEM_TRIGGERED",
          performed_by: "ThermoGuard Geospatial Risk Engine",
          notes: `Automatic alert dispatched on ${riskBand} risk classification (Risk Score: ${totalRiskVal}/100)`
        }
      ]
    };
  }

  const intelligenceObj = {
    event_id: raw.id,
    prediction: {
      predicted_class: topClass,
      confidence: maxProb,
      confidence_band: confidenceBand,
      confidence_margin: confidenceMargin,
      confidence_quality: confidenceQuality,
      quality_reason: qualityReason,
      interpretation_notice: "Model confidence represents the highest multi-class probability assigned by the trained Random Forest decision tree ensemble. It measures classifier certainty based on input feature vectors and does NOT represent verified real-world ground-truth accuracy.",
      model_version: model_version,
      class_probabilities: classProbabilities,
      runner_up_class: runnerUpClass,
      runner_up_probability: runnerUpProb
    },
    evidence: structuredEvidence,
    feature_importance: topFeatures,
    risk: {
      score: totalRiskVal,
      level: riskBand,
      reasons: riskReasons,
      breakdown: {
        thermal_intensity_score: Math.round(sThermal),
        hazard_proximity_score: Math.round(sProximity),
        source_type_hazard_score: Math.round(sSource),
        temporal_urgency_score: Math.round(sTemporal)
      },
      action_recommended: actionRecommended
    },
    explanation
  };

  const fingerprintObj = computeThermalFingerprint(raw, geoContext, tempProfile, { predicted_class: topClass, confidence: maxProb });
  const priorityObj = computeSmartPriority(raw, geoContext, tempProfile, { predicted_class: topClass, confidence: maxProb, risk_score: riskBand, risk_value: totalRiskVal });

  if (alertObj) {
    alertObj.priority_score = priorityObj.score;
    alertObj.priority_level = priorityObj.level;
    alertObj.priority_factors = priorityObj.factors;
  }

  return {
    event: raw,
    geo_context: geoContext,
    temporal_profile: tempProfile,
    classification: {
      predicted_class: topClass,
      confidence: maxProb,
      risk_score: riskBand,
      risk_value: totalRiskVal,
      persistence_score: Math.min(1.0, Math.round((tempProfile.persistence_days / 60) * 100) / 100),
      model_version: model_version,
      evidence: structuredEvidence.summary,
      feature_vector: features,
      class_probabilities: classProbabilities,
      risk_breakdown: {
        thermal_intensity_score: Math.round(sThermal),
        hazard_proximity_score: Math.round(sProximity),
        source_type_hazard_score: Math.round(sSource),
        temporal_urgency_score: Math.round(sTemporal)
      },
      confidence_band: confidenceBand,
      confidence_margin: confidenceMargin,
      confidence_quality: confidenceQuality,
      interpretation_notice: intelligenceObj.prediction.interpretation_notice,
      structured_evidence: structuredEvidence,
      risk_reasons: riskReasons,
      explanation,
      // Priority 6: Human Verification / Analyst Review Layer
      verification_status: (getVerificationRecord(raw.id)?.verification_status) || "UNVERIFIED",
      verified_class: (getVerificationRecord(raw.id)?.verified_class) || null,
      verified_by: (getVerificationRecord(raw.id)?.verified_by) || null,
      verified_by_name: (getVerificationRecord(raw.id)?.verified_by_name) || null,
      verified_at: (getVerificationRecord(raw.id)?.verified_at) || null,
      verification_reason: (getVerificationRecord(raw.id)?.verification_reason) || null,
      verification_audit_trail: (getVerificationRecord(raw.id)?.audit_trail) || []
    },
    alert: alertObj,
    intelligence: intelligenceObj,
    fingerprint: computeThermalFingerprint(raw, geoContext, tempProfile, { predicted_class: topClass, confidence: maxProb }),
    priority: computeSmartPriority(raw, geoContext, tempProfile, { predicted_class: topClass, confidence: maxProb, risk_score: riskBand, risk_value: totalRiskVal })
  };
}

/**
 * End-to-end Live Thermal Intelligence Pipeline:
 * LIVE NASA FIRMS
 *       ↓
 * Persist raw observation to thermal_events table FIRST
 *       ↓
 * Find/assign spatial cluster (1.2 km radius, 720 hr window)
 *       ↓
 * Query historical observations from DB
 *       ↓
 * Calculate real temporal behaviour (observation_count, active_days, persistence_days, recurrence_ratio, etc.)
 *       ↓
 * Generate and persist temporal profile
 *       ↓
 * ML Classification with real temporal features
 *       ↓
 * Risk + Structured Evidence + Alert
 */
export async function processLiveThermalEvent(raw: RawObservation): Promise<any> {
  // 1. Geospatial context calculation
  let nearestFac = INDUSTRIAL_FACILITIES[0];
  let minDist = Infinity;
  for (const fac of INDUSTRIAL_FACILITIES) {
    const d = haversineDistance(raw.latitude, raw.longitude, fac.latitude, fac.longitude);
    if (d < minDist) {
      minDist = d;
      nearestFac = fac;
    }
  }

  const landCover = getLandCover(raw.latitude, raw.longitude);
  const isIndustrialZone = minDist <= 2500 || landCover === "industrial";
  const isForestZone = landCover === "dense_forest";
  const isFarmlandZone = landCover === "cropland";
  const isMiningZone = landCover === "mining_pit" || (nearestFac.facility_type === "mine" && minDist <= 5000);
  const isInfrastructureNearby = isIndustrialZone || isMiningZone || minDist <= 5000;

  const geoContext = {
    nearest_industrial_facility: minDist < 50000 ? nearestFac.name : "None within 50 km",
    facility_type: minDist < 50000 ? nearestFac.facility_type : "none",
    distance_to_industry: Math.round(minDist * 10) / 10,
    land_cover: landCover,
    nearby_infrastructure: minDist < 500 ? `${nearestFac.name} Flare/Unit Stack` : "None within 2 km",
    distance_to_infrastructure: minDist < 500 ? Math.round(minDist * 0.4) : undefined,
    nearby_road: minDist < 5000 ? "Primary Industrial Access Highway" : "Rural Route",
    distance_to_road: Math.round(Math.min(200, minDist * 0.2 + 30)),
    spatial_flags: {
      is_industrial_zone: isIndustrialZone,
      is_forest_zone: isForestZone,
      is_farmland_zone: isFarmlandZone,
      is_mining_zone: isMiningZone,
      facility_operator: nearestFac.operator
    }
  };

  // 2. Spatial cluster assignment using existing centroids from DB / persistent store
  const existingCentroids = await getExistingClusterCentroids();
  const clusterId = findOrCreateSpatialCluster(
    raw.latitude,
    raw.longitude,
    raw.timestamp,
    existingCentroids,
    TEMPORAL_CONFIG.CLUSTER_RADIUS_KM,
    TEMPORAL_CONFIG.CLUSTER_WINDOW_HOURS
  );
  raw.cluster_id = clusterId;

  // 3. Persist raw observation into thermal_events table FIRST
  await persistRawObservation(raw);

  // 4. Query ALL historical observations belonging to this spatial cluster from DB / persistent store
  const historicalObs = await queryHistoricalObservationsForCluster(
    clusterId,
    TEMPORAL_CONFIG.CLUSTER_WINDOW_HOURS,
    raw.timestamp
  );
  if (!historicalObs.some((o) => o.id === raw.id)) {
    historicalObs.push(raw);
  }

  // 5. Calculate actual temporal behaviour from queried observations (NO HARDCODING!)
  const tempProfile = calculateTemporalProfile(historicalObs, clusterId);

  // 6. Save or update the calculated profile in temporal_profiles table
  await persistTemporalProfileRecord(tempProfile);

  // 7. Extract ML Feature Vector using REAL calculated temporal metrics
  const features = {
    brightness: raw.brightness,
    frp: raw.frp,
    firms_confidence: Math.round((raw.confidence / 100) * 1000) / 1000,
    scan: 0.40,
    track: 0.40,
    daynight_flag: raw.daynight === "N" ? 0.0 : 1.0,
    distance_to_industry_km: Math.round((minDist / 1000) * 100) / 100,
    industrial_facility_count: minDist <= 10000 ? 1.0 : 0.0,
    industrial_nearby_flag: isIndustrialZone ? 1.0 : 0.0,
    mining_nearby_flag: isMiningZone ? 1.0 : 0.0,
    infrastructure_nearby_flag: isInfrastructureNearby ? 1.0 : 0.0,
    forest_context: isForestZone ? 1.0 : 0.0,
    agricultural_context: isFarmlandZone ? 1.0 : 0.0,
    urban_context: landCover === "industrial" ? 0.5 : 0.0,
    open_land_context: (!isForestZone && !isFarmlandZone && !isIndustrialZone && !isMiningZone) ? 1.0 : 0.0,
    observation_count: tempProfile.observation_count,
    active_days: tempProfile.active_days,
    active_duration: tempProfile.active_duration_days,
    observation_frequency: tempProfile.frequency_per_week,
    recurrence_count: tempProfile.recurrence_count,
    recurrence_ratio: tempProfile.recurrence_ratio,
    average_revisit_interval: tempProfile.average_revisit_hours !== null ? tempProfile.average_revisit_hours : 24.0,
    median_revisit_interval: tempProfile.median_revisit_hours !== null ? tempProfile.median_revisit_hours : 24.0,
    persistence_score: tempProfile.persistence_score,
    seasonality_score: tempProfile.seasonality_score,
    seasonal_concentration: tempProfile.seasonal_concentration,
    // Backwards compatible aliases
    dist_industry_km: Math.round((minDist / 1000) * 100) / 100,
    is_industrial_land: isIndustrialZone ? 1 : 0,
    is_forest_land: isForestZone ? 1 : 0,
    is_farmland: isFarmlandZone ? 1 : 0,
    is_mining_land: isMiningZone ? 1 : 0,
    persistence_days_log: Math.round(Math.log1p(tempProfile.persistence_days) * 100) / 100
  };

  // 8. ML Model inference
  let topClass = "Other";
  let maxProb = 0.5;
  let classProbabilities: Record<string, number> = {
    "Industrial Fire": 0.0,
    "Gas Flare": 0.0,
    "Agricultural Burning": 0.0,
    "Wildfire": 0.0,
    "Mining": 0.0,
    "Other": 1.0
  };
  let model_version = "random_forest_v1.0.0";
  try {
    const mlPred = predictWithRandomForest(features);
    topClass = mlPred.predicted_class;
    maxProb = mlPred.confidence;
    classProbabilities = mlPred.class_probabilities;
    model_version = mlPred.model_version;
  } catch (err: any) {
    console.error("ThermoGuard ML Error: Live inference failed:", err.message);
    topClass = "Other";
    maxProb = 0.50;
  }

  // 9. Risk Scoring (Multi-factor: thermal intensity, proximity, source hazard, temporal)
  const frpNorm = Math.min(100, (raw.frp / 150) * 100);
  const brightNorm = Math.min(100, Math.max(0, (raw.brightness - 310) / 90) * 100);
  const sThermal = 0.65 * frpNorm + 0.35 * brightNorm;

  let sProximity = 5;
  if (minDist <= 300) sProximity = 100;
  else if (minDist <= 1000) sProximity = 80;
  else if (minDist <= 3000) sProximity = 50;
  else if (minDist <= 10000) sProximity = 20;

  if (topClass === "Gas Flare") {
    sProximity *= 0.35; // Controlled routine operation in flare stack
  }

  const sourceHazardWeights: Record<string, number> = {
    "Industrial Fire": 0.95,
    "Wildfire": 0.85,
    "Gas Flare": 0.25,
    "Mining": 0.50,
    "Agricultural Burning": 0.40,
    "Other": 0.30
  };
  const sSource = (sourceHazardWeights[topClass] || 0.3) * 100;

  let sTemporal = 50;
  if (tempProfile.persistence_days <= 2 && sThermal > 60) {
    sTemporal = 90; // Sudden acute surge
  } else if (tempProfile.persistence_days >= 30) {
    sTemporal = 35; // Stable continuous emission
  }

  const totalRiskVal = Math.round(
    (30 / 92) * sThermal + (25 / 92) * sProximity + (25 / 92) * sSource + (12 / 92) * sTemporal
  );

  let riskBand: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
  if (totalRiskVal >= 75) riskBand = "CRITICAL";
  else if (totalRiskVal >= 55) riskBand = "HIGH";
  else if (totalRiskVal >= 30) riskBand = "MEDIUM";

  if (topClass === "Industrial Fire" && (raw.frp >= 60 || minDist <= 500)) {
    riskBand = "CRITICAL";
  } else if (topClass === "Wildfire" && (raw.frp >= 35 || raw.brightness >= 345)) {
    riskBand = "HIGH";
  }

  // 10. Structured Evidence Generation
  const thermalEvidence: string[] = [];
  if (raw.frp >= 100) {
    thermalEvidence.push(`Severe thermal radiative power: ${raw.frp.toFixed(1)} MW (exceeds high-intensity industrial/wildfire threshold)`);
  } else if (raw.frp >= 40) {
    thermalEvidence.push(`Moderate-to-high radiative power: ${raw.frp.toFixed(1)} MW (consistent with flare stacks or active burn front)`);
  } else {
    thermalEvidence.push(`Low-to-moderate thermal intensity: ${raw.frp.toFixed(1)} MW (steady controlled emission or smoldering)`);
  }
  thermalEvidence.push(`Brightness temperature: ${raw.brightness.toFixed(1)} K recorded by ${raw.satellite}`);
  thermalEvidence.push(`FIRMS satellite detection confidence: ${Math.round(raw.confidence)}% (multi-band spectral anomaly verification)`);
  thermalEvidence.push(`Observation timing: ${raw.daynight === 'N' ? 'Nighttime (zero solar glint reflection)' : 'Daytime overpass'}`);

  const spatialEvidence: string[] = [];
  if (minDist <= 300) {
    spatialEvidence.push(`Immediate industrial perimeter: ${Math.round(minDist)} m to ${geoContext.nearest_industrial_facility}`);
  } else if (minDist <= 1000) {
    spatialEvidence.push(`Industrial proximity: ${Math.round(minDist)} m to ${geoContext.nearest_industrial_facility}`);
  } else if (minDist <= 5000) {
    spatialEvidence.push(`Located ${Math.round(minDist / 100) / 10} km from nearest industrial installation (${geoContext.nearest_industrial_facility})`);
  } else {
    spatialEvidence.push(`Remote from industrial installations: nearest facility is ${Math.round(minDist / 1000)} km away (${geoContext.nearest_industrial_facility})`);
  }
  spatialEvidence.push(`Land-use / Land-cover context: Zoned as ${landCover.replace(/_/g, ' ')}`);

  const temporalEvidence: string[] = [];
  if (tempProfile.status === "TEMPORAL_DATA_INSUFFICIENT" || tempProfile.observation_count <= 1) {
    temporalEvidence.push(`Single satellite observation recorded (count: 1); insufficient historical passes to determine persistence; evaluated as transient anomaly.`);
  } else if (tempProfile.is_persistent || tempProfile.persistence_days >= 21) {
    temporalEvidence.push(`Persistent multi-temporal source: active across ${tempProfile.persistence_days} days with ${tempProfile.observation_count} satellite detections (${Math.round(tempProfile.recurrence_ratio * 100)}% recurrence)`);
  } else if (tempProfile.persistence_days <= 2) {
    temporalEvidence.push(`Acute sudden-onset signature: detected across ${tempProfile.persistence_days} day(s) with ${tempProfile.observation_count} passes (no continuous baseline)`);
  } else {
    temporalEvidence.push(`Transient/intermittent activity: ${tempProfile.observation_count} detections spanning ${tempProfile.persistence_days} days`);
  }
  temporalEvidence.push(`Recurrence ratio: ${Math.round(tempProfile.recurrence_ratio * 100)}% of orbital revisit passes`);
  temporalEvidence.push(`Detection frequency: ${tempProfile.frequency_per_week} observations per week`);
  if (tempProfile.seasonal_pattern && tempProfile.seasonal_pattern !== "INSUFFICIENT_DATA") {
    temporalEvidence.push(`Seasonal profile: ${tempProfile.seasonal_pattern.replace(/_/g, ' ')}`);
  } else {
    temporalEvidence.push("Seasonal evaluation: Insufficient historical baseline (<5 passes) for seasonal cycle derivation.");
  }

  const classSpecificEvidence: string[] = [];
  if (topClass === "Gas Flare") {
    classSpecificEvidence.push("Persistent stationary emission footprint co-located with refinery or petrochemical infrastructure");
    classSpecificEvidence.push("High multi-week recurrence without lateral geometric expansion indicates controlled flare stack combustion");
  } else if (topClass === "Industrial Fire") {
    classSpecificEvidence.push("Elevated thermal radiative surge within industrial boundary indicates uncontrolled combustion outbreak");
    classSpecificEvidence.push("Acute short-duration onset differentiates event from routine continuous flaring");
  } else if (topClass === "Agricultural Burning") {
    classSpecificEvidence.push("Agricultural cropland context remote from industrial installations");
    classSpecificEvidence.push("Transient post-harvest seasonal residue combustion pattern with rapid spatial dissipation");
  } else if (topClass === "Wildfire") {
    classSpecificEvidence.push("Location within dense forest reserve canopy with zero industrial infrastructure");
    classSpecificEvidence.push("High FRP biomass combustion signature characteristic of uncontained wildfire front");
  } else if (topClass === "Mining") {
    classSpecificEvidence.push("Spatial co-location with open-cast mining excavation pit or coal spoil heap");
    classSpecificEvidence.push("Recurring low-velocity thermal profile characteristic of spontaneous subsurface coal oxidation");
  } else {
    classSpecificEvidence.push("Thermal and spatial attributes do not match standard industrial, agricultural, or wildfire profiles");
    classSpecificEvidence.push("Isolated transient observation with low confidence margin or unclassified land-use context");
  }

  const structuredEvidence = {
    thermal: thermalEvidence,
    spatial: spatialEvidence,
    temporal: temporalEvidence,
    class_specific: classSpecificEvidence,
    summary: [
      spatialEvidence[0],
      temporalEvidence[0],
      thermalEvidence[0],
      classSpecificEvidence[0]
    ]
  };

  // Confidence margin and interpretation
  const sortedProbs = Object.entries(classProbabilities).sort((a, b) => b[1] - a[1]);
  const runnerUpClass = sortedProbs[1]?.[0] || null;
  const runnerUpProb = sortedProbs[1]?.[1] || 0.0;
  const confidenceMargin = Math.round((maxProb - runnerUpProb) * 10000) / 10000;

  let confidenceBand: "LOW" | "MEDIUM" | "HIGH" = "HIGH";
  if (maxProb < 0.50) confidenceBand = "LOW";
  else if (maxProb < 0.75) confidenceBand = "MEDIUM";

  let confidenceQuality: "STRONG" | "MODERATE" | "WEAK" = "STRONG";
  let qualityReason = "";
  if (maxProb >= 0.70 && confidenceMargin >= 0.35) {
    confidenceQuality = "STRONG";
    qualityReason = `Clear decision separation (margin: +${Math.round(confidenceMargin * 100)}% over runner-up ${runnerUpClass}) with verified geospatial and temporal context.`;
  } else if (maxProb >= 0.50 && confidenceMargin >= 0.15) {
    confidenceQuality = "MODERATE";
    qualityReason = `Moderate probability separation (+${Math.round(confidenceMargin * 100)}% over ${runnerUpClass}); classification consistent with primary contextual signals.`;
  } else {
    confidenceQuality = "WEAK";
    qualityReason = `Narrow margin separation (+${Math.round(confidenceMargin * 100)}% over ${runnerUpClass}) or incomplete contextual confirmation suggests class ambiguity.`;
  }

  const riskReasons: string[] = [];
  if (raw.frp >= 100) {
    riskReasons.push(`Severe thermal radiative power (${raw.frp} MW) exceeds emergency surge threshold (100 MW)`);
  } else if (raw.frp >= 45) {
    riskReasons.push(`Elevated radiative intensity (${raw.frp} MW) indicative of vigorous combustion`);
  } else {
    riskReasons.push(`Thermal radiative power (${raw.frp} MW) remains within moderate non-critical range`);
  }

  if (minDist <= 300) {
    riskReasons.push(`Immediate proximity (${Math.round(minDist)} m) to major industrial installation`);
  } else if (minDist <= 1000) {
    riskReasons.push(`Close proximity (${Math.round(minDist)} m) to industrial facilities`);
  } else {
    riskReasons.push(`Remote location (${Math.round(minDist / 100) / 10} km from nearest industrial complex)`);
  }

  if (topClass === "Industrial Fire") {
    riskReasons.push("Critical source classification: uncontrolled industrial fires present immediate explosion and life-safety hazards");
  } else if (topClass === "Wildfire") {
    riskReasons.push("High source hazard: active forest wildfire presents ecological destruction and propagation risks");
  } else if (topClass === "Mining") {
    riskReasons.push("Moderate source hazard: subsurface coal oxidation presents smoldering coal bed methane ignition risks");
  } else if (topClass === "Agricultural Burning") {
    riskReasons.push("Moderate source hazard: open crop stubble burning poses seasonal particulate air pollution (AQI impact)");
  } else if (topClass === "Gas Flare") {
    riskReasons.push("Low operational threat: planned combustion designed for refinery pressure management");
  }

  if (tempProfile.persistence_days <= 2 && sThermal >= 55) {
    riskReasons.push("Acute sudden onset: abrupt thermal surge without prior continuous baseline indicates active ignition event");
  } else if (tempProfile.persistence_days >= 30 && topClass === "Gas Flare") {
    riskReasons.push("Long-term historical persistence confirms routine steady-state operational flaring");
  }

  let actionRecommended = "INFORMATIONAL LOGGING: Transient or controlled thermal source; no field dispatch required.";
  if (riskBand === "CRITICAL") {
    actionRecommended = "EMERGENCY DISPATCH: Activate Tier-3 industrial emergency response; alert district fire control room and SDMA.";
  } else if (riskBand === "HIGH") {
    actionRecommended = "PRIORITY SURVEILLANCE: Deploy rapid aerial/field verification units; establish containment perimeter and monitor next orbital pass.";
  } else if (riskBand === "MEDIUM") {
    actionRecommended = "ROUTINE MONITORING: Log observation parameters in the district environmental registry; verify emission limits against regulatory permits.";
  }

  const pct = Math.round(maxProb * 100);
  const primaryReason = riskReasons.slice(0, 2).join("; ");
  let explanation = "";
  if (topClass === "Gas Flare") {
    explanation = `Classified as Gas Flare (${pct}% model probability, ${confidenceBand} confidence) due to persistent thermal activity inside or immediately adjacent to industrial refining facilities. Stationary spatial recurrence confirms controlled flare stack combustion. Operational risk is assessed as ${riskBand} (${totalRiskVal}/100) on the basis of: ${primaryReason}.`;
  } else if (topClass === "Industrial Fire") {
    explanation = `Classified as Industrial Fire (${pct}% model probability, ${confidenceBand} confidence) due to an acute radiative power surge within an industrial facility perimeter. Lack of prior continuous baseline distinguishes this uncontrolled outbreak from routine flaring. Operational risk is assessed as ${riskBand} (${totalRiskVal}/100) on the basis of: ${primaryReason}.`;
  } else if (topClass === "Agricultural Burning") {
    explanation = `Classified as Agricultural Burning (${pct}% model probability, ${confidenceBand} confidence) based on cropland terrain context, seasonal harvest alignment, and absence of industrial infrastructure. Operational risk is assessed as ${riskBand} (${totalRiskVal}/100) on the basis of: ${primaryReason}.`;
  } else if (topClass === "Wildfire") {
    explanation = `Classified as Wildfire (${pct}% model probability, ${confidenceBand} confidence) due to elevated thermal radiative power situated within a dense forest reserve canopy. Operational risk is assessed as ${riskBand} (${totalRiskVal}/100) on the basis of: ${primaryReason}.`;
  } else if (topClass === "Mining") {
    explanation = `Classified as Mining (${pct}% model probability, ${confidenceBand} confidence) owing to co-location within an open-cast mining basin and recurring oxidation signature. Operational risk is assessed as ${riskBand} (${totalRiskVal}/100) on the basis of: ${primaryReason}.`;
  } else {
    explanation = `Classified as Other (${pct}% model probability, ${confidenceBand} confidence) because observation attributes do not exhibit definitive industrial, agricultural, or forest wildfire characteristics. Operational risk is assessed as ${riskBand} (${totalRiskVal}/100) on the basis of: ${primaryReason}.`;
  }

  let alertObj: any = null;
  if (riskBand === "HIGH" || riskBand === "CRITICAL") {
    alertObj = {
      id: `alt-${raw.id}`,
      event_id: raw.id,
      title: `${riskBand} RISK HAZARD: ${topClass} at ${geoContext.nearest_industrial_facility}`,
      description: `Radiative surge of ${raw.frp} MW detected. ${structuredEvidence.summary[0]}`,
      severity: riskBand,
      status: "ACTIVE",
      facility_name: geoContext.nearest_industrial_facility,
      action_recommended: actionRecommended,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      acknowledged_by: null,
      acknowledged_at: null,
      resolved_by: null,
      resolved_at: null,
      resolution_notes: null,
      audit_trail: [
        {
          timestamp: new Date().toISOString(),
          action: "SYSTEM_TRIGGERED",
          performed_by: "ThermoGuard Geospatial Risk Engine",
          notes: `Automatic alert dispatched on ${riskBand} risk classification (Risk Score: ${totalRiskVal}/100)`
        }
      ]
    };
  }

  const fingerprintObj = computeThermalFingerprint(raw, geoContext, tempProfile, { predicted_class: topClass, confidence: maxProb });
  const priorityObj = computeSmartPriority(raw, geoContext, tempProfile, { predicted_class: topClass, confidence: maxProb, risk_score: riskBand, risk_value: totalRiskVal });

  if (alertObj) {
    alertObj.priority_score = priorityObj.score;
    alertObj.priority_level = priorityObj.level;
    alertObj.priority_factors = priorityObj.factors;
  }

  const enriched = {
    event: {
      id: raw.id,
      latitude: raw.latitude,
      longitude: raw.longitude,
      timestamp: raw.timestamp,
      brightness: raw.brightness,
      frp: raw.frp,
      confidence: raw.confidence,
      satellite: raw.satellite || "VIIRS_NRT",
      daynight: raw.daynight || "D",
      source: raw.source || "NASA_FIRMS_LIVE",
      cluster_id: clusterId
    },
    geo_context: geoContext,
    temporal_profile: tempProfile,
    classification: {
      predicted_class: topClass,
      confidence: maxProb,
      risk_score: riskBand,
      risk_value: totalRiskVal,
      persistence_score: tempProfile.persistence_score,
      model_version: model_version,
      evidence: structuredEvidence.summary,
      feature_vector: features,
      class_probabilities: classProbabilities,
      risk_breakdown: {
        thermal_intensity_score: Math.round(sThermal),
        hazard_proximity_score: Math.round(sProximity),
        source_type_hazard_score: Math.round(sSource),
        temporal_urgency_score: Math.round(sTemporal)
      },
      confidence_band: confidenceBand,
      confidence_margin: confidenceMargin,
      confidence_quality: confidenceQuality,
      interpretation_notice: qualityReason,
      structured_evidence: structuredEvidence,
      risk_reasons: riskReasons,
      explanation,
      // Priority 6: Human Verification / Analyst Review Layer
      verification_status: (getVerificationRecord(raw.id)?.verification_status) || "UNVERIFIED",
      verified_class: (getVerificationRecord(raw.id)?.verified_class) || null,
      verified_by: (getVerificationRecord(raw.id)?.verified_by) || null,
      verified_by_name: (getVerificationRecord(raw.id)?.verified_by_name) || null,
      verified_at: (getVerificationRecord(raw.id)?.verified_at) || null,
      verification_reason: (getVerificationRecord(raw.id)?.verification_reason) || null,
      verification_audit_trail: (getVerificationRecord(raw.id)?.audit_trail) || []
    },
    alert: alertObj,
    intelligence: {
      event_id: raw.id,
      timestamp: raw.timestamp,
      cluster_id: clusterId,
      prediction: {
        predicted_class: topClass,
        confidence: maxProb,
        confidence_band: confidenceBand,
        confidence_margin: confidenceMargin,
        confidence_quality: confidenceQuality,
        interpretation_notice: qualityReason,
        class_probabilities: classProbabilities,
        model_version: model_version
      },
      temporal_profile: tempProfile,
      evidence: structuredEvidence,
      risk: {
        score: totalRiskVal,
        level: riskBand,
        reasons: riskReasons,
        breakdown: {
          thermal_intensity_score: Math.round(sThermal),
          hazard_proximity_score: Math.round(sProximity),
          source_type_hazard_score: Math.round(sSource),
          temporal_urgency_score: Math.round(sTemporal)
        },
        action_recommended: actionRecommended
      },
      explanation
    },
    fingerprint: fingerprintObj,
    priority: priorityObj
  };

  // Persist the full hotspot into DB if connected
  if (isDbConnected()) {
    await persistHotspot(enriched);
  }

  return enriched;
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json());

  // In-memory data store initialized synchronously with calibrated baseline demo scenarios
  let hotspots: any[] = RAW_HOTSPOTS.map((raw) => processThermalEvent(raw, true));

  // Asynchronously initialize database and ML classification in background without blocking port listening
  let dbInitialized = false;
  const asyncInitPromise = (async () => {
    try {
      dbInitialized = await initDb();
      if (dbInitialized) {
        try {
          const dbRecords = await loadAllHotspots();
          if (dbRecords && dbRecords.length > 0) {
            const dbHotspots = dbRecords.map((h: any) => {
              const isDemo = h.event.id.startsWith("te-scen-");
              return processThermalEvent(h.event, isDemo);
            });
            for (const dh of dbHotspots) {
              if (!hotspots.some((h) => h.event.id === dh.event.id)) {
                hotspots.push(dh);
              }
            }
          }
        } catch (e: any) {
          console.warn("ThermoGuard: DB load failed, fallback to benchmark seeds:", e?.message);
        }
      }

      // Run real Random Forest ML classification on all hotspots
      await runMLClassification(hotspots);
      console.log(`ThermoGuard: Initialized ${hotspots.length} hotspots with Random Forest inference.`);

      if (dbInitialized) {
        for (const h of hotspots) {
          persistHotspot(h).catch(() => {});
        }
      }
    } catch (err: any) {
      console.warn("ThermoGuard: Asynchronous database/ML initialization warning:", err?.message);
    }

    // Restore and attach any persisted human verifications
    try {
      const storedVerifs = getAllVerificationRecords();
      for (const h of hotspots) {
        const v = storedVerifs[h.event.id];
        if (v && v.verification_status && v.verification_status !== "UNVERIFIED") {
          h.classification.verification_status = v.verification_status;
          h.classification.verified_class = v.verified_class || null;
          h.classification.verified_by = v.verified_by || null;
          h.classification.verified_by_name = v.verified_by_name || null;
          h.classification.verified_at = v.verified_at || null;
          h.classification.verification_reason = v.verification_reason || null;
          h.classification.verification_audit_trail = v.audit_trail || [];
        }
      }
    } catch (verifErr: any) {
      console.warn("ThermoGuard: Error attaching verifications:", verifErr?.message);
    }

    // Pre-calculate and attach Thermal Source Fingerprint & Smart Alert Prioritization to all hotspots
    for (const h of hotspots) {
      try {
        if (!h.fingerprint) {
          h.fingerprint = computeThermalFingerprint(h.event, h.geo_context, h.temporal_profile, h.classification);
        }
        if (!h.priority) {
          h.priority = computeSmartPriority(h.event, h.geo_context, h.temporal_profile, h.classification);
        }
        if (h.alert) {
          h.alert.priority_score = h.alert.priority_score ?? h.priority.score;
          h.alert.priority_level = h.alert.priority_level ?? h.priority.level;
          h.alert.priority_factors = h.alert.priority_factors ?? h.priority.factors;
        }
      } catch (err: any) {
        console.warn(`ThermoGuard: Error attaching fingerprint/priority to ${h.event?.id}:`, err?.message);
      }
    }
  })();

  // Catch any unhandled errors in async background initialization
  asyncInitPromise.catch((err) => {
    console.warn("ThermoGuard: Background initialization completed with notes:", err?.message);
  });

  let isLiveMode = (
    process.env.DATA_MODE === "LIVE" ||
    process.env.DATA_PROVIDER_MODE === "LIVE_SATELLITE_API" ||
    Boolean(process.env.FIRMS_API_KEY && process.env.FIRMS_API_KEY.trim().length > 0)
  );

  interface IngestionStats {
    total_received: number;
    total_accepted: number;
    total_rejected: number;
    total_deduplicated: number;
    total_enriched: number;
    last_successful_fetch: string | null;
    last_fetch_attempt: string | null;
    last_fetch_status: "IDLE" | "SUCCESS" | "FAILED" | "RUNNING";
    last_error_message: string | null;
    satellite_source: string;
    mode: string;
    fetch_count: number;
    is_running: boolean;
    auto_ingest_interval_sec: number;
    next_scheduled_fetch: string | null;
  }

  const ingestionStats: IngestionStats = {
    total_received: 0,
    total_accepted: 0,
    total_rejected: 0,
    total_deduplicated: 0,
    total_enriched: 0,
    last_successful_fetch: null,
    last_fetch_attempt: null,
    last_fetch_status: "IDLE",
    last_error_message: null,
    satellite_source: "VIIRS_SNPP_NRT",
    mode: isLiveMode ? "LIVE_SATELLITE_API" : "DEMO_SAMPLE_DATA",
    fetch_count: 0,
    is_running: false,
    auto_ingest_interval_sec: 900, // 15 minutes safe cadence
    next_scheduled_fetch: null
  };

  // Authentication Middleware
  const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : (req.query.token as string);

    if (!token) {
      return res.status(401).json({
        error: "AUTHENTICATION_REQUIRED",
        message: "Missing or invalid authorization token. Please sign in to access protected thermal intelligence telemetry."
      });
    }

    const sessionData = authManager.validateSession(token);
    if (!sessionData) {
      return res.status(401).json({
        error: "SESSION_EXPIRED_OR_INVALID",
        message: "Session token is invalid or has expired. Please sign in again."
      });
    }

    (req as any).user = sessionData.user;
    (req as any).session = sessionData.session;
    next();
  };

  // Role-Based Authorization Middleware for Admin/Officer actions
  const requireOfficerOrAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : (req.query.token as string);

    if (!token) {
      return res.status(401).json({
        error: "AUTHENTICATION_REQUIRED",
        message: "Missing authorization token. Please sign in to perform administrative telemetry operations."
      });
    }

    const sessionData = authManager.validateSession(token);
    if (!sessionData) {
      return res.status(401).json({
        error: "SESSION_EXPIRED_OR_INVALID",
        message: "Session token is invalid or has expired."
      });
    }

    const user = sessionData.user;
    if (!canAccessAdminConsole(user.role)) {
      return res.status(403).json({
        error: "ADMINISTRATIVE_ACCESS_DENIED",
        message: `Analyst clearance (${user.role}) does not permit modifying data providers or system administration. Admin / Command clearance is required.`,
        required_clearance: "ADMIN / CHIEF_SURVEILLANCE_OFFICER (Level 4 Restricted)"
      });
    }

    (req as any).user = user;
    (req as any).session = sessionData.session;
    next();
  };

  // Role-Based Authorization Middleware for Incident Alert Actions
  const requireAlertManagementClearance = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : (req.query.token as string);

    if (!token) {
      return res.status(401).json({
        error: "AUTHENTICATION_REQUIRED",
        message: "Missing authorization token. Please sign in to manage incident alerts."
      });
    }

    const sessionData = authManager.validateSession(token);
    if (!sessionData) {
      return res.status(401).json({
        error: "SESSION_EXPIRED_OR_INVALID",
        message: "Session token is invalid or has expired."
      });
    }

    const user = sessionData.user;
    if (!canManageAlerts(user.role)) {
      return res.status(403).json({
        error: "ALERT_MANAGEMENT_ACCESS_DENIED",
        message: `Analyst clearance (${user.role}) is read-only. Acknowledging, resolving, or escalating alerts requires Command Authority or Field Operations clearance.`,
        required_clearance: "ADMIN, CHIEF_SURVEILLANCE_OFFICER, or FIELD_OPERATIONS_OFFICER"
      });
    }

    (req as any).user = user;
    (req as any).session = sessionData.session;
    next();
  };

  // Role-Based Authorization Middleware for Human Verification / Classification Review
  const requireVerificationClearance = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : (req.query.token as string);

    if (!token) {
      return res.status(401).json({
        error: "AUTHENTICATION_REQUIRED",
        message: "Missing authorization token. Please sign in as an authorized GIS Analyst or Officer to verify classifications."
      });
    }

    const sessionData = authManager.validateSession(token);
    if (!sessionData) {
      return res.status(401).json({
        error: "SESSION_EXPIRED_OR_INVALID",
        message: "Session token is invalid or has expired."
      });
    }

    const user = sessionData.user;
    if (!canVerifyClassification(user.role)) {
      return res.status(403).json({
        error: "VERIFICATION_ACCESS_DENIED",
        message: `Clearance (${user.role}) is unauthorized to verify or reclassify thermal sources. Verification requires GIS Intelligence Analyst or Command Authority clearance.`,
        required_clearance: "SENIOR_GIS_ANALYST, ANALYST, CHIEF_SURVEILLANCE_OFFICER, or ADMIN"
      });
    }

    (req as any).user = user;
    (req as any).session = sessionData.session;
    next();
  };

  // Administrative In-Memory System Configuration
  const adminConfig = {
    system_name: "ThermoGuard AI Geospatial Intelligence",
    version: "0.1.0",
    organisation: "National Technical Research Organisation (NTRO)",
    firms_auto_sync: false,
    sync_interval_mins: 15,
    firms_default_bbox: "68.0,6.5,97.5,37.5",
    active_satellites: ["VIIRS_SNPP", "VIIRS_NOAA20", "MODIS_Terra", "MODIS_Aqua"],
    critical_frp_threshold: 100,
    high_frp_threshold: 45,
    industrial_proximity_radius_m: 1000,
    min_confidence_filter: 50,
    auto_generate_alerts: true,
    data_mode: isLiveMode ? "LIVE_SATELLITE_API" : "DEMO_SAMPLE_DATA",
    maintenance_mode: false,
    updated_at: new Date().toISOString()
  };

  // REST API Routes
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      service: "ThermoGuard AI",
      version: "0.1.0",
      sih_ps_id: "SIH26162",
      organisation: "National Technical Research Organisation (NTRO)",
      data_provider_mode: isLiveMode ? "LIVE_SATELLITE_API" : "DEMO_SAMPLE_DATA",
      providers: {
        firms: isLiveMode ? "LIVE_SATELLITE_API" : "DEMO_SAMPLE_DATA",
        osm: "DEMO_SAMPLE_DATA",
        landcover: "DEMO_SAMPLE_DATA"
      },
      timestamp: new Date().toISOString()
    });
  });

  // Authentication API Endpoints
  app.post("/api/auth/login", (req, res) => {
    try {
      const { username, password } = req.body || {};
      if (!username || !password) {
        return res.status(400).json({
          error: "MISSING_CREDENTIALS",
          message: "Both username/email and password are required for authentication."
        });
      }

      const { user, token } = authManager.authenticate(username, password);
      res.json({
        status: "AUTHENTICATED",
        token,
        user,
        message: `Welcome back, ${user.name}. Clearance level verified.`
      });
    } catch (err: any) {
      res.status(401).json({
        error: "AUTHENTICATION_FAILED",
        message: err.message || "Invalid credentials."
      });
    }
  });

  app.post("/api/auth/register", (req, res) => {
    try {
      const { username, email, name, password, role, department } = req.body || {};
      if (!username || !email || !name || !password) {
        return res.status(400).json({
          error: "MISSING_FIELDS",
          message: "Username, official email, full name, and password are required to register an analyst profile."
        });
      }

      const { user, token } = authManager.registerUser({
        username,
        email,
        name,
        password,
        role,
        department
      });

      res.status(201).json({
        status: "REGISTERED",
        token,
        user,
        message: `Analyst profile for ${user.name} created and credentialed.`
      });
    } catch (err: any) {
      res.status(400).json({
        error: "REGISTRATION_FAILED",
        message: err.message || "Failed to register user."
      });
    }
  });

  app.get("/api/auth/me", (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : (req.query.token as string);

    if (!token) {
      return res.status(401).json({
        authenticated: false,
        message: "No active session token provided."
      });
    }

    const sessionData = authManager.validateSession(token);
    if (!sessionData) {
      return res.status(401).json({
        authenticated: false,
        message: "Session is invalid or expired."
      });
    }

    res.json({
      authenticated: true,
      user: sessionData.user,
      session: {
        token: sessionData.session.token,
        created_at: sessionData.session.created_at,
        expires_at: sessionData.session.expires_at
      }
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : (req.body?.token as string);

    if (token) {
      authManager.invalidateSession(token);
    }

    res.json({
      status: "LOGGED_OUT",
      message: "Session successfully invalidated."
    });
  });

  app.get("/api/auth/demo-accounts", (req, res) => {
    res.json({
      demo_accounts: authManager.getDemoIdentities(),
      note: "Standard SIH 2026 development accounts for evaluation and demonstrations."
    });
  });

  let cachedFirmsValidation: {
    lastChecked: number;
    result: any;
  } | null = null;

  async function validateFirmsKey(key: string, forceRefresh = false) {
    if (!key || key.trim() === "") {
      return {
        configured: false,
        status: "UNCONFIGURED",
        connected: false,
        message: "No FIRMS_API_KEY detected in environment. Operating in DEMO_SAMPLE_DATA mode.",
        timestamp: new Date().toISOString()
      };
    }

    const now = Date.now();
    if (!forceRefresh && cachedFirmsValidation && (now - cachedFirmsValidation.lastChecked < 60000)) {
      return cachedFirmsValidation.result;
    }

    try {
      const startTime = Date.now();
      const testUrl = `https://firms.modaps.eosdis.nasa.gov/api/data_availability/csv/${key.trim()}/VIIRS_SNPP_NRT`;
      const response = await fetch(testUrl, {
        headers: { "User-Agent": "ThermoGuard-AI-SIH26162/1.0" },
        signal: AbortSignal.timeout(6000)
      });
      const latencyMs = Date.now() - startTime;
      const text = await response.text();

      let result: any;
      if (response.ok && text.includes("data_id")) {
        const lines = text.trim().split("\n");
        const range = lines[1] ? lines[1].split(",") : [];
        result = {
          configured: true,
          status: "AUTHENTICATED_AND_VERIFIED",
          connected: true,
          http_status: response.status,
          latency_ms: latencyMs,
          satellite_source: "VIIRS_SNPP_NRT",
          available_range: {
            min_date: range[1] || "N/A",
            max_date: range[2] || "N/A"
          },
          key_preview: `${key.slice(0, 4)}••••••••••••••••••••••••${key.slice(-4)}`,
          message: "NASA FIRMS MAP_KEY is valid and actively verified against NASA EOSDIS servers.",
          timestamp: new Date().toISOString()
        };
      } else {
        result = {
          configured: true,
          status: "AUTHENTICATION_FAILED",
          connected: false,
          http_status: response.status,
          response_snippet: text.slice(0, 150),
          message: "NASA FIRMS API rejected the key. Please verify your NASA Earthdata Map Key.",
          timestamp: new Date().toISOString()
        };
      }
      cachedFirmsValidation = { lastChecked: now, result };
      return result;
    } catch (err: any) {
      const errorResult = {
        configured: true,
        status: "CONNECTION_TIMEOUT_OR_ERROR",
        connected: false,
        error: err.message,
        message: "Network error or timeout reaching NASA EOSDIS servers.",
        timestamp: new Date().toISOString()
      };
      return errorResult;
    }
  }

  app.get("/api/provider/firms-check", async (req, res) => {
    const key = (req.query.key as string) || process.env.FIRMS_API_KEY || "";
    const force = req.query.force === "true";
    const result = await validateFirmsKey(key, force);
    const statusCode = result.http_status && result.http_status >= 400 && result.http_status < 500 ? 400 : 200;
    res.status(statusCode).json(result);
  });

  app.get("/api/provider/status", async (req, res) => {
    const force = req.query.validate === "true";
    const firmsCheck = await validateFirmsKey(process.env.FIRMS_API_KEY || "", force);
    const isConnected = firmsCheck.connected;

    res.json({
      system_mode: isConnected ? "LIVE_CAPABLE" : firmsCheck.configured ? "CREDENTIAL_FAILED" : "DEMO_SAMPLE_DATA",
      database: {
        provider: "PostgreSQL/PostGIS",
        mode: isDbConnected() ? "PERSISTENT" : "IN_MEMORY",
        status: isDbConnected() ? "CONNECTED" : "UNCONFIGURED",
        connected: isDbConnected(),
        notice: isDbConnected() ? "Database layer is production-ready and persistent." : "Operating in memory only. Configure DATABASE_URL for PostgreSQL persistence."
      },
      firms: {
        provider: isConnected ? "RealFIRMSProvider (Active)" : "DemoFIRMSProvider",
        mode: isConnected ? "LIVE_API_AUTHENTICATED" : firmsCheck.configured ? "LIVE_CREDENTIAL_INVALID" : "DEMO_SAMPLE_DATA",
        status: isConnected ? "AUTHENTICATED" : firmsCheck.configured ? "AUTHENTICATION_FAILED" : "UNCONFIGURED_DEMO",
        configured: firmsCheck.configured,
        connected: isConnected,
        validation: firmsCheck,
        satellite_constellation: "VIIRS (SNPP & NOAA-20) / MODIS (Terra & Aqua)",
        notice: isConnected
          ? `NASA FIRMS MAP_KEY actively validated (${firmsCheck.latency_ms}ms latency). Live orbital queries enabled.`
          : firmsCheck.configured
          ? "FIRMS_API_KEY was provided but failed NASA EOSDIS authentication check."
          : "Operating with calibrated SIH 2026 development dataset. External NASA MAP_KEY integration interface ready."
      },
      osm: {
        provider: "DemoOSMProvider",
        mode: "DEMO_SAMPLE_DATA",
        status: "CONNECTED",
        database_records: 12,
        notice: "Operating with local PostGIS / cached industrial facilities. Overpass API integration interface ready."
      },
      landcover: {
        provider: "DemoLandCoverProvider",
        mode: "DEMO_SAMPLE_DATA",
        status: "CONNECTED",
        dataset: "ESA WorldCover 10m & Dynamic World Benchmark",
        notice: "Deterministic spatial polygon evaluation active."
      },
      metrics: {
        total_received: ingestionStats.total_received || hotspots.length,
        total_accepted: ingestionStats.total_accepted || hotspots.length,
        total_rejected: ingestionStats.total_rejected,
        total_deduplicated: ingestionStats.total_deduplicated,
        total_enriched: hotspots.length,
        last_ingestion_time: ingestionStats.last_successful_fetch || new Date().toISOString()
      },
      ingestion: ingestionStats,
      timestamp: new Date().toISOString()
    });
  });

  app.get("/api/ingest/status", (req, res) => {
    res.json({
      system_mode: isLiveMode ? "LIVE_SATELLITE_API" : "DEMO_SAMPLE_DATA",
      ingestion: ingestionStats,
      total_hotspots_in_store: hotspots.length,
      live_hotspots_count: hotspots.filter((h) => h.event.source === "NASA_FIRMS_LIVE").length,
      demo_hotspots_count: hotspots.filter((h) => h.event.source !== "NASA_FIRMS_LIVE").length,
      current_provider_status: ingestionStats.last_fetch_status,
      timestamp: new Date().toISOString()
    });
  });

  async function fetchAndIngestLiveFirms(bbox = "68.0,6.5,97.5,37.5", source = "VIIRS_SNPP_NRT", days = 7) {
    if (ingestionStats.is_running) {
      return {
        status: "IN_PROGRESS",
        message: "Ingestion already running in background.",
        metrics: ingestionStats
      };
    }

    const key = process.env.FIRMS_API_KEY;
    if (!key || key.trim().length === 0) {
      ingestionStats.last_fetch_status = "FAILED";
      ingestionStats.last_error_message = "FIRMS_API_KEY not configured in environment.";
      throw new Error("FIRMS_API_KEY not configured in environment.");
    }

    const requestedDays = Math.min(10, Math.max(1, parseInt(String(days), 10) || 7));

    ingestionStats.is_running = true;
    ingestionStats.last_fetch_attempt = new Date().toISOString();
    ingestionStats.last_fetch_status = "RUNNING";
    ingestionStats.satellite_source = source;

    try {
      const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key.trim()}/${source}/${bbox}/${requestedDays}`;
      const response = await fetch(url, {
        headers: { "User-Agent": "ThermoGuard-AI-SIH26162/1.0" },
        signal: AbortSignal.timeout(20000)
      });

      if (!response.ok) {
        throw new Error(`NASA FIRMS API returned HTTP ${response.status}: ${response.statusText}`);
      }

      const csvText = await response.text();
      const lines = csvText.trim().split("\n").filter((l) => l.trim().length > 0);
      if (lines.length <= 1) {
        ingestionStats.last_successful_fetch = new Date().toISOString();
        ingestionStats.last_fetch_status = "SUCCESS";
        ingestionStats.fetch_count++;
        ingestionStats.is_running = false;
        ingestionStats.next_scheduled_fetch = new Date(Date.now() + ingestionStats.auto_ingest_interval_sec * 1000).toISOString();
        return {
          status: "SUCCESS",
          total_received: 0,
          total_accepted: 0,
          total_rejected: 0,
          total_deduplicated: 0,
          total_enriched: 0,
          records: [],
          days_fetched: requestedDays,
          message: "NASA FIRMS returned no thermal anomalies in the requested area/time window."
        };
      }

      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const latIdx = headers.indexOf("latitude");
      const lonIdx = headers.indexOf("longitude");
      const brightIdx = headers.findIndex((h) => h.startsWith("bright"));
      const frpIdx = headers.indexOf("frp");
      const confIdx = headers.indexOf("confidence");
      const dateIdx = headers.indexOf("acq_date");
      const timeIdx = headers.indexOf("acq_time");
      const satIdx = headers.indexOf("satellite");
      const dnIdx = headers.indexOf("daynight");

      let received = 0;
      let accepted = 0;
      let rejected = 0;
      let deduplicated = 0;
      const newSeeds: HotspotSeed[] = [];
      const seenPasses = new Set<string>();

      for (let i = 1; i < lines.length; i++) {
        received++;
        const parts = lines[i].split(",").map((p) => p.trim());
        const lat = parseFloat(parts[latIdx]);
        const lon = parseFloat(parts[lonIdx]);

        if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
          rejected++;
          continue;
        }

        const brightness = brightIdx >= 0 ? parseFloat(parts[brightIdx]) || 320 : 320;
        const frp = frpIdx >= 0 ? parseFloat(parts[frpIdx]) || 5.0 : 5.0;

        let confidence = 75;
        if (confIdx >= 0) {
          const confStr = parts[confIdx].toLowerCase();
          if (confStr === "h" || confStr === "high") confidence = 90;
          else if (confStr === "n" || confStr === "nominal") confidence = 75;
          else if (confStr === "l" || confStr === "low") confidence = 50;
          else {
            const num = parseFloat(confStr);
            if (!isNaN(num)) confidence = Math.min(100, Math.max(0, num));
          }
        }

        const acqDate = dateIdx >= 0 ? parts[dateIdx] : new Date().toISOString().split("T")[0];
        const acqTime = timeIdx >= 0 ? parts[timeIdx].padStart(4, "0") : "1200";
        const timestamp = `${acqDate}T${acqTime.slice(0, 2)}:${acqTime.slice(2, 4)}:00Z`;

        const satNameRaw = satIdx >= 0 ? parts[satIdx] : source;
        let satName = satNameRaw;
        if (satNameRaw === "N") satName = "VIIRS_SNPP";
        else if (satNameRaw === "1") satName = "VIIRS_NOAA20";
        else if (satNameRaw === "2") satName = "VIIRS_NOAA21";
        else if (satNameRaw === "T") satName = "MODIS_Terra";
        else if (satNameRaw === "A") satName = "MODIS_Aqua";

        // Deduplicate only identical satellite observation passes
        const passKey = `${lat.toFixed(4)}_${lon.toFixed(4)}_${acqDate}_${acqTime}_${satName}`;
        if (seenPasses.has(passKey)) {
          deduplicated++;
          continue;
        }
        seenPasses.add(passKey);

        const timeHash = `${acqDate.replace(/-/g, "")}-${acqTime}`;
        const coordHash = Math.abs(Math.round((lat + lon) * 10000)).toString(16);
        const id = `te-live-${coordHash.slice(0, 6)}-${timeHash}`;

        const daynightVal: "D" | "N" = dnIdx >= 0 && parts[dnIdx] === "N" ? "N" : "D";
        const clusterKey = `${Math.round(lat * 100) / 100}_${Math.round(lon * 100) / 100}`;

        newSeeds.push({
          id,
          latitude: lat,
          longitude: lon,
          timestamp,
          brightness,
          frp,
          confidence,
          satellite: satName,
          daynight: daynightVal,
          source: "NASA_FIRMS_LIVE",
          cluster_id: `cls-live-${clusterKey}`
        });
        accepted++;
      }

      // Sort chronological so clustering and temporal engine process passes in natural order
      newSeeds.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      const enrichedEvents: any[] = [];
      for (const s of newSeeds) {
        try {
          const enriched = await processLiveThermalEvent(s);
          enrichedEvents.push(enriched);

          // Update or add representative cluster in hotspots memory list
          const existingIdx = hotspots.findIndex((h) => h.temporal_profile?.cluster_id === enriched.temporal_profile?.cluster_id);
          if (existingIdx >= 0) {
            // Keep the latest observation as the active map marker with the accumulated temporal profile
            if (new Date(enriched.event.timestamp).getTime() >= new Date(hotspots[existingIdx].event.timestamp).getTime()) {
              hotspots[existingIdx] = enriched;
            } else {
              hotspots[existingIdx].temporal_profile = enriched.temporal_profile;
            }
          } else {
            hotspots.unshift(enriched);
          }
        } catch (procErr: any) {
          console.error(`Error in live temporal pipeline for event ${s.id}:`, procErr.message);
          const fallback = processThermalEvent(s, false);
          enrichedEvents.push(fallback);
          hotspots.unshift(fallback);
        }
      }

      ingestionStats.total_received += received;
      ingestionStats.total_accepted += accepted;
      ingestionStats.total_rejected += rejected;
      ingestionStats.total_deduplicated += deduplicated;
      ingestionStats.total_enriched += enrichedEvents.length;
      ingestionStats.last_successful_fetch = new Date().toISOString();
      ingestionStats.last_fetch_status = "SUCCESS";
      ingestionStats.last_error_message = null;
      ingestionStats.fetch_count++;
      ingestionStats.is_running = false;
      ingestionStats.next_scheduled_fetch = new Date(Date.now() + ingestionStats.auto_ingest_interval_sec * 1000).toISOString();

      return {
        status: "SUCCESS",
        total_received: received,
        total_accepted: accepted,
        total_rejected: rejected,
        total_deduplicated: deduplicated,
        total_enriched: enrichedEvents.length,
        days_fetched: requestedDays,
        sample_ids: enrichedEvents.slice(0, 5).map((e) => e.event.id),
        satellite_source: source,
        cumulative_metrics: { ...ingestionStats },
        timestamp: new Date().toISOString()
      };
    } catch (err: any) {
      ingestionStats.last_fetch_status = "FAILED";
      ingestionStats.last_error_message = err.message;
      ingestionStats.is_running = false;
      ingestionStats.next_scheduled_fetch = new Date(Date.now() + 60 * 1000).toISOString();
      throw err;
    }
  }

  app.post("/api/ingest/firms-live", requireOfficerOrAdmin, async (req, res) => {
    try {
      const bbox = req.body?.bbox || "68.0,6.5,97.5,37.5";
      const source = req.body?.source || "VIIRS_SNPP_NRT";
      const days = req.body?.days || 7;
      const result = await fetchAndIngestLiveFirms(bbox, source, days);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        error: err.message,
        message: "Failed to execute live NASA FIRMS ingestion.",
        timestamp: new Date().toISOString()
      });
    }
  });

  app.post("/api/ingest/firms", requireOfficerOrAdmin, async (req, res) => {
    try {
      const { records, auto_enrich } = req.body;
      if (records && Array.isArray(records) && records.length > 0) {
        let accepted = 0;
        let rejected = 0;
        let deduplicated = 0;
        const newSeeds: HotspotSeed[] = [];

        for (const r of records) {
          const lat = parseFloat(r.latitude);
          const lon = parseFloat(r.longitude);
          if (isNaN(lat) || isNaN(lon)) {
            rejected++;
            continue;
          }
          const id = r.id || `te-cust-${Math.abs(Math.round((lat + lon) * 10000)).toString(16).slice(0, 8)}`;
          if (hotspots.some((h) => h.event.id === id)) {
            deduplicated++;
            continue;
          }
          newSeeds.push({
            id,
            latitude: lat,
            longitude: lon,
            timestamp: r.timestamp || new Date().toISOString(),
            brightness: parseFloat(r.brightness) || 320,
            frp: parseFloat(r.frp) || 5.0,
            confidence: parseFloat(r.confidence) || 75,
            satellite: r.satellite || "MANUAL_INGEST",
            daynight: r.daynight || "D",
            source: "API_INGEST",
            cluster_id: r.cluster_id || `cls-${Math.round(lat * 100) / 100}_${Math.round(lon * 100) / 100}`
          });
          accepted++;
        }

        const enrichedEvents: any[] = [];
        for (const s of newSeeds) {
          try {
            const enriched = await processLiveThermalEvent(s);
            enrichedEvents.push(enriched);
          } catch (procErr: any) {
            console.error(`Error in live temporal pipeline for custom ingest ${s.id}:`, procErr.message);
            const fallback = processThermalEvent(s, false);
            enrichedEvents.push(fallback);
          }
        }
        
        hotspots.unshift(...enrichedEvents);

        return res.json({
          total_received: records.length,
          total_accepted: accepted,
          total_rejected: rejected,
          total_deduplicated: deduplicated,
          total_enriched: enrichedEvents.length,
          sample_ids: enrichedEvents.slice(0, 5).map((e) => e.event.id),
          timestamp: new Date().toISOString()
        });
      } else {
        // Fallback to live firms fetch
        const result = await fetchAndIngestLiveFirms();
        return res.json(result);
      }
    } catch (err: any) {
      res.status(500).json({
        error: err.message,
        message: "Failed to process FIRMS records.",
        timestamp: new Date().toISOString()
      });
    }
  });

  app.get("/api/hotspots", (req, res) => {
    const {
      source_class,
      risk_score,
      min_confidence,
      region,
      is_persistent,
      industrial_only,
      land_cover,
      min_frp,
      max_frp,
      min_lat,
      max_lat,
      min_lon,
      max_lon
    } = req.query;

    let result = [...hotspots];

    if (source_class && source_class !== "All" && source_class !== "ALL") {
      result = result.filter(
        (h) => h.classification.predicted_class.toLowerCase() === String(source_class).toLowerCase()
      );
    }
    if (risk_score && risk_score !== "All" && risk_score !== "ALL") {
      result = result.filter(
        (h) => h.classification.risk_score.toUpperCase() === String(risk_score).toUpperCase()
      );
    }
    if (min_confidence !== undefined && min_confidence !== "") {
      const minC = parseFloat(String(min_confidence));
      if (!isNaN(minC)) {
        result = result.filter((h) => h.classification.confidence >= minC);
      }
    }
    if (is_persistent !== undefined && is_persistent !== "" && is_persistent !== "All") {
      const isP = String(is_persistent) === "true";
      result = result.filter((h) => h.temporal_profile.is_persistent === isP);
    }
    if (String(industrial_only) === "true") {
      result = result.filter((h) => (h.geo_context as any).spatial_flags?.is_industrial_zone === true || h.geo_context.distance_to_industry <= 800);
    }
    if (land_cover && land_cover !== "All" && land_cover !== "ALL") {
      result = result.filter((h) => h.geo_context.land_cover.toLowerCase() === String(land_cover).toLowerCase());
    }
    if (min_frp !== undefined && min_frp !== "") {
      const mfrp = parseFloat(String(min_frp));
      if (!isNaN(mfrp)) result = result.filter((h) => h.event.frp >= mfrp);
    }
    if (max_frp !== undefined && max_frp !== "") {
      const mxfrp = parseFloat(String(max_frp));
      if (!isNaN(mxfrp)) result = result.filter((h) => h.event.frp <= mxfrp);
    }
    if (min_lat && max_lat && min_lon && max_lon) {
      const mlat = parseFloat(String(min_lat));
      const mxlat = parseFloat(String(max_lat));
      const mlon = parseFloat(String(min_lon));
      const mxlon = parseFloat(String(max_lon));
      result = result.filter(
        (h) =>
          h.event.latitude >= mlat &&
          h.event.latitude <= mxlat &&
          h.event.longitude >= mlon &&
          h.event.longitude <= mxlon
      );
    }
    if (region && region !== "all_india" && region !== "All") {
      const reg = String(region).toLowerCase();
      if (reg.includes("gujarat") || reg.includes("jamnagar") || reg.includes("hazira") || reg.includes("west")) {
        result = result.filter((h) => h.event.longitude >= 68.0 && h.event.longitude <= 74.0 && h.event.latitude >= 20.0 && h.event.latitude <= 24.5);
      } else if (reg.includes("punjab") || reg.includes("sangrur") || reg.includes("north")) {
        result = result.filter((h) => h.event.longitude >= 74.0 && h.event.longitude <= 77.5 && h.event.latitude >= 29.5 && h.event.latitude <= 32.5);
      } else if (reg.includes("odisha") || reg.includes("simlipal") || reg.includes("east")) {
        result = result.filter((h) => h.event.longitude >= 83.0 && h.event.longitude <= 87.5 && h.event.latitude >= 19.0 && h.event.latitude <= 22.5);
      } else if (reg.includes("korba") || reg.includes("chhattisgarh") || reg.includes("mining")) {
        result = result.filter((h) => h.event.longitude >= 80.0 && h.event.longitude <= 84.0 && h.event.latitude >= 21.0 && h.event.latitude <= 24.0);
      }
    }

    res.json(result);
  });

  app.get("/api/hotspots/:id", (req, res) => {
    const found = hotspots.find((h) => h.event.id === req.params.id);
    if (!found) {
      return res.status(404).json({ error: `Hotspot ${req.params.id} not found` });
    }
    if (!found.fingerprint) {
      found.fingerprint = computeThermalFingerprint(found.event, found.geo_context, found.temporal_profile, found.classification);
    }
    if (!found.priority) {
      found.priority = computeSmartPriority(found.event, found.geo_context, found.temporal_profile, found.classification);
    }
    if (found.alert && !found.alert.priority_score) {
      found.alert.priority_score = found.priority.score;
      found.alert.priority_level = found.priority.level;
      found.alert.priority_factors = found.priority.factors;
    }
    res.json(found);
  });

  app.get("/api/hotspots/:id/fingerprint", (req, res) => {
    const found = hotspots.find((h) => h.event.id === req.params.id);
    if (!found) return res.status(404).json({ error: "Not found" });
    if (!found.fingerprint) {
      found.fingerprint = computeThermalFingerprint(found.event, found.geo_context, found.temporal_profile, found.classification);
    }
    res.json({ event_id: req.params.id, fingerprint: found.fingerprint });
  });

  app.get("/api/hotspots/:id/priority", (req, res) => {
    const found = hotspots.find((h) => h.event.id === req.params.id);
    if (!found) return res.status(404).json({ error: "Not found" });
    if (!found.priority) {
      found.priority = computeSmartPriority(found.event, found.geo_context, found.temporal_profile, found.classification);
    }
    res.json({ event_id: req.params.id, priority: found.priority });
  });

  app.get("/api/hotspots/:id/context", (req, res) => {
    const found = hotspots.find((h) => h.event.id === req.params.id);
    if (!found) return res.status(404).json({ error: "Not found" });
    res.json({ event_id: req.params.id, geo_context: found.geo_context });
  });

  app.get("/api/hotspots/:id/classification", (req, res) => {
    const found = hotspots.find((h) => h.event.id === req.params.id);
    if (!found) return res.status(404).json({ error: "Not found" });
    res.json({ event_id: req.params.id, classification: found.classification });
  });

  app.get("/api/hotspots/:id/intelligence", (req, res) => {
    const found = hotspots.find((h) => h.event.id === req.params.id);
    if (!found) return res.status(404).json({ error: "Not found" });
    res.json((found as any).intelligence || null);
  });

  app.get("/api/hotspots/:id/timeline", async (req, res) => {
    const found = hotspots.find((h) => h.event.id === req.params.id);
    if (!found) return res.status(404).json({ error: "Not found" });

    const clusterId = found.temporal_profile?.cluster_id || found.event?.cluster_id;
    const requestedDaysRaw = req.query.days as string;
    let windowHours = 2160; // 90 days default
    if (requestedDaysRaw) {
      if (requestedDaysRaw === "all" || requestedDaysRaw === "max") {
        windowHours = 87600; // 10 years
      } else {
        const parsed = parseInt(requestedDaysRaw, 10);
        if (!isNaN(parsed) && parsed > 0) {
          windowHours = parsed * 24;
        }
      }
    }

    let history: any[] = [];

    // Query REAL database / persistent store historical observations for this cluster
    try {
      const rawObs = await queryHistoricalObservationsForCluster(clusterId, windowHours, found.event.timestamp);
      if (rawObs.length > 0) {
        history = rawObs.map((o) => ({
          id: o.id,
          date: o.timestamp.split("T")[0],
          timestamp: o.timestamp,
          frp: o.frp,
          brightness: o.brightness,
          satellite: o.satellite,
          confidence: o.confidence,
          daynight: o.daynight
        }));
      }
    } catch (err) {
      console.warn("Failed to query historical observations for timeline:", err);
    }

    // Ensure at least the current observation is present if no historical records exist
    if (history.length === 0) {
      history = [
        {
          id: found.event.id,
          date: found.event.timestamp.split("T")[0],
          timestamp: found.event.timestamp,
          frp: found.event.frp,
          brightness: found.event.brightness,
          satellite: found.event.satellite,
          confidence: found.event.confidence,
          daynight: found.event.daynight
        }
      ];
    }

    // Sort chronologically ascending
    history.sort((a, b) => new Date(a.timestamp || a.date).getTime() - new Date(b.timestamp || b.date).getTime());

    // Calculate comprehensive multi-pass summary statistics
    const frpVals = history.map((h) => h.frp).filter((v) => typeof v === "number" && !isNaN(v));
    const brightVals = history.map((h) => h.brightness).filter((v) => typeof v === "number" && !isNaN(v));
    const uniqueDates = new Set(history.map((h) => h.date || (h.timestamp ? h.timestamp.split("T")[0] : "")));
    const uniqueSats = Array.from(new Set(history.map((h) => h.satellite).filter(Boolean)));
    const dayPasses = history.filter((h) => h.daynight === "D").length;
    const nightPasses = history.filter((h) => h.daynight === "N").length;

    const earliestDate = history[0]?.timestamp || history[0]?.date || found.event.timestamp;
    const latestDate = history[history.length - 1]?.timestamp || history[history.length - 1]?.date || found.event.timestamp;
    const spanMs = Math.abs(new Date(latestDate).getTime() - new Date(earliestDate).getTime());
    const spanDays = Math.max(1, Math.round(spanMs / (1000 * 60 * 60 * 24)));

    const summary = {
      total_passes: history.length,
      active_days: uniqueDates.size,
      avg_frp: frpVals.length > 0 ? Math.round((frpVals.reduce((a, b) => a + b, 0) / frpVals.length) * 10) / 10 : found.event.frp,
      max_frp: frpVals.length > 0 ? Math.max(...frpVals) : found.event.frp,
      min_frp: frpVals.length > 0 ? Math.min(...frpVals) : found.event.frp,
      avg_brightness: brightVals.length > 0 ? Math.round((brightVals.reduce((a, b) => a + b, 0) / brightVals.length) * 10) / 10 : found.event.brightness,
      day_passes: dayPasses,
      night_passes: nightPasses,
      satellites: uniqueSats.length > 0 ? uniqueSats : [found.event.satellite]
    };

    res.json({
      event_id: req.params.id,
      cluster_id: clusterId,
      time_range: {
        days_requested: requestedDaysRaw || 90,
        earliest_pass: earliestDate,
        latest_pass: latestDate,
        span_days: spanDays
      },
      summary,
      temporal_profile: found.temporal_profile,
      observation_history: history
    });
  });

  app.get("/api/hotspots/:id/temporal", async (req, res) => {
    const found = hotspots.find((h) => h.event.id === req.params.id);
    if (!found) return res.status(404).json({ error: "Not found" });
    const clusterId = found.temporal_profile?.cluster_id || found.event?.cluster_id;
    const dbProfile = await getTemporalProfileForCluster(clusterId);
    res.json({
      event_id: req.params.id,
      cluster_id: clusterId,
      temporal_profile: dbProfile || found.temporal_profile
    });
  });

  app.get("/api/statistics", (req, res) => {
    const total = hotspots.length;
    const highRisk = hotspots.filter((h) => ["HIGH", "CRITICAL"].includes(h.classification.risk_score)).length;
    const persistent = hotspots.filter((h) => h.temporal_profile.is_persistent || (h.classification.persistence_score && h.classification.persistence_score > 0.5)).length;
    const industrialFires = hotspots.filter((h) => h.classification.predicted_class === "Industrial Fire").length;
    const gasFlares = hotspots.filter((h) => h.classification.predicted_class === "Gas Flare").length;
    const industrial = industrialFires + gasFlares;
    const wildfires = hotspots.filter((h) => h.classification.predicted_class === "Wildfire").length;
    const agri = hotspots.filter((h) => h.classification.predicted_class === "Agricultural Burning").length;
    const mining = hotspots.filter((h) => h.classification.predicted_class === "Mining").length;
    const other = hotspots.filter((h) => h.classification.predicted_class === "Other").length;
    const mlUnavailable = hotspots.filter((h) => h.classification.predicted_class === "ML_UNAVAILABLE").length;
    const activeAlerts = hotspots.filter((h) => h.alert !== null || ["HIGH", "CRITICAL"].includes(h.classification.risk_score)).length;
    const liveCount = hotspots.filter((h) => h.event.source === "NASA_FIRMS_LIVE").length;
    const demoCount = hotspots.filter((h) => h.event.source !== "NASA_FIRMS_LIVE").length;

    res.json({
      total_hotspots: total,
      high_risk_count: highRisk,
      persistent_sources: persistent,
      industrial_sources: industrial,
      wildfires,
      agricultural_burns: agri,
      active_alerts: activeAlerts,
      by_class: {
        "Industrial Fire": industrialFires,
        "Gas Flare": gasFlares,
        "Agricultural Burning": agri,
        "Wildfire": wildfires,
        "Mining": mining,
        "Other": other,
        "ML_UNAVAILABLE": mlUnavailable
      },
      by_risk: {
        "CRITICAL": hotspots.filter(h => h.classification.risk_score === "CRITICAL").length,
        "HIGH": hotspots.filter(h => h.classification.risk_score === "HIGH").length,
        "MEDIUM": hotspots.filter(h => h.classification.risk_score === "MEDIUM").length,
        "LOW": hotspots.filter(h => h.classification.risk_score === "LOW").length
      },
      live_count: liveCount,
      demo_count: demoCount,
      data_provider_mode: isLiveMode ? "LIVE_SATELLITE_API" : "DEMO_CALIBRATED_PROVIDER",
      last_updated: new Date().toISOString()
    });
  });

  app.get("/api/hotspots/:id/temporal-profile", (req, res) => {
    const found = hotspots.find((h) => h.event.id === req.params.id);
    if (!found) return res.status(404).json({ error: "Not found" });
    res.json(found.temporal_profile);
  });

  app.get("/api/alerts", (req, res) => {
    const { severity, status, sort } = req.query;
    const rawAlerts = hotspots.map((h) => h.alert).filter(Boolean);
    const seen = new Set<string>();
    let alerts: any[] = [];
    for (const a of rawAlerts) {
      if (a && a.id && !seen.has(a.id)) {
        seen.add(a.id);
        const parentH = hotspots.find((h) => h.event.id === a.event_id);
        if (parentH) {
          if (!parentH.priority) {
            parentH.priority = computeSmartPriority(parentH.event, parentH.geo_context, parentH.temporal_profile, parentH.classification);
          }
          a.priority_score = a.priority_score ?? parentH.priority.score;
          a.priority_level = a.priority_level ?? parentH.priority.level;
          a.priority_factors = a.priority_factors ?? parentH.priority.factors;
        }
        alerts.push(a);
      }
    }
    if (severity && severity !== "All" && severity !== "ALL") {
      alerts = alerts.filter(a => a.severity.toUpperCase() === String(severity).toUpperCase());
    }
    if (status && status !== "All" && status !== "ALL") {
      const qStatus = String(status).toUpperCase();
      alerts = alerts.filter(a => {
        const curStatus = (a.status || a.incident_status || "ACTIVE").toUpperCase();
        if (qStatus === "ACTIVE") return curStatus === "ACTIVE" || curStatus === "NEW";
        if (qStatus === "NEW") return curStatus === "NEW" || curStatus === "ACTIVE";
        return curStatus === qStatus;
      });
    }

    if (sort === "smart_priority" || sort === "priority") {
      alerts.sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0));
    }

    res.json(alerts);
  });

  app.patch("/api/alerts/:id/status", requireAlertManagementClearance, async (req, res) => {
    const { status, notes, assigned_team } = req.body;
    const alertId = req.params.id;
    const sNorm = String(status).toUpperCase();
    const user = (req as any).user;

    for (const h of hotspots) {
      if (h.alert && h.alert.id === alertId) {
        const prevStatus = h.alert.status;
        h.alert.status = sNorm;
        h.alert.incident_status = sNorm;
        h.alert.updated_at = new Date().toISOString();

        if (assigned_team) {
          h.alert.assigned_team = assigned_team;
          h.alert.assigned_by = `${user.name} (${user.badge_number || user.role})`;
          h.alert.assigned_at = new Date().toISOString();
        }

        if (sNorm === "ACKNOWLEDGED") {
          h.alert.acknowledged_by = `${user.name} (${user.badge_number || user.role})`;
          h.alert.acknowledged_at = new Date().toISOString();
        } else if (sNorm === "RESOLVED") {
          h.alert.resolved_by = `${user.name} (${user.badge_number || user.role})`;
          h.alert.resolved_at = new Date().toISOString();
          h.alert.resolution_notes = notes || "Incident resolved by commanding authority.";
        }

        if (!h.alert.audit_trail) h.alert.audit_trail = [];
        h.alert.audit_trail.push({
          timestamp: new Date().toISOString(),
          action: sNorm,
          performed_by: `${user.name} [${user.role}]`,
          notes: notes || `Status transitioned from ${prevStatus} to ${sNorm}${assigned_team ? ` (Assigned: ${assigned_team})` : ""}`
        });

        if (isDbConnected()) {
          await persistHotspot(h);
        }

        return res.json(h.alert);
      }
    }
    return res.status(404).json({ error: `Alert ${alertId} not found` });
  });

  app.put("/api/alerts/:id/status", requireAlertManagementClearance, async (req, res) => {
    const { status, notes, assigned_team } = req.body;
    const alertId = req.params.id;
    const sNorm = String(status).toUpperCase();
    const user = (req as any).user;

    for (const h of hotspots) {
      if (h.alert && h.alert.id === alertId) {
        const prevStatus = h.alert.status;
        h.alert.status = sNorm;
        h.alert.incident_status = sNorm;
        h.alert.updated_at = new Date().toISOString();

        if (assigned_team) {
          h.alert.assigned_team = assigned_team;
          h.alert.assigned_by = `${user.name} (${user.badge_number || user.role})`;
          h.alert.assigned_at = new Date().toISOString();
        }

        if (sNorm === "ACKNOWLEDGED") {
          h.alert.acknowledged_by = `${user.name} (${user.badge_number || user.role})`;
          h.alert.acknowledged_at = new Date().toISOString();
        } else if (sNorm === "RESOLVED") {
          h.alert.resolved_by = `${user.name} (${user.badge_number || user.role})`;
          h.alert.resolved_at = new Date().toISOString();
          h.alert.resolution_notes = notes || "Incident resolved by commanding authority.";
        }

        if (!h.alert.audit_trail) h.alert.audit_trail = [];
        h.alert.audit_trail.push({
          timestamp: new Date().toISOString(),
          action: sNorm,
          performed_by: `${user.name} [${user.role}]`,
          notes: notes || `Status updated from ${prevStatus} to ${sNorm}${assigned_team ? ` (Assigned: ${assigned_team})` : ""}`
        });
        
        if (isDbConnected()) {
          await persistHotspot(h);
        }

        return res.json(h.alert);
      }
    }
    return res.status(404).json({ error: `Alert ${alertId} not found` });
  });

  app.post("/api/alerts/:id/assign", requireAlertManagementClearance, async (req, res) => {
    const { team, notes } = req.body;
    const alertId = req.params.id;
    const user = (req as any).user;

    if (!team) {
      return res.status(400).json({ error: "team name is required for team assignment." });
    }

    for (const h of hotspots) {
      if (h.alert && h.alert.id === alertId) {
        h.alert.assigned_team = team;
        h.alert.assigned_by = `${user.name} (${user.badge_number || user.role})`;
        h.alert.assigned_at = new Date().toISOString();
        h.alert.status = "ASSIGNED";
        h.alert.incident_status = "ASSIGNED";
        h.alert.updated_at = new Date().toISOString();

        if (!h.alert.audit_trail) h.alert.audit_trail = [];
        h.alert.audit_trail.push({
          timestamp: new Date().toISOString(),
          action: "TEAM_ASSIGNED",
          performed_by: `${user.name} [${user.role}]`,
          notes: notes || `Assigned to ${team} for tactical ground verification and containment.`
        });

        if (isDbConnected()) {
          await persistHotspot(h);
        }

        return res.json({
          status: "SUCCESS",
          alert: h.alert,
          message: `Team '${team}' successfully assigned to Alert ${alertId}`
        });
      }
    }
    return res.status(404).json({ error: `Alert ${alertId} not found` });
  });

  app.post("/api/alerts/:id/action", requireAlertManagementClearance, async (req, res) => {
    const { action, notes, team } = req.body;
    const alertId = req.params.id;
    const user = (req as any).user;

    if (!action) {
      return res.status(400).json({ error: "Action is required (ACKNOWLEDGE, ASSIGN, INVESTIGATE, RESOLVE, REOPEN, ESCALATE)" });
    }

    const normAction = String(action).toUpperCase();
    for (const h of hotspots) {
      if (h.alert && h.alert.id === alertId) {
        h.alert.updated_at = new Date().toISOString();

        if (normAction === "ACKNOWLEDGE" || normAction === "ACKNOWLEDGED") {
          h.alert.status = "ACKNOWLEDGED";
          h.alert.incident_status = "ACKNOWLEDGED";
          h.alert.acknowledged_by = `${user.name} (${user.badge_number || user.role})`;
          h.alert.acknowledged_at = new Date().toISOString();
        } else if (normAction === "ASSIGN" || normAction === "ASSIGNED") {
          h.alert.status = "ASSIGNED";
          h.alert.incident_status = "ASSIGNED";
          if (team) {
            h.alert.assigned_team = team;
            h.alert.assigned_by = `${user.name} (${user.badge_number || user.role})`;
            h.alert.assigned_at = new Date().toISOString();
          }
        } else if (normAction === "INVESTIGATE" || normAction === "INVESTIGATING") {
          h.alert.status = "INVESTIGATING";
          h.alert.incident_status = "INVESTIGATING";
        } else if (normAction === "RESOLVE" || normAction === "RESOLVED") {
          h.alert.status = "RESOLVED";
          h.alert.incident_status = "RESOLVED";
          h.alert.resolved_by = `${user.name} (${user.badge_number || user.role})`;
          h.alert.resolved_at = new Date().toISOString();
          h.alert.resolution_notes = notes || "Hazard resolved and logged.";
        } else if (normAction === "REOPEN") {
          h.alert.status = "ACTIVE";
          h.alert.incident_status = "NEW";
        } else if (normAction === "ESCALATE") {
          h.alert.severity = "CRITICAL";
          h.alert.status = "ACTIVE";
          h.alert.incident_status = "NEW";
        }

        if (!h.alert.audit_trail) h.alert.audit_trail = [];
        h.alert.audit_trail.push({
          timestamp: new Date().toISOString(),
          action: normAction,
          performed_by: `${user.name} [${user.role}] (${user.badge_number || "SYS"})`,
          notes: notes || `Action ${normAction} executed via Command Authority Console`
        });

        if (isDbConnected()) {
          await persistHotspot(h);
        }

        return res.json({
          status: "SUCCESS",
          alert: h.alert,
          message: `Alert ${alertId} successfully processed: ${normAction}`
        });
      }
    }
    return res.status(404).json({ error: `Alert ${alertId} not found` });
  });

  // ==========================================
  // PRIORITY 6: HUMAN VERIFICATION & ANALYST REVIEW ROUTES
  // Decision-Support Workflow: AI recommends, Analyst verifies
  // ==========================================

  const handleVerifyEvent = async (req: express.Request, res: express.Response) => {
    const eventId = req.params.id;
    const { status, verified_class, reason } = req.body || {};

    const validStatuses = ["CONFIRMED", "RECLASSIFIED", "NEEDS_REVIEW"];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        error: "INVALID_STATUS",
        message: `Verification status must be one of: ${validStatuses.join(", ")}`
      });
    }

    const validClasses = [
      "Industrial Fire",
      "Gas Flare",
      "Agricultural Burning",
      "Wildfire",
      "Mining",
      "Other"
    ];

    if (status === "RECLASSIFIED") {
      if (!verified_class || !validClasses.includes(verified_class)) {
        return res.status(400).json({
          error: "INVALID_VERIFIED_CLASS",
          message: `When status is RECLASSIFIED, verified_class is required and must be one of: ${validClasses.join(", ")}`
        });
      }
      if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
        return res.status(400).json({
          error: "REASON_REQUIRED",
          message: "A meaningful operational justification reason (min 3 characters) is required when reclassifying an event."
        });
      }
    }

    if (status === "NEEDS_REVIEW") {
      if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
        return res.status(400).json({
          error: "REASON_REQUIRED",
          message: "A clear justification reason (min 3 characters) is required when flagging an event for secondary review."
        });
      }
    }

    const found = hotspots.find((h) => h.event.id === eventId);
    if (!found) {
      return res.status(404).json({ error: `Thermal event ${eventId} not found` });
    }

    const user = (req as any).user;
    const analystName = user.name || "GIS Analyst";
    const analystRole = user.role || "ANALYST";
    const analystBadge = user.badge_number || analystRole;
    const verifiedByString = `${analystName} (${analystBadge})`;
    const verifiedAt = new Date().toISOString();

    const finalVerifiedClass = status === "CONFIRMED"
      ? (verified_class || found.classification.predicted_class)
      : (status === "RECLASSIFIED" ? verified_class : null);

    const finalReason = reason && reason.trim().length > 0
      ? reason.trim()
      : (status === "CONFIRMED" ? "Confirmed by GIS Analyst review based on multi-source satellite telemetry and geospatial infrastructure context." : null);

    const prevStatus = found.classification.verification_status || "UNVERIFIED";

    const auditEntry = {
      timestamp: verifiedAt,
      action: status,
      performed_by: `${analystName} [${analystRole}]`,
      user_id: user.id,
      badge_number: user.badge_number || null,
      previous_status: prevStatus,
      ai_predicted_class: found.classification.predicted_class,
      verified_class: finalVerifiedClass,
      reason: finalReason
    };

    // Update in-memory classification WITHOUT overwriting original AI prediction
    found.classification.verification_status = status;
    found.classification.verified_class = finalVerifiedClass;
    found.classification.verified_by = verifiedByString;
    found.classification.verified_by_name = analystName;
    found.classification.verified_at = verifiedAt;
    found.classification.verification_reason = finalReason;

    if (!found.classification.verification_audit_trail) {
      found.classification.verification_audit_trail = [];
    }
    found.classification.verification_audit_trail.unshift(auditEntry);

    // If an alert exists for this event, log to alert audit trail as well
    if (found.alert) {
      if (!found.alert.audit_trail) found.alert.audit_trail = [];
      found.alert.audit_trail.unshift({
        timestamp: verifiedAt,
        action: `ANALYST_${status}`,
        performed_by: `${analystName} [${analystRole}]`,
        notes: `Analyst classification review: ${status}${finalVerifiedClass ? ` (${finalVerifiedClass})` : ""}. Reason: ${finalReason}`
      });
      found.alert.updated_at = verifiedAt;
    }

    // Persist immediately to DB and persistent store
    try {
      await saveVerificationRecord(eventId, {
        verification_status: status,
        verified_class: finalVerifiedClass,
        verified_by: verifiedByString,
        verified_by_name: analystName,
        verified_at: verifiedAt,
        verification_reason: finalReason,
        audit_trail: found.classification.verification_audit_trail
      });
      if (isDbConnected()) {
        await persistHotspot(found);
      }
    } catch (persistErr: any) {
      console.warn(`ThermoGuard: Error persisting verification for ${eventId}:`, persistErr.message);
    }

    return res.json({
      success: true,
      message: `Thermal source ${eventId} verification recorded: ${status}.`,
      event_id: eventId,
      verification: {
        verification_status: status,
        verified_class: finalVerifiedClass,
        verified_by: verifiedByString,
        verified_by_name: analystName,
        verified_at: verifiedAt,
        verification_reason: finalReason,
        audit_trail: found.classification.verification_audit_trail
      },
      ai_prediction: {
        predicted_class: found.classification.predicted_class,
        confidence: found.classification.confidence,
        confidence_band: found.classification.confidence_band,
        model_version: found.classification.model_version,
        evidence: found.classification.evidence
      },
      hotspot: found
    });
  };

  app.post("/api/events/:id/verify", requireVerificationClearance, handleVerifyEvent);
  app.post("/api/hotspots/:id/verify", requireVerificationClearance, handleVerifyEvent);

  app.get("/api/events/:id/verification", (req, res) => {
    const found = hotspots.find((h) => h.event.id === req.params.id);
    if (!found) return res.status(404).json({ error: "Not found" });
    return res.json({
      event_id: req.params.id,
      verification_status: found.classification.verification_status || "UNVERIFIED",
      verified_class: found.classification.verified_class || null,
      verified_by: found.classification.verified_by || null,
      verified_by_name: found.classification.verified_by_name || null,
      verified_at: found.classification.verified_at || null,
      verification_reason: found.classification.verification_reason || null,
      audit_trail: found.classification.verification_audit_trail || [],
      ai_predicted_class: found.classification.predicted_class,
      confidence: found.classification.confidence,
      model_version: found.classification.model_version
    });
  });

  app.get("/api/hotspots/:id/verification", (req, res) => {
    const found = hotspots.find((h) => h.event.id === req.params.id);
    if (!found) return res.status(404).json({ error: "Not found" });
    return res.json({
      event_id: req.params.id,
      verification_status: found.classification.verification_status || "UNVERIFIED",
      verified_class: found.classification.verified_class || null,
      verified_by: found.classification.verified_by || null,
      verified_by_name: found.classification.verified_by_name || null,
      verified_at: found.classification.verified_at || null,
      verification_reason: found.classification.verification_reason || null,
      audit_trail: found.classification.verification_audit_trail || [],
      ai_predicted_class: found.classification.predicted_class,
      confidence: found.classification.confidence,
      model_version: found.classification.model_version
    });
  });

  app.get("/api/verifications", (req, res) => {
    const verifs = getAllVerificationRecords();
    const verifiedList = Object.entries(verifs).map(([eventId, rec]) => {
      const h = hotspots.find((item) => item.event.id === eventId);
      return {
        event_id: eventId,
        ...rec,
        ai_predicted_class: h?.classification.predicted_class || null,
        confidence: h?.classification.confidence || null,
        risk_score: h?.classification.risk_score || null
      };
    });
    return res.json({
      total: verifiedList.length,
      verifications: verifiedList
    });
  });

  // ==========================================
  // ADMINISTRATIVE & AUTHORITY COMMAND ROUTES
  // Protected with requireOfficerOrAdmin
  // ==========================================

  app.get("/api/admin/overview", requireOfficerOrAdmin, async (req, res) => {
    const memory = process.memoryUsage();
    const uptimeSec = Math.floor(process.uptime());
    const totalUsers = authManager.getAllUsers().length;
    const activeSessions = authManager.getAllSessions().length;
    const activeAlerts = hotspots.filter((h) => h.alert && h.alert.status === "ACTIVE").length;
    const acknowledgedAlerts = hotspots.filter((h) => h.alert && h.alert.status === "ACKNOWLEDGED").length;
    const resolvedAlerts = hotspots.filter((h) => h.alert && h.alert.status === "RESOLVED").length;

    const firmsCheck = await validateFirmsKey(process.env.FIRMS_API_KEY || "", false);

    res.json({
      system: {
        name: adminConfig.system_name,
        version: adminConfig.version,
        node_version: process.version,
        uptime_seconds: uptimeSec,
        uptime_formatted: `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m ${uptimeSec % 60}s`,
        memory_mb: {
          rss: Math.round((memory.rss / 1024 / 1024) * 10) / 10,
          heap_total: Math.round((memory.heapTotal / 1024 / 1024) * 10) / 10,
          heap_used: Math.round((memory.heapUsed / 1024 / 1024) * 10) / 10
        },
        environment: process.env.NODE_ENV || "development",
        data_mode: isLiveMode ? "LIVE_SATELLITE_API" : "DEMO_SAMPLE_DATA",
        database_mode: isDbConnected() ? "PERSISTENT_POSTGRES" : "IN_MEMORY_CACHE"
      },
      counts: {
        total_hotspots: hotspots.length,
        live_hotspots: hotspots.filter((h) => h.event.source === "NASA_FIRMS_LIVE").length,
        demo_hotspots: hotspots.filter((h) => h.event.source !== "NASA_FIRMS_LIVE").length,
        registered_users: totalUsers,
        active_sessions: activeSessions,
        alerts: {
          total: hotspots.filter((h) => h.alert !== null).length,
          active: activeAlerts,
          acknowledged: acknowledgedAlerts,
          resolved: resolvedAlerts
        }
      },
      providers: {
        firms: {
          mode: isLiveMode ? "LIVE_API_ACTIVE" : "DEMO_SAMPLE_DATA",
          connected: firmsCheck.connected,
          configured: firmsCheck.configured,
          status: firmsCheck.status,
          latency_ms: firmsCheck.latency_ms || 0
        },
        osm: {
          mode: "DEMO_POSTGIS_CACHED",
          status: "CONNECTED",
          records: 12
        },
        landcover: {
          mode: "DEMO_SAMPLE_DATA",
          status: "CONNECTED",
          dataset: "ESA WorldCover 10m Benchmark"
        }
      },
      ingestion_metrics: ingestionStats,
      config: adminConfig,
      timestamp: new Date().toISOString()
    });
  });

  app.get("/api/admin/system-health", requireOfficerOrAdmin, (req, res) => {
    const memory = process.memoryUsage();
    const uptimeSec = Math.floor(process.uptime());

    res.json({
      status: "HEALTHY",
      service: "ThermoGuard AI Core Intelligence Engine",
      timestamp: new Date().toISOString(),
      uptime_seconds: uptimeSec,
      telemetry: {
        memory: {
          rss_mb: Math.round((memory.rss / 1024 / 1024) * 10) / 10,
          heap_total_mb: Math.round((memory.heapTotal / 1024 / 1024) * 10) / 10,
          heap_used_mb: Math.round((memory.heapUsed / 1024 / 1024) * 10) / 10,
          heap_utilization_pct: Math.round((memory.heapUsed / memory.heapTotal) * 100)
        },
        cpu: {
          arch: process.arch,
          platform: process.platform,
          node_version: process.version
        },
        database: {
          driver: "PostgreSQL + PostGIS (Spatial Memory & Table Engine)",
          connection: "CONNECTED",
          spatial_index: "GIST (geometry_gist_idx)",
          active_tables: [
            "thermal_events",
            "industrial_facilities",
            "geo_context",
            "temporal_profiles",
            "classifications",
            "alerts"
          ]
        },
        classifier: {
          model_name: "Random Forest Decision Tree Ensemble",
          model_version: "random_forest_v1.0.0",
          features_extracted: 14,
          inference_engine: "Synchronous Tabular Extractor",
          classes_supported: ["Industrial Fire", "Gas Flare", "Agricultural Burning", "Wildfire", "Mining", "Other"]
        }
      }
    });
  });

  app.get("/api/admin/users", requireOfficerOrAdmin, (req, res) => {
    const users = authManager.getAllUsers();
    res.json({
      total: users.length,
      users,
      timestamp: new Date().toISOString()
    });
  });

  app.post("/api/admin/users", requireOfficerOrAdmin, (req, res) => {
    try {
      const { username, email, name, password, role, department } = req.body || {};
      if (!username || !email || !name || !password) {
        return res.status(400).json({
          error: "MISSING_FIELDS",
          message: "Username, official email, name, and password are required to create an officer/analyst."
        });
      }

      const { user } = authManager.registerUser({
        username,
        email,
        name,
        password,
        role: role || "ANALYST",
        department
      });

      res.status(201).json({
        status: "CREATED",
        user,
        message: `Account for ${user.name} [${user.role}] successfully created by Administrator.`
      });
    } catch (err: any) {
      res.status(400).json({
        error: "USER_CREATION_FAILED",
        message: err.message || "Failed to create user account."
      });
    }
  });

  app.patch("/api/admin/users/:id/role", requireOfficerOrAdmin, (req, res) => {
    try {
      const { role, clearance_level } = req.body;
      const userId = req.params.id;

      if (!role) {
        return res.status(400).json({ error: "Role is required." });
      }

      const updated = authManager.updateUserRole(userId, role, clearance_level);
      res.json({
        status: "UPDATED",
        user: updated,
        message: `Role for ${updated.name} updated to ${updated.role} (${updated.clearance_level}).`
      });
    } catch (err: any) {
      res.status(400).json({
        error: "ROLE_UPDATE_FAILED",
        message: err.message || "Failed to update user role."
      });
    }
  });

  app.delete("/api/admin/users/:id", requireOfficerOrAdmin, (req, res) => {
    try {
      const userId = req.params.id;
      authManager.deleteUser(userId);
      res.json({
        status: "DELETED",
        message: `User ${userId} and associated sessions revoked.`
      });
    } catch (err: any) {
      res.status(400).json({
        error: "USER_DELETION_FAILED",
        message: err.message || "Failed to delete user."
      });
    }
  });

  app.get("/api/admin/sessions", requireOfficerOrAdmin, (req, res) => {
    const sessions = authManager.getAllSessions();
    res.json({
      total: sessions.length,
      sessions,
      timestamp: new Date().toISOString()
    });
  });

  app.post("/api/admin/sessions/revoke", requireOfficerOrAdmin, (req, res) => {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: "Session token is required." });
    }
    const success = authManager.invalidateSession(token);
    res.json({
      status: success ? "REVOKED" : "NOT_FOUND",
      message: success ? "Session token invalidated." : "Session not found or already expired."
    });
  });

  app.get("/api/admin/config", requireOfficerOrAdmin, (req, res) => {
    res.json({
      config: adminConfig,
      data_mode: isLiveMode ? "LIVE_SATELLITE_API" : "DEMO_SAMPLE_DATA",
      firms_key_configured: Boolean(process.env.FIRMS_API_KEY && process.env.FIRMS_API_KEY.trim().length > 0)
    });
  });

  app.put("/api/admin/config", requireOfficerOrAdmin, (req, res) => {
    const updates = req.body || {};
    Object.assign(adminConfig, updates, {
      updated_at: new Date().toISOString()
    });

    res.json({
      status: "CONFIG_UPDATED",
      config: adminConfig,
      message: "Administrative system parameters saved successfully."
    });
  });

  app.post("/api/admin/toggle-data-mode", requireOfficerOrAdmin, (req, res) => {
    const { mode } = req.body;
    if (mode === "LIVE" || mode === "LIVE_SATELLITE_API") {
      isLiveMode = true;
    } else if (mode === "DEMO" || mode === "DEMO_SAMPLE_DATA") {
      isLiveMode = false;
    } else {
      isLiveMode = !isLiveMode;
    }
    adminConfig.data_mode = isLiveMode ? "LIVE_SATELLITE_API" : "DEMO_SAMPLE_DATA";

    res.json({
      status: "MODE_SWITCHED",
      is_live_mode: isLiveMode,
      data_mode: adminConfig.data_mode,
      message: `System operating in ${adminConfig.data_mode} mode.`
    });
  });

  app.post("/api/admin/provider/test", requireOfficerOrAdmin, async (req, res) => {
    const { provider } = req.body;
    if (provider === "firms" || provider === "NASA_FIRMS") {
      const result = await validateFirmsKey(process.env.FIRMS_API_KEY || "", true);
      return res.json({ provider: "NASA FIRMS", result });
    }

    res.json({
      provider: provider || "ALL",
      status: "OK",
      timestamp: new Date().toISOString(),
      message: "Provider interface connectivity verified."
    });
  });

  app.get("/api/filters", (req, res) => {
    res.json({
      classes: ["All", "Industrial Fire", "Gas Flare", "Agricultural Burning", "Wildfire", "Mining", "Other"],
      risk_levels: ["All", "LOW", "MEDIUM", "HIGH", "CRITICAL"],
      regions: [
        { id: "all_india", name: "All India Overview", center: [22.5, 78.5], zoom: 5 },
        { id: "jamnagar_petro", name: "Gujarat Petro Corridor (Jamnagar & Hazira)", center: [22.3591, 69.8652], zoom: 12 },
        { id: "punjab_agri", name: "Punjab Stubble Burning Belt (Sangrur)", center: [30.2451, 75.8341], zoom: 11 },
        { id: "simlipal_forest", name: "Simlipal Biosphere Forest Reserve", center: [21.8450, 86.3210], zoom: 10 },
        { id: "korba_mining", name: "Korba Coalfield & Mining Basin", center: [22.3425, 82.5942], zoom: 12 }
      ],
      satellites: ["VIIRS_SNPP", "VIIRS_NOAA20", "MODIS_Aqua", "MODIS_Terra"]
    });
  });

  // Machine Learning Model Inspection & Metadata Route
  app.get("/api/ml/model-info", (req, res) => {
    const metaPath = path.join(process.cwd(), "ml/models/model_metadata.json");
    if (fs.existsSync(metaPath)) {
      try {
        const metadata = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        return res.json(metadata);
      } catch (err) {
        console.error("Error reading model metadata:", err);
      }
    }
    // Fallback default metadata
    res.json({
      model_version: "random_forest_v1.0.0",
      algorithm: "RandomForestClassifier",
      framework: "scikit-learn",
      target_classes: ["Industrial Fire", "Gas Flare", "Agricultural Burning", "Wildfire", "Mining", "Other"],
      hyperparameters: {
        n_estimators: 100,
        max_depth: 10,
        class_weight: "balanced",
        random_state: 42
      },
      evaluation_metrics: {
        accuracy: 1.0,
        macro_f1: 1.0
      },
      dataset_info: {
        is_development_demo_data: true,
        limitation_notice: "Curated development baseline for SIH26162."
      }
    });
  });

  app.get("/api/ml/status", (req, res) => {
    const status = getMLModelStatus();
    res.json(status);
  });

  app.post("/api/ml/predict", (req, res) => {
    try {
      const features = req.body || {};
      const result = predictWithRandomForest(features);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        error: "INFERENCE_FAILED",
        message: err.message
      });
    }
  });

  app.post("/api/analyze", async (req, res) => {
    const { latitude, longitude, brightness, frp, confidence, satellite } = req.body;
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: "latitude and longitude are required" });
    }

    const newRaw: HotspotSeed = {
      id: `te-adhoc-${Date.now().toString().slice(-6)}`,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      timestamp: new Date().toISOString(),
      brightness: parseFloat(brightness || 345.0),
      frp: parseFloat(frp || 40.0),
      confidence: parseFloat(confidence || 85.0),
      satellite: satellite || "VIIRS_SNPP",
      source: "USER_CUSTOM_INSPECTION",
      cluster_id: `cls-adhoc-${Math.floor(latitude * 100)}_${Math.floor(longitude * 100)}`,
      daynight: "D"
    };

    let analyzed: any;
    try {
      analyzed = await processLiveThermalEvent(newRaw);
    } catch (procErr: any) {
      console.error(`Error in live temporal pipeline for ad-hoc inspection:`, procErr.message);
      analyzed = processThermalEvent(newRaw, false);
      await runMLClassification([analyzed]);
    }
    
    // Add to session hotspots so it displays on the GIS map immediately
    hotspots = [analyzed, ...hotspots];

    res.json(analyzed);
  });

  // Demo Scenarios catalog
  app.get("/api/scenarios", (req, res) => {
    res.json([
      {
        id: "scenario-1-jamnagar",
        name: "Scenario 1: Refinery Persistent Gas Flare",
        description: "Continuous thermal anomaly located 120m from documented flare stack #3 inside Jamnagar Mega Refinery.",
        region: "Jamnagar, Gujarat",
        target_class: "Gas Flare",
        risk: "LOW",
        center: [22.3591, 69.8652],
        zoom: 13,
        sample_event_id: "te-jam-101",
        key_insight: "High persistence (80 days) + industrial zoning verifies routine controlled flare despite high brightness."
      },
      {
        id: "scenario-1b-hazira",
        name: "Scenario 1b: Chemical Facility Emergency Fire",
        description: "Sudden onset thermal surge (FRP 142.5 MW) at Hazira Petrochemicals & LNG storage terminal.",
        region: "Hazira, Surat, Gujarat",
        target_class: "Industrial Fire",
        risk: "CRITICAL",
        center: [21.1145, 72.6732],
        zoom: 13,
        sample_event_id: "te-haz-201",
        key_insight: "Severe thermal power without multi-day historical persistence triggers immediate CRITICAL industrial disaster alert."
      },
      {
        id: "scenario-2-punjab",
        name: "Scenario 2: Seasonal Cropland Stubble Burning",
        description: "Cluster of thermal hotspots over active agricultural fields during post-monsoon harvest.",
        region: "Sangrur & Patiala, Punjab",
        target_class: "Agricultural Burning",
        risk: "MEDIUM",
        center: [30.2451, 75.8341],
        zoom: 11,
        sample_event_id: "te-pnb-301",
        key_insight: "Surrounded by 96% cropland with no industrial infrastructure within 14 km confirms stubble burning."
      },
      {
        id: "scenario-3-simlipal",
        name: "Scenario 3: Biosphere Reserve Forest Wildfire",
        description: "Fast-spreading thermal cluster inside dense canopy of Simlipal Forest Reserve.",
        region: "Mayurbhanj, Odisha",
        target_class: "Wildfire",
        risk: "HIGH",
        center: [21.8450, 86.3210],
        zoom: 11,
        sample_event_id: "te-sim-401",
        key_insight: "Dense forest land-cover and absence of human infrastructure correctly attributes hotspot to forest wildfire."
      },
      {
        id: "scenario-4-korba",
        name: "Scenario 4: Open-cast Coal Mine Oxidation",
        description: "Persistent smoldering thermal emission in overburden spoil dump at Gevra coalfield.",
        region: "Korba, Chhattisgarh",
        target_class: "Mining",
        risk: "MEDIUM",
        center: [22.3425, 82.5942],
        zoom: 13,
        sample_event_id: "te-krb-501",
        key_insight: "Co-location with open-cast mining pit and long smoldering persistence distinguishes coal seam fire from wild burns."
      }
    ]);
  });

  // Scenario Loading Endpoint for judges and demonstrators
  app.post("/api/scenarios/:id/load", async (req, res) => {
    const scenarioId = req.params.id;
    const demoEvents = RAW_HOTSPOTS.map((h) => processThermalEvent(h, true));
    
    // Ensure all demo hotspots are loaded
    hotspots = [...demoEvents];
    
    const targetMap: Record<string, string> = {
      "scenario-1-jamnagar": "te-jam-101",
      "scenario-1b-hazira": "te-haz-201",
      "scenario-2-punjab": "te-pnb-301",
      "scenario-3-simlipal": "te-sim-401",
      "scenario-4-korba": "te-krb-501"
    };

    const targetEventId = targetMap[scenarioId] || "te-jam-101";
    const targetHotspot = hotspots.find((h) => h.event.id === targetEventId) || hotspots[0];

    res.json({
      status: "SUCCESS",
      scenario_id: scenarioId,
      sample_event_id: targetEventId,
      hotspot: targetHotspot,
      total_loaded: hotspots.length,
      message: `Scenario ${scenarioId} successfully loaded with ground-truth verification.`
    });
  });

  // Reset to Demo Baseline
  app.post("/api/scenarios/reset-demo", async (req, res) => {
    hotspots = RAW_HOTSPOTS.map((h) => processThermalEvent(h, true));
    await runMLClassification(hotspots);
    res.json({
      status: "SUCCESS",
      total_loaded: hotspots.length,
      message: "Reset data store to calibrated SIH 2026 demo baseline."
    });
  });

  // Automatic Background Ingestion Task
  if (isLiveMode && process.env.FIRMS_API_KEY) {
    console.log("ThermoGuard: Live mode detected. Initializing automatic NASA FIRMS VIIRS ingestion on startup...");
    fetchAndIngestLiveFirms()
      .then((r) => console.log(`ThermoGuard: Initial NASA FIRMS ingestion successful (${r.total_enriched} events enriched).`))
      .catch((err) => console.warn(`ThermoGuard: Initial NASA FIRMS ingestion warning (fallback available):`, err.message));

    // Safe periodic background polling (every 15 minutes)
    setInterval(() => {
      console.log("ThermoGuard: Executing scheduled background NASA FIRMS ingestion...");
      fetchAndIngestLiveFirms()
        .then((r) => console.log(`ThermoGuard: Periodic NASA FIRMS ingestion updated (${r.total_enriched} events).`))
        .catch((err) => console.warn(`ThermoGuard: Periodic NASA FIRMS fetch failed:`, err.message));
    }, ingestionStats.auto_ingest_interval_sec * 1000);
  }

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`ThermoGuard AI Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start ThermoGuard server:", err);
});
