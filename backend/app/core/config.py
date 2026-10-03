import os
from pydantic import BaseModel

class Settings(BaseModel):
    PROJECT_NAME: str = "ThermoGuard AI"
    TAGLINE: str = "Detect • Classify • Protect"
    VERSION: str = "0.1.0"
    SIH_PROBLEM_STATEMENT: str = "SIH26162 - AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources"
    ORGANISATION: str = "National Technical Research Organisation (NTRO)"
    
    # Environment mode (Phase 1/2 uses DEMO data; can be toggled to LIVE when keys are supplied)
    DATA_MODE: str = os.getenv("DATA_MODE", "DEMO").upper()
    DATA_PROVIDER_MODE: str = os.getenv("DATA_PROVIDER_MODE", "DEMO_SAMPLE_DATA")
    
    # Database configuration (PostgreSQL + PostGIS)
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://thermoguard:guard_secure@localhost:5432/thermoguard_db"
    )
    
    # External APIs (Configured when transitioning from DEMO to LIVE)
    FIRMS_API_URL: str = os.getenv(
        "FIRMS_API_URL",
        "https://firms.modaps.eosdis.nasa.gov/api"
    )
    FIRMS_API_KEY: str = os.getenv("FIRMS_API_KEY", "")
    OSM_API_URL: str = os.getenv(
        "OSM_API_URL",
        "https://overpass-api.de/api/interpreter"
    )
    
    # Frontend API Base URL
    VITE_API_BASE_URL: str = os.getenv("VITE_API_BASE_URL", "")
    
    # ML Model Config (scikit-learn Random Forest Pipeline)
    MODEL_PATH: str = os.getenv("MODEL_PATH", "./ml/models/random_forest_v1.joblib")
    MODEL_METADATA_PATH: str = os.getenv("MODEL_METADATA_PATH", "./ml/models/model_metadata.json")
    MIN_CONFIDENCE_THRESHOLD: float = 0.50

    # Temporal Intelligence Engine Configuration
    TEMPORAL_CLUSTER_RADIUS_KM: float = float(os.getenv("TEMPORAL_CLUSTER_RADIUS_KM", "1.2"))
    TEMPORAL_CLUSTER_WINDOW_HOURS: float = float(os.getenv("TEMPORAL_CLUSTER_WINDOW_HOURS", "720.0")) # 30 days
    TEMPORAL_INACTIVE_GAP_HOURS: float = float(os.getenv("TEMPORAL_INACTIVE_GAP_HOURS", "24.0"))
    TEMPORAL_PERSISTENCE_DAYS_PERSISTENT: int = int(os.getenv("TEMPORAL_PERSISTENCE_DAYS_PERSISTENT", "21"))
    TEMPORAL_PERSISTENCE_DAYS_TRANSIENT: int = int(os.getenv("TEMPORAL_PERSISTENCE_DAYS_TRANSIENT", "3"))
    TEMPORAL_MIN_OBSERVATIONS_FOR_SEASONALITY: int = int(os.getenv("TEMPORAL_MIN_OBSERVATIONS_FOR_SEASONALITY", "5"))

settings = Settings()
