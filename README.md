# ThermoGuard AI

> **Detect • Classify • Protect**  
> **Smart India Hackathon 2026 | PS ID: SIH26162**  
> **Organisation:** National Technical Research Organisation (NTRO)  
> **Category:** Software | **Theme:** Miscellaneous

---

## 1. Problem Statement (SIH26162)
NASA Fire Information for Resource Management System (FIRMS) provides satellite-derived thermal anomaly and hotspot observations globally via VIIRS (S-NPP, NOAA-20/21) and MODIS (Terra/Aqua) sensors. However, **a detected thermal hotspot is not automatically an industrial fire**. 

In operational reality, thermal hotspots arise from diverse sources:
- **Controlled industrial flares** (e.g., routine flaring at petrochemical refineries and gas processing plants)
- **Uncontrolled industrial catastrophic fires** (e.g., storage tank fires, pipeline ruptures, plant explosions)
- **Agricultural burning** (e.g., seasonal paddy/wheat stubble clearing post-harvest)
- **Forest wildfires** (e.g., canopy and surface biomass combustion)
- **Mining thermal anomalies** (e.g., spontaneous coal seam combustion in open-cast pits)
- **Other transient/urban heat sources**

Relying on raw satellite thermal hotspots alone produces high false alarm rates, misallocates national emergency resources, and leaves high-risk industrial hazards undetected.

---

## 2. ThermoGuard AI Solution
**ThermoGuard AI** is a geospatial intelligence and machine learning platform that ingests thermal observations and deterministically determines the **underlying source** and **operational risk** using multi-source spatial, temporal, and environmental context.

### Core Philosophy:
1. **Never use an LLM as the thermal classifier:** Classification is performed strictly by trained tabular ML algorithms (`RandomForestClassifier`) using engineered spatial, thermal, and temporal features.
2. **Confidence vs. Operational Risk Separation:** High ML confidence in a "Gas Flare" yields **LOW** operational risk, whereas an "Industrial Fire" yields **CRITICAL** risk.
3. **Deterministic Factual Explainability:** Every prediction produces physical, verifiable evidence without model hallucination.
4. **Transparent Data Provenance:** Benchmark demo datasets are clearly labelled as **DEMO MODE**, with clean decoupled provider interfaces for live NASA FIRMS, OSM Overpass, and ESA WorldCover integration.

---

## 3. Architecture & Data Flow

```text
       ┌─────────────────────────────────────────────────────────┐
       │   NASA FIRMS Satellite Observation (VIIRS / MODIS)      │
       └────────────────────────────┬────────────────────────────┘
                                    │
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │   Data Ingestion & Ingestion Validation Pipeline        │
       │   • Range checks: lat, lon, brightness, FRP             │
       │   • Confidence normalization (0-100% / low, nom, high)  │
       │   • Spatio-temporal deduplication (500m / 12h)          │
       └────────────────────────────┬────────────────────────────┘
                                    │
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │   Multi-Source Geospatial Context Engine                │
       │   • OpenStreetMap Industrial Cadastre (PostGIS)         │
       │   • Hazardous installation proximity & buffer zones     │
       │   • ESA WorldCover LULC (Industrial, Forest, Cropland)  │
       │   • Infrastructure proximity (Pipelines, High-Voltage)  │
       └────────────────────────────┬────────────────────────────┘
                                    │
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │   Temporal Persistence & Clustering Engine              │
       │   • DBSCAN / Spatio-temporal cluster grouping           │
       │   • Revisit frequency & active persistence duration     │
       │   • Recurrence ratio across orbital passes              │
       │   • Seasonal concentration index                        │
       └────────────────────────────┬────────────────────────────┘
                                    │
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │   Multimodal Feature Engineering Pipeline               │
       │   • Thermal: FRP, Kelvin brightness, confidence         │
       │   • Spatial: Distance to industry, LULC one-hot enc     │
       │   • Temporal: Persistence log days, recurrence ratio    │
       └────────────────────────────┬────────────────────────────┘
                                    │
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │   Machine Learning Classification Engine                │
       │   • scikit-learn RandomForestClassifier (100 trees)     │
       │   • Calibrated class probabilities across 6 classes     │
       └────────────────────────────┬────────────────────────────┘
                                    │
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │   Independent Risk Scoring & Explainability Engine      │
       │   • Risk = f(Thermal, Proximity, Source Hazard, Time)   │
       │   • Structured, non-hallucinated physical evidence      │
       └────────────────────────────┬────────────────────────────┘
                                    │
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │   GIS Intelligence & Command Dashboard                  │
       │   • Leaflet radar map, multi-layer spatial overlays     │
       │   • Incident alert dispatch & operational lifecycle     │
       │   • Time-series FRP/Brightness trajectory charts        │
       │   • Random Forest Gini feature diagnostic benchmarks    │
       └─────────────────────────────────────────────────────────┘
```

---

## 4. Technology Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Leaflet / React-Leaflet, Recharts, Lucide Icons
- **Backend:** Python 3.10+, FastAPI, Pydantic v2, SQLAlchemy, Uvicorn
- **Geospatial:** PostGIS, GeoPandas, Shapely, Haversine geodesic calculations
- **Machine Learning:** Python, NumPy, pandas, scikit-learn (`RandomForestClassifier`), joblib
- **Database:** PostgreSQL 15+ with PostGIS extensions
- **Runtime & Deployment:** Docker, Docker Compose, Express + Vite full-stack middleware (Container Port 3000)

---

## 5. Database Design (PostgreSQL + PostGIS)

The relational schema is defined in `database/schema.sql`:

1. `industrial_facilities`:
   - `id`, `name`, `facility_type`, `hazard_level`, `operator`, `is_hazardous`
   - Spatial geometry: `location GEOMETRY(Point, 4326)` with spatial index `idx_facilities_geom`
2. `thermal_events`:
   - `id`, `latitude`, `longitude`, `brightness`, `frp`, `confidence`, `satellite`, `timestamp`, `cluster_id`
   - Spatial geometry: `geom GEOMETRY(Point, 4326)` with spatial index `idx_thermal_events_geom`
3. `geo_context`:
   - `event_id`, `nearest_facility_id`, `distance_to_industry_m`, `land_cover`, `infrastructure_nearby`, `road_distance_m`
4. `temporal_profiles`:
   - `cluster_id`, `observation_count`, `frequency_per_week`, `recurrence_ratio`, `persistence_days`, `is_persistent`, `seasonal_pattern`
5. `classifications`:
   - `event_id`, `predicted_class`, `confidence`, `risk_level`, `risk_score_numeric`, `persistence_score`, `evidence_json`, `feature_vector_json`, `model_version`
6. `alerts`:
   - `id`, `event_id`, `severity`, `title`, `description`, `action_recommended`, `status` (`ACTIVE`, `ACKNOWLEDGED`, `RESOLVED`), `created_at`

---

## 6. Geospatial Processing Layer

The geospatial engine executes real spatial calculations rather than cosmetic coordinate displays:
- **Geodesic Distance Calculation:** Uses Haversine / PostGIS `ST_Distance` to compute exact meter-accurate distances from hotspots to registered industrial perimeters.
- **Radial Cadastral Queries:** Scans for industrial installations within multi-tier safety zones (500m high-density, 1000m security buffer, 2500m hazard envelope).
- **Land-Use / Land-Cover Mapping:** Intersects observations with high-resolution land-cover maps (`industrial`, `cropland`, `dense_forest`, `mining_pit`, `open_land`).
- **Critical Infrastructure Proximity:** Computes distances to pipelines, major transportation corridors, and electrical transmission corridors.

---

## 7. Temporal Intelligence Engine

The temporal engine analyzes multi-pass satellite revisits to distinguish one-off thermal transients from continuous industrial infrastructure:
- **Spatio-Temporal Clustering:** Groups observations within a 1.2 km spatial radius and a sliding multi-week temporal window.
- **Persistence Duration:** Calculates elapsed days between the initial detection and the latest revisit.
- **Revisit Recurrence Ratio:** Evaluates the proportion of orbital passes where a thermal signature was detected:
  $$\text{Recurrence Ratio} = \frac{N_{\text{detected passes}}}{N_{\text{total orbital revisits}}}$$
- **Classification Categorization:**
  - `PERSISTENT`: Active duration $\ge 21$ days with regular recurrence (characteristic of refinery flaring, smelters, continuous mining).
  - `RECURRING`: Intermittent periodic activity (seasonal agricultural residue clearing, periodic batch kiln operations).
  - `ONE-OFF`: Sudden, single-pass or short-duration thermal event ($< 3$ days), typical of acute industrial explosions or rapid-moving wildfires.

---

## 8. Multimodal Feature Engineering

The feature engineering pipeline extracts a normalized 12-dimensional structured feature vector:

| Feature Name | Category | Description |
|---|---|---|
| `brightness` | Thermal | Brightness temperature in Kelvin (normalized 200–600 K) |
| `frp` | Thermal | Fire Radiative Power in Megawatts (MW) |
| `firms_confidence` | Thermal | Normalized detection confidence ($0.0 - 1.0$) |
| `dist_industry_km` | Spatial | Distance to nearest industrial facility in kilometers |
| `is_industrial_zone` | Spatial | Binary flag (1.0 if distance $\le 0.8\text{ km}$) |
| `is_industrial_land` | Spatial | One-hot indicator for industrial land-use zoning |
| `is_forest_land` | Spatial | One-hot indicator for dense forest/tree canopy |
| `is_farmland` | Spatial | One-hot indicator for agricultural cropland |
| `is_mining_land` | Spatial | One-hot indicator for open-cast mining concession |
| `persistence_days_log` | Temporal | Log-transformed persistence duration: $\ln(1 + \text{days})$ |
| `observation_count` | Temporal | Cumulative count of satellite sensor detections |
| `recurrence_ratio` | Temporal | Recurrence frequency across orbital revisit passes |

---

## 9. Machine Learning Classification Pipeline

- **Classifier:** `RandomForestClassifier` (100 decision trees, Gini impurity criterion, balanced class weighting)
- **Target Classes (6):**
  1. `Industrial Fire`
  2. `Gas Flare`
  3. `Agricultural Burning`
  4. `Wildfire`
  5. `Mining`
  6. `Other`
- **Model Artifacts:** Serialized to `ml/models/random_forest_v1.pkl` and `ml/models/model_metadata.json`.
- **Inference Engine:** `ThermalSourceClassifier` loads the serialized model and outputs class probabilities and top prediction.
- **Feature Importance (Gini Impurity):**
  - Distance to Industrial Facility: ~28.5%
  - Industrial Land Cover: ~21.0%
  - Persistence Duration (log): ~16.5%
  - Observation Count: ~12.5%
  - Fire Radiative Power (FRP): ~9.5%
  - Brightness Temperature: ~6.5%
  - Forest / Cropland Proximity: ~5.5%

---

## 10. Explainability & Risk Scoring

### Confidence vs. Risk Principle
- **Confidence:** How statistically confident the ML model is in the predicted taxonomic class.
- **Operational Risk:** The emergency priority level (0–100) calculated independently from:
  $$\text{Risk Index} = 0.30 \cdot S_{\text{thermal}} + 0.25 \cdot S_{\text{proximity}} + 0.30 \cdot S_{\text{source\_hazard}} + 0.15 \cdot S_{\text{temporal\_urgency}}$$

### Risk Severity Tiers:
- **CRITICAL (86–100):** Sudden high-FRP industrial fires inside chemical/petrochemical battery zones.
- **HIGH (66–85):** Rapidly expanding forest wildfires threatening biodiversity reserves or settlements.
- **MEDIUM (36–65):** Cropland stubble burning, open-cast smoldering coal seams.
- **LOW (0–35):** Controlled, routine, permitted refinery flare operations.

### Explainable Evidence Protocol:
Every classification returns concrete, non-hallucinated evidence:
- *"Industrial facility within 320 m (Jamnagar Petrochemical Complex)"*
- *"ESA WorldCover confirms industrial land-use zoning"*
- *"Persistent thermal signature across 84 days with 142 satellite revisits"*
- *"Thermal intensity FRP 48.5 MW conforms to standard gas flaring profile"*

---

## 11. REST API Overview

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health status, version, and active provider mode |
| `GET` | `/api/hotspots` | Query thermal hotspots with class, risk, persistence, and bbox filters |
| `GET` | `/api/hotspots/{id}` | Detailed telemetry profile for a specific thermal observation |
| `GET` | `/api/hotspots/{id}/context` | Geospatial proximity and land-cover environmental context |
| `GET` | `/api/hotspots/{id}/classification` | ML prediction, class probabilities, and explainable evidence |
| `GET` | `/api/hotspots/{id}/timeline` | Historical orbit passes and time-series FRP/brightness values |
| `GET` | `/api/statistics` | High-level operational metrics and taxonomic distribution counts |
| `GET` | `/api/alerts` | Active high & critical severity operational incident notices |
| `PATCH` | `/api/alerts/{id}/status` | Update incident status (`ACTIVE`, `ACKNOWLEDGED`, `RESOLVED`) |
| `POST` | `/api/analyze` | On-demand inference pipeline execution for custom coordinates and FRP |
| `GET` | `/api/ml/model-info` | ML model architecture specs, hyperparameters, and feature importances |
| `GET` | `/api/filters` | Dynamic filter options (regions, classes, risk levels) |

---

## 12. SIH Demonstration Scenarios

The platform includes 4 calibrated scenarios matching real-world Indian operational environments:

1. **Scenario 1: Controlled Gas Flare — Jamnagar Refinery, Gujarat**
   - Coordinates: `22.3850° N, 69.8320° E`
   - FRP: 48.5 MW | Brightness: 342.1 K | Distance to Facility: 180 m
   - Persistence: 84 days | Recurrence: 94%
   - **Classification:** `Gas Flare` (Confidence: 94.2%, Risk: LOW, Status: Routine)
2. **Scenario 2: Agricultural Stubble Burning — Sangrur, Punjab**
   - Coordinates: `30.2450° N, 75.8420° E`
   - FRP: 18.4 MW | Brightness: 318.5 K | Distance to Facility: 8,400 m
   - Land-Use: `cropland` | Persistence: 3 days | Recurrence: 22%
   - **Classification:** `Agricultural Burning` (Confidence: 92.5%, Risk: MEDIUM)
3. **Scenario 3: Forest Wildfire — Simlipal Biosphere Reserve, Odisha**
   - Coordinates: `21.6520° N, 86.3210° E`
   - FRP: 94.2 MW | Brightness: 382.4 K | Distance to Facility: 34,200 m
   - Land-Use: `dense_forest` | Persistence: 2 days | Recurrence: 15%
   - **Classification:** `Wildfire` (Confidence: 96.1%, Risk: HIGH)
4. **Scenario 4: Open-Cast Coal Mining — Gevra Mine, Korba, Chhattisgarh**
   - Coordinates: `22.3420° N, 82.5840° E`
   - FRP: 32.8 MW | Brightness: 328.6 K | Distance to Facility: 420 m
   - Land-Use: `mining_pit` | Persistence: 62 days | Recurrence: 81%
   - **Classification:** `Mining` (Confidence: 89.8%, Risk: MEDIUM)

---

## 13. Local Setup & Execution

### Prerequisites
- Node.js 20+ (npm 10+)
- Python 3.10+
- (Optional) PostgreSQL 15+ with PostGIS 3.3+

### Quick Start (Web Application)
```bash
# 1. Install dependencies
npm install

# 2. Launch full-stack development environment
npm run dev

# 3. Access GIS Command Center
# Open http://localhost:3000 in your browser
```

### Running Backend Unit & Integration Tests (45 Tests)
```bash
# Execute Python backend test suite covering API, spatial joins, ML inference, and risk scoring
python3 -m unittest discover backend/tests
```

### Optional: Train & Serialize Random Forest Classifier
```bash
python3 ml/training/model_training.py
```

---

## 14. Real Data Integration Points

The system is built on decoupled provider abstractions (`FIRMSDataProvider`, `OSMDataProvider`, `LandCoverProvider`):

1. **NASA FIRMS Integration (`RealFIRMSProvider`):**
   - Obtain a free MAP Key from [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/map_key/).
   - Add `FIRMS_API_KEY=your_key_here` to `.env`.
   - The provider fetches real-time VIIRS/MODIS CSV streams for any bounding box or country code.
2. **OpenStreetMap Overpass API (`RealOSMProvider`):**
   - Connects to `https://overpass-api.de/api/interpreter`.
   - Executes dynamic Overpass QL queries for `man_made=industrial`, `industrial=refinery`, `landuse=industrial`, and `amenity=fuel_storage`.
3. **ESA WorldCover 10m LULC (`RealLandCoverProvider`):**
   - Interfaces with Sentinel-2 / ESA WorldCover COG tiles via WCS/WMS or Earth Engine REST endpoints.

---

## 15. Limitations & Engineering Disclosures

1. **Demo Dataset Baseline:** Out of the box, ThermoGuard AI operates in **DEMO MODE** using calibrated real-world Indian coordinates and satellite observation values to ensure zero external dependency failures during evaluation.
2. **Satellite Temporal Revisit Gaps:** Polar-orbiting VIIRS and MODIS satellites have 12–24 hour revisit intervals. Very rapid, transient flare surges between orbital passes may experience observation latency until geostationary (e.g. INSAT-3D) feeds are coupled.
3. **Cloud Cover Interference:** Optical/infrared satellite sensors cannot penetrate dense cloud obscuration; integration with Synthetic Aperture Radar (SAR) is planned for all-weather surveillance.

---

## 16. Future Improvements & Roadmap

- **SAR Satellite Integration:** Ingest Sentinel-1 SAR and NISAR imagery for all-weather cloud-penetrating industrial monitoring.
- **Geostationary Sensor Coupling:** Ingest INSAT-3DR / GOES-16 15-minute thermal feeds for instant alert latency (< 15 min).
- **Automated UAV Dispatch Integration:** Webhook triggers for automated drone fleet dispatch to verify critical industrial perimeter breaches.
- **Gradient Boosting (XGBoost / LightGBM) Upgrade:** Support multi-model tabular ensembles with automated hyperparameter tuning.

---

**SIH 2026 | PS ID: SIH26162 | National Technical Research Organisation (NTRO)**
