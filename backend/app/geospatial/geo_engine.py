import math
from typing import Dict, Any, List, Optional
from backend.app.data_providers.base import OSMDataProvider, LandCoverProvider
from backend.app.data_providers.osm_provider import DemoOSMProvider
from backend.app.data_providers.landcover_provider import DemoLandCoverProvider

class GeospatialContextEngine:
    """
    Geospatial Context Engine.
    Combines OpenStreetMap industrial facilities, transport networks, and
    multi-spectral land-cover data to enrich raw FIRMS thermal points.
    """
    def __init__(
        self,
        osm_provider: Optional[OSMDataProvider] = None,
        landcover_provider: Optional[LandCoverProvider] = None
    ):
        self.osm = osm_provider or DemoOSMProvider()
        self.landcover = landcover_provider or DemoLandCoverProvider()

    def enrich_thermal_event(self, latitude: float, longitude: float) -> Dict[str, Any]:
        """
        Calculates distances to nearest industrial facilities, extracts LULC
        classification, queries infrastructure, and derives proximity metrics for ML feature engineering.
        """
        # 1. Query nearest industrial facility
        facility = self.osm.find_nearest_industrial_facility(latitude, longitude, radius_meters=50000.0)
        dist_industry = facility["distance_meters"]

        # 2. Query all facilities within 10 km corridor
        facilities_within_10k = self.osm.find_facilities_within_radius(latitude, longitude, radius_meters=10000.0)
        facility_count_10k = len(facilities_within_10k)

        # 3. Query land-use / land-cover context
        lc = self.landcover.get_land_cover_at_point(latitude, longitude)
        land_cover = lc.get("land_cover", "open_land")
        lc_confidence = lc.get("confidence", 0.70)

        # 4. Query infrastructure within 2 km
        infra = self.osm.query_infrastructure_nearby(latitude, longitude, radius_meters=2000.0)
        nearest_infra_name = infra[0]["name"] if infra else "None within 2 km"
        dist_infra = infra[0]["distance_meters"] if infra else None

        # 5. Synthesize spatial context flags
        is_industrial_zone = (dist_industry <= 800.0) or (land_cover == "industrial") or (facility_count_10k >= 2)
        is_forest_zone = (land_cover == "dense_forest")
        is_farmland_zone = (land_cover == "cropland")
        is_mining_zone = (land_cover == "mining_pit") or (facility["facility_type"] == "mine" and dist_industry <= 1500.0)
        is_infrastructure_nearby = (dist_infra is not None and dist_infra <= 500.0) or (dist_industry <= 1000.0)

        # Calculate representative road distance
        dist_road = min(250.0, dist_industry * 0.15 + 25.0) if dist_industry < 10000.0 else 500.0
        nearby_road_desc = "Primary Highway / Plant Access Arterial" if dist_industry < 5000.0 else "Rural Route / Secondary Highway"

        return {
            "facility_id": facility.get("facility_id"),
            "nearest_industrial_facility": facility["name"],
            "facility_type": facility["facility_type"],
            "distance_to_industry": dist_industry,
            "industrial_facilities_within_10km": facility_count_10k,
            "nearby_facilities": facilities_within_10k[:3],
            "facility_latitude": facility.get("latitude"),
            "facility_longitude": facility.get("longitude"),
            "land_cover": land_cover,
            "land_cover_confidence": lc_confidence,
            "nearby_infrastructure": nearest_infra_name,
            "distance_to_infrastructure": dist_infra,
            "nearby_road": nearby_road_desc,
            "distance_to_road": dist_road,
            "spatial_flags": {
                "is_industrial_zone": is_industrial_zone,
                "is_forest_zone": is_forest_zone,
                "is_farmland_zone": is_farmland_zone,
                "is_mining_zone": is_mining_zone,
                "is_infrastructure_nearby": is_infrastructure_nearby,
                "facility_operator": facility.get("operator")
            },
            "contextual_attributes": {
                "osm_tags": facility.get("tags", {}),
                "land_cover_composition": lc.get("surrounding_composition", {}),
                "dataset": lc.get("dataset", "ESA_WorldCover_10m")
            }
        }

    def batch_enrich_events(self, events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Enriches a batch of raw or validated thermal events with geospatial context."""
        enriched = []
        for ev in events:
            lat = float(ev["latitude"])
            lon = float(ev["longitude"])
            context = self.enrich_thermal_event(lat, lon)
            item = dict(ev)
            item["geo_context"] = context
            enriched.append(item)
        return enriched
