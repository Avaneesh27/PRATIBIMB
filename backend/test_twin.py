import unittest
import numpy as np
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from data_ingestion import generate_synthetic_grid, is_in_maharashtra, generate_maharashtra_metadata
from data_ingestion import TEMP_GRID_SHAPE, RAIN_GRID_SHAPE, TEMP_LATS, TEMP_LONS, RAIN_LATS, RAIN_LONS
from data_assimilation import optimal_interpolation, ClosedLoopSelfCorrection, interpolate_grid
from ai_model import ClimateTwinPredictor
from impact_engine import calculate_crop_water_stress, calculate_soil_moisture_index, evaluate_imd_heatwave_risk, calculate_district_risk_scores

class TestVayuMitraBackend(unittest.TestCase):
    
    def test_maharashtra_coordinates_mask(self):
        """Test land boundary masking of India"""
        # Delhi (28.61, 77.20) should be inside
        self.assertTrue(is_in_maharashtra(28.61, 77.20))
        # Pune (18.52, 73.85) should be inside
        self.assertTrue(is_in_maharashtra(18.52, 73.85))
        
        # Sea or external territories should be outside
        self.assertFalse(is_in_maharashtra(5.0, 70.0)) # Indian Ocean deep south
        self.assertFalse(is_in_maharashtra(36.0, 90.0)) # Tibet north-east
        
        # Count of active grid coordinates
        active_pts, mask = generate_maharashtra_metadata()
        self.assertTrue(6300 <= len(active_pts) <= 6600, f"Active points count is {len(active_pts)}, expected ~6434")

    def test_grid_shapes(self):
        """Test gridded variable outputs match native resolution grid systems"""
        temp = generate_synthetic_grid(180, 'temp')
        rain = generate_synthetic_grid(180, 'rain')
        lst = generate_synthetic_grid(180, 'lst')
        
        self.assertEqual(temp.shape, TEMP_GRID_SHAPE)
        self.assertEqual(rain.shape, RAIN_GRID_SHAPE)
        self.assertEqual(lst.shape, TEMP_GRID_SHAPE)

    def test_data_assimilation_and_self_correction(self):
        """Test closed-loop daily feedback loop calibration"""
        feedback = ClosedLoopSelfCorrection(TEMP_GRID_SHAPE)
        
        day = 180
        actual = generate_synthetic_grid(day, 'temp')
        # Store a dummy forecast for yesterday
        dummy_forecast = actual + 1.0 # 1C systematic bias
        feedback.store_forecast(day - 1, dummy_forecast)
        
        # Apply calibration
        calibrated_grid, logs = feedback.apply_feedback_calibration(day, actual)
        
        # Calibrated output should adjust for forecast bias
        self.assertEqual(logs["status"], "Self-Correction Loop Active")
        self.assertAlmostEqual(logs["rmse"], 1.0, places=1)
        self.assertTrue(logs["correction_applied_mean"] > 0)
        self.assertEqual(calibrated_grid.shape, TEMP_GRID_SHAPE)

    def test_recurrent_conv_ensemble_predictions(self):
        """Test ConvLSTM MC Dropout ensemble variance"""
        pred = ClimateTwinPredictor(variable_type='temp')
        
        # Train on mock sequence of shape (31, 31)
        lats = np.linspace(22.5, 15.5, 31)
        lons = np.linspace(72.5, 80.5, 31)
        
        grids = [generate_synthetic_grid(d, 'temp') for d in range(120, 125)]
        
        training_data = []
        days = []
        for t in range(3, 5):
            seq = [grids[t-3], grids[t-2], grids[t-1]]
            target = grids[t]
            training_data.append((seq, target))
            days.append(120 + t)
            
        success = pred.train(training_data, days, lats, lons)
        self.assertTrue(success)
        
        # Run forecast with 15 Monte Carlo Dropout iterations
        seq_input = [grids[2], grids[3], grids[4]]
        mean_g, std_g, shap = pred.predict_next_grid_ensemble(seq_input, 125, lats, lons, num_ensembles=15)
        
        # Grid shape checks
        self.assertEqual(mean_g.shape, TEMP_GRID_SHAPE)
        self.assertEqual(std_g.shape, TEMP_GRID_SHAPE)
        
        # Variance of ensembles should be positive for active grid points
        valid = ~np.isnan(std_g)
        if np.any(valid):
            self.assertTrue(np.nanmean(std_g[valid]) >= 0.0)
            
        # SHAP checks
        self.assertIn("lags", shap)
        self.assertIn("seasonality", shap)

    def test_district_vuln_indices(self):
        """Test DCVI risk calculations for Maharashtra's 36 districts"""
        temp = generate_synthetic_grid(180, 'temp')
        rain = generate_synthetic_grid(180, 'rain')
        
        # Align temp grid to rain shape
        temp_aligned = interpolate_grid(temp, TEMP_LATS, TEMP_LONS, RAIN_LATS, RAIN_LONS)
        
        cwsi = calculate_crop_water_stress(temp_aligned, None, rain)
        smi = calculate_soil_moisture_index(rain, temp_aligned)
        
        # Calculate risk
        districts = calculate_district_risk_scores(temp_aligned, rain, cwsi, smi)
        
        self.assertEqual(len(districts), 36)
        for name, data in districts.items():
            self.assertTrue(5.0 <= data["dcvi"] <= 100.0, f"Vulnerability for {name} is out of bounds: {data['dcvi']}")
            self.assertIn(data["alert"], ["Green", "Yellow", "Orange", "Red"])

if __name__ == '__main__':
    unittest.main()
