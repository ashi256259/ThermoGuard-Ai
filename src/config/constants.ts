export const APP_CONFIG = {
  NAME: "ThermoGuard AI",
  TAGLINE: "Detect • Classify • Protect",
  HACKATHON: "Smart India Hackathon 2026",
  PS_ID: "SIH26162",
  PROBLEM_STATEMENT: "AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources Using NASA FIRMS, OSM & Satellite Data",
  ORGANISATION: "National Technical Research Organisation (NTRO)",
  PHASE: "Phase 1: Foundation & Core Architecture",
  CLASSIFIER_TECH: "Random Forest Supervised Tabular Ensemble (Non-LLM)"
};

export const SOURCE_CLASSES = [
  "Industrial Fire",
  "Gas Flare",
  "Agricultural Burning",
  "Wildfire",
  "Mining",
  "Other"
] as const;

export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
