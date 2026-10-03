-- =====================================================================
-- ThermoGuard AI - Database Schema (PostgreSQL + PostGIS)
-- Smart India Hackathon 2026 | PS ID: SIH26162
-- Problem Statement: AI-Based Detection and Classification of Industrial
-- Fires and Persistent Thermal Sources Using NASA FIRMS, OSM & Satellite Data
-- Organisation: National Technical Research Organisation (NTRO)
-- =====================================================================

-- Enable PostGIS extension for spatial vector operations
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enum types for classification and risk levels (idempotent creation)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'source_class_enum') THEN
        CREATE TYPE source_class_enum AS ENUM (
            'Industrial Fire',
            'Gas Flare',
            'Agricultural Burning',
            'Wildfire',
            'Mining',
            'Other',
            'ML_UNAVAILABLE'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'risk_level_enum') THEN
        CREATE TYPE risk_level_enum AS ENUM (
            'LOW',
            'MEDIUM',
            'HIGH',
            'CRITICAL'
        );
    END IF;
END
$$;

-- 1. Table: industrial_facilities (OSM and Industrial cadastral POIs)
CREATE TABLE IF NOT EXISTS industrial_facilities (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    facility_type VARCHAR(100) NOT NULL, -- e.g. 'oil_refinery', 'chemical_plant', 'power_station', 'steel_plant', 'mine'
    operator VARCHAR(255),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    geom geometry(Point, 4326) NOT NULL,
    tags JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_industrial_facilities_geom ON industrial_facilities USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_industrial_facilities_type ON industrial_facilities (facility_type);

-- 2. Table: thermal_events (Raw and Ingested FIRMS Hotspot Observations)
CREATE TABLE IF NOT EXISTS thermal_events (
    id VARCHAR(64) PRIMARY KEY,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    brightness DOUBLE PRECISION NOT NULL, -- Brightness temperature (Kelvin)
    frp DOUBLE PRECISION NOT NULL,        -- Fire Radiative Power (MW)
    confidence DOUBLE PRECISION NOT NULL, -- Sensor/algorithm confidence (0-100%)
    satellite VARCHAR(50) NOT NULL,       -- e.g. 'VIIRS_SNPP', 'VIIRS_NOAA20', 'MODIS_Aqua'
    source VARCHAR(50) NOT NULL,          -- e.g. 'NASA_FIRMS_DEMO', 'NASA_FIRMS_LIVE'
    cluster_id VARCHAR(64),               -- Spatial-temporal cluster grouping
    daynight VARCHAR(1) DEFAULT 'D',      -- 'D' or 'N'
    geom geometry(Point, 4326) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_thermal_events_geom ON thermal_events USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_thermal_events_timestamp ON thermal_events (timestamp);
CREATE INDEX IF NOT EXISTS idx_thermal_events_cluster ON thermal_events (cluster_id);

-- 3. Table: geo_context (Geospatial context derived from OSM & Land Cover)
CREATE TABLE IF NOT EXISTS geo_context (
    id VARCHAR(64) PRIMARY KEY,
    event_id VARCHAR(64) REFERENCES thermal_events(id) ON DELETE CASCADE,
    nearest_industrial_facility VARCHAR(255),
    facility_type VARCHAR(100),
    distance_to_industry DOUBLE PRECISION NOT NULL, -- in meters
    land_cover VARCHAR(100) NOT NULL,               -- e.g. 'industrial', 'cropland', 'dense_forest', 'mining_pit', 'water'
    nearby_infrastructure VARCHAR(255),             -- e.g. 'pipeline_junction', 'railway_siding', 'substation'
    distance_to_infrastructure DOUBLE PRECISION,    -- in meters
    nearby_road VARCHAR(255),
    distance_to_road DOUBLE PRECISION,
    contextual_attributes JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_geo_context_event_id ON geo_context (event_id);
CREATE INDEX IF NOT EXISTS idx_geo_context_dist_industry ON geo_context (distance_to_industry);
CREATE INDEX IF NOT EXISTS idx_geo_context_land_cover ON geo_context (land_cover);

-- 4. Table: temporal_profiles (Temporal recurrence and persistence)
CREATE TABLE IF NOT EXISTS temporal_profiles (
    id VARCHAR(64) PRIMARY KEY,
    cluster_id VARCHAR(64) NOT NULL,
    first_seen TIMESTAMP WITH TIME ZONE NOT NULL,
    last_seen TIMESTAMP WITH TIME ZONE NOT NULL,
    observation_count INTEGER NOT NULL DEFAULT 1,
    frequency_per_week DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    recurrence_ratio DOUBLE PRECISION NOT NULL DEFAULT 0.0, -- observations / active window span
    persistence_days INTEGER NOT NULL DEFAULT 1,
    seasonal_pattern VARCHAR(100),                          -- 'year_round', 'post_monsoon', 'harvest_autumn', 'dry_summer'
    is_persistent BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_temporal_profiles_cluster ON temporal_profiles (cluster_id);
CREATE INDEX IF NOT EXISTS idx_temporal_profiles_persistence ON temporal_profiles (persistence_days);

-- 5. Table: classifications (ML Inference Output, Transparent Evidence & Human Verification)
CREATE TABLE IF NOT EXISTS classifications (
    id VARCHAR(64) PRIMARY KEY,
    event_id VARCHAR(64) REFERENCES thermal_events(id) ON DELETE CASCADE,
    predicted_class source_class_enum NOT NULL,
    confidence DOUBLE PRECISION NOT NULL,     -- 0.0 to 1.0
    risk_score risk_level_enum NOT NULL,
    risk_value DOUBLE PRECISION NOT NULL,     -- numerical index 0 - 100
    persistence_score DOUBLE PRECISION NOT NULL, -- 0.0 to 1.0
    model_version VARCHAR(50) NOT NULL,       -- e.g. 'rf_classifier_v1.0.0'
    evidence JSONB NOT NULL,                  -- structured list of factual evidence
    feature_vector JSONB NOT NULL,            -- normalized ML feature values
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Priority 6: Human Verification / Analyst Review Layer
    verified_class source_class_enum,
    verification_status VARCHAR(50) DEFAULT 'UNVERIFIED', -- 'UNVERIFIED', 'CONFIRMED', 'RECLASSIFIED', 'NEEDS_REVIEW'
    verified_by VARCHAR(255),
    verified_at TIMESTAMP WITH TIME ZONE,
    verification_reason TEXT,
    verification_audit JSONB DEFAULT '[]'::jsonb
);

-- Idempotent column migrations if classifications table already exists
ALTER TABLE classifications ADD COLUMN IF NOT EXISTS verified_class source_class_enum;
ALTER TABLE classifications ADD COLUMN IF NOT EXISTS verification_status VARCHAR(50) DEFAULT 'UNVERIFIED';
ALTER TABLE classifications ADD COLUMN IF NOT EXISTS verified_by VARCHAR(255);
ALTER TABLE classifications ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE classifications ADD COLUMN IF NOT EXISTS verification_reason TEXT;
ALTER TABLE classifications ADD COLUMN IF NOT EXISTS verification_audit JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_classifications_event_id ON classifications (event_id);
CREATE INDEX IF NOT EXISTS idx_classifications_predicted_class ON classifications (predicted_class);
CREATE INDEX IF NOT EXISTS idx_classifications_risk_score ON classifications (risk_score);
CREATE INDEX IF NOT EXISTS idx_classifications_verification_status ON classifications (verification_status);

-- 6. Table: alerts (Automated notifications for high-risk thermal events)
CREATE TABLE IF NOT EXISTS alerts (
    id VARCHAR(64) PRIMARY KEY,
    event_id VARCHAR(64) REFERENCES thermal_events(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    severity risk_level_enum NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'
    facility_name VARCHAR(255),
    action_recommended TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_alerts_event_id ON alerts (event_id);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts (severity);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts (status);

-- =====================================================================
-- RLS (Row Level Security) Configuration
-- =====================================================================
-- Enable RLS on all application-level tables to satisfy security linters
ALTER TABLE industrial_facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE thermal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE temporal_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- Note: spatial_ref_sys is a PostGIS system table and remains untouched.

-- Create policies allowing full access to backend service role / authenticated users
-- The Node.js backend connects using a service role or connection string,
-- so we provide a safe default true policy for the application's roles.
DO $$
DECLARE
    t_name text;
BEGIN
    FOR t_name IN (SELECT unnest(ARRAY['industrial_facilities', 'thermal_events', 'geo_context', 'temporal_profiles', 'classifications', 'alerts']))
    LOOP
        EXECUTE format('
            DROP POLICY IF EXISTS "Allow all for backend" ON %I;
', t_name);
    END LOOP;
END
$$;
