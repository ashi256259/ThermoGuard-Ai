import unittest
from datetime import datetime, timezone
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.data_providers.firms_provider import (
    validate_and_normalize_firms_record,
    deduplicate_firms_records,
    DemoFIRMSProvider,
    RealFIRMSProvider
)
from backend.app.data_providers.osm_provider import DemoOSMProvider, haversine_distance
from backend.app.data_providers.landcover_provider import DemoLandCoverProvider
from backend.app.geospatial.geo_engine import GeospatialContextEngine
from backend.app.services.ingestion_service import IngestionService

class TestPhase2IngestionAndGeospatial(unittest.TestCase):
    """
    Automated Test Suite for Phase 2:
    - FIRMS validation and boundary checks
    - Space-time deduplication
    - Geospatial proximity and OSM facility joins
    - Multi-spectral land cover contextualization
    - End-to-end ingestion pipeline execution
    - FastAPI ingestion and provider status endpoints
    """

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.service = IngestionService()

    def test_firms_validation_valid_record(self):
        """Valid FIRMS record must be accepted and normalized."""
        raw = {
            "latitude": 22.3591,
            "longitude": 69.8652,
            "acq_date": "2026-09-03",
            "acq_time": "1430",
            "brightness": 365.2,
            "frp": 48.5,
            "confidence": "high",
            "satellite": "VIIRS_SNPP",
            "daynight": "D"
        }
        normalized, err = validate_and_normalize_firms_record(raw)
        self.assertIsNone(err)
        self.assertIsNotNone(normalized)
        self.assertEqual(normalized["latitude"], 22.3591)
        self.assertEqual(normalized["longitude"], 69.8652)
        self.assertEqual(normalized["brightness"], 365.2)
        self.assertEqual(normalized["frp"], 48.5)
        self.assertEqual(normalized["confidence"], 90.0) # 'high' maps to 90.0
        self.assertEqual(normalized["satellite"], "VIIRS_SNPP")
        self.assertEqual(normalized["daynight"], "D")

    def test_firms_validation_invalid_coordinates(self):
        """Records with coordinates out of bounds [-90..90, -180..180] must be rejected."""
        # Latitude > 90
        raw_invalid_lat = {"latitude": 94.5, "longitude": 75.0, "brightness": 340.0, "frp": 10.0}
        norm, err = validate_and_normalize_firms_record(raw_invalid_lat)
        self.assertIsNone(norm)
        self.assertIn("out of geographic bounds", err)

        # Longitude < -180
        raw_invalid_lon = {"latitude": 20.0, "longitude": -195.0, "brightness": 340.0, "frp": 10.0}
        norm, err = validate_and_normalize_firms_record(raw_invalid_lon)
        self.assertIsNone(norm)
        self.assertIn("out of geographic bounds", err)

        # Missing latitude
        raw_missing = {"longitude": 75.0, "brightness": 340.0}
        norm, err = validate_and_normalize_firms_record(raw_missing)
        self.assertIsNone(norm)
        self.assertIn("Missing mandatory coordinates", err)

    def test_firms_validation_physical_boundaries(self):
        """Rejects non-physical temperature readings or negative FRP values."""
        # Brightness < 200 K (unphysical on Earth)
        raw_cold = {"latitude": 22.0, "longitude": 70.0, "brightness": 120.0, "frp": 10.0}
        norm, err = validate_and_normalize_firms_record(raw_cold)
        self.assertIsNone(norm)
        self.assertIn("exceeds physical earth thermal boundaries", err)

        # Negative FRP
        raw_neg_frp = {"latitude": 22.0, "longitude": 70.0, "brightness": 340.0, "frp": -15.0}
        norm, err = validate_and_normalize_firms_record(raw_neg_frp)
        self.assertIsNone(norm)
        self.assertIn("cannot be negative", err)

    def test_firms_deduplication(self):
        """Duplicate observations matching space-time and satellite must be filtered."""
        now_iso = datetime.now(timezone.utc).isoformat()
        records = [
            {"id": "rec-1", "latitude": 22.3591, "longitude": 69.8652, "timestamp": now_iso, "satellite": "VIIRS_SNPP"},
            {"id": "rec-2", "latitude": 22.3591, "longitude": 69.8652, "timestamp": now_iso, "satellite": "VIIRS_SNPP"},
            {"id": "rec-3", "latitude": 21.1145, "longitude": 72.6732, "timestamp": now_iso, "satellite": "VIIRS_SNPP"}
        ]
        deduped, dup_count = deduplicate_firms_records(records)
        self.assertEqual(len(deduped), 2)
        self.assertEqual(dup_count, 1)

    def test_osm_haversine_and_nearest_facility(self):
        """Verify geodesic distance calculation to industrial facilities."""
        osm = DemoOSMProvider()
        # Jamnagar refinery coordinates: 22.3582, 69.8645
        # Hotspot point ~120m away: 22.3591, 69.8652
        nearest = osm.find_nearest_industrial_facility(22.3591, 69.8652)
        self.assertEqual(nearest["facility_id"], "fac-ref-001")
        self.assertIn("Jamnagar", nearest["name"])
        self.assertLess(nearest["distance_meters"], 200.0)

        # Multi-facility search
        within_10k = osm.find_facilities_within_radius(22.3591, 69.8652, radius_meters=10000.0)
        self.assertGreaterEqual(len(within_10k), 1)

    def test_landcover_classification(self):
        """Verify LULC engine classifies distinct sectors accurately."""
        lc = DemoLandCoverProvider()
        
        # Industrial sector (Jamnagar)
        jam_lc = lc.get_land_cover_at_point(22.3591, 69.8652)
        self.assertEqual(jam_lc["land_cover"], "industrial")

        # Cropland sector (Punjab)
        pnb_lc = lc.get_land_cover_at_point(30.2451, 75.8341)
        self.assertEqual(pnb_lc["land_cover"], "cropland")

        # Forest reserve (Simlipal)
        sim_lc = lc.get_land_cover_at_point(21.8450, 86.3210)
        self.assertEqual(sim_lc["land_cover"], "dense_forest")

        # Mining basin (Korba)
        krb_lc = lc.get_land_cover_at_point(22.3425, 82.5942)
        self.assertEqual(krb_lc["land_cover"], "mining_pit")

    def test_geospatial_enrichment_engine(self):
        """Verify GeospatialContextEngine synthesizes correct flags and infrastructure."""
        engine = GeospatialContextEngine()
        res = engine.enrich_thermal_event(22.3591, 69.8652)

        self.assertEqual(res["facility_type"], "oil_refinery")
        self.assertTrue(res["spatial_flags"]["is_industrial_zone"])
        self.assertFalse(res["spatial_flags"]["is_forest_zone"])
        self.assertIsNotNone(res["nearby_infrastructure"])
        self.assertLess(res["distance_to_industry"], 300.0)

    def test_ingestion_service_batch_flow(self):
        """Verify full ingestion service validation, deduplication, and enrichment."""
        service = IngestionService()
        batch = [
            # Valid event
            {
                "latitude": 22.3591,
                "longitude": 69.8652,
                "brightness": 370.0,
                "frp": 50.0,
                "confidence": 92.0,
                "satellite": "VIIRS_SNPP"
            },
            # Duplicate of above
            {
                "latitude": 22.3591,
                "longitude": 69.8652,
                "brightness": 370.0,
                "frp": 50.0,
                "confidence": 92.0,
                "satellite": "VIIRS_SNPP"
            },
            # Invalid event (out of bounds)
            {
                "latitude": 120.0,
                "longitude": 75.0,
                "brightness": 350.0,
                "frp": 20.0
            }
        ]

        summary = service.ingest_firms_batch(batch, auto_enrich=True)
        self.assertEqual(summary["records_received"], 3)
        self.assertEqual(summary["records_accepted"], 1)
        self.assertEqual(summary["records_rejected"], 1)
        self.assertEqual(summary["records_deduplicated"], 1)
        self.assertEqual(summary["records_enriched"], 1)
        self.assertEqual(len(summary["ingested_ids"]), 1)

    def test_api_ingest_firms_endpoint(self):
        """Test POST /api/ingest/firms endpoint contract."""
        payload = {
            "records": [
                {
                    "latitude": 21.1145,
                    "longitude": 72.6732,
                    "brightness": 390.0,
                    "frp": 130.0,
                    "confidence": 98.0,
                    "satellite": "VIIRS_SNPP"
                }
            ],
            "auto_enrich": True
        }
        res = self.client.post("/api/ingest/firms", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["records_received"], 1)
        self.assertEqual(data["records_accepted"], 1)
        self.assertEqual(data["records_enriched"], 1)
        self.assertIn("status", data)

    def test_api_provider_status_endpoint(self):
        """Test GET /api/provider/status endpoint contract."""
        res = self.client.get("/api/provider/status")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("system_mode", data)
        self.assertIn("firms", data)
        self.assertIn("osm", data)
        self.assertIn("landcover", data)
        self.assertIn("metrics", data)

    def test_api_scenarios_endpoint(self):
        """Test GET /api/scenarios returns all 5 demo scenarios A through E."""
        res = self.client.get("/api/scenarios")
        self.assertEqual(res.status_code, 200)
        scenarios = res.json()
        self.assertGreaterEqual(len(scenarios), 5)
        codes = [s["code"] for s in scenarios]
        self.assertIn("SCENARIO_A1", codes)
        self.assertIn("SCENARIO_A2", codes)
        self.assertIn("SCENARIO_B", codes)
        self.assertIn("SCENARIO_C", codes)
        self.assertIn("SCENARIO_D", codes)
        self.assertIn("SCENARIO_E", codes)

    def test_api_hotspots_filtering(self):
        """Test GET /api/hotspots with filtering queries."""
        # Query by class
        res_gas = self.client.get("/api/hotspots?source_class=Gas%20Flare")
        self.assertEqual(res_gas.status_code, 200)
        spots = res_gas.json()
        for s in spots:
            self.assertEqual(s["classification"]["predicted_class"], "Gas Flare")

        # Query by risk
        res_crit = self.client.get("/api/hotspots?risk_score=CRITICAL")
        self.assertEqual(res_crit.status_code, 200)
        crit_spots = res_crit.json()
        for s in crit_spots:
            self.assertEqual(s["classification"]["risk_score"], "CRITICAL")

if __name__ == "__main__":
    unittest.main()
