import json, joblib, math, pandas as pd
from collections import Counter

m = joblib.load('ml/models/random_forest_v1.joblib')

with open('test_live.json', 'w') as f:
    pass

import urllib.request
req = urllib.request.Request('http://localhost:3000/api/hotspots')
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode('utf-8'))
live = [h for h in data if h['event']['source'] == 'NASA_FIRMS_LIVE']

def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlon/2)**2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1-a))

FACILITIES = [
    # Refineries & Petrochem
    {"name": "Jamnagar Mega Refinery", "type": "oil_refinery", "lat": 22.3582, "lon": 69.8645, "operator": "Reliance"},
    {"name": "Hazira Petrochemicals", "type": "chemical_plant", "lat": 21.1124, "lon": 72.6718, "operator": "ONGC"},
    {"name": "Vadodara IOCL Gujarat Refinery", "type": "oil_refinery", "lat": 22.368, "lon": 73.125, "operator": "IOCL"},
    {"name": "Mumbai BPCL Mahul Refinery", "type": "oil_refinery", "lat": 19.010, "lon": 72.895, "operator": "BPCL"},
    {"name": "Mangalore MRPL Refinery", "type": "oil_refinery", "lat": 12.992, "lon": 74.828, "operator": "MRPL"},
    {"name": "Kochi BPCL Refinery", "type": "oil_refinery", "lat": 9.993, "lon": 76.358, "operator": "BPCL"},
    {"name": "Chennai Manali CPCL Refinery", "type": "oil_refinery", "lat": 13.163, "lon": 80.262, "operator": "CPCL"},
    {"name": "Visakhapatnam HPCL Refinery", "type": "oil_refinery", "lat": 17.688, "lon": 83.245, "operator": "HPCL"},
    {"name": "Paradip IOCL Refinery", "type": "oil_refinery", "lat": 20.274, "lon": 86.671, "operator": "IOCL"},
    {"name": "Haldia IOCL Refinery", "type": "oil_refinery", "lat": 22.052, "lon": 88.082, "operator": "IOCL"},
    {"name": "Panipat IOCL Refinery", "type": "oil_refinery", "lat": 29.431, "lon": 76.883, "operator": "IOCL"},
    {"name": "Mathura IOCL Refinery", "type": "oil_refinery", "lat": 27.301, "lon": 77.702, "operator": "IOCL"},
    {"name": "Bina Bharat Oman Refinery", "type": "oil_refinery", "lat": 24.192, "lon": 78.182, "operator": "BORL"},
    {"name": "Bathinda HMEL Refinery", "type": "oil_refinery", "lat": 29.983, "lon": 74.931, "operator": "HMEL"},
    {"name": "Numaligarh Refinery", "type": "oil_refinery", "lat": 26.582, "lon": 93.763, "operator": "NRL"},
    # Steel Works
    {"name": "Bellary JSW Vijayanagar Steel", "type": "steel_plant", "lat": 15.195, "lon": 76.668, "operator": "JSW"},
    {"name": "Angul Jindal Steel Plant", "type": "steel_plant", "lat": 20.841, "lon": 85.086, "operator": "JSPL"},
    {"name": "Tata Steel Jamshedpur", "type": "steel_plant", "lat": 22.801, "lon": 86.202, "operator": "Tata"},
    {"name": "Rourkela Steel Plant", "type": "steel_plant", "lat": 22.223, "lon": 84.871, "operator": "SAIL"},
    {"name": "Bhilai Steel Plant", "type": "steel_plant", "lat": 21.182, "lon": 81.381, "operator": "SAIL"},
    {"name": "Bokaro Steel Plant", "type": "steel_plant", "lat": 23.671, "lon": 86.172, "operator": "SAIL"},
    # Major Mining Basins
    {"name": "Bellary-Sandur Iron Ore Pithead", "type": "mine", "lat": 15.085, "lon": 76.545, "operator": "NMDC / Sandur"},
    {"name": "Gevra & Dipka Opencast Coal Mines", "type": "mine", "lat": 22.3418, "lon": 82.5934, "operator": "SECL"},
    {"name": "Jharia Coalfield Pithead", "type": "mine", "lat": 23.7481, "lon": 86.4162, "operator": "BCCL"},
    {"name": "Singrauli Coal Basin Pit", "type": "mine", "lat": 24.112, "lon": 82.684, "operator": "NCL"},
    {"name": "Neyveli Lignite Open Pit", "type": "mine", "lat": 11.583, "lon": 79.485, "operator": "NLC"},
    {"name": "Keonjhar Barbil Iron Ore Mines", "type": "mine", "lat": 22.115, "lon": 85.385, "operator": "OMC"},
    # Thermal & Nuclear Power
    {"name": "NTPC Vindhyachal Super Thermal", "type": "power_station", "lat": 24.0984, "lon": 82.6641, "operator": "NTPC"},
    {"name": "NTPC Ramagundam Super Thermal", "type": "power_station", "lat": 18.753, "lon": 79.522, "operator": "NTPC"},
    {"name": "Mundra Thermal Power Plant", "type": "power_station", "lat": 22.831, "lon": 69.712, "operator": "Adani"},
    {"name": "Kudankulam Nuclear Complex", "type": "power_station", "lat": 8.169, "lon": 77.712, "operator": "NPCIL"},
    {"name": "Tuticorin Thermal Power", "type": "power_station", "lat": 8.752, "lon": 78.182, "operator": "TANGEDCO"}
]

def get_land_cover(lat, lon):
    # Forest Reserves & Hill Tracts
    # Western Ghats
    if (8.0 <= lat <= 21.0 and 73.2 <= lon <= 77.0) and not (14.8 <= lat <= 15.5 and 75.8 <= lon <= 77.2):
        # Check if high elevation / forest corridor
        if (73.4 <= lon <= 75.6) or (lat <= 11.5 and 76.0 <= lon <= 77.3):
            return "dense_forest"
    # Eastern Ghats
    if 17.0 <= lat <= 19.5 and 81.5 <= lon <= 84.5:
        return "dense_forest"
    # Simlipal
    if 21.3 <= lat <= 22.3 and 86.0 <= lon <= 86.7:
        return "dense_forest"
    # Central India / Satpura / Bastar forests
    if 18.5 <= lat <= 23.5 and 79.5 <= lon <= 83.5:
        # Some parts mining, some forest
        if 22.1 <= lat <= 22.6 and 82.2 <= lon <= 82.9:
            return "mining_pit"
        return "dense_forest"
    # Northeast forests
    if 23.5 <= lat <= 28.5 and 90.0 <= lon <= 97.2:
        return "dense_forest"

    # Mining zones
    if 15.0 <= lat <= 15.4 and 76.3 <= lon <= 76.9:
        return "mining_pit"
    if 22.25 <= lat <= 22.45 and 82.5 <= lon <= 82.7:
        return "mining_pit"
    if 23.65 <= lat <= 23.85 and 86.3 <= lon <= 86.55:
        return "mining_pit"
    if 24.0 <= lat <= 24.3 and 82.5 <= lon <= 82.8:
        return "mining_pit"
    if 11.5 <= lat <= 11.7 and 79.4 <= lon <= 79.6:
        return "mining_pit"

    # Cropland / Agriculture
    # Indo-Gangetic Plain
    if 24.5 <= lat <= 32.0 and 74.0 <= lon <= 88.5:
        return "cropland"
    # Deccan agrarian belts
    if 14.5 <= lat <= 19.5 and 75.0 <= lon <= 79.5:
        return "cropland"
    # Tamil Nadu agrarian plains
    if 8.5 <= lat <= 12.0 and 77.2 <= lon <= 79.8:
        return "cropland"
    # Sri Lanka agrarian plain
    if 7.0 <= lat <= 9.5 and 80.0 <= lon <= 81.8:
        return "cropland"

    return "open_land"

records = []
for h in live:
    e = h['event']
    lat, lon = e['latitude'], e['longitude']
    # Nearest facility
    min_d = float('inf')
    nearest = FACILITIES[0]
    for fac in FACILITIES:
        d = haversine(lat, lon, fac['lat'], fac['lon'])
        if d < min_d:
            min_d = d
            nearest = fac
    
    lc = get_land_cover(lat, lon)
    is_ind = 1.0 if (min_d <= 2.5 or lc == "industrial") else 0.0
    is_mine = 1.0 if (lc == "mining_pit" or (nearest["type"] == "mine" and min_d <= 5.0)) else 0.0
    is_forest = 1.0 if (lc == "dense_forest") else 0.0
    is_farm = 1.0 if (lc == "cropland") else 0.0
    is_infra = 1.0 if (is_ind or is_mine or min_d <= 5.0) else 0.0
    is_open = 1.0 if (not is_ind and not is_mine and not is_forest and not is_farm) else 0.0

    frp = e['frp']
    bright = e['brightness']
    conf = e['confidence'] / 100.0

    # Cluster persistence
    obs_cnt = 2.0 if is_ind else 1.0
    active_days = 25.0 if is_ind else (4.0 if is_forest else 1.0)
    freq = 6.0 if is_ind else 1.0
    recur = 0.6 if is_ind else (0.3 if is_forest else 0.1)
    persist_score = 0.85 if is_ind else (0.3 if is_forest else 0.1)
    season_score = 0.85 if is_farm else (0.5 if is_forest else 0.15)
    season_conc = 0.85 if is_farm else (0.5 if is_forest else 0.15)

    rec = {
        'brightness': bright,
        'frp': frp,
        'firms_confidence': conf,
        'scan': 0.40,
        'track': 0.40,
        'daynight_flag': 1.0 if e['daynight'] == 'D' else 0.0,
        'distance_to_industry_km': round(min_d, 2),
        'industrial_facility_count': 1.0 if min_d <= 10.0 else 0.0,
        'industrial_nearby_flag': is_ind,
        'mining_nearby_flag': is_mine,
        'infrastructure_nearby_flag': is_infra,
        'forest_context': is_forest,
        'agricultural_context': is_farm,
        'urban_context': 0.0,
        'open_land_context': is_open,
        'observation_count': obs_cnt,
        'active_days': active_days,
        'active_duration': active_days,
        'observation_frequency': freq,
        'recurrence_count': round(active_days * recur),
        'recurrence_ratio': recur,
        'average_revisit_interval': 24.0,
        'median_revisit_interval': 24.0,
        'persistence_score': persist_score,
        'seasonality_score': season_score,
        'seasonal_concentration': season_conc
    }
    records.append(rec)

df = pd.DataFrame(records)
preds = m.predict(df)
print("Classification Breakdown on LIVE events with real Geospatial Engine:")
print(Counter(preds))
