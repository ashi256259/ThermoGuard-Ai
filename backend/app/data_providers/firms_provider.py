import os
import re
import math
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple
from backend.app.data_providers.base import FIRMSDataProvider


def validate_and_normalize_firms_record(record: Dict[str, Any]) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """
    Validates a raw NASA FIRMS record and normalizes it into ThermoGuard ThermalEvent schema.
    
    Checks:
    - Latitude and Longitude validity (-90..90, -180..180, non-null, finite numeric)
    - Acquisition Date and Time / Timestamp parsing
    - Brightness Temperature in Kelvin (200.0 <= T <= 600.0)
    - Fire Radiative Power (FRP >= 0.0)
    - Confidence score (0..100 or categorical mapping)
    - Satellite/Instrument normalization
    - Day/Night indicator ('D' or 'N')
    
    Returns:
        (normalized_dict, None) on success
        (None, error_message_string) on validation failure
    """
    if not isinstance(record, dict):
        return None, "Record must be a dictionary object"

    # 1. Coordinate Validation
    raw_lat = record.get("latitude", record.get("lat"))
    raw_lon = record.get("longitude", record.get("lon", record.get("long")))

    if raw_lat is None or raw_lon is None:
        return None, "Missing mandatory coordinates (latitude or longitude)"

    try:
        lat = float(raw_lat)
        lon = float(raw_lon)
    except (ValueError, TypeError):
        return None, f"Malformed coordinates: lat='{raw_lat}', lon='{raw_lon}' cannot be parsed as floats"

    if math.isnan(lat) or math.isinf(lat) or math.isnan(lon) or math.isinf(lon):
        return None, "Coordinates contain NaN or Infinite values"

    if not (-90.0 <= lat <= 90.0):
        return None, f"Latitude {lat} out of geographic bounds [-90.0, 90.0]"

    if not (-180.0 <= lon <= 180.0):
        return None, f"Longitude {lon} out of geographic bounds [-180.0, 180.0]"

    # 2. Timestamp Validation & Normalization
    timestamp_dt = None
    if "timestamp" in record and record["timestamp"]:
        ts_val = record["timestamp"]
        if isinstance(ts_val, datetime):
            timestamp_dt = ts_val
        elif isinstance(ts_val, str):
            try:
                # Handle ISO string with or without Z
                clean_ts = ts_val.replace("Z", "+00:00")
                timestamp_dt = datetime.fromisoformat(clean_ts)
            except Exception:
                pass

    if timestamp_dt is None:
        acq_date = record.get("acq_date", record.get("date"))
        acq_time = record.get("acq_time", record.get("time", "0000"))

        if not acq_date:
            timestamp_dt = datetime.now(timezone.utc)
        else:
            try:
                date_str = str(acq_date).strip()
                time_str = str(acq_time).strip().replace(":", "").zfill(4)
                # Parse YYYY-MM-DD and HHMM
                if len(time_str) >= 4:
                    hh = int(time_str[:2])
                    mm = int(time_str[2:4])
                    if not (0 <= hh <= 23 and 0 <= mm <= 59):
                        hh, mm = 12, 0
                else:
                    hh, mm = 12, 0

                dt_part = datetime.strptime(date_str, "%Y-%m-%d")
                timestamp_dt = dt_part.replace(hour=hh, minute=mm, tzinfo=timezone.utc)
            except Exception as e:
                return None, f"Malformed acquisition date/time '{acq_date}' '{acq_time}': {e}"

    # 3. Brightness Temperature Validation (Kelvin)
    # FIRMS VIIRS often provides bright_ti4 and bright_ti5; MODIS provides brightness and bright_t31
    raw_brightness = record.get("brightness", record.get("bright_ti4", record.get("bright_t31", 340.0)))
    try:
        brightness = float(raw_brightness)
    except (ValueError, TypeError):
        return None, f"Invalid brightness value '{raw_brightness}'"

    if brightness < 200.0 or brightness > 600.0:
        return None, f"Brightness temperature {brightness} K exceeds physical earth thermal boundaries [200.0, 600.0 K]"

    # 4. Fire Radiative Power (FRP in Megawatts)
    raw_frp = record.get("frp", 10.0)
    try:
        frp = float(raw_frp)
    except (ValueError, TypeError):
        return None, f"Invalid FRP value '{raw_frp}'"

    if frp < 0.0:
        return None, f"FRP {frp} cannot be negative"

    # 5. Sensor Confidence (0 to 100%)
    raw_conf = record.get("confidence", 80.0)
    if isinstance(raw_conf, str):
        c_lower = raw_conf.strip().lower()
        if c_lower in ("l", "low"):
            confidence = 30.0
        elif c_lower in ("n", "nominal"):
            confidence = 60.0
        elif c_lower in ("h", "high"):
            confidence = 90.0
        else:
            try:
                confidence = float(raw_conf)
            except ValueError:
                confidence = 70.0
    else:
        try:
            confidence = float(raw_conf)
        except (ValueError, TypeError):
            confidence = 70.0

    confidence = max(0.0, min(100.0, confidence))

    # 6. Satellite & Instrument Normalization
    raw_sat = str(record.get("satellite", "VIIRS_SNPP")).strip().upper()
    if "SNPP" in raw_sat or "NPP" in raw_sat:
        satellite = "VIIRS_SNPP"
    elif "NOAA20" in raw_sat or "NOAA-20" in raw_sat or "JPSS1" in raw_sat:
        satellite = "VIIRS_NOAA20"
    elif "NOAA21" in raw_sat or "NOAA-21" in raw_sat:
        satellite = "VIIRS_NOAA21"
    elif "AQUA" in raw_sat:
        satellite = "MODIS_Aqua"
    elif "TERRA" in raw_sat:
        satellite = "MODIS_Terra"
    else:
        satellite = raw_sat if raw_sat else "VIIRS_SNPP"

    # 7. Day / Night Flag
    raw_dn = str(record.get("daynight", record.get("day_night", "D"))).strip().upper()
    daynight = "N" if raw_dn.startswith("N") else "D"

    # 8. Identifier & Cluster ID
    rec_id = str(record.get("id", record.get("event_id", f"te-firms-{str(uuid.uuid4())[:8]}")))
    cluster_id = record.get("cluster_id") or f"cls-{round(lat, 2)}_{round(lon, 2)}"

    source = record.get("source", "NASA_FIRMS_INGEST")

    normalized = {
        "id": rec_id,
        "latitude": round(lat, 6),
        "longitude": round(lon, 6),
        "timestamp": timestamp_dt.isoformat() if timestamp_dt else datetime.now(timezone.utc).isoformat(),
        "brightness": round(brightness, 2),
        "frp": round(frp, 2),
        "confidence": round(confidence, 1),
        "satellite": satellite,
        "source": source,
        "cluster_id": cluster_id,
        "daynight": daynight,
        "scan": float(record.get("scan", 1.0)) if record.get("scan") else None,
        "track": float(record.get("track", 1.0)) if record.get("track") else None
    }

    return normalized, None


def deduplicate_firms_records(records: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], int]:
    """
    Identifies and removes duplicate FIRMS observations based on space-time proximity:
    Same satellite, coordinates within ~0.001 deg (~110m), and timestamp within same hour.
    """
    seen_keys = set()
    deduped = []
    duplicate_count = 0

    for rec in records:
        lat = round(float(rec["latitude"]), 3)
        lon = round(float(rec["longitude"]), 3)
        ts = str(rec.get("timestamp", ""))[:13] # YYYY-MM-DDTHH
        sat = str(rec.get("satellite", ""))
        key = (lat, lon, ts, sat)

        if key in seen_keys:
            duplicate_count += 1
            continue

        seen_keys.add(key)
        deduped.append(rec)

    return deduped, duplicate_count


class DemoFIRMSProvider(FIRMSDataProvider):
    """
    Demo FIRMS Provider producing deterministic, realistic thermal anomaly signatures
    for SIH 2026 scenarios (Jamnagar, Hazira, Sangrur, Simlipal, Korba, and Isolated Transient).
    
    IMPORTANT DEMO DATA POLICY:
    - This provider emits curated SAMPLE/DEMO data for architecture validation.
    - It is explicitly NOT live satellite data and does not pretend to be.
    - Zero external API keys are required for evaluation.
    """
    def __init__(self, api_key: str = ""):
        self.api_key = api_key
        self.is_live = False

    def get_provider_status(self) -> Dict[str, Any]:
        return {
            "provider": "DemoFIRMSProvider",
            "mode": "DEMO_SAMPLE_DATA",
            "source_catalogs": ["VIIRS_SNPP", "VIIRS_NOAA20", "MODIS_Aqua", "MODIS_Terra"],
            "live_key_configured": False,
            "notice": "DEMO DATA ONLY: Calibrated realistic demo observations representing SIH 2026 test scenarios. No live API token required."
        }

    def fetch_hotspots(
        self,
        bbox: Optional[List[float]] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        source: str = "VIIRS_SNPP"
    ) -> List[Dict[str, Any]]:
        now = datetime.now(timezone.utc)
        return [
            # SCENARIO A1: Jamnagar Refinery Persistent Gas Flare (Industrial Flare)
            {
                "id": "te-jam-101",
                "latitude": 22.3591,
                "longitude": 69.8652,
                "timestamp": now.isoformat(),
                "brightness": 368.5,
                "frp": 54.2,
                "confidence": 94.0,
                "satellite": "VIIRS_SNPP",
                "source": "DEMO_DATA_FIRMS",
                "cluster_id": "cls-jamnagar-01",
                "daynight": "N",
                "scenario": "SCENARIO_A_INDUSTRIAL_FLARE"
            },
            # SCENARIO A2: Hazira Petrochemicals Sudden Industrial Emergency (Industrial Fire)
            {
                "id": "te-haz-201",
                "latitude": 21.1145,
                "longitude": 72.6732,
                "timestamp": now.isoformat(),
                "brightness": 394.8,
                "frp": 142.5,
                "confidence": 99.0,
                "satellite": "VIIRS_SNPP",
                "source": "DEMO_DATA_FIRMS",
                "cluster_id": "cls-hazira-fire-01",
                "daynight": "D",
                "scenario": "SCENARIO_A_INDUSTRIAL_FIRE"
            },
            # SCENARIO B: Punjab Stubble Burning Cluster (Seasonal Agricultural Crop Residue)
            {
                "id": "te-pnb-301",
                "latitude": 30.2451,
                "longitude": 75.8341,
                "timestamp": now.isoformat(),
                "brightness": 332.4,
                "frp": 28.5,
                "confidence": 82.0,
                "satellite": "VIIRS_SNPP",
                "source": "DEMO_DATA_FIRMS",
                "cluster_id": "cls-sangrur-agri-01",
                "daynight": "D",
                "scenario": "SCENARIO_B_AGRICULTURAL_BURNING"
            },
            # SCENARIO C: Simlipal Biosphere Reserve Canopy Wildfire (Forest Wildfire)
            {
                "id": "te-sim-401",
                "latitude": 21.8450,
                "longitude": 86.3210,
                "timestamp": now.isoformat(),
                "brightness": 354.2,
                "frp": 92.4,
                "confidence": 89.0,
                "satellite": "VIIRS_SNPP",
                "source": "DEMO_DATA_FIRMS",
                "cluster_id": "cls-simlipal-wild-01",
                "daynight": "D",
                "scenario": "SCENARIO_C_WILDFIRE"
            },
            # SCENARIO D: Korba Open-Cast Mine Spontaneous Coal Combustion (Mining)
            {
                "id": "te-krb-501",
                "latitude": 22.3425,
                "longitude": 82.5942,
                "timestamp": now.isoformat(),
                "brightness": 348.6,
                "frp": 38.0,
                "confidence": 88.0,
                "satellite": "VIIRS_NOAA20",
                "source": "DEMO_DATA_FIRMS",
                "cluster_id": "cls-korba-mine-01",
                "daynight": "N",
                "scenario": "SCENARIO_D_MINING"
            },
            # SCENARIO E: Isolated Transient Rural Hotspot (Other / Transient Biomass)
            {
                "id": "te-tra-701",
                "latitude": 26.8920,
                "longitude": 75.8140,
                "timestamp": now.isoformat(),
                "brightness": 322.0,
                "frp": 14.5,
                "confidence": 65.0,
                "satellite": "MODIS_Terra",
                "source": "DEMO_DATA_FIRMS",
                "cluster_id": "cls-transient-rural-01",
                "daynight": "D",
                "scenario": "SCENARIO_E_TRANSIENT_HOTSPOT"
            }
        ]

# Backwards compatibility alias
DemoFIRMSDataProvider = DemoFIRMSProvider


class RealFIRMSProvider(FIRMSDataProvider):
    """
    Real NASA FIRMS Data Provider abstraction.
    Designed for live integration using official NASA MAP_KEY.
    
    API Endpoints:
    Country query: https://firms.modaps.eosdis.nasa.gov/api/country/csv/{MAP_KEY}/{SOURCE}/{COUNTRY}/{DAYS}
    Area query: https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{BBOX}/{DAYS}
    """
    def __init__(self, api_key: str = "", base_url: str = ""):
        self.api_key = api_key or os.getenv("FIRMS_API_KEY", "")
        self.base_url = base_url or os.getenv("FIRMS_BASE_URL", os.getenv("FIRMS_API_URL", "https://firms.modaps.eosdis.nasa.gov/api"))

    def get_provider_status(self) -> Dict[str, Any]:
        has_key = bool(self.api_key and len(self.api_key.strip()) > 10)
        return {
            "provider": "RealFIRMSProvider",
            "mode": "LIVE_API" if has_key else "UNCONFIGURED",
            "configured": has_key,
            "base_url": self.base_url,
            "api_endpoint": f"{self.base_url}/country/csv/<MAP_KEY>/VIIRS_SNPP_NRT/IND/1",
            "notice": "Real NASA FIRMS Provider requires a valid NASA FIRMS MAP_KEY configured in FIRMS_API_KEY. Operating safely in unconfigured mode until credentials are provided." if not has_key else "NASA FIRMS API key is configured for live queries."
        }

    def fetch_hotspots(
        self,
        bbox: Optional[List[float]] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        source: str = "VIIRS_SNPP_NRT"
    ) -> List[Dict[str, Any]]:
        if not self.api_key or len(self.api_key.strip()) < 10:
            raise ValueError(
                "NASA FIRMS MAP_KEY is not configured in FIRMS_API_KEY. "
                "Per SIH26162 architecture guidelines, configure FIRMS_API_KEY or use DemoFIRMSProvider for demo evaluation."
            )
        
        # Real provider connects to NASA FIRMS REST endpoint via HTTP client
        import urllib.request
        import csv
        import io

        if bbox and len(bbox) == 4:
            # min_lon, min_lat, max_lon, max_lat
            bbox_str = f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}"
        else:
            # Default to India national extent bounding box: 68.0E, 6.5N, 97.5E, 37.5N
            bbox_str = "68.0,6.5,97.5,37.5"
            
        url = f"{self.base_url}/area/csv/{self.api_key}/{source}/{bbox_str}/1"

        try:
            req = urllib.request.Request(url, headers={"User-Agent": "ThermoGuard-AI-SIH26162/1.0"})
            with urllib.request.urlopen(req, timeout=10) as response:
                content = response.read().decode("utf-8")
                reader = csv.DictReader(io.StringIO(content))
                raw_rows = list(reader)
                
                valid_records = []
                for row in raw_rows:
                    normalized, err = validate_and_normalize_firms_record(row)
                    if normalized:
                        valid_records.append(normalized)
                
                deduped, _ = deduplicate_firms_records(valid_records)
                return deduped
        except Exception as e:
            raise RuntimeError(f"Failed to query live NASA FIRMS API: {e}")

