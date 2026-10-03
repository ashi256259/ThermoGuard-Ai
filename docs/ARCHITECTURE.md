# ThermoGuard AI — System Architecture & Specification
**Smart India Hackathon 2026 | Problem Statement ID: SIH26162**  
**Title:** AI-Based Detection and Classification of Industrial Fires and Persistent Thermal Sources Using NASA FIRMS, OSM & Satellite Data  
**Target Organisation:** National Technical Research Organisation (NTRO)  
**Tagline:** Detect • Classify • Protect  
**Current Status:** Phase 1 (Foundation & Core Architecture)

---

## 1. Executive Problem Statement & Motivation

Spaceborne thermal sensors (such as VIIRS on S-NPP / NOAA-20 and MODIS on Terra / Aqua) distribute near-real-time thermal anomaly observations across the globe through NASA FIRMS (Fire Information for Resource Management System). While standard FIRMS alerts indicate the presence of a thermal anomaly (brightness temperature, Fire Radiative Power [FRP]), they **do not identify the source or operational nature** of the heat signature.

Consequently, national monitoring bodies, defense/intelligence agencies (such as NTRO), and disaster management responders face massive signal-to-noise ratios:
- Routine, safe **gas flares** in petrochemical refineries generate hundreds of false fire alarms.
- High-intensity **industrial fires and chemical explosions** are initially indistinguishable from routine flaring without geospatial and facility cadastre context.
- Seasonal **agricultural stubble burning** generates transient regional clusters.
- Canopy-consuming **wildfires** in dense reserves spread unpredictably.
- Spontaneous coal seam combustion in **open-cast mines** creates long-term persistent hotspots.

**ThermoGuard AI** solves this problem not by relying on generative AI chatbots or ungrounded LLMs, but through a rigorous, explainable geospatial intelligence pipeline combining:
1. **Multi-sensor thermal anomaly ingestion** (NASA FIRMS)
2. **OpenStreetMap (OSM) industrial facility proximity and infrastructure queries**
3. **Satellite Land-Use / Land-Cover (LULC) context**
4. **Multi-temporal persistence and recurrence analysis**
5. **Supervised tabular Machine Learning (Random Forest Classifier)**
6. **Transparent, dual-axis scoring (Model Confidence vs Operational Risk)**
7. **Explainable, audit-ready ground-truth evidence generation**

---

## 2. End-to-End Data Flow Architecture

```
                       +-----------------------------------+
                       |    NASA FIRMS Satellite Feeds     |
                       | (VIIRS 375m / MODIS 1km Hotspots) |
                       +-----------------+-----------------+
                                         |
                                         v
                       +-----------------------------------+
                       |       Data Ingestion Engine       |
                       | (Filtering, Validation & Spatial  |
                       |          Deduplication)           |
                       +-----------------+-----------------+
                                         |
                                         v
                       +-----------------------------------+
                       |     Geospatial Context Engine     |
                       |  - OSM Industrial Facilities      |
                       |  - Euclidean & Haversine Distance |
                       |  - LULC (WorldCover / Sentinel-2) |
                       |  - Transport / Infrastructure     |
                       +-----------------+-----------------+
                                         |
                                         v
                       +-----------------------------------+
                       |     Temporal Behaviour Engine     |
                       |  - Multi-day recurrence ratio     |
                       |  - Active persistence duration    |
                       |  - Pass observation frequency     |
                       |  - Spatial clustering (DBSCAN)    |
                       +-----------------+-----------------+
                                         |
                                         v
                       +-----------------------------------+
                       |    Feature Engineering Pipeline   |
                       |   Normalized 11-dimension vector: |
                       |   [thermal, spatial, temporal]    |
                       +-----------------+-----------------+
                                         |
                                         v
                       +-----------------------------------+
                       |   Supervised ML Classification    |
                       |   (Random Forest Classifier Core) |
                       |  Classes: Industrial Fire, Flare, |
                       |  Agri, Wildfire, Mining, Other    |
                       +-----------------+-----------------+
                                         |
                                         v
                       +-----------------------------------+
                       |  Dual Scoring & Evidence Engine   |
                       |  - Classification Confidence %    |
                       |  - Operational Risk Score (0-100) |
                       |  - Fact-checked Evidence List     |
                       +-----------------+-----------------+
                                         |
                                         v
                       +-----------------------------------+
                       |          FastAPI Backend          |
                       |   Modular REST Endpoints & PostGIS|
                       +-----------------+-----------------+
                                         |
                                         v
                       +-----------------------------------+
                       |     React GIS Intelligence UI     |
                       |    (Leaflet Map, Dark Theme,      |
                       |   Scenarios, Analytics, Explorer) |
                       +-----------------------------------+
```

---

## 3. Classification Taxonomy

The system explicitly predicts into 6 discrete source classes:

| Class | Definition | Key Signatures |
| :--- | :--- | :--- |
| **Industrial Fire** | Uncontrolled emergency event at or near an industrial facility | High FRP (>100 MW), high brightness (>380K), very close to industrial facility (<1 km), sudden transient onset (low historical persistence). |
| **Gas Flare** | Controlled, routine flaring at refineries, petrochemical units, or offshore rigs | High brightness, moderate FRP (20–80 MW), co-located with refinery (<500 m), high temporal recurrence (>80%), persistent over weeks/months. |
| **Agricultural Burning** | Post-harvest crop residue/stubble clearance | Moderate brightness, cropland land-cover, non-industrial, short seasonal window (October–November, April–May), low multi-day persistence. |
| **Wildfire** | Forest biomass fire (surface or canopy) | High FRP, dense forest / shrubland land-cover, remote from industrial facilities (>10 km), spread over multiple adjacent pixels. |
| **Mining** | Open-cast coal pit or spoil heap spontaneous combustion | Moderate FRP, open-cast mining land-use or quarry proximity, recurrent over dry seasons. |
| **Other** | Brick kilns, municipal waste burns, or unclassified transient thermal sources | Intermediate characteristics not satisfying principal industrial or forest criteria. |

---

## 4. Confidence vs. Operational Risk Scoring

Confidence and Risk are strictly decoupled:

### 4.1 Model Confidence (0.0 to 1.0)
The statistical posterior probability produced by the Random Forest ensemble that the observation belongs to the predicted source class. A routine gas flare can have **94% confidence** while carrying **LOW operational risk**.

### 4.2 Operational Risk Score (0 to 100)
A deterministic decision-support index prioritizing emergency response, computed from 5 weighted components:
1. **Thermal Intensity (30% weight):** Normalized FRP and brightness temperature.
2. **Proximity to Industrial Hazards (35% weight):** Distance to major hazard installations (e.g. Seveso III equivalent, refineries, chemical storage).
3. **Temporal Anomaly & Sudden Onset (20% weight):** High suddenness (low persistence + high FRP) signals an unannounced explosion/fire rather than a routine recurring flare.
4. **Source Class Baseline Risk (15% weight):**
   - Industrial Fire: Critical baseline weight
   - Wildfire: High baseline weight
   - Mining: Medium baseline weight
   - Agricultural: Low-to-medium baseline weight
   - Gas Flare: Low baseline weight (routine operational flaring)

Risk Levels:
- **CRITICAL (80–100):** Immediate containment advisory and automated alert dispatch.
- **HIGH (60–79):** Priority monitoring and facility verification.
- **MEDIUM (40–59):** Standard situational tracking.
- **LOW (0–39):** Routine operational thermal event.

---

## 5. Provider Abstraction Architecture

To maintain strict scientific integrity and avoid vendor lock-in or fake API responses:
- **Demo Providers (`DemoFIRMSProvider`, `DemoOSMProvider`, `DemoLandCoverProvider`):** Return deterministic, calibrated sample data for SIH evaluation scenarios (Jamnagar, Hazira, Punjab, Simlipal, Korba).
- **Real Providers (`RealFIRMSProvider`, `RealOSMProvider`, `RealLandCoverProvider`):** Stand ready with complete request schemas to ingest live NASA FIRMS API keys (`NASA_FIRMS_MAP_KEY`) and live Overpass OSM queries when keys are supplied in `.env`.
- All demo data is strictly labelled as `DEMO DATA` in the user interface and API metadata.

---

## 6. Database Schema & PostGIS Vectorization

The storage layer utilizes **PostgreSQL with PostGIS**:
- `thermal_events`: Point observation geometry with spatial GIST index.
- `industrial_facilities`: Registered industrial complexes and hazard tiers with spatial GIST index.
- `geo_context`: Spatial join results (nearest facility, distance in meters, land cover).
- `temporal_profiles`: Recurrence ratio, observation count, and persistence days.
- `classifications`: Model version, confidence, risk score, and structured evidence array.
- `alerts`: Actionable advisory dispatches for high-risk and critical incidents.

---

## 7. Phase Roadmap

- **Phase 1 (Current):** Project foundation, modular directory structure, FastAPI + PostgreSQL/PostGIS schemas, demo provider abstraction, basic unit test suite, and sophisticated dark UI shell.
- **Phase 2:** Database schema deployment, migrations, and PostGIS spatial indexing.
- **Phase 3:** Automated FIRMS ingestion pipeline & spatial deduplication engine.
- **Phase 4:** Geospatial context engine with Overpass OSM integration.
- **Phase 5:** Temporal clustering & multi-day persistence engine.
- **Phase 6:** Multimodal feature engineering pipeline.
- **Phase 7:** Supervised Random Forest & XGBoost model training and evaluation.
- **Phase 8:** Explainable evidence generator & multi-criteria risk scorer.
- **Phase 9:** Full interactive Leaflet GIS dashboard & scenario runner.
- **Phase 10:** End-to-end integration testing & load benchmarking.
- **Phase 11:** Live NASA FIRMS API key connector & live OSM Overpass queries.
- **Phase 12:** Production containerization & security hardening.
