import os
import argparse
import pickle
import numpy as np
from dataset_parsers import IMDPuneBinaryReader, CoordinateGridInterpolator
from data_ingestion import INDIA_GRID_SHAPE, INDIA_LAT_START, INDIA_LAT_END, INDIA_LON_START, INDIA_LON_END
from ai_model import ClimateTwinPredictor

def main():
    parser = argparse.ArgumentParser(description="VayuMitra Climate Twin: Train AI Model with Real IMD Pune/MOSDAC Datasets")
    parser.add_argument("--temp_dir", type=str, default=None, help="Directory containing IMD 1.0x1.0 Gridded Max Temp files (.GRD)")
    parser.add_argument("--rain_dir", type=str, default=None, help="Directory containing IMD 0.25x0.25 Gridded Rainfall files (.GRD)")
    parser.add_argument("--output_dir", type=str, default="backend", help="Directory to save trained model checkpoints (.pkl)")
    
    args = parser.parse_args()
    
    # 1. Target coordinate grid setups
    lats = np.linspace(INDIA_LAT_END, INDIA_LAT_START, INDIA_GRID_SHAPE[0]) # Top down (North to South)
    lons = np.linspace(INDIA_LON_START, INDIA_LON_END, INDIA_GRID_SHAPE[1]) # West to East
    
    print(f"Targeting India grid shape: {INDIA_GRID_SHAPE} (6434 active land points)")
    
    # 2. Train Temperature Model if files are provided
    if args.temp_dir and os.path.exists(args.temp_dir):
        print(f"\n--- Training Temperature Model using real grids from {args.temp_dir} ---")
        temp_files = sorted([os.path.join(args.temp_dir, f) for f in os.listdir(args.temp_dir) if f.upper().endswith('.GRD')])
        
        if len(temp_files) < 4:
            print("Error: Minimum of 4 sequential day grid files are required to construct temporal lag features (lag_steps=3).")
        else:
            print(f"Found {len(temp_files)} temperature records. Parsing binary grids...")
            grids = []
            days = []
            
            for idx, filepath in enumerate(temp_files):
                try:
                    grid_raw, src_lats, src_lons = IMDPuneBinaryReader.read_temp_10(filepath)
                    # Interpolate from 1.0x1.0 degree source to target 0.25x0.25 grid
                    grid_interpolated = CoordinateGridInterpolator.interpolate_to_target(
                        grid_raw, src_lats, src_lons, lats, lons
                    )
                    grids.append(grid_interpolated)
                    days.append(120 + idx) # Assign baseline mock days of year
                except Exception as e:
                    print(f"Skipping failed file {os.path.basename(filepath)}: {e}")
            
            # Construct temporal lag features
            historical_sequences = []
            start_days = []
            for t in range(3, len(grids)):
                seq = [grids[t-3], grids[t-2], grids[t-1]]
                target = grids[t]
                historical_sequences.append((seq, target))
                start_days.append(days[t])
                
            print(f"Extracted {len(historical_sequences)} lag sequences. Fitting ConvLSTM Predictor...")
            predictor = ClimateTwinPredictor(variable_type='temp')
            success = predictor.train(historical_sequences, start_days, lats, lons)
            
            if success:
                out_path = os.path.join(args.output_dir, "temp_model.pkl")
                with open(out_path, 'wb') as f:
                    pickle.dump(predictor.model, f)
                print(f"Success! Saved trained Temperature ML weights to: {out_path}")
            else:
                print("Error: Training fitting failed.")
                
    # 3. Train Rainfall Model if files are provided
    if args.rain_dir and os.path.exists(args.rain_dir):
        print(f"\n--- Training Rainfall Model using real grids from {args.rain_dir} ---")
        rain_files = sorted([os.path.join(args.rain_dir, f) for f in os.listdir(args.rain_dir) if f.upper().endswith('.GRD')])
        
        if len(rain_files) < 4:
            print("Error: Minimum of 4 sequential day grid files are required to construct temporal lag features.")
        else:
            print(f"Found {len(rain_files)} rainfall records. Parsing binary grids...")
            grids = []
            days = []
            
            for idx, filepath in enumerate(rain_files):
                try:
                    grid_raw, src_lats, src_lons = IMDPuneBinaryReader.read_rain_025(filepath)
                    # Interpolate from 0.25x0.25 degree source to target 0.25x0.25 grid
                    grid_interpolated = CoordinateGridInterpolator.interpolate_to_target(
                        grid_raw, src_lats, src_lons, lats, lons
                    )
                    grids.append(grid_interpolated)
                    days.append(120 + idx)
                except Exception as e:
                    print(f"Skipping failed file {os.path.basename(filepath)}: {e}")
            
            # Construct temporal lag features
            historical_sequences = []
            start_days = []
            for t in range(3, len(grids)):
                seq = [grids[t-3], grids[t-2], grids[t-1]]
                target = grids[t]
                historical_sequences.append((seq, target))
                start_days.append(days[t])
                
            print(f"Extracted {len(historical_sequences)} lag sequences. Fitting ConvLSTM Predictor...")
            predictor = ClimateTwinPredictor(variable_type='rain')
            success = predictor.train(historical_sequences, start_days, lats, lons)
            
            if success:
                out_path = os.path.join(args.output_dir, "rain_model.pkl")
                with open(out_path, 'wb') as f:
                    pickle.dump(predictor.model, f)
                print(f"Success! Saved trained Rainfall ML weights to: {out_path}")
            else:
                print("Error: Training fitting failed.")
                
    if not args.temp_dir and not args.rain_dir:
        print("\nUsage Example to train on downloaded files:")
        print("  python backend/train_with_real_data.py --temp_dir /path/to/imd_temp/ --rain_dir /path/to/imd_rain/")

if __name__ == '__main__':
    main()
