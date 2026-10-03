# ThermoGuard AI — Machine Learning Dataset Specifications
**Problem Statement ID: SIH26162** | **Phase 1**

## Dataset Principles & Ground-Truth Policy
- **No Fabricated Metrics**: We do NOT claim fictional training accuracy, false dataset sizes, or artificial ground truth.
- **Phase 1 Scope**: The architecture relies on calibrated prototype distributions representing the 4 core Hackathon scenarios.
- **Phase 7 Full Pipeline**: Supervised tabular models (Random Forest, XGBoost) will be trained using historical multi-temporal FIRMS observations merged with ground-truth cadastres.

## Tabular Feature Vector Specification (11 Features)
1. `brightness`: VIIRS Brightness temperature (Kelvin)
2. `frp`: Fire Radiative Power (MW)
3. `firms_confidence`: Sensor/algorithm confidence (0.0 to 1.0)
4. `dist_industry_km`: Haversine distance to nearest industrial facility (km)
5. `is_industrial_land`: Binary flag (1 if LULC == 'industrial', 0 otherwise)
6. `is_forest_land`: Binary flag (1 if LULC == 'dense_forest', 0 otherwise)
7. `is_farmland`: Binary flag (1 if LULC == 'cropland', 0 otherwise)
8. `is_mining_land`: Binary flag (1 if LULC == 'mining_pit', 0 otherwise)
9. `persistence_days_log`: Logarithmic scaling of active cluster persistence: `ln(1 + persistence_days)`
10. `recurrence_ratio`: Observation ratio over available satellite revisit passes (0.0 to 1.0)
11. `observation_frequency`: Weekly observation density
