"""
ThermoGuard AI - scikit-learn Random Forest Inference Engine
Smart India Hackathon 2026 | NTRO PS ID: SIH26162

Real, reproducible scikit-learn model inference for thermal source attribution.
Loads the serialized Random Forest classifier and computes:
- Predicted source class (one of 6 approved classes)
- Statistical model confidence (max class probability)
- Complete class probability distribution
- Feature importances and audit metadata
"""

import os
import sys
import json
import logging
from typing import Dict, Any, Tuple, List, Optional

import joblib
import numpy as np

# Ensure workspace root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))
sys.path.insert(0, os.path.abspath("."))

from backend.app.core.config import settings
from backend.app.ml.feature_engineering import FeatureEngineeringPipeline

logger = logging.getLogger("thermoguard.ml.inference")


class ThermalSourceClassifier:
    """
    scikit-learn Random Forest Classifier for Thermal Anomaly Source Attribution.
    Replaces heuristic voting logic with trained ensemble decision trees.
    """

    MODEL_VERSION = "random_forest_v1.0.0"
    CLASSES = FeatureEngineeringPipeline.TARGET_CLASSES
    FEATURE_NAMES = FeatureEngineeringPipeline.FEATURE_NAMES

    def __init__(
        self,
        model_path: Optional[str] = None,
        metadata_path: Optional[str] = None
    ):
        self.model_path = model_path or settings.MODEL_PATH
        self.metadata_path = metadata_path or settings.MODEL_METADATA_PATH
        self.version = self.MODEL_VERSION
        self.model = None
        self.metadata: Dict[str, Any] = {}

        self._load_or_initialize_model()

    def _load_or_initialize_model(self) -> None:
        """
        Loads serialized joblib model from disk.
        If model artifact does not exist (e.g. initial deployment), runs the
        canonical training pipeline to generate and persist it automatically.
        """
        # Resolve potential relative paths
        candidate_paths = [
            self.model_path,
            os.path.join(os.getcwd(), self.model_path),
            os.path.join(os.getcwd(), "ml/models/random_forest_v1.joblib"),
            "ml/models/random_forest_v1.joblib"
        ]

        loaded = False
        for p in candidate_paths:
            if p and os.path.exists(p):
                try:
                    self.model = joblib.load(p)
                    self.model_path = p
                    loaded = True
                    logger.info(f"Loaded trained RandomForestClassifier from {p}")
                    break
                except Exception as e:
                    logger.warning(f"Failed loading model from {p}: {e}")

        # If not loaded from disk, train on demand
        if not loaded or self.model is None:
            logger.warning("No persisted model artifact found on disk. Initiating training pipeline...")
            try:
                from ml.training.model_training import ModelTrainer
                trainer = ModelTrainer(
                    model_path=self.model_path if self.model_path.endswith(".joblib") else "ml/models/random_forest_v1.joblib",
                    metadata_path=self.metadata_path if self.metadata_path.endswith(".json") else "ml/models/model_metadata.json"
                )
                self.metadata = trainer.run_training_pipeline()
                self.model = trainer.model
                self.model_path = trainer.model_path
                self.metadata_path = trainer.metadata_path
                loaded = True
                logger.info("Successfully trained and initialized new RandomForestClassifier.")
            except Exception as e:
                logger.error(f"Failed to auto-train model: {e}")
                # Create a bare-bones baseline model to guarantee execution safety
                from sklearn.ensemble import RandomForestClassifier
                self.model = RandomForestClassifier(n_estimators=10, random_state=42)
                # Seed with minimal synthetic baseline
                X_dummy = np.zeros((len(self.CLASSES), len(self.FEATURE_NAMES)))
                y_dummy = np.array(self.CLASSES)
                self.model.fit(X_dummy, y_dummy)

        # Load metadata if available
        candidate_meta = [
            self.metadata_path,
            os.path.join(os.getcwd(), self.metadata_path),
            os.path.join(os.getcwd(), "ml/models/model_metadata.json"),
            "ml/models/model_metadata.json"
        ]
        for mp in candidate_meta:
            if mp and os.path.exists(mp):
                try:
                    with open(mp, "r") as f:
                        self.metadata = json.load(f)
                    self.version = self.metadata.get("model_version", self.MODEL_VERSION)
                    break
                except Exception:
                    pass

    def predict(self, features: Dict[str, Any]) -> Tuple[str, float, Dict[str, float]]:
        """
        Runs scikit-learn Random Forest inference.
        Accepts:
            features: Dictionary containing thermal, geospatial, and temporal attributes.
        Returns:
            predicted_class (str): One of the 6 approved classes.
            confidence (float): Statistical probability of predicted class (0.0 to 1.0).
            class_probabilities (Dict[str, float]): Normalized probabilities across all classes.
        """
        # Convert dictionary to canonical feature vector conforming to FEATURE_NAMES
        vector = FeatureEngineeringPipeline.dict_to_feature_vector(features)
        return self.predict_vector(vector)

    def predict_vector(self, vector: List[float]) -> Tuple[str, float, Dict[str, float]]:
        """
        Performs inference directly on a canonical feature vector.
        """
        if self.model is None:
            self._load_or_initialize_model()

        import pandas as pd
        X = pd.DataFrame([vector], columns=self.FEATURE_NAMES)

        # 1. Predict class
        predicted_arr = self.model.predict(X)
        predicted_class = str(predicted_arr[0])

        # 2. Predict probability distribution across classes
        proba_arr = self.model.predict_proba(X)[0]
        model_classes = list(self.model.classes_)

        # Build dictionary covering all 6 approved classes
        probabilities: Dict[str, float] = {c: 0.0 for c in self.CLASSES}
        for cls_name, prob in zip(model_classes, proba_arr):
            if cls_name in probabilities:
                probabilities[cls_name] = round(float(prob), 4)

        # Re-normalize if needed
        total_p = sum(probabilities.values())
        if total_p > 0.0:
            probabilities = {k: round(v / total_p, 4) for k, v in probabilities.items()}

        # Model confidence is the maximum class probability
        confidence = float(np.max(proba_arr)) if len(proba_arr) > 0 else 0.50
        confidence = round(max(0.0, min(1.0, confidence)), 4)

        return predicted_class, confidence, probabilities

    def get_feature_importances(self) -> Dict[str, float]:
        """
        Returns actual feature importances calculated from the fitted Random Forest trees.
        """
        if self.model is None or not hasattr(self.model, "feature_importances_"):
            return {feat: 0.0 for feat in self.FEATURE_NAMES}

        importances = self.model.feature_importances_
        return {
            name: round(float(imp), 4)
            for name, imp in sorted(zip(self.FEATURE_NAMES, importances), key=lambda x: x[1], reverse=True)
        }

    def get_top_features_for_vector(
        self,
        features: Dict[str, float],
        top_n: int = 6
    ) -> List[Dict[str, Any]]:
        """
        Returns top features by global model importance along with their specific
        measured values in this event.
        """
        descriptions = {
            "dist_industry_m": "Distance to nearest industrial facility (meters)",
            "is_within_300m_industry": "Direct co-location in industrial perimeter (<300m)",
            "is_within_1000m_industry": "Industrial proximity zone (<1000m)",
            "land_cover_industrial": "Designated industrial land-use zoning",
            "land_cover_dense_forest": "Dense forest reserve canopy",
            "land_cover_cropland": "Agricultural cultivated cropland parcel",
            "land_cover_mining_pit": "Open-cast mining concession or coal spoil pit",
            "persistence_days": "Total historical observation duration (days)",
            "recurrence_ratio": "Orbital revisit detection recurrence ratio",
            "observation_count": "Total multi-temporal satellite detections",
            "is_persistent": "Multi-temporal persistence flag (>=14 days)",
            "frp": "Fire Radiative Power (MW)",
            "brightness": "Brightness temperature (Kelvin)",
            "confidence": "Satellite spectral detection confidence (%)",
            "facilities_within_10km": "Industrial facilities within 10 km corridor",
            "frequency_per_week": "Observation detection frequency per week",
            "seasonal_stubble_burning": "Post-harvest agricultural burning season",
            "seasonal_forest_fire": "Dry-season wildfire susceptibility window"
        }
        importances = self.get_feature_importances()
        sorted_feats = sorted(importances.items(), key=lambda x: x[1], reverse=True)
        top = []
        for feat_name, imp in sorted_feats[:top_n]:
            val = features.get(feat_name)
            top.append({
                "feature": feat_name,
                "importance": round(imp, 4),
                "value": round(float(val), 2) if val is not None else None,
                "description": descriptions.get(feat_name, feat_name.replace("_", " ").title())
            })
        return top

    def get_model_metadata(self) -> Dict[str, Any]:
        """
        Returns full audit metadata, including hyperparameters, evaluation metrics,
        and dataset provenance notice.
        """
        if not self.metadata:
            self.metadata = {
                "model_version": self.version,
                "algorithm": "RandomForestClassifier",
                "framework": "scikit-learn",
                "target_classes": self.CLASSES,
                "feature_count": len(self.FEATURE_NAMES),
                "feature_names": self.FEATURE_NAMES,
                "feature_importances": self.get_feature_importances(),
                "dataset_info": {
                    "is_development_demo_data": True,
                    "limitation_notice": "Curated development baseline for SIH26162."
                }
            }
        return self.metadata
