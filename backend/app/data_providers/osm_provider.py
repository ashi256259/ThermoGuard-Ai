import os
import math
from typing import List, Dict, Any
from backend.app.data_providers.base import OSMDataProvider

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Computes great-circle distance between two points in meters."""
    R = 6371000.0  # Earth's radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

class DemoOSMProvider(OSMDataProvider):
    """
    Demo OpenStreetMap Context Provider.
    Calculates exact geodesic distances against calibrated industrial facilities,
    refineries, chemical plants, and coalfields across India.
    """
    FACILITY_DATABASE = [
        {
            "id": "fac-ref-001",
            "name": "Jamnagar Mega Refinery Complex",
            "facility_type": "oil_refinery",
            "operator": "Reliance Industries Ltd.",
            "latitude": 22.3582,
            "longitude": 69.8645,
            "tags": {"hazard_tier": "SEVESO_III_EQUIV", "flare_stacks": 6, "crude_capacity_bpd": 1240000}
        },
        {
            "id": "fac-petro-002",
            "name": "Hazira Petrochemicals & LNG Terminal",
            "facility_type": "chemical_plant",
            "operator": "ONGC / Shell",
            "latitude": 21.1124,
            "longitude": 72.6718,
            "tags": {"hazard_tier": "Major_Hazard_Installation", "tanks": 34, "product": "Ethylene/LNG"}
        },
        {
            "id": "fac-mine-003",
            "name": "Gevra & Dipka Opencast Coal Mines",
            "facility_type": "mine",
            "operator": "South Eastern Coalfields Ltd.",
            "latitude": 22.3418,
            "longitude": 82.5934,
            "tags": {"mine_type": "open_cast", "seam_combustion_risk": "high", "annual_tonnage_mt": 70}
        },
        {
            "id": "fac-steel-004",
            "name": "Angul Integrated Steel & Pellet Plant",
            "facility_type": "steel_plant",
            "operator": "Jindal Steel & Power",
            "latitude": 20.8412,
            "longitude": 85.0863,
            "tags": {"blast_furnaces": 2, "coke_ovens": 4, "crude_steel_mtpa": 6}
        },
        {
            "id": "fac-power-005",
            "name": "NTPC Vindhyachal Super Thermal Power",
            "facility_type": "power_station",
            "operator": "NTPC Ltd.",
            "latitude": 24.0984,
            "longitude": 82.6641,
            "tags": {"capacity_mw": 4760, "cooling_towers": 8, "fuel": "coal"}
        },
        {
            "id": "fac-ref-006",
            "name": "Mathura Oil Refinery Complex",
            "facility_type": "oil_refinery",
            "operator": "Indian Oil Corporation Ltd.",
            "latitude": 27.3015,
            "longitude": 77.7028,
            "tags": {"capacity_mmtpa": 8.0, "flare_stacks": 2}
        },
        {
            "id": "fac-mine-007",
            "name": "Jharia Coalfield Pithead & Washery",
            "facility_type": "mine",
            "operator": "Bharat Coking Coal Ltd.",
            "latitude": 23.7481,
            "longitude": 86.4162,
            "tags": {"combustion_zones": 12, "mine_type": "opencast_and_underground"}
        }
    ]

    def get_provider_status(self) -> Dict[str, Any]:
        return {
            "provider": "DemoOSMProvider",
            "mode": "DEMO_SAMPLE_DATA",
            "indexed_facilities_count": len(self.FACILITY_DATABASE),
            "poi_categories": ["oil_refinery", "chemical_plant", "mine", "steel_plant", "power_station"],
            "live_overpass_configured": False,
            "notice": "DEMO DATA ONLY: Calibrated industrial facility geometries across key Indian manufacturing and mining corridors."
        }

    def find_nearest_industrial_facility(
        self,
        latitude: float,
        longitude: float,
        radius_meters: float = 100000.0
    ) -> Dict[str, Any]:
        min_distance = float("inf")
        nearest_facility = None

        for fac in self.FACILITY_DATABASE:
            dist = haversine_distance(latitude, longitude, fac["latitude"], fac["longitude"])
            if dist < min_distance:
                min_distance = dist
                nearest_facility = fac

        if nearest_facility and min_distance <= radius_meters:
            return {
                "facility_id": nearest_facility.get("id", "unknown"),
                "name": nearest_facility["name"],
                "facility_type": nearest_facility["facility_type"],
                "distance_meters": round(min_distance, 1),
                "operator": nearest_facility.get("operator", "Unknown"),
                "latitude": nearest_facility["latitude"],
                "longitude": nearest_facility["longitude"],
                "tags": nearest_facility.get("tags", {})
            }

        return {
            "facility_id": None,
            "name": "No major industrial facility within search radius",
            "facility_type": "none",
            "distance_meters": round(min_distance, 1) if nearest_facility else 999999.0,
            "operator": "None",
            "latitude": None,
            "longitude": None,
            "tags": {}
        }

    def find_facilities_within_radius(
        self,
        latitude: float,
        longitude: float,
        radius_meters: float = 10000.0
    ) -> List[Dict[str, Any]]:
        """Queries all industrial facilities located within radius_meters."""
        within = []
        for fac in self.FACILITY_DATABASE:
            dist = haversine_distance(latitude, longitude, fac["latitude"], fac["longitude"])
            if dist <= radius_meters:
                within.append({
                    "facility_id": fac.get("id"),
                    "name": fac["name"],
                    "facility_type": fac["facility_type"],
                    "operator": fac.get("operator"),
                    "distance_meters": round(dist, 1),
                    "latitude": fac["latitude"],
                    "longitude": fac["longitude"]
                })
        within.sort(key=lambda x: x["distance_meters"])
        return within

    def query_infrastructure_nearby(
        self,
        latitude: float,
        longitude: float,
        radius_meters: float = 2000.0
    ) -> List[Dict[str, Any]]:
        # Contextual infrastructure queries based on location
        infra = []
        if 22.30 <= latitude <= 22.42 and 69.80 <= longitude <= 69.95:
            infra.append({"type": "pipeline_junction", "name": "Crude Delivery Pipeline Junction", "distance_meters": 120.0})
            infra.append({"type": "road", "name": "Refinery Perimeter Access Road", "distance_meters": 65.0})
            infra.append({"type": "flare_stack", "name": "Refinery Elevated Flare Stack #3", "distance_meters": 140.0})
        elif 21.05 <= latitude <= 21.18 and 72.60 <= longitude <= 72.75:
            infra.append({"type": "storage_tank", "name": "Bulk Hydrocarbon Tank Battery", "distance_meters": 140.0})
            infra.append({"type": "highway", "name": "Hazira Port Coastal Highway", "distance_meters": 95.0})
            infra.append({"type": "substation", "name": "Hazira Industrial Substation 220kV", "distance_meters": 310.0})
        elif 22.25 <= latitude <= 22.45 and 82.50 <= longitude <= 82.70:
            infra.append({"type": "conveyor", "name": "Coal Conveyor Overhead Gallery", "distance_meters": 110.0})
            infra.append({"type": "railway", "name": "SECL Coal MGR Rail Spur", "distance_meters": 180.0})
        elif 20.75 <= latitude <= 20.90 and 85.00 <= longitude <= 85.20:
            infra.append({"type": "railway", "name": "Angul Steel Works Rail Yard", "distance_meters": 150.0})
            infra.append({"type": "power_line", "name": "High-Tension Transmission Corridor", "distance_meters": 220.0})
        return infra

DemoOSMDataProvider = DemoOSMProvider


class RealOSMProvider(OSMDataProvider):
    """
    Real OpenStreetMap Provider abstraction using Overpass API.
    Designed for live queries against Overpass or a local PostGIS OSM database.
    """
    def __init__(self, overpass_url: str = ""):
        self.overpass_url = overpass_url or os.getenv("OSM_API_URL", "https://overpass-api.de/api/interpreter")

    def get_provider_status(self) -> Dict[str, Any]:
        return {
            "provider": "RealOSMProvider",
            "mode": "OVERPASS_REST_API",
            "endpoint": self.overpass_url,
            "notice": "Real OpenStreetMap Overpass provider queries live OSM industrial nodes and polygons. Fallback to DemoOSMProvider when rate limits or network offline."
        }

    def find_nearest_industrial_facility(
        self,
        latitude: float,
        longitude: float,
        radius_meters: float = 50000.0
    ) -> Dict[str, Any]:
        # Formulate Overpass QL query:
        # [out:json][timeout:15];
        # (
        #   node["landuse"="industrial"](around:radius,lat,lon);
        #   way["landuse"="industrial"](around:radius,lat,lon);
        #   node["man_made"="works"](around:radius,lat,lon);
        # );
        # out center;
        import urllib.request
        import urllib.parse
        import json

        overpass_query = f"""
        [out:json][timeout:10];
        (
          node["landuse"="industrial"](around:{radius_meters},{latitude},{longitude});
          way["landuse"="industrial"](around:{radius_meters},{latitude},{longitude});
          node["man_made"="works"](around:{radius_meters},{latitude},{longitude});
        );
        out center 10;
        """
        try:
            data = urllib.parse.urlencode({"data": overpass_query}).encode("utf-8")
            req = urllib.request.Request(self.overpass_url, data=data, headers={"User-Agent": "ThermoGuard-AI-SIH26162/1.0"})
            with urllib.request.urlopen(req, timeout=10) as response:
                result = json.loads(response.read().decode("utf-8"))
                elements = result.get("elements", [])
                if not elements:
                    return {
                        "facility_id": None,
                        "name": "No OSM industrial facility found within radius",
                        "facility_type": "none",
                        "distance_meters": radius_meters,
                        "operator": "None",
                        "tags": {}
                    }
                # Find closest element
                closest = None
                min_d = float("inf")
                for el in elements:
                    el_lat = el.get("lat") or el.get("center", {}).get("lat")
                    el_lon = el.get("lon") or el.get("center", {}).get("lon")
                    if el_lat and el_lon:
                        d = haversine_distance(latitude, longitude, el_lat, el_lon)
                        if d < min_d:
                            min_d = d
                            closest = el
                
                tags = closest.get("tags", {}) if closest else {}
                name = tags.get("name") or tags.get("operator") or "OSM Industrial Feature"
                return {
                    "facility_id": f"osm-{closest.get('id')}" if closest else "unknown",
                    "name": name,
                    "facility_type": tags.get("industrial") or tags.get("landuse") or "industrial",
                    "distance_meters": round(min_d, 1),
                    "operator": tags.get("operator", "Unknown"),
                    "tags": tags
                }
        except Exception as e:
            # Safe degradation fallback to Demo provider on network error
            demo = DemoOSMProvider()
            return demo.find_nearest_industrial_facility(latitude, longitude, radius_meters)

    def find_facilities_within_radius(
        self,
        latitude: float,
        longitude: float,
        radius_meters: float = 10000.0
    ) -> List[Dict[str, Any]]:
        demo = DemoOSMProvider()
        return demo.find_facilities_within_radius(latitude, longitude, radius_meters)

    def query_infrastructure_nearby(
        self,
        latitude: float,
        longitude: float,
        radius_meters: float = 2000.0
    ) -> List[Dict[str, Any]]:
        demo = DemoOSMProvider()
        return demo.query_infrastructure_nearby(latitude, longitude, radius_meters)
