import unittest
from datetime import datetime
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.core.config import settings
from backend.app.data_providers.firms_provider import DemoFIRMSProvider, RealFIRMSProvider
from backend.app.data_providers.osm_provider import DemoOSMProvider
from backend.app.data_providers.landcover_provider import DemoLandCoverProvider
from backend.app.models.models import (
    Base,
    IndustrialFacility,
    ThermalEvent,
    GeoContext,
    TemporalProfile,
    Classification,
    Alert
)

class TestThermoGuardFoundation(unittest.TestCase):
    """
    Phase 1 Foundation Test Suite:
    - FastAPI Health Check & Contract Validation
    - Environment Configuration Defaults
    - Demo Data Providers & Integrity
    - PostgreSQL/PostGIS SQLAlchemy Model Declarations
    - Basic API Routes
    """

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_fastapi_health_endpoint(self):
        """Verify GET /api/health returns status 'ok', service name, and version '0.1.0'."""
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["service"], "ThermoGuard AI")
        self.assertEqual(data["version"], "0.1.0")
        self.assertIn("data_provider_mode", data)

    def test_configuration(self):
        """Verify settings adhere to SIH26162 problem statement parameters."""
        self.assertEqual(settings.PROJECT_NAME, "ThermoGuard AI")
        self.assertEqual(settings.TAGLINE, "Detect • Classify • Protect")
        self.assertEqual(settings.VERSION, "0.1.0")
        self.assertIn("SIH26162", settings.SIH_PROBLEM_STATEMENT)
        self.assertIn("NTRO", settings.ORGANISATION)
        self.assertEqual(settings.DATA_MODE, "DEMO")
        self.assertTrue(len(settings.DATABASE_URL) > 0)

    def test_demo_firms_provider(self):
        """Verify DemoFIRMSProvider returns deterministic demo observations and explicit DEMO metadata."""
        provider = DemoFIRMSProvider()
        status = provider.get_provider_status()
        self.assertEqual(status["provider"], "DemoFIRMSProvider")
        self.assertEqual(status["mode"], "DEMO_SAMPLE_DATA")
        self.assertFalse(status["live_key_configured"])
        self.assertIn("DEMO DATA ONLY", status["notice"])

        hotspots = provider.fetch_hotspots()
        self.assertGreaterEqual(len(hotspots), 4)

        # Verify attributes on first hotspot
        h0 = hotspots[0]
        self.assertIn("id", h0)
        self.assertIn("latitude", h0)
        self.assertIn("longitude", h0)
        self.assertIn("brightness", h0)
        self.assertIn("frp", h0)
        self.assertIn("confidence", h0)
        self.assertIn("satellite", h0)
        self.assertEqual(h0["source"], "DEMO_DATA_FIRMS")

    def test_real_firms_provider_guard(self):
        """Verify RealFIRMSProvider prevents unauthenticated live calls in Phase 1 without keys."""
        real_provider = RealFIRMSProvider(api_key="")
        status = real_provider.get_provider_status()
        self.assertEqual(status["mode"], "UNCONFIGURED")
        with self.assertRaises(ValueError):
            real_provider.fetch_hotspots()

    def test_database_model_imports_and_schema(self):
        """Verify SQLAlchemy model classes define proper table names and columns."""
        self.assertEqual(IndustrialFacility.__tablename__, "industrial_facilities")
        self.assertEqual(ThermalEvent.__tablename__, "thermal_events")
        self.assertEqual(GeoContext.__tablename__, "geo_context")
        self.assertEqual(TemporalProfile.__tablename__, "temporal_profiles")
        self.assertEqual(Classification.__tablename__, "classifications")
        self.assertEqual(Alert.__tablename__, "alerts")

        # Verify required columns exist on ThermalEvent
        te_cols = {c.name for c in ThermalEvent.__table__.columns}
        for col in ["id", "latitude", "longitude", "timestamp", "brightness", "frp", "confidence", "satellite", "source", "geometry"]:
            self.assertIn(col, te_cols)

        # Verify required columns exist on GeoContext
        gc_cols = {c.name for c in GeoContext.__table__.columns}
        for col in ["event_id", "nearest_facility_id", "distance_to_facility", "land_cover", "nearby_infrastructure", "nearby_road"]:
            self.assertIn(col, gc_cols)

        # Verify required columns exist on TemporalProfile
        tp_cols = {c.name for c in TemporalProfile.__table__.columns}
        for col in ["cluster_id", "observation_count", "frequency", "recurrence", "persistence_days", "seasonal_information"]:
            self.assertIn(col, tp_cols)

        # Verify required columns exist on Classification
        cls_cols = {c.name for c in Classification.__table__.columns}
        for col in ["event_id", "predicted_class", "confidence", "risk_score", "persistence_score", "evidence", "model_version"]:
            self.assertIn(col, cls_cols)

        # Verify required columns exist on Alert
        alt_cols = {c.name for c in Alert.__table__.columns}
        for col in ["event_id", "severity", "status", "created_at", "message"]:
            self.assertIn(col, alt_cols)

    def test_basic_api_responses(self):
        """Verify core REST endpoints return expected schemas and status codes."""
        # Hotspots list
        res_hotspots = self.client.get("/api/hotspots")
        self.assertEqual(res_hotspots.status_code, 200)
        hotspots_list = res_hotspots.json()
        self.assertIsInstance(hotspots_list, list)
        self.assertGreater(len(hotspots_list), 0)

        # Statistics
        res_stats = self.client.get("/api/statistics")
        self.assertEqual(res_stats.status_code, 200)
        stats = res_stats.json()
        self.assertIn("total_hotspots", stats)
        self.assertIn("high_risk_count", stats)
        self.assertIn("persistent_sources", stats)
        self.assertIn("industrial_sources", stats)
        self.assertIn("wildfires", stats)

        # Filters
        res_filters = self.client.get("/api/filters")
        self.assertEqual(res_filters.status_code, 200)
        filters = res_filters.json()
        self.assertIn("classes", filters)
        self.assertIn("risk_levels", filters)
        self.assertIn("regions", filters)

if __name__ == "__main__":
    unittest.main()
