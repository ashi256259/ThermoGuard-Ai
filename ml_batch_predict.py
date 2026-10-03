import sys
import json
import warnings
warnings.filterwarnings("ignore")
import joblib
import pandas as pd
import os

FALLBACKS = {
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

try:
    model_path = os.path.join(os.path.dirname(__file__), "ml", "models", "random_forest_v1.joblib")
    model = joblib.load(model_path)
    classes = model.classes_
    
    input_data = json.loads(sys.argv[1])
    
    if not input_data:
        print(json.dumps([]))
        sys.exit(0)
        
    df = pd.DataFrame(input_data)
    
    if hasattr(model, "feature_names_in_"):
        for col in model.feature_names_in_:
            if col not in df.columns:
                df[col] = FALLBACKS.get(col, 0.0)
        df = df[model.feature_names_in_]
        
    preds = model.predict(df)
    probs = model.predict_proba(df)
    
    results = []
    for i, pred in enumerate(preds):
        class_probs = {str(c): float(p) for c, p in zip(classes, probs[i])}
        confidence = class_probs.get(str(pred), 0.0)
        results.append({
            "predicted_class": str(pred),
            "confidence": confidence,
            "class_probabilities": class_probs,
            "model_version": "random_forest_v1.0.0"
        })
    print(json.dumps(results))
except Exception as e:
    print(json.dumps({"error": str(e)}))
