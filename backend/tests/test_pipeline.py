import unittest
from backend.app.geospatial.geo_engine import GeospatialContextEngine
from backend.app.temporal.temporal_engine import TemporalBehaviourEngine
from backend.app.ml.feature_engineering import FeatureEngineeringPipeline
from backend.app.ml.model_inference import ThermalSourceClassifier
from backend.app.ml.risk_scorer import RiskScoringEngine
from backend.app.services.pipeline_service import HotspotAnalysisService

class TestThermoGuardPipeline(unittest.TestCase):
    def test_geospatial_distance_calculation(self):
        """Test distance calculation between Jamnagar coordinates and refinery."""
        engine = GeospatialContextEngine()
        # Coordinates slightly north of Jamnagar refinery
        res = engine.enrich_thermal_event(22.3591, 69.8652)
        self.assertEqual(res["nearest_industrial_facility"], "Jamnagar Mega Refinery Complex")
        self.assertLess(res["distance_to_industry"], 500.0)
        self.assertTrue(res["spatial_flags"]["is_industrial_zone"])
        self.assertEqual(res["land_cover"], "industrial")

    def test_temporal_persistence_calculation(self):
        """Test temporal recurrence and multi-day persistence evaluation."""
        engine = TemporalBehaviourEngine()
        # Test known persistent cluster
        prof = engine.evaluate_temporal_profile(cluster_id="cls-jamnagar-01")
        self.assertTrue(prof["is_persistent"])
        self.assertGreaterEqual(prof["persistence_days"], 60)
        self.assertGreater(prof["recurrence_ratio"], 0.80)

        # Test transient sudden onset
        prof_sudden = engine.evaluate_temporal_profile(cluster_id="cls-hazira-fire-01")
        self.assertFalse(prof_sudden["is_persistent"])
        self.assertEqual(prof_sudden["persistence_days"], 1)

    def test_feature_generation(self):
        """Test normalized feature vector generation."""
        thermal = {"brightness": 370.0, "frp": 50.0, "confidence": 95.0}
        geo = {"distance_to_industry": 200.0, "land_cover": "industrial", "facility_type": "oil_refinery"}
        temp = {"persistence_days": 45, "recurrence_ratio": 0.85, "frequency_per_week": 8.0}

        features = FeatureEngineeringPipeline.extract_features(thermal, geo, temp)
        self.assertIn("brightness", features)
        self.assertIn("frp", features)
        self.assertEqual(features["is_industrial_land"], 1.0)
        self.assertEqual(features["is_forest_land"], 0.0)
        self.assertLess(features["dist_industry_km"], 1.0)

    def test_classification_engine(self):
        """Test classification outcomes for Gas Flare vs Wildfire vs Agricultural Burning."""
        classifier = ThermalSourceClassifier()

        # Case 1: Industrial persistent -> Gas Flare
        flare_features = {
            "brightness": 365.0,
            "frp": 52.0,
            "firms_confidence": 0.95,
            "dist_industry_km": 0.15,
            "is_industrial_land": 1.0,
            "is_forest_land": 0.0,
            "is_farmland": 0.0,
            "is_mining_land": 0.0,
            "persistence_days_log": 4.2, # ~65 days
            "recurrence_ratio": 0.90,
            "observation_frequency": 10.0
        }
        pred_class, conf, probs = classifier.predict(flare_features)
        self.assertEqual(pred_class, "Gas Flare")
        self.assertGreater(conf, 0.50)

        # Case 2: Forest location -> Wildfire
        wildfire_features = {
            "brightness": 355.0,
            "frp": 95.0,
            "firms_confidence": 0.90,
            "dist_industry_km": 30.0,
            "is_industrial_land": 0.0,
            "is_forest_land": 1.0,
            "is_farmland": 0.0,
            "is_mining_land": 0.0,
            "persistence_days_log": 1.0,
            "recurrence_ratio": 0.30,
            "observation_frequency": 4.0
        }
        pred_class, conf, _ = classifier.predict(wildfire_features)
        self.assertEqual(pred_class, "Wildfire")

    def test_risk_scoring(self):
        """Test risk scoring separation from confidence and normalized weights."""
        # Verify normalized weights sum to 1.0 and preserve relative ratios
        weights = RiskScoringEngine.WEIGHTS
        self.assertAlmostEqual(sum(weights.values()), 1.0, places=5)
        self.assertAlmostEqual(weights["thermal_intensity"] / weights["hazard_proximity"], 30.0 / 25.0, places=5)
        self.assertAlmostEqual(weights["hazard_proximity"] / weights["source_hazard"], 25.0 / 25.0, places=5)
        self.assertAlmostEqual(weights["temporal_behavior"] / weights["thermal_intensity"], 12.0 / 30.0, places=5)

        # Critical risk: high FRP sudden fire in industrial perimeter
        band, val, breakdown, reasons, action = RiskScoringEngine.calculate_risk(
            predicted_class="Industrial Fire",
            frp=140.0,
            brightness=395.0,
            distance_to_industry_m=250.0,
            persistence_days=1,
            recurrence_ratio=0.05
        )
        self.assertEqual(band, "CRITICAL")
        self.assertGreaterEqual(val, 85.0)
        self.assertIn("thermal_intensity_score", breakdown)
        self.assertIn("hazard_proximity_score", breakdown)
        self.assertIn("source_type_hazard_score", breakdown)
        self.assertIn("temporal_urgency_score", breakdown)
        self.assertNotIn("infrastructure_hazard_score", breakdown)

        # Low risk: routine controlled gas flare
        band_flare, val_flare, _, reasons_flare, _ = RiskScoringEngine.calculate_risk(
            predicted_class="Gas Flare",
            frp=45.0,
            brightness=360.0,
            distance_to_industry_m=120.0,
            persistence_days=60,
            recurrence_ratio=0.90
        )
        self.assertEqual(band_flare, "LOW")
        self.assertLess(val_flare, 35.0)

    def test_end_to_end_pipeline_service(self):
        """Test full analysis service pipeline on realistic event."""
        service = HotspotAnalysisService()
        event = {
            "id": "test-ev-01",
            "latitude": 22.3591,
            "longitude": 69.8652,
            "brightness": 368.5,
            "frp": 54.2,
            "confidence": 94.0,
            "satellite": "VIIRS_SNPP"
        }
        result = service.process_hotspot(event, cluster_id="cls-jamnagar-01")
        self.assertEqual(result["classification"]["predicted_class"], "Gas Flare")
        self.assertGreaterEqual(len(result["classification"]["evidence"]), 3)
        self.assertEqual(result["geo_context"]["nearest_industrial_facility"], "Jamnagar Mega Refinery Complex")

if __name__ == "__main__":
    unittest.main()
