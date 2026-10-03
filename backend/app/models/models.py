from sqlalchemy import Column, String, Float, Integer, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime

Base = declarative_base()

class IndustrialFacility(Base):
    """
    OpenStreetMap & Industrial Cadastral Facility POIs.
    Spatial coordinates and facility taxonomy for proximity evaluation.
    """
    __tablename__ = "industrial_facilities"

    id = Column(String(64), primary_key=True)
    name = Column(String(255), nullable=False)
    facility_type = Column(String(100), nullable=False) # e.g. 'oil_refinery', 'chemical_plant', 'mine', 'steel_plant'
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    geometry = Column(String(255), nullable=True) # GeoJSON or WKT Point representation
    operator = Column(String(255), nullable=True)
    tags = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    geo_contexts = relationship("GeoContext", back_populates="nearest_facility", foreign_keys="GeoContext.nearest_facility_id")


class ThermalEvent(Base):
    """
    Spaceborne Thermal Anomaly Observations ingested from NASA FIRMS.
    Represents raw detection vector with satellite instrument attributes.
    """
    __tablename__ = "thermal_events"

    id = Column(String(64), primary_key=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    timestamp = Column(DateTime, nullable=False)
    brightness = Column(Float, nullable=False) # Brightness temperature (Kelvin)
    frp = Column(Float, nullable=False)        # Fire Radiative Power (MW)
    confidence = Column(Float, nullable=False) # Sensor algorithm confidence (0-100%)
    satellite = Column(String(50), nullable=False) # e.g. 'VIIRS_SNPP', 'MODIS_Aqua'
    source = Column(String(50), nullable=False)    # e.g. 'NASA_FIRMS_DEMO', 'NASA_FIRMS_LIVE'
    geometry = Column(String(255), nullable=True)  # WKT Point(lon, lat)
    cluster_id = Column(String(64), nullable=True, index=True)
    daynight = Column(String(1), default="D")
    created_at = Column(DateTime, default=datetime.utcnow)

    # One-to-one or one-to-many relationships
    geo_context = relationship("GeoContext", back_populates="event", uselist=False, cascade="all, delete-orphan", foreign_keys="GeoContext.event_id")
    classification = relationship("Classification", back_populates="event", uselist=False, cascade="all, delete-orphan")
    alert = relationship("Alert", back_populates="event", uselist=False, cascade="all, delete-orphan")


class GeoContext(Base):
    """
    Contextual geospatial attributes derived by intersecting the hotspot
    with OSM industrial buffers, infrastructure corridors, and satellite LULC rasters.
    """
    __tablename__ = "geo_context"

    id = Column(String(64), primary_key=True)
    event_id = Column(String(64), ForeignKey("thermal_events.id", ondelete="CASCADE"), nullable=False)
    nearest_facility_id = Column(String(64), ForeignKey("industrial_facilities.id"), nullable=True)
    nearest_industrial_facility = Column(String(255), nullable=False)
    facility_type = Column(String(100), nullable=False)
    distance_to_facility = Column(Float, nullable=False) # Distance in meters
    land_cover = Column(String(100), nullable=False)     # e.g. 'industrial', 'cropland', 'dense_forest', 'mining_pit'
    nearby_infrastructure = Column(String(255), nullable=True)
    distance_to_infrastructure = Column(Float, nullable=True)
    nearby_road = Column(String(255), nullable=True)
    distance_to_road = Column(Float, nullable=True)
    contextual_attributes = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.utcnow)

    event = relationship("ThermalEvent", back_populates="geo_context", foreign_keys=[event_id])
    nearest_facility = relationship("IndustrialFacility", back_populates="geo_contexts", foreign_keys=[nearest_facility_id])


class TemporalProfile(Base):
    """
    Multi-temporal metrics tracking recurrence, persistence duration,
    and seasonal patterns across satellite revisit windows.
    """
    __tablename__ = "temporal_profiles"

    id = Column(String(64), primary_key=True)
    cluster_id = Column(String(64), nullable=False, index=True) # event/source cluster
    observation_count = Column(Integer, nullable=False, default=1)
    frequency = Column(Float, nullable=False, default=1.0) # Observations per week
    recurrence = Column(Float, nullable=False, default=0.0) # Ratio of active revisit passes
    persistence_days = Column(Integer, nullable=False, default=1)
    seasonal_information = Column(String(100), nullable=True) # e.g. 'year_round', 'harvest_autumn', 'dry_summer'
    first_seen = Column(DateTime, nullable=False)
    last_seen = Column(DateTime, nullable=False)
    is_persistent = Column(Boolean, nullable=False, default=False)
    updated_at = Column(DateTime, default=datetime.utcnow)


class Classification(Base):
    """
    Explainable Machine Learning inference record produced by the Random Forest tabular model.
    """
    __tablename__ = "classifications"

    id = Column(String(64), primary_key=True)
    event_id = Column(String(64), ForeignKey("thermal_events.id", ondelete="CASCADE"), nullable=False)
    predicted_class = Column(String(50), nullable=False) # 'Industrial Fire', 'Gas Flare', 'Agricultural Burning', etc.
    confidence = Column(Float, nullable=False)           # Statistical probability (0.0 to 1.0)
    risk_score = Column(String(20), nullable=False)       # 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    risk_value = Column(Float, nullable=False)           # Quantitative score (0 to 100)
    persistence_score = Column(Float, nullable=False)    # 0.0 to 1.0
    evidence = Column(JSON, nullable=False)              # Structured list of factual observations
    feature_vector = Column(JSON, nullable=False)        # Input features for auditability
    model_version = Column(String(50), nullable=False)   # Model artifact identifier
    created_at = Column(DateTime, default=datetime.utcnow)

    event = relationship("ThermalEvent", back_populates="classification")


class Alert(Base):
    """
    Operational alerts dispatched for high-risk thermal emergencies requiring verification.
    """
    __tablename__ = "alerts"

    id = Column(String(64), primary_key=True)
    event_id = Column(String(64), ForeignKey("thermal_events.id", ondelete="CASCADE"), nullable=False)
    severity = Column(String(20), nullable=False) # 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    status = Column(String(50), default="ACTIVE") # 'ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'
    message = Column(String(1000), nullable=False) # Human-readable alert summary
    facility_name = Column(String(255), nullable=True)
    action_recommended = Column(String(1000), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    acknowledged_at = Column(DateTime, nullable=True)

    event = relationship("ThermalEvent", back_populates="alert")
