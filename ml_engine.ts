import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function getModuleDir(): string {
  try {
    if (typeof __dirname !== "undefined") {
      return __dirname;
    }
    if (typeof import.meta !== "undefined" && import.meta.url) {
      return path.dirname(fileURLToPath(import.meta.url));
    }
  } catch {
    // ignore
  }
  return process.cwd();
}

export interface MLModelArtifact {
  model_version: string;
  algorithm: string;
  classes: string[];
  feature_names: string[];
  n_estimators: number;
  trees: Array<{
    children_left: number[];
    children_right: number[];
    feature: number[];
    threshold: number[];
    value: number[][][]; // [n_nodes][1][n_classes]
  }>;
}

export interface MLPredictionResult {
  predicted_class: "Industrial Fire" | "Gas Flare" | "Agricultural Burning" | "Wildfire" | "Mining" | "Other";
  confidence: number;
  class_probabilities: Record<string, number>;
  model_version: string;
  feature_vector: Record<string, number>;
  inference_timestamp: string;
}

export interface RiskEvaluationResult {
  risk_score: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  risk_value: number;
  persistence_score: number;
  evidence: string[];
  structured_evidence: {
    thermal_intensity: string;
    geospatial_proximity: string;
    temporal_persistence: string;
    environmental_context: string;
  };
  risk_breakdown: {
    thermal_intensity_score: number;
    hazard_proximity_score: number;
    source_type_hazard_score: number;
    temporal_urgency_score: number;
  };
  risk_reasons: string[];
  explanation: string;
}

export const CANONICAL_FEATURES: string[] = [
  "brightness",
  "frp",
  "firms_confidence",
  "scan",
  "track",
  "daynight_flag",
  "distance_to_industry_km",
  "industrial_facility_count",
  "industrial_nearby_flag",
  "mining_nearby_flag",
  "infrastructure_nearby_flag",
  "forest_context",
  "agricultural_context",
  "urban_context",
  "open_land_context",
  "observation_count",
  "active_days",
  "active_duration",
  "observation_frequency",
  "recurrence_count",
  "recurrence_ratio",
  "average_revisit_interval",
  "median_revisit_interval",
  "persistence_score",
  "seasonality_score",
  "seasonal_concentration"
];

let cachedModel: MLModelArtifact | null = null;
let modelLoadError: string | null = null;

export function loadRandomForestModel(): MLModelArtifact | null {
  if (cachedModel) return cachedModel;

  const modDir = getModuleDir();
  const candidatePaths = [
    path.join(process.cwd(), "ml", "models", "random_forest_v1_trees.json"),
    path.join(modDir, "ml", "models", "random_forest_v1_trees.json"),
    path.join(modDir, "..", "ml", "models", "random_forest_v1_trees.json"),
    path.join(modDir, "random_forest_v1_trees.json")
  ];

  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf-8");
        const parsed = JSON.parse(raw) as MLModelArtifact;
        if (parsed.trees && parsed.trees.length > 0 && parsed.classes && parsed.feature_names) {
          cachedModel = parsed;
          modelLoadError = null;
          console.log(`ThermoGuard ML: Successfully loaded Random Forest model artifact (${parsed.n_estimators} trees, ${parsed.classes.length} classes) from ${p}`);
          return cachedModel;
        }
      }
    } catch (err: any) {
      console.warn(`ThermoGuard ML: Failed parsing candidate model at ${p}:`, err.message);
    }
  }

  modelLoadError = `Random Forest tree artifact not found in checked paths: ${candidatePaths.join(", ")}`;
  console.error(`ThermoGuard ML Error: ${modelLoadError}`);
  return null;
}

export function getMLModelStatus(): { online: boolean; version: string; error: string | null; n_estimators: number } {
  const model = loadRandomForestModel();
  if (model) {
    return {
      online: true,
      version: model.model_version,
      error: null,
      n_estimators: model.n_estimators
    };
  }
  return {
    online: false,
    version: "ML_UNAVAILABLE",
    error: modelLoadError,
    n_estimators: 0
  };
}

/**
 * Validates and transforms an input feature dictionary into a strict 26-element canonical vector.
 */
export function validateAndExtractFeatureVector(input: Record<string, any>): {
  vector: number[];
  featureDict: Record<string, number>;
  warnings: string[];
} {
  const warnings: string[] = [];
  const vector: number[] = [];
  const featureDict: Record<string, number> = {};

  for (const fn of CANONICAL_FEATURES) {
    let val = input[fn];
    if (val === undefined || val === null || isNaN(Number(val))) {
      // Check legacy / alias names
      if (fn === "distance_to_industry_km" && input["dist_industry_km"] !== undefined) {
        val = input["dist_industry_km"];
      } else if (fn === "active_days" && input["persistence_days"] !== undefined) {
        val = input["persistence_days"];
      } else if (fn === "active_duration" && input["persistence_days"] !== undefined) {
        val = input["persistence_days"];
      } else if (fn === "observation_frequency" && input["frequency_per_week"] !== undefined) {
        val = input["frequency_per_week"];
      } else if (fn === "daynight_flag" && typeof input["daynight"] === "string") {
        val = input["daynight"] === "N" ? 0.0 : 1.0;
      } else {
        warnings.push(`Missing feature '${fn}', using default 0.0`);
        val = 0.0;
      }
    }
    const numVal = Number(val);
    vector.push(numVal);
    featureDict[fn] = Math.round(numVal * 10000) / 10000;
  }

  return { vector, featureDict, warnings };
}

/**
 * Evaluates the trained Random Forest classifier deterministically across all decision trees.
 */
export function predictWithRandomForest(inputFeatures: Record<string, any>): MLPredictionResult {
  const model = loadRandomForestModel();
  if (!model) {
    throw new Error(`Random Forest inference unavailable: ${modelLoadError || "Model not loaded"}`);
  }

  const { vector, featureDict, warnings } = validateAndExtractFeatureVector(inputFeatures);
  if (warnings.length > 0 && warnings.length > 5) {
    console.warn(`ThermoGuard ML: Feature vector validation warnings: ${warnings.slice(0, 3).join("; ")} (+${warnings.length - 3} more)`);
  }

  const nClasses = model.classes.length;
  const nTrees = model.trees.length;
  const accumulatedProbs = new Array(nClasses).fill(0.0);

  for (let t = 0; t < nTrees; t++) {
    const tree = model.trees[t];
    let node = 0;
    while (tree.children_left[node] !== -1 && tree.children_left[node] !== undefined) {
      const fIdx = tree.feature[node];
      const thresh = tree.threshold[node];
      const sampleVal = vector[fIdx];
      if (sampleVal <= thresh) {
        node = tree.children_left[node];
      } else {
        node = tree.children_right[node];
      }
    }

    const valArray = tree.value[node][0]; // [n_classes]
    let sumVal = 0.0;
    for (let c = 0; c < nClasses; c++) {
      sumVal += valArray[c];
    }
    if (sumVal > 0) {
      for (let c = 0; c < nClasses; c++) {
        accumulatedProbs[c] += valArray[c] / sumVal;
      }
    }
  }

  const classProbabilities: Record<string, number> = {};
  let maxProb = -1.0;
  let topClassIdx = 0;

  for (let c = 0; c < nClasses; c++) {
    const avgProb = Math.round((accumulatedProbs[c] / nTrees) * 1000) / 1000;
    const clsName = model.classes[c];
    classProbabilities[clsName] = avgProb;
    if (avgProb > maxProb) {
      maxProb = avgProb;
      topClassIdx = c;
    }
  }

  const predicted_class = model.classes[topClassIdx] as MLPredictionResult["predicted_class"];

  return {
    predicted_class,
    confidence: maxProb,
    class_probabilities: classProbabilities,
    model_version: model.model_version,
    feature_vector: featureDict,
    inference_timestamp: new Date().toISOString()
  };
}

/**
 * Computes explainable evidence and operational risk scoring for a classified thermal event.
 */
export function evaluateRiskAndEvidence(
  rawEvent: { brightness: number; frp: number; confidence: number },
  geoContext: {
    nearest_industrial_facility: string;
    facility_type: string;
    distance_to_industry: number;
    land_cover: string;
    nearby_infrastructure?: string;
  },
  tempProfile: {
    observation_count: number;
    frequency_per_week: number;
    recurrence_ratio: number;
    persistence_days: number;
    is_persistent: boolean;
  },
  prediction: MLPredictionResult
): RiskEvaluationResult {
  const { predicted_class, confidence } = prediction;
  const dist = geoContext.distance_to_industry;

  // 1. Thermal Intensity Score (0 - 100)
  const frpNorm = Math.min(100, (rawEvent.frp / 150) * 100);
  const brightNorm = Math.min(100, Math.max(0, (rawEvent.brightness - 310) / 90) * 100);
  const sThermal = Math.round((0.65 * frpNorm + 0.35 * brightNorm) * 10) / 10;

  // 2. Hazard Proximity Score (0 - 100)
  let sProximity = 5;
  if (dist <= 300) sProximity = 100;
  else if (dist <= 1000) sProximity = 80;
  else if (dist <= 3000) sProximity = 50;
  else if (dist <= 10000) sProximity = 20;

  if (predicted_class === "Gas Flare") {
    sProximity = Math.round(sProximity * 0.3); // Routine controlled flaring reduces proximity alarm
  }

  // 3. Source Type Hazard Weight (0 - 100)
  const sourceHazardWeights: Record<string, number> = {
    "Industrial Fire": 95,
    "Wildfire": 75,
    "Gas Flare": 25,
    "Mining": 40,
    "Agricultural Burning": 35,
    "Other": 20
  };
  const sHazard = sourceHazardWeights[predicted_class] || 30;

  // 4. Temporal Urgency (0 - 100)
  let sTemporal = 15;
  if (tempProfile.persistence_days >= 14 || tempProfile.is_persistent) {
    sTemporal = predicted_class === "Gas Flare" ? 25 : 85;
  } else if (tempProfile.persistence_days >= 3) {
    sTemporal = 50;
  } else if (rawEvent.frp > 100) {
    sTemporal = 90; // High energy sudden outburst
  }

  // Composite Operational Risk Value (0 - 100)
  const riskValue = Math.min(
    100,
    Math.round(
      0.35 * sThermal +
      0.30 * sProximity +
      0.20 * sHazard +
      0.15 * sTemporal
    )
  );

  let riskScore: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
  if (riskValue >= 75) riskScore = "CRITICAL";
  else if (riskValue >= 50) riskScore = "HIGH";
  else if (riskValue >= 25) riskScore = "MEDIUM";

  const persistenceScore = Math.round(
    Math.min(1.0, (tempProfile.persistence_days / 60) * 0.5 + tempProfile.recurrence_ratio * 0.5) * 1000
  ) / 1000;

  // Structured Explainable Evidence Extraction
  const evidence: string[] = [];
  const riskReasons: string[] = [];

  if (dist < 1000) {
    evidence.push(`Direct industrial proximity: ${Math.round(dist)} m to ${geoContext.nearest_industrial_facility}`);
  } else if (dist < 5000) {
    evidence.push(`Industrial corridor proximity: ${(dist / 1000).toFixed(1)} km to ${geoContext.nearest_industrial_facility}`);
  }

  if (geoContext.land_cover === "dense_forest") {
    evidence.push("Canopy cover: Dense forest tract vulnerable to spread");
  } else if (geoContext.land_cover === "cropland") {
    evidence.push("Agrarian parcel: Seasonal agricultural belt");
  } else if (geoContext.land_cover === "mining_pit") {
    evidence.push("Mineral extraction basin: Surface mining operation");
  } else if (geoContext.land_cover === "industrial") {
    evidence.push("Zoning: Designated petrochemical / industrial estate");
  }

  if (rawEvent.frp >= 80) {
    evidence.push(`Elevated thermal radiation: ${rawEvent.frp.toFixed(1)} MW FRP indicates intense combustion`);
    riskReasons.push(`FRP ${rawEvent.frp.toFixed(1)} MW exceeds elevated hazard threshold`);
  } else if (rawEvent.frp >= 30) {
    evidence.push(`Moderate combustion power: ${rawEvent.frp.toFixed(1)} MW FRP`);
  }

  if (tempProfile.is_persistent || tempProfile.persistence_days > 10) {
    evidence.push(`Temporal persistence: Multi-week recurring signature (${tempProfile.persistence_days} days active)`);
  } else if (tempProfile.persistence_days <= 2) {
    evidence.push(`Temporal onset: Acute transient event (first detected within 48h)`);
  }

  if (rawEvent.confidence >= 80) {
    evidence.push(`High satellite detection confidence: ${Math.round(rawEvent.confidence)}%`);
  }

  if (evidence.length === 0) {
    evidence.push("Isolated thermal anomaly with moderate baseline parameters");
  }

  if (riskScore === "CRITICAL" || riskScore === "HIGH") {
    if (dist < 1000 && predicted_class === "Industrial Fire") {
      riskReasons.push(`Uncontrolled thermal anomaly within critical 1 km buffer of ${geoContext.nearest_industrial_facility}`);
    } else if (predicted_class === "Wildfire" && geoContext.land_cover === "dense_forest") {
      riskReasons.push("Rapid wildfire spread hazard in contiguous forest canopy");
    }
  }

  const explanation = `${predicted_class} classified with ${Math.round(confidence * 100)}% ML confidence based on ${evidence.slice(0, 2).join(" and ")}.`;

  return {
    risk_score: riskScore,
    risk_value: riskValue,
    persistence_score: persistenceScore,
    evidence,
    structured_evidence: {
      thermal_intensity: `${rawEvent.frp.toFixed(1)} MW FRP / ${rawEvent.brightness.toFixed(1)} K`,
      geospatial_proximity: dist < 50000 ? `${(dist / 1000).toFixed(1)} km to ${geoContext.nearest_industrial_facility}` : "No major industrial facility within 50 km",
      temporal_persistence: `${tempProfile.persistence_days} days (${tempProfile.observation_count} observations)`,
      environmental_context: geoContext.land_cover.replace(/_/g, " ").toUpperCase()
    },
    risk_breakdown: {
      thermal_intensity_score: sThermal,
      hazard_proximity_score: sProximity,
      source_type_hazard_score: sHazard,
      temporal_urgency_score: sTemporal
    },
    risk_reasons: riskReasons,
    explanation
  };
}
