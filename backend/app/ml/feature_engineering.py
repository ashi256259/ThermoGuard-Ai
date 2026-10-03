import math
from typing import Dict, Any, List, Tuple

class FeatureEngineeringPipeline:
    """
    Canonical Feature Engineering Pipeline for Thermal Anomaly Source Classification.
    SIH26162 - NTRO Geospatial & Multi-Temporal Feature Extraction.

    Combines:
    1. Thermal Radiative Features (NASA FIRMS MODIS/VIIRS)
    2. Geospatial Proximity & Land Cover Features (OpenStreetMap & Multi-spectral LULC)
    3. Temporal Recurrence & Persistence Features (Multi-Temporal Observation Engine)
    """

    # Canonical Feature Schema: Exact feature names and deterministic order used for both Training & Inference
    FEATURE_NAMES: List[str] = [
        # --- Group 1: Thermal Radiative Features ---
        "brightness",                   # Kelvin (typical range: 300 - 500 K)
        "frp",                          # Fire Radiative Power (MW)
        "firms_confidence",             # Normalized sensor confidence (0.0 to 1.0)
        "scan",                         # Along-scan pixel dimension (km)
        "track",                        # Along-track pixel dimension (km)
        "daynight_flag",                # 1.0 for Day ('D'), 0.0 for Night ('N')

        # --- Group 2: Geospatial & Infrastructure Features ---
        "distance_to_industry_km",      # Distance to nearest industrial facility in km (capped at 50.0 km)
        "industrial_facility_count",    # Number of industrial facilities within 10 km corridor
        "industrial_nearby_flag",       # 1.0 if within industrial perimeter (<= 800m or industrial LULC)
        "mining_nearby_flag",           # 1.0 if mining pit, open-cast mine, or quarry
        "infrastructure_nearby_flag",   # 1.0 if near pipeline, rail, or power infrastructure
        "forest_context",               # 1.0 if dense forest or woodland canopy
        "agricultural_context",         # 1.0 if agricultural cropland or plantation
        "urban_context",                # 1.0 if urban built-up zone
        "open_land_context",            # 1.0 if open scrub, barren, or grassland

        # --- Group 3: Multi-Temporal Behavior Features ---
        "observation_count",            # Total satellite overpasses recorded for cluster
        "active_days",                  # Number of distinct days with active heat detections
        "active_duration",              # Span in days between first and latest detection
        "observation_frequency",        # Average detections per week across monitoring window
        "recurrence_count",             # Number of distinct active revisit cycles separated by quiet gaps
        "recurrence_ratio",             # Fraction of expected satellite overpasses that detected heat (0.0 to 1.0)
        "average_revisit_interval",     # Mean revisit interval between consecutive detections (hours)
        "median_revisit_interval",      # Median revisit interval (hours)
        "persistence_score",            # Continuous multi-factor persistence metric (0.0 to 1.0)
        "seasonality_score",            # Temporal concentration / seasonality metric (0.0 to 1.0)
        "seasonal_concentration"        # Fraction of detections occurring in the primary peak month (0.0 to 1.0)
    ]

    # Target class definitions for SIH26162
    TARGET_CLASSES: List[str] = [
        "Industrial Fire",
        "Gas Flare",
        "Agricultural Burning",
        "Wildfire",
        "Mining",
        "Other"
    ]

    # Backward-compatibility alias mapping for legacy feature keys
    _FEATURE_ALIASES: Dict[str, str] = {
        "dist_industry_km": "distance_to_industry_km",
        "is_industrial_land": "industrial_nearby_flag",
        "is_forest_land": "forest_context",
        "is_farmland": "agricultural_context",
        "is_mining_land": "mining_nearby_flag",
        "is_daytime": "daynight_flag",
        "facility_count_10k": "industrial_facility_count"
    }

    # Safe deterministic fallbacks for missing values
    _FALLBACK_VALUES: Dict[str, float] = {
        "brightness": 330.0,
        "frp": 25.0,
        "firms_confidence": 0.80,
        "scan": 0.40,
        "track": 0.40,
        "daynight_flag": 1.0,
        "distance_to_industry_km": 50.0,
        "industrial_facility_count": 0.0,
        "industrial_nearby_flag": 0.0,
        "mining_nearby_flag": 0.0,
        "infrastructure_nearby_flag": 0.0,
        "forest_context": 0.0,
        "agricultural_context": 0.0,
        "urban_context": 0.0,
        "open_land_context": 1.0,
        "observation_count": 1.0,
        "active_days": 1.0,
        "active_duration": 0.0,
        "observation_frequency": 1.0,
        "recurrence_count": 0.0,
        "recurrence_ratio": 0.0,
        "average_revisit_interval": 0.0,
        "median_revisit_interval": 0.0,
        "persistence_score": 0.0,
        "seasonality_score": 0.0,
        "seasonal_concentration": 0.0
    }

    @classmethod
    def extract_features(
        cls,
        thermal: Dict[str, Any],
        geo_context: Dict[str, Any],
        temporal: Dict[str, Any]
    ) -> Dict[str, float]:
        """
        Extracts structured, normalized features ready for ML classification.
        Guarantees inclusion of all canonical features plus legacy backward-compatible aliases.
        """
        # 1. Thermal Radiative Features
        brightness = float(thermal.get("brightness", 330.0) or 330.0)
        frp = float(thermal.get("frp", 25.0) or 25.0)

        raw_conf = thermal.get("confidence", 80.0)
        if raw_conf is None:
            conf = 0.80
        else:
            try:
                conf_val = float(raw_conf)
                conf = conf_val / 100.0 if conf_val > 1.0 else conf_val
            except (ValueError, TypeError):
                # FIRMS categorical confidences: 'l' -> 0.3, 'n' -> 0.7, 'h' -> 0.95
                c_str = str(raw_conf).lower()
                conf = 0.95 if 'h' in c_str else (0.30 if 'l' in c_str else 0.70)
        conf = max(0.0, min(1.0, conf))

        scan = float(thermal.get("scan", 0.40) or 0.40)
        track = float(thermal.get("track", 0.40) or 0.40)
        daynight_val = str(thermal.get("daynight", "D") or "D").upper()
        daynight_flag = 1.0 if daynight_val.startswith("D") else 0.0

        # 2. Geospatial Context Features
        geo = geo_context or {}
        dist_m = float(geo.get("distance_to_industry", 50000.0) or 50000.0)
        dist_km = min(50.0, max(0.0, dist_m / 1000.0))
        facility_count = float(geo.get("industrial_facilities_within_10km", 0) or 0)

        spatial_flags = geo.get("spatial_flags") or {}
        lc = str(geo.get("land_cover", "") or "").lower()
        fac_type = str(geo.get("facility_type", "") or "").lower()

        dist_infra = geo.get("distance_to_infrastructure")
        dist_infra_m = float(dist_infra) if dist_infra is not None else 99999.0

        is_ind = 1.0 if (
            spatial_flags.get("is_industrial_zone")
            or lc == "industrial"
            or dist_m <= 800.0
            or facility_count >= 2
        ) else 0.0

        is_mine = 1.0 if (
            spatial_flags.get("is_mining_zone")
            or lc == "mining_pit"
            or fac_type == "mine"
            or "quarry" in fac_type
        ) else 0.0

        is_infra = 1.0 if (
            spatial_flags.get("is_infrastructure_nearby")
            or dist_infra_m <= 500.0
            or dist_m <= 1000.0
        ) else 0.0

        is_forest = 1.0 if (
            spatial_flags.get("is_forest_zone")
            or lc in ["dense_forest", "forest", "woodland", "tree_cover"]
        ) else 0.0

        is_farm = 1.0 if (
            spatial_flags.get("is_farmland_zone")
            or lc in ["cropland", "farmland", "agriculture"]
        ) else 0.0

        is_urban = 1.0 if (
            lc in ["urban", "built_up", "settlement", "residential", "commercial"]
        ) else 0.0

        is_open = 1.0 if (
            lc in ["open_land", "grassland", "scrub", "shrubland", "barren", "desert"]
            or (not is_ind and not is_forest and not is_farm and not is_urban and not is_mine)
        ) else 0.0

        # 3. Multi-Temporal Behavior Features
        temp = temporal or {}
        ml_temp = temp.get("ml_features") or {}

        obs_count = float(ml_temp.get("observation_count", temp.get("observation_count", 1)) or 1)
        active_days = float(ml_temp.get("active_days", temp.get("active_days", 1)) or 1)
        active_dur = float(ml_temp.get("active_duration", temp.get("active_duration_days", 0.0)) or 0.0)
        obs_freq = float(ml_temp.get("observation_frequency", temp.get("frequency_per_week", 1.0)) or 1.0)
        rec_count = float(ml_temp.get("recurrence_count", temp.get("recurrence_count", 0)) or 0)
        rec_ratio = float(ml_temp.get("recurrence_ratio", temp.get("recurrence_ratio", 0.0)) or 0.0)
        avg_rev = float(ml_temp.get("average_revisit_interval", temp.get("average_revisit_hours") or 0.0) or 0.0)
        med_rev = float(ml_temp.get("median_revisit_interval", temp.get("median_revisit_hours") or 0.0) or 0.0)
        persist_score = float(ml_temp.get("persistence_score", temp.get("persistence_score", 0.0)) or 0.0)
        season_score = float(ml_temp.get("seasonality_score", temp.get("seasonality_score", 0.0)) or 0.0)
        season_conc = float(ml_temp.get("seasonal_concentration", temp.get("seasonal_concentration", 0.0)) or 0.0)

        # Legacy persistence log helper
        persist_days = float(temp.get("persistence_days", active_days or 1))
        persist_days_log = round(math.log1p(max(0.0, persist_days)), 3)

        features: Dict[str, float] = {
            # Canonical feature keys
            "brightness": round(brightness, 2),
            "frp": round(frp, 2),
            "firms_confidence": round(conf, 4),
            "scan": round(scan, 3),
            "track": round(track, 3),
            "daynight_flag": daynight_flag,
            "distance_to_industry_km": round(dist_km, 3),
            "industrial_facility_count": facility_count,
            "industrial_nearby_flag": is_ind,
            "mining_nearby_flag": is_mine,
            "infrastructure_nearby_flag": is_infra,
            "forest_context": is_forest,
            "agricultural_context": is_farm,
            "urban_context": is_urban,
            "open_land_context": is_open,
            "observation_count": round(obs_count, 1),
            "active_days": round(active_days, 1),
            "active_duration": round(active_dur, 2),
            "observation_frequency": round(obs_freq, 2),
            "recurrence_count": round(rec_count, 1),
            "recurrence_ratio": round(rec_ratio, 3),
            "average_revisit_interval": round(avg_rev, 2),
            "median_revisit_interval": round(med_rev, 2),
            "persistence_score": round(persist_score, 3),
            "seasonality_score": round(season_score, 3),
            "seasonal_concentration": round(season_conc, 3),

            # Backward-compatible aliases for legacy callers and tests
            "dist_industry_km": round(dist_km, 3),
            "is_industrial_land": is_ind,
            "is_forest_land": is_forest,
            "is_farmland": is_farm,
            "is_mining_land": is_mine,
            "persistence_days_log": persist_days_log,
            "is_daytime": daynight_flag,
            "facility_count_10k": facility_count
        }

        return features

    @classmethod
    def dict_to_feature_vector(cls, feature_dict: Dict[str, Any]) -> List[float]:
        """
        Converts any feature dictionary to a strict, ordered List[float] conforming
        to FEATURE_NAMES. Implements deterministic missing-value imputation and alias resolution.
        """
        vector: List[float] = []
        for name in cls.FEATURE_NAMES:
            val = feature_dict.get(name)

            # Check backward-compatibility alias if primary name not found
            if val is None:
                for alias, primary in cls._FEATURE_ALIASES.items():
                    if primary == name and alias in feature_dict:
                        val = feature_dict[alias]
                        break

            # Intelligent derivations for partial dictionaries
            if val is None:
                if name == "persistence_score":
                    if "persistence_days" in feature_dict:
                        val = min(1.0, float(feature_dict["persistence_days"]) / 60.0)
                    elif "persistence_days_log" in feature_dict:
                        val = min(1.0, math.expm1(float(feature_dict["persistence_days_log"])) / 60.0)
                elif name in ["active_days", "active_duration"]:
                    if "persistence_days" in feature_dict:
                        val = float(feature_dict["persistence_days"])
                    elif "persistence_days_log" in feature_dict:
                        val = math.expm1(float(feature_dict["persistence_days_log"]))
                elif name == "recurrence_count":
                    obs = float(feature_dict.get("observation_count", feature_dict.get("observation_frequency", 5.0)))
                    rec = float(feature_dict.get("recurrence_ratio", 0.0))
                    val = max(0.0, obs * rec)
                elif name == "industrial_nearby_flag":
                    dist = float(feature_dict.get("distance_to_industry_km", feature_dict.get("dist_industry_km", 99.0)))
                    ind = float(feature_dict.get("is_industrial_land", 0.0))
                    val = 1.0 if (dist <= 0.8 or ind > 0.5) else 0.0
                elif name in ["average_revisit_interval", "median_revisit_interval"]:
                    freq = float(feature_dict.get("observation_frequency", 0.0))
                    val = (7.0 / max(0.1, freq)) if freq > 0 else 0.0

            # Fallback to default if still missing or None
            if val is None:
                val = cls._FALLBACK_VALUES.get(name, 0.0)

            try:
                f_val = float(val)
                # Guard against NaN or inf
                if math.isnan(f_val) or math.isinf(f_val):
                    f_val = cls._FALLBACK_VALUES.get(name, 0.0)
            except (ValueError, TypeError):
                f_val = cls._FALLBACK_VALUES.get(name, 0.0)

            vector.append(round(f_val, 4))

        return vector

    @classmethod
    def extract_feature_vector(
        cls,
        thermal: Dict[str, Any],
        geo_context: Dict[str, Any],
        temporal: Dict[str, Any]
    ) -> List[float]:
        """
        Extracts features directly as an ordered List[float] conforming to FEATURE_NAMES.
        """
        feat_dict = cls.extract_features(thermal, geo_context, temporal)
        return cls.dict_to_feature_vector(feat_dict)

