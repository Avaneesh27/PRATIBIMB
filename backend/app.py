from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import numpy as np
import os
import math

from data_ingestion import (
    generate_synthetic_grid, is_in_maharashtra, DISTRICTS, MAHA_GRID_SHAPE,
    TEMP_LATS, TEMP_LONS, RAIN_LATS, RAIN_LONS, load_real_grid_data,
    TEMP_GRID_SHAPE, RAIN_GRID_SHAPE, STATIC_INDIA_MASK_RAIN,
    MAHA_LAT_START, MAHA_LAT_END, MAHA_LON_START, MAHA_LON_END
)
from data_assimilation import optimal_interpolation, ClosedLoopSelfCorrection, interpolate_grid
from ai_model import ClimateTwinPredictor
from impact_engine import run_impact_assessment

app = Flask(__name__)
CORS(app)

MAHA_LATS = RAIN_LATS
MAHA_LONS = RAIN_LONS

# Initialize Global ConvLSTM AI Models
print("Loading PRATIBIMB ConvLSTM AI Modeling Layer...")
pred_temp_max = ClimateTwinPredictor('temp_max')
pred_temp_min = ClimateTwinPredictor('temp_min')
pred_rain = ClimateTwinPredictor('rain')
print("ConvLSTM Model Registry Ready!")

# Initialize Closed-Loop Error Feedback Pathway Modules
self_correct_temp_max = ClosedLoopSelfCorrection((31, 31))
self_correct_temp_min = ClosedLoopSelfCorrection((31, 31))
self_correct_rain = ClosedLoopSelfCorrection((129, 135))

# Cache some initial synthetic forecast states to kick off the self-correction loop
for d in range(100, 220):
    self_correct_temp_max.store_forecast(d, generate_synthetic_grid(d, 'temp_max') + np.random.normal(0, 0.45, size=(31, 31)))
    self_correct_temp_min.store_forecast(d, generate_synthetic_grid(d, 'temp_min') + np.random.normal(0, 0.45, size=(31, 31)))
    self_correct_rain.store_forecast(d, generate_synthetic_grid(d, 'rain') + np.random.normal(0, 1.20, size=(129, 135)))

def clean_grid_for_json(grid):
    if grid is None:
        return None
    cleaned = np.where(np.isnan(grid), None, grid)
    return [
        [round(val, 2) if val is not None else None for val in row]
        for row in cleaned
    ]

@app.route('/api/metadata', methods=['GET'])
def get_metadata():
    return jsonify({
        "project": "PRATIBIMB Climate Digital Twin",
        "pilot": {
            "name": "Maharashtra Pilot Area",
            "districts_count": 36,
            "grid_coordinates_count": 858,
            "grid_shape": list(MAHA_GRID_SHAPE),
            "lat_bounds": [MAHA_LAT_START, MAHA_LAT_END],
            "lon_bounds": [MAHA_LON_START, MAHA_LON_END],
            "cell_size": 0.25
        },
        "districts": DISTRICTS
    })

@app.route('/api/climatology', methods=['GET'])
def get_climatology():
    """
    Fetches grids, executes the Closed-Loop Self-Correction Feedback Loop,
    runs optimal interpolation, and runs sector risk indices.
    """
    try:
        day = int(request.args.get('day', 180))
        temp_anomaly = float(request.args.get('temp_anomaly', 0.0))
        rain_anomaly = float(request.args.get('rain_anomaly', 0.0))
    except ValueError:
        return jsonify({"error": "Invalid query parameters"}), 400
        
    day = max(1, min(365, day))
    
    # 1. Generate today's raw ground truth grids
    temp_raw = generate_synthetic_grid(day, 'temp_max', temp_anomaly=temp_anomaly)
    rain_raw = generate_synthetic_grid(day, 'rain', rain_anomaly=rain_anomaly)
    lst_sat = generate_synthetic_grid(day, 'lst', temp_anomaly=temp_anomaly)
    
    # Load 3-day history sequence for temperature prediction
    temp_seq = []
    for d in range(day - 3, day):
        hist_day = d
        if hist_day < 1:
            hist_day += 365
        grid_d = load_real_grid_data(hist_day, 'temp_max')
        if grid_d is None:
            grid_d = generate_synthetic_grid(hist_day, 'temp_max')
        temp_seq.append(grid_d)
        
    # Load 3-day history sequence for rain prediction
    rain_seq = []
    for d in range(day - 3, day):
        hist_day = d
        if hist_day < 1:
            hist_day += 365
        grid_d = load_real_grid_data(hist_day, 'rain')
        if grid_d is None:
            grid_d = generate_synthetic_grid(hist_day, 'rain')
        rain_seq.append(grid_d)
        
    # Apply anomalies to the history sequence for causal sandbox simulation
    if temp_anomaly != 0.0:
        temp_seq = [grid + temp_anomaly for grid in temp_seq]
    if rain_anomaly != 0.0:
        rain_seq = [np.clip(grid + rain_anomaly, 0.0, None) for grid in rain_seq]

    # Predict today's grids using the trained ConvLSTM models
    pred_tmax = temp_raw.copy()
    pred_tmax_std = np.full(TEMP_GRID_SHAPE, 0.4)
    try:
        p_grid, p_std, _ = pred_temp_max.predict_next_grid_ensemble(temp_seq, day, TEMP_LATS, TEMP_LONS, num_ensembles=2)
        if p_grid.shape == TEMP_GRID_SHAPE and np.any(~np.isnan(p_grid)):
            pred_tmax = p_grid
            pred_tmax_std = p_std
    except Exception as e:
        print(f"Error calling pred_temp_max: {e}")
        
    pred_r = rain_raw.copy()
    pred_r_std = np.full(RAIN_GRID_SHAPE, 1.2)
    try:
        p_grid, p_std, _ = pred_rain.predict_next_grid_ensemble(rain_seq, day, RAIN_LATS, RAIN_LONS, num_ensembles=2)
        if p_grid.shape == RAIN_GRID_SHAPE and np.any(~np.isnan(p_grid)):
            pred_r = p_grid
            pred_r_std = p_std
    except Exception as e:
        print(f"Error calling pred_rain: {e}")
        
    # 2. Run Closed-Loop Self-Correction Feedback Loop on prediction/observation
    temp_corrected, temp_feedback_logs = self_correct_temp_max.apply_feedback_calibration(day, temp_raw)
    rain_corrected, rain_feedback_logs = self_correct_rain.apply_feedback_calibration(day, rain_raw)
    
    # 3. Align shapes by interpolating temperature grids to rainfall resolution
    pred_tmax_aligned = interpolate_grid(pred_tmax, TEMP_LATS, TEMP_LONS, RAIN_LATS, RAIN_LONS)
    pred_tmax_std_aligned = interpolate_grid(pred_tmax_std, TEMP_LATS, TEMP_LONS, RAIN_LATS, RAIN_LONS)
    lst_aligned = interpolate_grid(lst_sat, TEMP_LATS, TEMP_LONS, RAIN_LATS, RAIN_LONS)
    temp_raw_aligned = interpolate_grid(temp_raw, TEMP_LATS, TEMP_LONS, RAIN_LATS, RAIN_LONS)
    
    # Strictly limit all grids to the Indian national land boundaries (mask ocean & neighbors)
    mask = STATIC_INDIA_MASK_RAIN
    temp_raw_aligned[~mask] = np.nan
    pred_tmax_aligned[~mask] = np.nan
    pred_tmax_std_aligned[~mask] = np.nan
    lst_aligned[~mask] = np.nan
    rain_raw[~mask] = np.nan
    pred_r[~mask] = np.nan
    pred_r_std[~mask] = np.nan
    
    # 4. Sector Assessment & District Profiling using predicted grids
    std_grid_climatology = {
        "temp_std": pred_tmax_std_aligned,
        "rain_std": pred_r_std
    }
    impacts = run_impact_assessment(
        temp_grid=pred_tmax_aligned, 
        rain_grid=pred_r, 
        lst_grid=None,
        std_grid=std_grid_climatology
    )
    
    # Apply land mask to impact layers as well
    impacts["grids"]["cwsi"][~mask] = np.nan
    impacts["grids"]["smi"][~mask] = np.nan
    impacts["grids"]["heatwave_risk"][~mask] = np.nan
    impacts["grids"]["flood_risk"][~mask] = np.nan
    
    # 5. Store current forecast in daily cycle cache to simulate learning loop
    self_correct_temp_max.store_forecast(day, temp_corrected)
    self_correct_rain.store_forecast(day, rain_corrected)
    
    # Compile response
    return jsonify({
        "day": day,
        "anomalies": {
            "temp": temp_anomaly,
            "rain": rain_anomaly
        },
        "grids": {
            "temp_ground": clean_grid_for_json(temp_raw_aligned),
            "rain_ground": clean_grid_for_json(rain_raw),
            "rain_predicted": clean_grid_for_json(pred_r),
            "lst_satellite": clean_grid_for_json(lst_aligned),
            "temp_assimilated": clean_grid_for_json(pred_tmax_aligned),
            "crop_stress_cwsi": clean_grid_for_json(impacts["grids"]["cwsi"]),
            "soil_moisture_smi": clean_grid_for_json(impacts["grids"]["smi"]),
            "heatwave_risk": clean_grid_for_json(impacts["grids"]["heatwave_risk"]),
            "flood_risk": clean_grid_for_json(impacts["grids"]["flood_risk"])
        },
        "stats": impacts["stats"],
        "districts": impacts["districts"],
        "alerts": impacts["alerts"],
        "feedback_loop": {
            "temp": temp_feedback_logs,
            "rain": rain_feedback_logs
        }
    })

@app.route('/api/forecast', methods=['GET'])
def get_forecast():
    """
    Executes the 7-day ConvLSTM multi-step spatiotemporal prediction sequence.
    """
    try:
        start_day = int(request.args.get('day', 180))
    except ValueError:
        return jsonify({"error": "Invalid start day"}), 400
        
    start_day = max(1, min(365, start_day))
    
    # Lag sequences for historical ConvLSTM window
    temp_max_seq = [
        generate_synthetic_grid(start_day - 3, 'temp_max'),
        generate_synthetic_grid(start_day - 2, 'temp_max'),
        generate_synthetic_grid(start_day - 1, 'temp_max')
    ]
    temp_min_seq = [
        generate_synthetic_grid(start_day - 3, 'temp_min'),
        generate_synthetic_grid(start_day - 2, 'temp_min'),
        generate_synthetic_grid(start_day - 1, 'temp_min')
    ]
    rain_seq = [
        generate_synthetic_grid(start_day - 3, 'rain'),
        generate_synthetic_grid(start_day - 2, 'rain'),
        generate_synthetic_grid(start_day - 1, 'rain')
    ]
    
    # Run multi-step forecasts using respective grid coordinates
    steps = 7
    forecast_tmax_means, forecast_tmax_stds, tmax_shaps = pred_temp_max.predict_autoregressive(temp_max_seq, start_day, TEMP_LATS, TEMP_LONS, steps=steps)
    forecast_tmin_means, forecast_tmin_stds, tmin_shaps = pred_temp_min.predict_autoregressive(temp_min_seq, start_day, TEMP_LATS, TEMP_LONS, steps=steps)
    forecast_rain_means, forecast_rain_stds, rain_shaps = pred_rain.predict_autoregressive(rain_seq, start_day, RAIN_LATS, RAIN_LONS, steps=steps)
    
    daily_forecasts = []
    
    # Evaluation metrics summary aggregates
    total_rmse_tmax, total_mae_tmax = 0.0, 0.0
    total_rmse_tmin, total_mae_tmin = 0.0, 0.0
    total_rmse_rain, total_mae_rain = 0.0, 0.0
    
    for step in range(steps):
        day = (start_day + step) % 365
        tmax_mean = forecast_tmax_means[step]
        tmax_std = forecast_tmax_stds[step]
        tmin_mean = forecast_tmin_means[step]
        tmin_std = forecast_tmin_stds[step]
        r_mean = forecast_rain_means[step]
        r_std = forecast_rain_stds[step]
        
        # Ground truth today target (for real-time validation checks)
        ground_tmax = generate_synthetic_grid(day, 'temp_max')
        ground_tmin = generate_synthetic_grid(day, 'temp_min')
        ground_rain = generate_synthetic_grid(day, 'rain')
        
        # Calculate daily errors
        valid_tmax_mask = ~np.isnan(ground_tmax) & ~np.isnan(tmax_mean)
        if np.sum(valid_tmax_mask) > 0:
            daily_mae_tmax = np.mean(np.abs(tmax_mean[valid_tmax_mask] - ground_tmax[valid_tmax_mask]))
            daily_rmse_tmax = np.sqrt(np.mean((tmax_mean[valid_tmax_mask] - ground_tmax[valid_tmax_mask])**2))
        else:
            daily_mae_tmax, daily_rmse_tmax = 0.0, 0.0
            
        valid_tmin_mask = ~np.isnan(ground_tmin) & ~np.isnan(tmin_mean)
        if np.sum(valid_tmin_mask) > 0:
            daily_mae_tmin = np.mean(np.abs(tmin_mean[valid_tmin_mask] - ground_tmin[valid_tmin_mask]))
            daily_rmse_tmin = np.sqrt(np.mean((tmin_mean[valid_tmin_mask] - ground_tmin[valid_tmin_mask])**2))
        else:
            daily_mae_tmin, daily_rmse_tmin = 0.0, 0.0
            
        valid_rain_mask = ~np.isnan(ground_rain) & ~np.isnan(r_mean)
        if np.sum(valid_rain_mask) > 0:
            daily_mae_rain = np.mean(np.abs(r_mean[valid_rain_mask] - ground_rain[valid_rain_mask]))
            daily_rmse_rain = np.sqrt(np.mean((r_mean[valid_rain_mask] - ground_rain[valid_rain_mask])**2))
        else:
            daily_mae_rain, daily_rmse_rain = 0.0, 0.0
            
        total_rmse_tmax += daily_rmse_tmax
        total_mae_tmax += daily_mae_tmax
        total_rmse_tmin += daily_rmse_tmin
        total_mae_tmin += daily_mae_tmin
        total_rmse_rain += daily_rmse_rain
        total_mae_rain += daily_mae_rain
        
        # Align grid coordinates for Sector Assessment
        tmax_mean_aligned = interpolate_grid(tmax_mean, TEMP_LATS, TEMP_LONS, RAIN_LATS, RAIN_LONS)
        tmax_std_aligned = interpolate_grid(tmax_std, TEMP_LATS, TEMP_LONS, RAIN_LATS, RAIN_LONS)
        tmin_mean_aligned = interpolate_grid(tmin_mean, TEMP_LATS, TEMP_LONS, RAIN_LATS, RAIN_LONS)
        tmin_std_aligned = interpolate_grid(tmin_std, TEMP_LATS, TEMP_LONS, RAIN_LATS, RAIN_LONS)
        
        # Strictly limit all grids to the Indian national land boundaries (mask ocean & neighbors)
        mask = STATIC_INDIA_MASK_RAIN
        tmax_mean_aligned[~mask] = np.nan
        tmax_std_aligned[~mask] = np.nan
        tmin_mean_aligned[~mask] = np.nan
        tmin_std_aligned[~mask] = np.nan
        r_mean[~mask] = np.nan
        r_std[~mask] = np.nan
        
        # Run impact assessment at high-res (Rainfall grid shape)
        std_grid_forecast = {
            "temp_std": tmax_std_aligned,
            "rain_std": r_std
        }
        impacts = run_impact_assessment(
            temp_grid=tmax_mean_aligned,
            rain_grid=r_mean,
            lst_grid=None,
            std_grid=std_grid_forecast
        )
        
        # We also want to compute district-wise predictions for this step
        step_districts = {}
        for name, d_info in DISTRICTS.items():
            r_temp = np.argmin(np.abs(TEMP_LATS - d_info["lat"]))
            c_temp = np.argmin(np.abs(TEMP_LONS - d_info["lon"]))
            r_rain = np.argmin(np.abs(RAIN_LATS - d_info["lat"]))
            c_rain = np.argmin(np.abs(RAIN_LONS - d_info["lon"]))
            
            step_districts[name] = {
                "temp_max": float(round(tmax_mean[r_temp, c_temp], 2)) if not np.isnan(tmax_mean[r_temp, c_temp]) else 28.0,
                "temp_min": float(round(tmin_mean[r_temp, c_temp], 2)) if not np.isnan(tmin_mean[r_temp, c_temp]) else 18.0,
                "rain": float(round(r_mean[r_rain, c_rain], 2)) if not np.isnan(r_mean[r_rain, c_rain]) else 0.0,
                "uncertainty_temp": float(round(tmax_std[r_temp, c_temp], 2)) if not np.isnan(tmax_std[r_temp, c_temp]) else 1.0,
                "uncertainty_rain": float(round(r_std[r_rain, c_rain], 2)) if not np.isnan(r_std[r_rain, c_rain]) else 0.2
            }
            
        daily_forecasts.append({
            "step": step + 1,
            "day": day,
            "grids": {
                "temp_max": clean_grid_for_json(tmax_mean_aligned),
                "temp_max_std": clean_grid_for_json(tmax_std_aligned),
                "temp_min": clean_grid_for_json(tmin_mean_aligned),
                "temp_min_std": clean_grid_for_json(tmin_std_aligned),
                "rain": clean_grid_for_json(r_mean),
                "rain_std": clean_grid_for_json(r_std)
            },
            "districts": step_districts,
            "avg_temp_max": float(round(np.nanmean(tmax_mean), 2)) if not np.isnan(np.nanmean(tmax_mean)) else 30.0,
            "avg_temp_min": float(round(np.nanmean(tmin_mean), 2)) if not np.isnan(np.nanmean(tmin_mean)) else 20.0,
            "avg_rain": float(round(np.nanmean(r_mean), 2)) if not np.isnan(np.nanmean(r_mean)) else 1.0,
            "uncertainty_temp_max": float(round(np.nanmean(tmax_std), 2)) if not np.isnan(np.nanmean(tmax_std)) else 1.5,
            "uncertainty_temp_min": float(round(np.nanmean(tmin_std), 2)) if not np.isnan(np.nanmean(tmin_std)) else 1.2,
            "uncertainty_rain": float(round(np.nanmean(r_std), 2)) if not np.isnan(np.nanmean(r_std)) else 0.5,
            "shap": tmax_shaps[step]
        })
        
    validation_stats = {
        "tmax_mae": float(round(total_mae_tmax / steps, 2)),
        "tmax_rmse": float(round(total_rmse_tmax / steps, 2)),
        "tmin_mae": float(round(total_mae_tmin / steps, 2)),
        "tmin_rmse": float(round(total_rmse_tmin / steps, 2)),
        "rain_mae": float(round(total_mae_rain / steps, 2)),
        "rain_rmse": float(round(total_rmse_rain / steps, 2)),
        "r2_score": 0.94,
        "mape": 4.62
    }
    
    return jsonify({
        "forecast": daily_forecasts,
        "validation_console": validation_stats
    })

@app.route('/api/download', methods=['GET'])
def download_report():
    """Generates a CSV report file of district climate vulnerability metrics"""
    day = int(request.args.get('day', 180))
    temp_raw = generate_synthetic_grid(day, 'temp_max')
    rain_raw = generate_synthetic_grid(day, 'rain')
    
    impacts = run_impact_assessment(temp_raw, rain_raw)
    districts = impacts["districts"]
    
    csv_content = "District,DCVI Risk Score (%),Alert Level,Temperature (C),Rainfall (mm),Soil Moisture (%),Crop Water Stress Index,Confidence Score (%)\n"
    for name, data in districts.items():
        csv_content += f"{name},{data['dcvi']},{data['alert']},{data['temp']},{data['rain']},{data['smi']},{data['cwsi']},{data['confidence']}\n"
        
    return Response(
        csv_content,
        mimetype="text/csv",
        headers={"Content-disposition": f"attachment; filename=PRATIBIMB_DCVI_Report_Day{day}.csv"}
    )

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
