import sys
import json
import joblib
import pandas as pd
import os

try:
    model_path = os.path.join(os.path.dirname(__file__), "ml", "models", "random_forest_v1.joblib")
    model = joblib.load(model_path)
    classes = model.classes_
    
    input_data = json.loads(sys.argv[1])
    features = input_data.get("features", {})
    df = pd.DataFrame([features])
    
    # Ensure correct columns
    if hasattr(model, "feature_names_in_"):
        for col in model.feature_names_in_:
            if col not in df.columns:
                df[col] = 0.0
        df = df[model.feature_names_in_]
        
    pred = model.predict(df)[0]
    probs = model.predict_proba(df)[0]
    
    class_probs = {str(c): float(p) for c, p in zip(classes, probs)}
    confidence = class_probs.get(str(pred), 0.0)
    
    print(json.dumps({
        "predicted_class": str(pred),
        "confidence": confidence,
        "class_probabilities": class_probs,
        "model_version": "random_forest_v1.0.0"
    }))
except Exception as e:
    print(json.dumps({"error": str(e)}))
