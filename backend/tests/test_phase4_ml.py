"""
ThermoGuard AI - Phase 4 ML Pipeline Verification Tests
Smart India Hackathon 2026 | NTRO Problem Statement: SIH26162

Tests:
1. Canonical Feature Schema & Deterministic Vector Extraction
2. scikit-learn Model Persistence & Metadata
3. Real Model Inference (predict & predict_proba)
4. Multi-class Probability Distribution & Calibration
5. Feature Importances (Gini Impurity from fitted trees)
6. FastAPI ML Endpoints (/api/ml/model-info & /api/ml/predict)
"""

import os
import json
import unittest
import joblib
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.ml.feature_engineering import FeatureEngineeringPipeline
from backend.app.ml.model_inference import ThermalSourceClassifier
from backend.app.core.config import settings


class TestPhase4MLPipeline(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.classifier = ThermalSourceClassifier()

    def test_canonical_feature_schema(self):
        """Verify canonical 26 features and deterministic ordering."""
        features = FeatureEngineeringPipeline.FEATURE_NAMES
        self.assertEqual(len(features), 26)
        self.assertIn("brightness", features)
        self.assertIn("frp", features)
        self.assertIn("distance_to_industry_km", features)
        self.assertIn("recurrence_ratio", features)
        self.assertIn("persistence_score", features)
        self.assertIn("seasonality_score", features)

    def test_dict_to_feature_vector_deterministic(self):
        """Verify that dict_to_feature_vector produces identical ordered vectors."""
        sample_dict = {
            "brightness": 365.2,
            "frp": 60.5,
            "firms_confidence": 0.92,
            "dist_industry_km": 0.25,  # Alias
            "is_industrial_land": 1.0,
            "persistence_days": 40.0,
            "recurrence_ratio": 0.88,
            "observation_frequency": 8.0
        }
        vec1 = FeatureEngineeringPipeline.dict_to_feature_vector(sample_dict)
        vec2 = FeatureEngineeringPipeline.dict_to_feature_vector(sample_dict)
        self.assertEqual(len(vec1), 26)
        self.assertEqual(vec1, vec2)
        # Verify alias resolution
        idx_dist = FeatureEngineeringPipeline.FEATURE_NAMES.index("distance_to_industry_km")
        self.assertEqual(vec1[idx_dist], 0.25)
        # Verify intelligent derivation of persistence_score
        idx_persist = FeatureEngineeringPipeline.FEATURE_NAMES.index("persistence_score")
        self.assertAlmostEqual(vec1[idx_persist], min(1.0, 40.0 / 60.0), places=2)

    def test_missing_feature_imputation(self):
        """Verify deterministic fallback when optional features are missing."""
        minimal_dict = {"brightness": 340.0, "frp": 25.0}
        vector = FeatureEngineeringPipeline.dict_to_feature_vector(minimal_dict)
        self.assertEqual(len(vector), 26)
        # Should not raise exception or contain NaN
        for val in vector:
            self.assertIsInstance(val, float)
            self.assertFalse(val != val)  # Not NaN

    def test_model_artifact_persistence(self):
        """Verify saved joblib model artifact and JSON audit metadata."""
        model_path = settings.MODEL_PATH
        meta_path = settings.MODEL_METADATA_PATH

        self.assertTrue(os.path.exists(model_path), f"Model file not found at {model_path}")
        self.assertTrue(os.path.exists(meta_path), f"Metadata file not found at {meta_path}")

        # Test joblib can load model directly
        loaded_model = joblib.load(model_path)
        self.assertTrue(hasattr(loaded_model, "predict"))
        self.assertTrue(hasattr(loaded_model, "predict_proba"))
        self.assertTrue(hasattr(loaded_model, "feature_importances_"))

        # Test metadata integrity
        with open(meta_path, "r") as f:
            meta = json.load(f)

        self.assertEqual(meta["algorithm"], "RandomForestClassifier")
        self.assertEqual(meta["framework"], "scikit-learn")
        self.assertEqual(len(meta["target_classes"]), 6)
        self.assertIn("evaluation_metrics", meta)
        self.assertIn("accuracy", meta["evaluation_metrics"])
        self.assertIn("dataset_info", meta)
        self.assertTrue(meta["dataset_info"]["is_development_demo_data"])

    def test_real_feature_importances(self):
        """Verify feature importances are calculated and sum to approximately 1.0."""
        importances = self.classifier.get_feature_importances()
        self.assertEqual(len(importances), 26)
        total_imp = sum(importances.values())
        self.assertAlmostEqual(total_imp, 1.0, places=2)
        # Top features should have meaningful positive importance
        top_feature = max(importances, key=importances.get)
        self.assertGreater(importances[top_feature], 0.03)

    def test_classification_gas_flare(self):
        """Test refinery gas flare attribution (high persistence + industrial proximity)."""
        flare_features = {
            "brightness": 365.0,
            "frp": 48.0,
            "firms_confidence": 0.95,
            "distance_to_industry_km": 0.12,
            "industrial_nearby_flag": 1.0,
            "industrial_facility_count": 4.0,
            "forest_context": 0.0,
            "agricultural_context": 0.0,
            "mining_nearby_flag": 0.0,
            "persistence_score": 0.85,
            "active_days": 80.0,
            "active_duration": 80.0,
            "recurrence_ratio": 0.92,
            "recurrence_count": 14.0,
            "observation_frequency": 11.0,
            "average_revisit_interval": 14.0,
            "median_revisit_interval": 14.0,
            "seasonality_score": 0.10,
            "seasonal_concentration": 0.20
        }
        pred_class, conf, probs = self.classifier.predict(flare_features)
        self.assertEqual(pred_class, "Gas Flare")
        self.assertGreater(conf, 0.50)
        self.assertEqual(set(probs.keys()), set(self.classifier.CLASSES))
        self.assertAlmostEqual(sum(probs.values()), 1.0, places=2)

    def test_classification_wildfire(self):
        """Test forest canopy wildfire attribution."""
        wildfire_features = {
            "brightness": 365.0,
            "frp": 120.0,
            "firms_confidence": 0.92,
            "distance_to_industry_km": 35.0,
            "industrial_nearby_flag": 0.0,
            "industrial_facility_count": 0.0,
            "forest_context": 1.0,
            "agricultural_context": 0.0,
            "mining_nearby_flag": 0.0,
            "persistence_score": 0.10,
            "active_days": 5.0,
            "active_duration": 5.0,
            "recurrence_ratio": 0.35,
            "recurrence_count": 3.0,
            "observation_frequency": 4.0,
            "average_revisit_interval": 12.0,
            "median_revisit_interval": 12.0,
            "seasonality_score": 0.55,
            "seasonal_concentration": 0.60
        }
        pred_class, conf, probs = self.classifier.predict(wildfire_features)
        self.assertEqual(pred_class, "Wildfire")
        self.assertGreater(conf, 0.50)

    def test_classification_agricultural_burning(self):
        """Test agricultural crop residue burning attribution."""
        agri_features = {
            "brightness": 328.0,
            "frp": 24.0,
            "firms_confidence": 0.88,
            "distance_to_industry_km": 28.0,
            "industrial_nearby_flag": 0.0,
            "industrial_facility_count": 0.0,
            "forest_context": 0.0,
            "agricultural_context": 1.0,
            "mining_nearby_flag": 0.0,
            "persistence_score": 0.03,
            "active_days": 2.0,
            "active_duration": 2.0,
            "recurrence_ratio": 0.10,
            "recurrence_count": 1.0,
            "observation_frequency": 1.5,
            "average_revisit_interval": 28.0,
            "median_revisit_interval": 26.0,
            "seasonality_score": 0.85,
            "seasonal_concentration": 0.85
        }
        pred_class, conf, probs = self.classifier.predict(agri_features)
        self.assertEqual(pred_class, "Agricultural Burning")
        self.assertGreater(conf, 0.50)

    def test_api_model_info_endpoint(self):
        """Test GET /api/ml/model-info endpoint."""
        response = self.client.get("/api/ml/model-info")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["algorithm"], "RandomForestClassifier")
        self.assertEqual(data["framework"], "scikit-learn")
        self.assertEqual(len(data["target_classes"]), 6)
        self.assertIn("feature_importances", data)
        self.assertIn("evaluation_metrics", data)
        self.assertIn("accuracy", data["evaluation_metrics"])
        self.assertIn("dataset_info", data)

    def test_api_predict_endpoint(self):
        """Test POST /api/ml/predict direct feature inference endpoint."""
        payload = {
            "brightness": 365.0,
            "frp": 48.0,
            "firms_confidence": 0.95,
            "distance_to_industry_km": 0.12,
            "industrial_nearby_flag": 1.0,
            "forest_context": 0.0,
            "agricultural_context": 0.0,
            "active_days": 80.0,
            "recurrence_ratio": 0.92,
            "observation_frequency": 11.0
        }
        response = self.client.post("/api/ml/predict", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("predicted_class", data)
        self.assertIn("confidence", data)
        self.assertIn("class_probabilities", data)
        self.assertEqual(len(data["class_probabilities"]), 6)
        self.assertEqual(data["model_version"], "random_forest_v1.0.0")


if __name__ == "__main__":
    unittest.main()
