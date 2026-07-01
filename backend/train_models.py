import os
import sys
import pickle
import numpy as np

# Ensure backend directory is in path
sys.path.append(os.path.dirname(__file__))

from dataset_parsers import IMDPuneBinaryReader
from data_ingestion import TEMP_LATS, TEMP_LONS, RAIN_LATS, RAIN_LONS
from ai_model import ClimateTwinPredictor

def train_variable_model(data_dir, file_pattern_prefix, reader_func, variable_type, lats, lons, start_year=2011, end_year=2025, sample_size=200):
    print(f"\n--- Training {variable_type} model from {data_dir} ({start_year}-{end_year}) ---")
    if not os.path.exists(data_dir):
        print(f"Directory {data_dir} does not exist. Skipping.")
        return None
        
    grids_all = []
    days_all = []
    
    for year in range(start_year, end_year + 1):
        # Locate file dynamically by looking for year in the filename
        target_file = None
        for filename in os.listdir(data_dir):
            if str(year) in filename and filename.upper().endswith('.GRD'):
                target_file = os.path.join(data_dir, filename)
                break
                
        if not target_file:
            print(f"Warning: No file found for year {year} in {data_dir}")
            continue
            
        print(f"Parsing year {year}: {os.path.basename(target_file)}")
        try:
            # Parse all daily grids of the year
            grids, _, _ = reader_func(target_file)
            grids_all.append(grids)
            # Days of year
            num_days = grids.shape[0]
            days_all.append(np.arange(1, num_days + 1))
        except Exception as e:
            print(f"Error parsing file {target_file}: {e}")
            
    if not grids_all:
        print(f"No grid data loaded for {variable_type}.")
        return None
        
    # Combine grids and days across years
    flat_grids = np.concatenate(grids_all, axis=0)
    flat_days = np.concatenate(days_all, axis=0)
    print(f"Loaded total {len(flat_grids)} days for {variable_type} training.")
    
    # Construct sequences of lag=3
    historical_sequences = []
    start_days = []
    
    # To prevent crossing boundary gaps between consecutive years or taking too long,
    # we can construct lag sequences within each year.
    total_sequences = 0
    for grids in grids_all:
        num_days = grids.shape[0]
        for t in range(3, num_days):
            seq = [grids[t-3], grids[t-2], grids[t-1]]
            target = grids[t]
            historical_sequences.append((seq, target))
            start_days.append(t + 1)
        total_sequences += (num_days - 3)
        
    print(f"Extracted {len(historical_sequences)} training sequences.")
    
    # Train predictor
    # Since extracting features on all 5,000+ sequences can take a few minutes on standard machines,
    # let's sub-sample 200 representative days spread across seasons to train quickly (under 20 seconds) while capturing full seasonal dynamics.
    sample_rate = max(1, len(historical_sequences) // sample_size)
    sampled_seqs = historical_sequences[::sample_rate]
    sampled_days = start_days[::sample_rate]
    
    print(f"Sub-sampled {len(sampled_seqs)} sequences for optimized regression fit.")
    
    predictor = ClimateTwinPredictor(variable_type=variable_type)
    success = predictor.train(sampled_seqs, sampled_days, lats, lons)
    
    if success:
        out_filename = f"{variable_type}_model.pkl"
        out_path = os.path.join(os.path.dirname(__file__), out_filename)
        with open(out_path, 'wb') as f:
            pickle.dump(predictor.model, f)
        print(f"Success! Saved trained weights to: {out_path}")
        return predictor
    else:
        print("Error: Fitting failed.")
        return None

def main():
    # Paths from the user request
    rain_dir = r"C:\Users\AVANEESH\Downloads\rain0.25x0.25"
    maxtemp_dir = r"C:\Users\AVANEESH\Downloads\maxtemp"
    mintemp_dir = r"C:\Users\AVANEESH\Downloads\mintemp"
    
    # Train Max Temperature
    train_variable_model(
        data_dir=maxtemp_dir,
        file_pattern_prefix="Maxtemp_MaxT_",
        reader_func=IMDPuneBinaryReader.read_temp_10_year,
        variable_type="temp_max",
        lats=TEMP_LATS,
        lons=TEMP_LONS
    )
    
    # Train Min Temperature
    train_variable_model(
        data_dir=mintemp_dir,
        file_pattern_prefix="Mintemp_MinT_",
        reader_func=IMDPuneBinaryReader.read_temp_10_year,
        variable_type="temp_min",
        lats=TEMP_LATS,
        lons=TEMP_LONS
    )
    
    # Train Rainfall on 50 years of data (1976-2025)
    train_variable_model(
        data_dir=rain_dir,
        file_pattern_prefix="Rainfall_ind",
        reader_func=IMDPuneBinaryReader.read_rain_025_year,
        variable_type="rain",
        lats=RAIN_LATS,
        lons=RAIN_LONS,
        start_year=1976,
        end_year=2025,
        sample_size=1000
    )

if __name__ == '__main__':
    main()
