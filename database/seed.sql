-- =====================================================================
-- ThermoGuard AI - Demo Seed Data (Realistic Geospatial Scenarios)
-- Clearly labelled as SAMPLE / DEMO DATA for SIH 2026 Evaluation
-- =====================================================================

-- 1. Industrial Facilities (OSM/Cadastral POIs)
INSERT INTO industrial_facilities (id, name, facility_type, operator, latitude, longitude, geom, tags)
VALUES
('fac-ref-001', 'Jamnagar Mega Refinery Complex', 'oil_refinery', 'Reliance Industries Ltd.', 22.3582, 69.8645, ST_SetSRID(ST_MakePoint(69.8645, 22.3582), 4326), '{"flare_stacks": 6, "capacity_bpd": 1240000, "hazard_class": "Major Accident Hazard"}'::jsonb),
('fac-petro-002', 'Hazira Petrochemicals & LNG Terminal', 'chemical_plant', 'ONGC / Shell', 21.1124, 72.6718, ST_SetSRID(ST_MakePoint(72.6718, 21.1124), 4326), '{"sector": "hydrocarbon", "storage_tanks": 34}'::jsonb),
('fac-mine-003', 'Gevra & Dipka Opencast Coal Mines', 'mine', 'South Eastern Coalfields Ltd.', 22.3418, 82.5934, ST_SetSRID(ST_MakePoint(82.5934, 22.3418), 4326), '{"mining_type": "open_cast_coal", "overburden_dumps": 12}'::jsonb),
('fac-steel-004', 'Angul Integrated Steel & Pellet Plant', 'steel_plant', 'Jindal Steel & Power', 20.8412, 85.0863, ST_SetSRID(ST_MakePoint(85.0863, 20.8412), 4326), '{"blast_furnaces": 2, "coke_ovens": 4}'::jsonb),
('fac-power-005', 'NTPC Vindhyachal Super Thermal Power', 'power_station', 'NTPC Ltd.', 24.0984, 82.6641, ST_SetSRID(ST_MakePoint(82.6641, 24.0984), 4326), '{"fuel": "coal", "capacity_mw": 4760}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 2. Thermal Events (Realistic FIRMS Observation records)
INSERT INTO thermal_events (id, latitude, longitude, timestamp, brightness, frp, confidence, satellite, source, cluster_id, daynight, geom)
VALUES
-- Scenario 1: Jamnagar Refinery Persistent Gas Flare (Flare Stack 3)
('te-jam-101', 22.3591, 69.8652, '2026-09-03 04:30:00+00', 368.5, 54.2, 94.0, 'VIIRS_SNPP', 'NASA_FIRMS_SAMPLE', 'cls-jamnagar-01', 'N', ST_SetSRID(ST_MakePoint(69.8652, 22.3591), 4326)),
('te-jam-102', 22.3588, 69.8649, '2026-09-02 18:15:00+00', 362.1, 49.8, 91.0, 'VIIRS_NOAA20', 'NASA_FIRMS_SAMPLE', 'cls-jamnagar-01', 'N', ST_SetSRID(ST_MakePoint(69.8649, 22.3588), 4326)),
('te-jam-103', 22.3594, 69.8655, '2026-09-01 05:00:00+00', 371.0, 58.6, 96.0, 'MODIS_Aqua', 'NASA_FIRMS_SAMPLE', 'cls-jamnagar-01', 'D', ST_SetSRID(ST_MakePoint(69.8655, 22.3594), 4326)),

-- Scenario 1b: Unplanned Industrial Fire Emergency at Solvent Tank Farm
('te-haz-201', 21.1145, 72.6732, '2026-09-03 09:12:00+00', 394.8, 142.5, 99.0, 'VIIRS_SNPP', 'NASA_FIRMS_SAMPLE', 'cls-hazira-fire-01', 'D', ST_SetSRID(ST_MakePoint(72.6732, 21.1145), 4326)),

-- Scenario 2: Punjab Stubble Burning Cluster (Sangrur Agricultural Belt)
('te-pnb-301', 30.2451, 75.8341, '2026-09-03 08:20:00+00', 332.4, 28.5, 82.0, 'VIIRS_SNPP', 'NASA_FIRMS_SAMPLE', 'cls-sangrur-agri-01', 'D', ST_SetSRID(ST_MakePoint(75.8341, 30.2451), 4326)),
('te-pnb-302', 30.2612, 75.8512, '2026-09-03 08:22:00+00', 328.0, 22.1, 78.0, 'VIIRS_SNPP', 'NASA_FIRMS_SAMPLE', 'cls-sangrur-agri-02', 'D', ST_SetSRID(ST_MakePoint(75.8512, 30.2612), 4326)),
('te-pnb-303', 30.2319, 75.8190, '2026-09-02 08:45:00+00', 330.5, 25.0, 80.0, 'MODIS_Aqua', 'NASA_FIRMS_SAMPLE', 'cls-sangrur-agri-03', 'D', ST_SetSRID(ST_MakePoint(75.8190, 30.2319), 4326)),

-- Scenario 3: Simlipal Biosphere Reserve Forest Wildfire (Odisha)
('te-sim-401', 21.8450, 86.3210, '2026-09-03 07:15:00+00', 354.2, 92.4, 89.0, 'VIIRS_SNPP', 'NASA_FIRMS_SAMPLE', 'cls-simlipal-wild-01', 'D', ST_SetSRID(ST_MakePoint(86.3210, 21.8450), 4326)),
('te-sim-402', 21.8512, 86.3345, '2026-09-03 07:15:00+00', 361.0, 115.0, 93.0, 'VIIRS_SNPP', 'NASA_FIRMS_SAMPLE', 'cls-simlipal-wild-01', 'D', ST_SetSRID(ST_MakePoint(86.3345, 21.8512), 4326)),

-- Scenario 4: Korba Coalfield Spontaneous Smoldering / Coal Seam Fire
('te-krb-501', 22.3425, 82.5942, '2026-09-03 03:40:00+00', 348.6, 38.0, 88.0, 'VIIRS_NOAA20', 'NASA_FIRMS_SAMPLE', 'cls-korba-mine-01', 'N', ST_SetSRID(ST_MakePoint(82.5942, 22.3425), 4326)),
('te-krb-502', 22.3412, 82.5928, '2026-09-01 19:10:00+00', 345.1, 35.2, 86.0, 'VIIRS_SNPP', 'NASA_FIRMS_SAMPLE', 'cls-korba-mine-01', 'N', ST_SetSRID(ST_MakePoint(82.5928, 22.3412), 4326))
ON CONFLICT (id) DO NOTHING;

-- 3. Geo Context (Derived OSM, Infrastructure, and Land Cover)
INSERT INTO geo_context (id, event_id, nearest_industrial_facility, facility_type, distance_to_industry, land_cover, nearby_infrastructure, distance_to_infrastructure, nearby_road, distance_to_road, contextual_attributes)
VALUES
('gc-101', 'te-jam-101', 'Jamnagar Mega Refinery Complex', 'oil_refinery', 120.0, 'industrial', 'Crude Distillation Unit Flare Stack #3', 85.0, 'Refinery Internal Perimeter Road', 40.0, '{"industrial_zoning": true, "buffer_1km_industrial_pct": 92.5, "water_body_nearby": false}'::jsonb),
('gc-201', 'te-haz-201', 'Hazira Petrochemicals & LNG Terminal', 'chemical_plant', 280.0, 'industrial', 'Ethylene Tank Storage Battery A', 140.0, 'Hazira Coastal Highway (SH-168)', 95.0, '{"industrial_zoning": true, "buffer_1km_industrial_pct": 84.0, "high_density_storage": true}'::jsonb),
('gc-301', 'te-pnb-301', 'None within 5 km', 'none', 14200.0, 'cropland', 'Irrigation canal pump station', 650.0, 'Rural MDR 104', 320.0, '{"industrial_zoning": false, "crop_type": "Paddy / Rice straw residue", "buffer_1km_agri_pct": 96.0}'::jsonb),
('gc-401', 'te-sim-401', 'None within 25 km', 'none', 32000.0, 'dense_forest', 'Forest Range Watchtower', 4800.0, 'Unpaved Forest Trail', 1200.0, '{"protected_area": true, "canopy_cover": "85%", "slope": "18 deg", "wind_speed_kmh": 22}'::jsonb),
('gc-501', 'te-krb-501', 'Gevra & Dipka Opencast Coal Mines', 'mine', 180.0, 'mining_pit', 'Coal Haul Road & Conveyor Gallery', 110.0, 'Mine Access Arterial Road', 150.0, '{"open_cast_pit": true, "coal_seam_depth_m": 45, "buffer_1km_mining_pct": 88.0}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 4. Temporal Profiles
INSERT INTO temporal_profiles (id, cluster_id, first_seen, last_seen, observation_count, frequency_per_week, recurrence_ratio, persistence_days, seasonal_pattern, is_persistent)
VALUES
('tp-101', 'cls-jamnagar-01', '2026-06-15 00:00:00+00', '2026-09-03 04:30:00+00', 142, 11.2, 0.94, 80, 'year_round', true),
('tp-201', 'cls-hazira-fire-01', '2026-09-03 08:30:00+00', '2026-09-03 09:12:00+00', 2, 0.0, 0.05, 1, 'none_sudden_onset', false),
('tp-301', 'cls-sangrur-agri-01', '2026-09-01 00:00:00+00', '2026-09-03 08:20:00+00', 3, 3.0, 0.20, 3, 'harvest_autumn', false),
('tp-401', 'cls-simlipal-wild-01', '2026-09-02 12:00:00+00', '2026-09-03 07:15:00+00', 5, 5.0, 0.35, 2, 'dry_season_transient', false),
('tp-501', 'cls-korba-mine-01', '2026-07-01 00:00:00+00', '2026-09-03 03:40:00+00', 64, 7.5, 0.82, 64, 'year_round', true)
ON CONFLICT (id) DO NOTHING;

-- 5. Classifications (Generated by ML Inference Engine)
INSERT INTO classifications (id, event_id, predicted_class, confidence, risk_score, risk_value, persistence_score, model_version, evidence, feature_vector)
VALUES
('cls-res-101', 'te-jam-101', 'Gas Flare', 0.945, 'LOW', 28.0, 0.96, 'rf_classifier_v1.0.0',
 '[
   "Located 120m from documented oil refinery flare stack",
   "Over 140 recurring observations across 80 consecutive days",
   "FRP of 54.2 MW matches controlled refinery flaring thresholds",
   "Strictly localized to licensed industrial parcel",
   "Year-round persistence signature with negligible spatial drift"
 ]'::jsonb,
 '{"dist_industry_m": 120.0, "is_industrial_land": 1.0, "frp": 54.2, "brightness": 368.5, "persistence_days": 80, "recurrence_ratio": 0.94}'::jsonb),

('cls-res-201', 'te-haz-201', 'Industrial Fire', 0.968, 'CRITICAL', 94.5, 0.15, 'rf_classifier_v1.0.0',
 '[
   "Extreme thermal energy (FRP 142.5 MW, Brightness 394.8 K) exceeding normal flaring",
   "Sudden onset anomaly at chemical plant storage area without prior history",
   "Distance to critical hydrocarbon infrastructure under 280m",
   "High sensor confidence (99.0%) under daytime VIIRS pass",
   "Immediate alert triggered: potential catastrophic industrial fire"
 ]'::jsonb,
 '{"dist_industry_m": 280.0, "is_industrial_land": 1.0, "frp": 142.5, "brightness": 394.8, "persistence_days": 1, "recurrence_ratio": 0.05}'::jsonb),

('cls-res-301', 'te-pnb-301', 'Agricultural Burning', 0.920, 'MEDIUM', 48.0, 0.18, 'rf_classifier_v1.0.0',
 '[
   "Cropland land-cover class with 96% agricultural parcel density",
   "No industrial facility or infrastructure within 14.2 km",
   "Moderate FRP (28.5 MW) characteristic of crop stubble burning",
   "Matches known post-monsoon harvest burning temporal pattern",
   "Spatial cluster of adjacent short-lived thermal points"
 ]'::jsonb,
 '{"dist_industry_m": 14200.0, "is_industrial_land": 0.0, "frp": 28.5, "brightness": 332.4, "persistence_days": 3, "recurrence_ratio": 0.20}'::jsonb),

('cls-res-401', 'te-sim-401', 'Wildfire', 0.952, 'HIGH', 82.0, 0.22, 'rf_classifier_v1.0.0',
 '[
   "Located within protected dense forest canopy (Simlipal Biosphere)",
   "Zero industrial facilities within 32 km perimeter",
   "High FRP (92.4 - 115 MW) indicating rapid biomass consumption",
   "Rapid perimeter expansion detected between satellite revisits",
   "Dry season biomass combustion profile"
 ]'::jsonb,
 '{"dist_industry_m": 32000.0, "is_industrial_land": 0.0, "frp": 92.4, "brightness": 354.2, "persistence_days": 2, "recurrence_ratio": 0.35}'::jsonb),

('cls-res-501', 'te-krb-501', 'Mining', 0.895, 'MEDIUM', 55.0, 0.88, 'rf_classifier_v1.0.0',
 '[
   "Coincident with active opencast coal pit (Gevra & Dipka)",
   "Persistent moderate thermal emission over 64 days",
   "Characteristic signature of spontaneous coal seam combustion in overburden",
   "Low to moderate FRP (38.0 MW) continuous smoldering",
   "Confined within documented mining concession boundary"
 ]'::jsonb,
 '{"dist_industry_m": 180.0, "is_industrial_land": 0.0, "frp": 38.0, "brightness": 348.6, "persistence_days": 64, "recurrence_ratio": 0.82}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 6. Alerts
INSERT INTO alerts (id, event_id, title, description, severity, status, facility_name, action_recommended)
VALUES
('alt-haz-001', 'te-haz-201', 'CRITICAL INDUSTRIAL FIRE HAZARD: Hazira Petrochemicals', 'Extreme FRP (142.5 MW) detected inside Hazira Petrochemicals & LNG terminal boundary. Sudden onset indicates potential solvent tank or unit fire.', 'CRITICAL', 'ACTIVE', 'Hazira Petrochemicals & LNG Terminal', 'Dispatch district fire response units immediately; trigger plant emergency shutdown and notify state disaster management authority (SDMA).'),
('alt-sim-002', 'te-sim-401', 'HIGH SEVERITY WILDFIRE: Simlipal Biosphere Core Zone', 'Multiple high-intensity thermal anomalies detected expanding rapidly inside dense forest reserve.', 'HIGH', 'ACTIVE', 'Simlipal Forest Reserve', 'Mobilize forest patrol teams and air-drop reconnaissance; initiate fire break creation on northern ridge.'),
('alt-krb-003', 'te-krb-501', 'ELEVATED MINING THERMAL EMISSION: Gevra Opencast Pit', 'Persistent smoldering thermal signature detected in coal overburden dump #4.', 'MEDIUM', 'ACKNOWLEDGED', 'Gevra & Dipka Opencast Coal Mines', 'Direct mine safety personnel to inspect overburden bench and apply slurry blanketing to retard oxidation.')
ON CONFLICT (id) DO NOTHING;
