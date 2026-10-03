import unittest
import math
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.core.config import settings
from backend.app.temporal.temporal_engine import (
    haversine_distance_km,
    group_events_spatiotemporal,
    TemporalIntelligenceEngine
)
from backend.app.services.ingestion_service import IngestionService

class TestPhase3TemporalIntelligenceEngine(unittest.TestCase):
    """
    Automated Test Suite for Phase 3: Temporal Intelligence Engine (SIH26162).
    Validates:
    - Great-circle distance calculations & spatial-temporal grouping
    - Observation frequency, active/inactive days, and density
    - Multi-temporal persistence scoring and class categorization
    - High-FRP sudden event persistence suppression (single event != persistent)
    - Revisit intervals (mean, median, min, max, single-pass None handling)
    - Recurrence count and recurrence ratio across monitoring periods
    - Statistical seasonality concentration and pattern classification
    - 11 structured ML-ready temporal features
    - FastAPI /timeline and /temporal-profile REST endpoints
    """

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.engine = TemporalIntelligenceEngine()
        cls.service = IngestionService()

    def test_haversine_distance_km(self):
        """Validates great-circle distance calculation between known geographic coordinates."""
        # Jamnagar refinery to coordinates ~1.11 km north
        d = haversine_distance_km(22.3591, 69.8652, 22.3691, 69.8652)
        self.assertAlmostEqual(d, 1.11, delta=0.05)

        # Identical point distance must be 0
        d_zero = haversine_distance_km(22.3591, 69.8652, 22.3591, 69.8652)
        self.assertEqual(d_zero, 0.0)

    def test_spatiotemporal_grouping(self):
        """Validates grouping of observations within spatial radius and temporal window."""
        t0 = datetime(2026, 9, 3, 10, 0, tzinfo=timezone.utc)
        events = [
            # Two points near Jamnagar (~200m apart)
            {"id": "e1", "latitude": 22.3591, "longitude": 69.8652, "timestamp": t0.isoformat()},
            {"id": "e2", "latitude": 22.3595, "longitude": 69.8655, "timestamp": (t0 + timedelta(hours=6)).isoformat()},
            # One distant point in Punjab
            {"id": "e3", "latitude": 30.2451, "longitude": 75.8341, "timestamp": (t0 + timedelta(hours=2)).isoformat()},
        ]

        clusters = group_events_spatiotemporal(events, radius_km=1.2, window_hours=24.0)
        self.assertEqual(len(clusters), 2)
        # Find the cluster with 2 items
        cluster_sizes = [len(c) for c in clusters.values()]
        self.assertIn(2, cluster_sizes)
        self.assertIn(1, cluster_sizes)

    def test_single_observation_transient(self):
        """Single observation must be classified as TRANSIENT with None revisit intervals."""
        t_now = datetime(2026, 9, 3, 12, 0, tzinfo=timezone.utc)
        single_obs = [{
            "timestamp": t_now.isoformat(),
            "frp": 35.0,
            "brightness": 340.0,
            "latitude": 26.8920,
            "longitude": 75.8140
        }]

        prof = self.engine.analyze_temporal_profile(single_obs, cluster_id="cls-single-test")
        self.assertEqual(prof["observation_count"], 1)
        self.assertEqual(prof["active_days"], 1)
        self.assertEqual(prof["active_duration_days"], 0.0)
        self.assertEqual(prof["persistence_days"], 1)
        self.assertEqual(prof["persistence_class"], "TRANSIENT")
        self.assertFalse(prof["is_persistent"])
        self.assertIsNone(prof["average_revisit_hours"])
        self.assertIsNone(prof["median_revisit_hours"])
        self.assertEqual(prof["recurrence_count"], 0)
        self.assertEqual(prof["recurrence_ratio"], 0.0)
        self.assertEqual(prof["seasonal_pattern"], "INSUFFICIENT_DATA")

    def test_sudden_onset_high_frp_is_not_persistent(self):
        """A sudden high-FRP fire (Hazira chemical plant) must NOT be marked persistent."""
        prof = self.engine.evaluate_temporal_profile(cluster_id="cls-hazira-fire-01")
        self.assertEqual(prof["observation_count"], 2)
        self.assertEqual(prof["persistence_class"], "TRANSIENT")
        self.assertFalse(prof["is_persistent"])
        self.assertLess(prof["persistence_score"], 0.20)
        self.assertLessEqual(prof["persistence_days"], 1)
        # Revisit between the two passes is ~2.75 hours
        self.assertIsNotNone(prof["average_revisit_hours"])
        self.assertAlmostEqual(prof["average_revisit_hours"], 2.75, delta=0.1)

    def test_long_term_industrial_flaring_persistence(self):
        """Jamnagar continuous flare stack observations must be classified as PERSISTENT."""
        prof = self.engine.evaluate_temporal_profile(cluster_id="cls-jamnagar-01")
        self.assertTrue(prof["is_persistent"])
        self.assertEqual(prof["persistence_class"], "PERSISTENT")
        self.assertGreaterEqual(prof["observation_count"], 30)
        self.assertGreaterEqual(prof["persistence_days"], 60)
        self.assertGreaterEqual(prof["persistence_score"], 0.60)
        self.assertGreater(prof["recurrence_ratio"], 0.80)
        self.assertEqual(prof["seasonal_pattern"], "year_round")
        # Revisit interval for regular polar LEO passes
        self.assertIsNotNone(prof["average_revisit_hours"])
        self.assertGreater(prof["average_revisit_hours"], 20.0)
        self.assertLess(prof["average_revisit_hours"], 60.0)

    def test_seasonality_insufficient_data(self):
        """Fewer than 5 observations or <14 days span must return INSUFFICIENT_DATA."""
        t0 = datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc)
        obs_short = [
            {"timestamp": (t0 + timedelta(hours=i * 12)).isoformat(), "frp": 25.0, "brightness": 330.0}
            for i in range(4)
        ]
        prof = self.engine.analyze_temporal_profile(obs_short, cluster_id="cls-short-test")
        self.assertEqual(prof["seasonal_pattern"], "INSUFFICIENT_DATA")
        self.assertEqual(prof["seasonality_score"], 0.0)
        self.assertFalse(prof["seasonality_flag"])

    def test_seasonality_autumn_harvest_concentration(self):
        """Observations concentrated in October/November harvest window must show high concentration."""
        obs_harvest = []
        # 12 observations concentrated in late October and early November
        t_base = datetime(2025, 10, 25, 10, 0, tzinfo=timezone.utc)
        for i in range(12):
            t = t_base + timedelta(days=i * 1.5)
            obs_harvest.append({
                "timestamp": t.isoformat(),
                "frp": 28.0,
                "brightness": 332.0,
                "latitude": 30.2451,
                "longitude": 75.8341
            })

        prof = self.engine.analyze_temporal_profile(obs_harvest, cluster_id="cls-agri-harvest-test")
        self.assertGreaterEqual(prof["seasonality_score"], 0.60)
        self.assertTrue(prof["seasonality_flag"])
        self.assertEqual(prof["seasonal_pattern"], "autumn_harvest")
        self.assertIn(prof["peak_month"], [10, 11])

    def test_ml_features_structure_and_completeness(self):
        """ML feature vector must contain all 11 required numeric features without NaNs or infinities."""
        prof = self.engine.evaluate_temporal_profile(cluster_id="cls-jamnagar-01")
        ml_feats = prof["ml_features"]

        expected_keys = [
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
        ]

        for k in expected_keys:
            self.assertIn(k, ml_feats, f"Missing ML feature: {k}")
            val = ml_feats[k]
            self.assertIsInstance(val, (int, float), f"Feature {k} must be float/int")
            self.assertFalse(math.isnan(val), f"Feature {k} must not be NaN")
            self.assertFalse(math.isinf(val), f"Feature {k} must not be infinite")

    def test_api_hotspot_timeline_endpoint(self):
        """GET /api/hotspots/{id}/timeline returns 200 with chronological history and profile."""
        # Query Jamnagar scenario event
        res = self.client.get("/api/hotspots/te-scen-a1/timeline")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["event_id"], "te-scen-a1")
        self.assertIn("temporal_profile", data)
        self.assertIn("observation_history", data)
        self.assertGreater(len(data["observation_history"]), 1)

        # Check chronological ordering
        history = data["observation_history"]
        for i in range(len(history) - 1):
            t_curr = datetime.fromisoformat(history[i]["timestamp"].replace("Z", "+00:00"))
            t_next = datetime.fromisoformat(history[i + 1]["timestamp"].replace("Z", "+00:00"))
            self.assertLessEqual(t_curr, t_next)

    def test_api_hotspot_temporal_profile_endpoint(self):
        """GET /api/hotspots/{id}/temporal-profile returns 200 with deep temporal metrics."""
        res = self.client.get("/api/hotspots/te-scen-a1/temporal-profile")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["event_id"], "te-scen-a1")
        prof = data["temporal_profile"]
        self.assertIn("persistence_class", prof)
        self.assertIn("persistence_score", prof)
        self.assertIn("average_revisit_hours", prof)
        self.assertIn("recurrence_ratio", prof)
        self.assertIn("ml_features", prof)

    def test_api_timeline_not_found(self):
        """Non-existent hotspot ID must return 404."""
        res = self.client.get("/api/hotspots/non-existent-id-999/timeline")
        self.assertEqual(res.status_code, 404)

if __name__ == "__main__":
    unittest.main()
