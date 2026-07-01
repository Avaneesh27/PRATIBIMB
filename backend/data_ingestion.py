import os
import numpy as np
import math

# Coordinate structures matching India grid specifications (0.25 degree resolution)
# Spanning latitudes 6.5 to 38.5 and longitudes 66.5 to 100.0 -> shape (129, 135)
INDIA_GRID_SHAPE = (129, 135)
INDIA_LAT_START, INDIA_LAT_END = 6.5, 38.5
INDIA_LON_START, INDIA_LON_END = 66.5, 100.0
INDIA_CELL_SIZE = 0.25

# Aliases for backward compatibility with other project modules
MAHA_GRID_SHAPE = INDIA_GRID_SHAPE
MAHA_LAT_START, MAHA_LAT_END = INDIA_LAT_START, INDIA_LAT_END
MAHA_LON_START, MAHA_LON_END = INDIA_LON_START, INDIA_LON_END
MAHA_CELL_SIZE = INDIA_CELL_SIZE

# 36 Major Cities/Districts of India with centroids and baseline vulnerabilities
# Dataset covers all geographic zones of India
DISTRICTS = {
    "Delhi": {"lat": 28.61, "lon": 77.20, "vuln": 0.55, "ndvi": 0.35, "dem": 215},
    "Mumbai": {"lat": 19.07, "lon": 72.87, "vuln": 0.60, "ndvi": 0.30, "dem": 14},
    "Kolkata": {"lat": 22.57, "lon": 88.36, "vuln": 0.65, "ndvi": 0.40, "dem": 9},
    "Chennai": {"lat": 13.08, "lon": 80.27, "vuln": 0.50, "ndvi": 0.32, "dem": 6},
    "Bengaluru": {"lat": 12.97, "lon": 77.59, "vuln": 0.40, "ndvi": 0.45, "dem": 920},
    "Hyderabad": {"lat": 17.38, "lon": 78.48, "vuln": 0.48, "ndvi": 0.38, "dem": 505},
    "Ahmedabad": {"lat": 23.02, "lon": 72.57, "vuln": 0.70, "ndvi": 0.28, "dem": 53},
    "Jaipur": {"lat": 26.91, "lon": 75.78, "vuln": 0.85, "ndvi": 0.22, "dem": 431},
    "Lucknow": {"lat": 26.85, "lon": 80.94, "vuln": 0.58, "ndvi": 0.42, "dem": 123},
    "Patna": {"lat": 25.59, "lon": 85.13, "vuln": 0.72, "ndvi": 0.45, "dem": 53},
    "Bhopal": {"lat": 23.25, "lon": 77.41, "vuln": 0.52, "ndvi": 0.50, "dem": 427},
    "Guwahati": {"lat": 26.14, "lon": 91.73, "vuln": 0.45, "ndvi": 0.75, "dem": 55},
    "Srinagar": {"lat": 34.08, "lon": 74.79, "vuln": 0.60, "ndvi": 0.62, "dem": 1585},
    "Leh": {"lat": 34.15, "lon": 77.57, "vuln": 0.75, "ndvi": 0.15, "dem": 3500},
    "Bhubaneswar": {"lat": 20.29, "lon": 85.82, "vuln": 0.55, "ndvi": 0.55, "dem": 45},
    "Thiruvananthapuram": {"lat": 8.52, "lon": 76.93, "vuln": 0.35, "ndvi": 0.72, "dem": 10},
    "Ranchi": {"lat": 23.34, "lon": 85.30, "vuln": 0.50, "ndvi": 0.58, "dem": 651},
    "Raipur": {"lat": 21.25, "lon": 81.62, "vuln": 0.58, "ndvi": 0.52, "dem": 298},
    "Dehradun": {"lat": 30.31, "lon": 78.03, "vuln": 0.42, "ndvi": 0.68, "dem": 640},
    "Shimla": {"lat": 31.10, "lon": 77.17, "vuln": 0.48, "ndvi": 0.65, "dem": 2206},
    "Panaji": {"lat": 15.49, "lon": 73.82, "vuln": 0.30, "ndvi": 0.70, "dem": 7},
    "Itanagar": {"lat": 27.08, "lon": 93.60, "vuln": 0.40, "ndvi": 0.82, "dem": 440},
    "Port Blair": {"lat": 11.62, "lon": 92.72, "vuln": 0.38, "ndvi": 0.80, "dem": 16},
    "Imphal": {"lat": 24.81, "lon": 93.93, "vuln": 0.46, "ndvi": 0.70, "dem": 786},
    "Shillong": {"lat": 25.57, "lon": 91.88, "vuln": 0.35, "ndvi": 0.78, "dem": 1525},
    "Chandigarh": {"lat": 30.73, "lon": 76.77, "vuln": 0.38, "ndvi": 0.48, "dem": 321},
    "Indore": {"lat": 22.71, "lon": 75.85, "vuln": 0.45, "ndvi": 0.40, "dem": 553},
    "Pune": {"lat": 18.52, "lon": 73.85, "vuln": 0.35, "ndvi": 0.48, "dem": 560},
    "Nagpur": {"lat": 21.14, "lon": 79.08, "vuln": 0.45, "ndvi": 0.52, "dem": 310},
    "Jodhpur": {"lat": 26.23, "lon": 73.01, "vuln": 0.88, "ndvi": 0.18, "dem": 231},
    "Varanasi": {"lat": 25.31, "lon": 82.97, "vuln": 0.62, "ndvi": 0.44, "dem": 80},
    "Visakhapatnam": {"lat": 17.68, "lon": 83.21, "vuln": 0.48, "ndvi": 0.50, "dem": 4},
    "Kochi": {"lat": 9.93, "lon": 76.26, "vuln": 0.40, "ndvi": 0.68, "dem": 2},
    "Amritsar": {"lat": 31.63, "lon": 74.87, "vuln": 0.50, "ndvi": 0.52, "dem": 234},
    "Agartala": {"lat": 23.83, "lon": 91.28, "vuln": 0.48, "ndvi": 0.72, "dem": 15},
    "Darjeeling": {"lat": 27.04, "lon": 88.26, "vuln": 0.40, "ndvi": 0.75, "dem": 2042}
}

def is_in_india(lat, lon):
    """
    Checks if a coordinate point falls inside India's general political boundary.
    Excludes large bodies of water (Arabian Sea, Bay of Bengal) and neighboring countries.
    """
    # Check general bounding box
    if not (8.0 <= lat <= 37.0 and 68.0 <= lon <= 97.0):
        return False
        
    # Exclude Arabian Sea (Southwest)
    if lat < 20.0:
        # Southern peninsula narrows down
        # At lat 8: lon between 76.5 and 78.5
        # At lat 15: lon between 73.5 and 82.5
        min_lon = 72.0 + (20.0 - lat) * 0.45
        max_lon = 85.0 - (20.0 - lat) * 0.7
        if not (min_lon <= lon <= max_lon):
            return False
            
    # Exclude Bay of Bengal (Southeast)
    if 13.0 <= lat <= 21.0 and lon > 80.0:
        # Coastline curves inward
        if lon > 80.0 + (lat - 13.0) * 0.8:
            return False
            
    # Exclude Pakistan/Arabian sea (West of Rajasthan/Gujarat)
    if 20.0 <= lat <= 25.0 and lon < 68.5:
        return False
    if 25.0 < lat <= 30.0 and lon < 70.0:
        return False
    if lat > 30.0 and lon < 73.0:
        return False
        
    # Exclude China/Tibet/Nepal (North/Northeast border)
    # Nepal/Himalayas border: from (80E, 30N) to (88E, 27N)
    if 27.0 <= lat <= 31.0 and 80.0 <= lon <= 88.0:
        border_lat = 31.0 - (lon - 80.0) * 0.45
        if lat > border_lat:
            return False
            
    # Bhutan/Tibet border above Northeast:
    if lat > 27.5 and 88.0 < lon <= 92.0:
        return False
    # Tibet border above Arunachal:
    if lat > 28.5 and lon > 92.0:
        return False
        
    # Bangladesh entry gap:
    # Between 22N and 25N, and 88.5E and 92.0E is Bangladesh
    if 22.0 <= lat <= 25.0 and 88.5 <= lon <= 92.0:
        # Tripura/Mizoram tip (91.5 to 93E, 22 to 24.5N) is India
        if not (lon >= 91.0 and lat <= 24.5):
            return False
            
    # Myanmar border (East of Northeast):
    if 22.0 <= lat <= 27.0 and lon > 95.5:
        return False

    return True

# Keep alias to support pre-existing imports
is_in_maharashtra = is_in_india

def generate_maharashtra_metadata():
    """
    Analyzes the grid coordinates and creates a static mask mapping active cells.
    """
    lats = np.linspace(MAHA_LAT_END, MAHA_LAT_START, MAHA_GRID_SHAPE[0]) # Top down (North to South)
    lons = np.linspace(MAHA_LON_START, MAHA_LON_END, MAHA_GRID_SHAPE[1]) # West to East
    
    mask = np.zeros(MAHA_GRID_SHAPE, dtype=bool)
    active_points = []
    
    for r in range(MAHA_GRID_SHAPE[0]):
        lat = lats[r]
        for c in range(MAHA_GRID_SHAPE[1]):
            lon = lons[c]
            if is_in_india(lat, lon):
                mask[r, c] = True
                active_points.append({
                    "r": r,
                    "c": c,
                    "lat": float(round(lat, 4)),
                    "lon": float(round(lon, 4))
                })
                
    return active_points, mask

# --- Precomputed Static Grids for 100x Speedup ---
TEMP_GRID_SHAPE = (31, 31)
RAIN_GRID_SHAPE = (129, 135)

TEMP_LATS = np.linspace(37.5, 7.5, TEMP_GRID_SHAPE[0])
TEMP_LONS = np.linspace(67.5, 97.5, TEMP_GRID_SHAPE[1])

RAIN_LATS = np.linspace(38.5, 6.5, RAIN_GRID_SHAPE[0])
RAIN_LONS = np.linspace(66.5, 100.0, RAIN_GRID_SHAPE[1])

# For backward compatibility
_lats = RAIN_LATS
_lons = RAIN_LONS

def _get_static_dem_ndvi_det(lat, lon):
    """Deterministic, noise-free calculation of DEM and NDVI to speed up precomputation."""
    # 1. Elevation (DEM)
    if lat >= 30.0:
        dem = 1200.0 + (lat - 30.0) * 800.0 + (lon - 73.0) * 100.0
        if lon > 76.0:
            dem = max(dem, 3000.0)
    elif lat >= 27.0 and lon >= 88.0:
        dem = 1500.0 + (lat - 27.0) * 1000.0
    elif 10.0 <= lat <= 20.0 and (73.0 <= lon <= 74.5):
        dist_to_crest = abs(lon - 73.8)
        dem = 900.0 * math.exp(-(dist_to_crest / 0.3)**2) + 150.0
    elif 10.0 <= lat <= 18.0 and (78.0 <= lon <= 80.0):
        dem = 500.0
    else:
        if 24.0 <= lat <= 28.0 and 75.0 <= lon <= 88.0:
            dem = 150.0 + (88.0 - lon) * 10.0
        else:
            dem = 500.0
    dem = max(5.0, dem)
    
    # 2. NDVI
    if lon < 74.0 and 23.0 <= lat <= 29.0:
        ndvi = 0.12 + (lon - 68.0) * 0.02
    elif lat >= 33.0 and lon >= 76.0:
        ndvi = 0.08
    elif lon >= 90.0:
        ndvi = 0.75
    elif 10.0 <= lat <= 20.0 and lon <= 74.0:
        ndvi = 0.70
    else:
        ndvi = 0.38
    ndvi = np.clip(ndvi, 0.05, 0.95)
    return float(round(dem, 1)), float(round(ndvi, 2))

# Load GeoJSON boundary data of India states to build a strict land mask
try:
    import json
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    geojson_path = os.path.join(backend_dir, "..", "frontend", "src", "assets", "india_states_simplified.json")
    with open(geojson_path, 'r', encoding='utf-8') as f:
        india_states = json.load(f)

    # Precompute state bounding boxes for speed
    state_bounding_boxes = []
    for feature in india_states['features']:
        geom = feature['geometry']
        lons_list = []
        lats_list = []
        if geom['type'] == 'Polygon':
            for ring in geom['coordinates']:
                for pt in ring:
                    lons_list.append(pt[0])
                    lats_list.append(pt[1])
        elif geom['type'] == 'MultiPolygon':
            for poly in geom['coordinates']:
                for ring in poly:
                    for pt in ring:
                        lons_list.append(pt[0])
                        lats_list.append(pt[1])
        if lons_list:
            state_bounding_boxes.append((min(lons_list), max(lons_list), min(lats_list), max(lats_list), geom))
except Exception as e:
    print(f"Warning: Could not load India states GeoJSON boundaries: {e}")
    state_bounding_boxes = []

def point_in_polygon(x, y, poly):
    """Ray-casting point-in-polygon test."""
    n = len(poly)
    inside = False
    p1x, p1y = poly[0]
    for i in range(n + 1):
        p2x, p2y = poly[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xints = (y - p1y) * (p2x - p1x) / (y - p1y) if (p2y - p1y) == 0 else (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xints:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside

def is_inside_geometry(lon, lat, geometry):
    geom_type = geometry['type']
    coords = geometry['coordinates']
    if geom_type == 'Polygon':
        if point_in_polygon(lon, lat, coords[0]):
            for hole in coords[1:]:
                if point_in_polygon(lon, lat, hole):
                    return False
            return True
    elif geom_type == 'MultiPolygon':
        for polygon in coords:
            if point_in_polygon(lon, lat, polygon[0]):
                in_hole = False
                for hole in polygon[1:]:
                    if point_in_polygon(lon, lat, hole):
                        in_hole = True
                        break
                if not in_hole:
                    return True
    return False

def is_in_india_geojson(lat, lon):
    if not (6.0 <= lat <= 38.0 and 66.0 <= lon <= 100.0):
        return False
    if not state_bounding_boxes:
        return is_in_india(lat, lon)
    for min_lon, max_lon, min_lat, max_lat, geom in state_bounding_boxes:
        if min_lon <= lon <= max_lon and min_lat <= lat <= max_lat:
            if is_inside_geometry(lon, lat, geom):
                return True
    return False

# Pre-allocate static grids for BOTH TEMP and RAIN
STATIC_INDIA_MASK_TEMP = np.zeros(TEMP_GRID_SHAPE, dtype=bool)
STATIC_DEM_GRID_TEMP = np.zeros(TEMP_GRID_SHAPE)
STATIC_NDVI_GRID_TEMP = np.zeros(TEMP_GRID_SHAPE)

STATIC_INDIA_MASK_RAIN = np.zeros(RAIN_GRID_SHAPE, dtype=bool)
STATIC_DEM_GRID_RAIN = np.zeros(RAIN_GRID_SHAPE)
STATIC_NDVI_GRID_RAIN = np.zeros(RAIN_GRID_SHAPE)

# Compatibility aliases
STATIC_INDIA_MASK = STATIC_INDIA_MASK_RAIN
STATIC_DEM_GRID = STATIC_DEM_GRID_RAIN
STATIC_NDVI_GRID = STATIC_NDVI_GRID_RAIN

# Precompute TEMP static grids
for r in range(TEMP_GRID_SHAPE[0]):
    lat = TEMP_LATS[r]
    for c in range(TEMP_GRID_SHAPE[1]):
        lon = TEMP_LONS[c]
        if is_in_india_geojson(lat, lon):
            STATIC_INDIA_MASK_TEMP[r, c] = True
            dem, ndvi = _get_static_dem_ndvi_det(lat, lon)
            STATIC_DEM_GRID_TEMP[r, c] = dem
            STATIC_NDVI_GRID_TEMP[r, c] = ndvi

# Precompute RAIN static grids
for r in range(RAIN_GRID_SHAPE[0]):
    lat = RAIN_LATS[r]
    for c in range(RAIN_GRID_SHAPE[1]):
        lon = RAIN_LONS[c]
        if is_in_india_geojson(lat, lon):
            STATIC_INDIA_MASK_RAIN[r, c] = True
            dem, ndvi = _get_static_dem_ndvi_det(lat, lon)
            STATIC_DEM_GRID_RAIN[r, c] = dem
            STATIC_NDVI_GRID_RAIN[r, c] = ndvi

def get_grid_cell_dem_ndvi(lat, lon):
    """
    Optimized O(1) lookup of elevation (DEM) and NDVI using precomputed static grids.
    """
    r = np.argmin(np.abs(RAIN_LATS - lat))
    c = np.argmin(np.abs(RAIN_LONS - lon))
    return STATIC_DEM_GRID_RAIN[r, c], STATIC_NDVI_GRID_RAIN[r, c]

# Precomputed active list to prevent checking empty ocean coordinate checks in rendering/training loops
ACTIVE_COORDS_TEMP = []
for r in range(TEMP_GRID_SHAPE[0]):
    for c in range(TEMP_GRID_SHAPE[1]):
        if STATIC_INDIA_MASK_TEMP[r, c]:
            ACTIVE_COORDS_TEMP.append((r, c))

ACTIVE_COORDS_RAIN = []
for r in range(RAIN_GRID_SHAPE[0]):
    for c in range(RAIN_GRID_SHAPE[1]):
        if STATIC_INDIA_MASK_RAIN[r, c]:
            ACTIVE_COORDS_RAIN.append((r, c))

# Compatibility aliases
ACTIVE_COORDS = ACTIVE_COORDS_RAIN

def load_real_grid_data(day_of_year, grid_type, year=2024):
    """
    Loads the actual gridded meteorological data for a given day of the year (1-365)
    from the downloaded IMD binary files for the year 2024 (or fallback to latest year).
    """
    import os
    day_idx = max(0, min(365, day_of_year - 1))
    
    rain_dir = r"C:\Users\AVANEESH\Downloads\rain0.25x0.25"
    maxtemp_dir = r"C:\Users\AVANEESH\Downloads\maxtemp"
    mintemp_dir = r"C:\Users\AVANEESH\Downloads\mintemp"
    
    try:
        if grid_type == 'temp_max' or grid_type == 'temp':
            if not os.path.exists(maxtemp_dir):
                return None
            filepath = os.path.join(maxtemp_dir, f"Maxtemp_MaxT_{year}.GRD")
            if not os.path.exists(filepath):
                files = [f for f in os.listdir(maxtemp_dir) if f.upper().endswith('.GRD')]
                if not files:
                    return None
                filepath = os.path.join(maxtemp_dir, files[-1])
            from dataset_parsers import IMDPuneBinaryReader
            grids, _, _ = IMDPuneBinaryReader.read_temp_10_year(filepath)
            day_idx = min(day_idx, len(grids) - 1)
            return grids[day_idx].copy()
            
        elif grid_type == 'temp_min':
            if not os.path.exists(mintemp_dir):
                return None
            filepath = os.path.join(mintemp_dir, f"Mintemp_MinT_{year}.GRD")
            if not os.path.exists(filepath):
                files = [f for f in os.listdir(mintemp_dir) if f.upper().endswith('.GRD')]
                if not files:
                    return None
                filepath = os.path.join(mintemp_dir, files[-1])
            from dataset_parsers import IMDPuneBinaryReader
            grids, _, _ = IMDPuneBinaryReader.read_temp_10_year(filepath)
            day_idx = min(day_idx, len(grids) - 1)
            return grids[day_idx].copy()
            
        elif grid_type == 'rain':
            if not os.path.exists(rain_dir):
                return None
            filepath = os.path.join(rain_dir, f"Rainfall_ind{year}_rfp25.grd")
            if not os.path.exists(filepath):
                files = [f for f in os.listdir(rain_dir) if f.upper().endswith('.GRD') or f.lower().endswith('.grd')]
                if not files:
                    return None
                filepath = os.path.join(rain_dir, files[-1])
            from dataset_parsers import IMDPuneBinaryReader
            grids, _, _ = IMDPuneBinaryReader.read_rain_025_year(filepath)
            day_idx = min(day_idx, len(grids) - 1)
            return grids[day_idx].copy()
            
        elif grid_type == 'lst':
            tmax = load_real_grid_data(day_of_year, 'temp_max', year)
            if tmax is not None:
                return tmax + np.random.normal(1.0, 0.4, size=tmax.shape)
            
    except Exception as e:
        print(f"Error loading real grid {grid_type}: {e}")
        
    return None

def generate_synthetic_grid(day_of_year, grid_type='temp', temp_anomaly=0.0, rain_anomaly=0.0):
    """
    Generates or loads gridded meteorological data representing the climate of India.
    Attempts to read from real IMD binary datasets, with a synthetic fallback.
    """
    mapped_type = grid_type
    if mapped_type == 'temp':
        mapped_type = 'temp_max'
        
    # Attempt loading real data grid
    real_grid = load_real_grid_data(day_of_year, mapped_type)
    if real_grid is not None:
        if temp_anomaly != 0.0 and mapped_type in ['temp_max', 'temp_min', 'lst']:
            real_grid = real_grid + temp_anomaly
        elif rain_anomaly != 0.0 and mapped_type == 'rain':
            real_grid = np.clip(real_grid + rain_anomaly, 0.0, None)
        return real_grid

    # Fallback to synthetic if real data load fails:
    is_temp = grid_type in ['temp', 'temp_max', 'temp_min', 'lst']
    shape = TEMP_GRID_SHAPE if is_temp else RAIN_GRID_SHAPE
    grid = np.full(shape, np.nan)
    
    is_monsoon = 150 <= day_of_year <= 270
    
    # Vectorized noise pre-generation
    if is_temp:
        noise_arr = np.random.normal(0, 0.3, size=shape)
        lst_noise = np.random.normal(0, 0.6, size=shape) if grid_type == 'lst' else None
        active_list = ACTIVE_COORDS_TEMP
        lats = TEMP_LATS
        lons = TEMP_LONS
        dem_grid = STATIC_DEM_GRID_TEMP
        ndvi_grid = STATIC_NDVI_GRID_TEMP
    else:
        noise_arr_gamma = np.random.gamma(1.5, 4.0, size=shape)
        noise_arr_rand = np.random.rand(*shape)
        noise_arr_wd = np.random.gamma(1.2, 3.0, size=shape)
        noise_arr_wd_rand = np.random.rand(*shape)
        active_list = ACTIVE_COORDS_RAIN
        lats = RAIN_LATS
        lons = RAIN_LONS
        dem_grid = STATIC_DEM_GRID_RAIN
        ndvi_grid = STATIC_NDVI_GRID_RAIN
        
    for i, j in active_list:
        lat, lon = lats[i], lons[j]
        
        dem = dem_grid[i, j]
        ndvi = ndvi_grid[i, j]
        
        if is_temp:
            base_temp = 28.5
            
            # Seasonality: Max in May/June (day 150)
            summer_factor = math.exp(-((day_of_year - 150) / 45) ** 2)
            winter_factor = math.cos(2 * math.pi * (day_of_year - 15) / 365) # max in Jan
            
            # Western desert summer heating (Thar Desert)
            desert_heat = 15.0 * summer_factor * max(0.0, (28.0 - abs(lat - 26.0))/4.0) if (lon < 75.0 and 22.0 <= lat <= 30.0) else 0.0
            
            # Central plains summer heating
            plains_heat = 8.0 * summer_factor * max(0.0, (85.0 - lon)/15.0) if (20.0 <= lat <= 28.0) else 0.0
            
            # Lapse-rate cooling (DEM)
            lapse_rate_cooling = -0.0065 * dem
            
            # Winter cooling (increasing with latitude northwards)
            winter_cooling = -15.0 * max(0.0, winter_factor) * ((lat - 8.0)/30.0)
            
            val = base_temp + desert_heat + plains_heat + lapse_rate_cooling + winter_cooling + temp_anomaly
            if grid_type == 'temp_min':
                val -= 10.0
            grid[i, j] = max(-10.0, val + noise_arr[i, j])
            
            # LST calculation
            if grid_type == 'lst':
                lst_offset = 4.0 * (1.0 - ndvi)
                grid[i, j] += lst_offset + lst_noise[i, j]
                # Cloud cover mask during monsoon
                if is_monsoon and np.random.rand() < 0.3:
                    grid[i, j] = np.nan
                    
        elif grid_type == 'rain':
            if is_monsoon:
                # Monsoon progresses northwards over time
                lat_progress_factor = np.clip((day_of_year - 150 - (lat - 8.0) * 1.5) / 10.0, 0.1, 1.0)
                
                # 1. Western Ghats orographic rain
                west_coast_rain = 0.0
                if lon < 75.5 and lat < 20.0:
                    west_coast_rain = 35.0 * math.exp(-((lon - 73.0)/0.8)**2)
                
                # 2. Northeast rainfall
                northeast_rain = 0.0
                if lon > 89.0 and 22.0 <= lat <= 29.0:
                    northeast_rain = 40.0 * math.exp(-((lat - 25.5)/3.0)**2)
                    
                # 3. Desert aridity factor
                desert_shadow = 1.0
                if lon < 74.0 and 24.0 <= lat <= 30.0:
                    desert_shadow = 0.05
                    
                # 4. General plains rain
                plains_rain = 8.0 + (lon - 75.0) * 0.3 if lon >= 75.0 else 4.0
                
                val = (west_coast_rain + northeast_rain + plains_rain) * desert_shadow * lat_progress_factor * (1.0 + rain_anomaly)
                noise = noise_arr_gamma[i, j] if noise_arr_rand[i, j] < 0.60 else 0.0
                grid[i, j] = max(0.0, val + noise)
            else:
                # Post-monsoon / winter (Northeast monsoon active in Southeast India)
                ne_monsoon_rain = 0.0
                if 290 <= day_of_year <= 340 and lat < 16.0 and lon > 77.0:
                    ne_monsoon_rain = 18.0 * math.exp(-((lon - 80.0)/2.0)**2) * math.exp(-((lat - 11.0)/3.0)**2)
                
                # Winter western disturbances in North India
                western_disturbance = 0.0
                if (day_of_year >= 340 or day_of_year <= 60) and lat > 30.0:
                    western_disturbance = noise_arr_wd[i, j] if noise_arr_wd_rand[i, j] < 0.15 else 0.0
                    
                grid[i, j] = max(0.0, (ne_monsoon_rain + western_disturbance) * (1.0 + rain_anomaly))
                    
    return grid

if __name__ == '__main__':
    print("Testing upgraded India data ingestion setup...")
    active_pts, mask = generate_maharashtra_metadata()
    print(f"Total active India grid coordinates: {len(active_pts)}")
    temp_grid = generate_synthetic_grid(150, 'temp')
    rain_grid = generate_synthetic_grid(180, 'rain')
    print("Non-nan temp mean:", np.nanmean(temp_grid))
    print("Non-nan rain mean (monsoon):", np.nanmean(rain_grid))
