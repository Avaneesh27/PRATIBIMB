import numpy as np
from scipy.ndimage import gaussian_filter
from scipy.interpolate import RegularGridInterpolator

def interpolate_grid(src_grid, src_lats, src_lons, target_lats, target_lons):
    """
    Interpolates a gridded variable from a source coordinate system to a target coordinate system.
    """
    nan_mask = np.isnan(src_grid)
    src_clean = src_grid.copy()
    if np.all(nan_mask):
        return np.full((len(target_lats), len(target_lons)), np.nan)
        
    if np.any(nan_mask):
        mean_val = np.nanmean(src_grid)
        src_clean[nan_mask] = mean_val
        
    reverse_lat = False
    if src_lats[1] < src_lats[0]:
        src_lats = src_lats[::-1]
        src_clean = src_clean[::-1, :]
        reverse_lat = True
        
    reverse_lon = False
    if src_lons[1] < src_lons[0]:
        src_lons = src_lons[::-1]
        src_clean = src_clean[:, ::-1]
        reverse_lon = True

    interpolator = RegularGridInterpolator((src_lats, src_lons), src_clean, method='linear', bounds_error=False, fill_value=None)
    
    lat_mesh, lon_mesh = np.meshgrid(target_lats, target_lons, indexing='ij')
    pts = np.vstack([lat_mesh.ravel(), lon_mesh.ravel()]).T
    
    target_flat = interpolator(pts)
    target_grid = target_flat.reshape(len(target_lats), len(target_lons))
    
    return target_grid

def optimal_interpolation(background_grid, obs_grid, bg_lats, bg_lons, obs_lats, obs_lons, sigma_bg=0.6, sigma_obs=1.5, correlation_length_km=40.0):
    """
    Blends low-res background ground data with high-res satellite observations (INSAT LST)
    using Optimal Interpolation.
    """
    bg_interp = interpolate_grid(background_grid, bg_lats, bg_lons, obs_lats, obs_lons)
    innovation = obs_grid - bg_interp
    valid_mask = ~np.isnan(innovation)
    
    if not np.any(valid_mask):
        return bg_interp
        
    k_factor = (sigma_bg ** 2) / (sigma_bg ** 2 + sigma_obs ** 2)
    weighted_innovation = np.zeros_like(innovation)
    weighted_innovation[valid_mask] = innovation[valid_mask] * k_factor
    
    grid_spacing_km = 111.0 * (obs_lats[1] - obs_lats[0])
    sigma_grid_units = correlation_length_km / grid_spacing_km
    smoothed_innovation = gaussian_filter(np.nan_to_num(weighted_innovation), sigma=sigma_grid_units)
    
    analysis_grid = bg_interp + smoothed_innovation
    analysis_grid[np.isnan(bg_interp)] = np.nan
    return analysis_grid


class ClosedLoopSelfCorrection:
    """
    Implements VayuMitra's Closed-Loop Error Feedback Pathway.
    Yesterday's prediction is compared against today's actual ground observation.
    The residual is mapped through a lightweight simulated MLP calibration layer
    to correct today's initialization state vector (Twin Core) prior to forecasting.
    """
    def __init__(self, grid_shape):
        self.grid_shape = grid_shape
        # Saved state of yesterday's forecast: maps day_of_year -> forecast_grid
        self.forecast_history = {}
        # MLP weight coefficients for error calibration
        self.mlp_weight_direct = 0.40  # weight for local cell residual
        self.mlp_weight_spatial = 0.25 # weight for neighboring cell residuals
        self.spatial_blur_sigma = 1.2  # diffusion of error influence
        
    def store_forecast(self, day_of_year, forecast_grid):
        """Saves forecasted grid for tomorrow's verification checks"""
        self.forecast_history[day_of_year] = forecast_grid.copy()
        
    def apply_feedback_calibration(self, current_day, today_actual_grid):
        """
        Calculates residuals, runs calibration MLP, and returns corrected starting state.
        
        Parameters:
            current_day (int): Today's day of year (1-365)
            today_actual_grid (np.ndarray): Fresh ground truth grid observed today
            
        Returns:
            corrected_grid (np.ndarray): Calibrated grid used as new forecast initialization
            metrics (dict): Validation metrics (RMSE, MAE, MaxError) and status
        """
        # Yesterday is current_day - 1
        yesterday = (current_day - 1)
        if yesterday == 0: yesterday = 365
        
        # Check if we have yesterday's forecast in cache
        yesterday_forecast = self.forecast_history.get(yesterday)
        
        if yesterday_forecast is None or today_actual_grid is None:
            # If no history is found, calibration returns baseline grid without corrections
            return today_actual_grid.copy(), {
                "status": "No feedback cache. Baseline initialized.",
                "rmse": 0.0,
                "mae": 0.0,
                "residual_mean": 0.0
            }
            
        # 1. Compute Residuals (Actual ground truth - Forecast predicted yesterday)
        residuals = today_actual_grid - yesterday_forecast
        
        # Mask out NaNs
        nan_mask = np.isnan(today_actual_grid) | np.isnan(yesterday_forecast)
        clean_residuals = np.where(nan_mask, 0.0, residuals)
        
        # 2. Map through lightweight MLP calibration network
        # C(x, y) = direct_weight * R(x, y) + spatial_weight * Spread(R, sigma)
        spatial_spread = gaussian_filter(clean_residuals, sigma=self.spatial_blur_sigma)
        correction_tensor = self.mlp_weight_direct * clean_residuals + self.mlp_weight_spatial * spatial_spread
        
        # 3. Apply correction to today's starting state: today_corrected = today_actual + correction
        corrected_grid = today_actual_grid + correction_tensor
        corrected_grid[np.isnan(today_actual_grid)] = np.nan
        
        # Calculate Validation metrics
        valid_idx = ~nan_mask
        if np.sum(valid_idx) > 0:
            active_residuals = residuals[valid_idx]
            rmse = float(np.sqrt(np.mean(active_residuals ** 2)))
            mae = float(np.mean(np.abs(active_residuals)))
            residual_mean = float(np.mean(active_residuals))
        else:
            rmse, mae, residual_mean = 0.0, 0.0, 0.0
            
        metrics = {
            "status": "Self-Correction Loop Active",
            "rmse": float(round(rmse, 3)),
            "mae": float(round(mae, 3)),
            "residual_mean": float(round(residual_mean, 3)),
            "correction_applied_mean": float(round(np.nanmean(np.abs(correction_tensor)), 3))
        }
        
        return corrected_grid, metrics
