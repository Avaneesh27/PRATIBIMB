import os
import numpy as np

# Dynamic check and instructions for scientific file format libraries
try:
    import h5py
except ImportError:
    h5py = None

try:
    from scipy.interpolate import RegularGridInterpolator
except ImportError:
    RegularGridInterpolator = None

class IMDPuneBinaryReader:
    """
    Parser for Indian Meteorological Department (IMD) Pune binary grid datasets.
    Supports:
    1. Gridded Rainfall (0.25 x 0.25 degree bin grid)
    2. Gridded Max Temperature (1.0 x 1.0 degree bin grid)
    """
    @staticmethod
    def read_rain_025(filepath):
        """
        Parses IMD Pune 0.25 x 0.25 degree binary rainfall file.
        Grid shape: 135 columns (longitudes 66.5 to 100.0) x 129 rows (latitudes 6.5 to 38.5)
        Data format: 32-bit floats. Undefined value is -99.9
        """
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"IMD Rainfall file not found at: {filepath}")
            
        with open(filepath, 'rb') as f:
            raw_data = np.fromfile(f, dtype=np.float32)
            
        # Reshape to standard row-major (129, 135)
        # Latitudes are ordered from North (38.5) to South (6.5)
        grid = raw_data.reshape((129, 135))
        grid = np.flip(grid, axis=0)
        grid[grid < 0.0] = np.nan
        
        lats = np.linspace(38.5, 6.5, 129)
        lons = np.linspace(66.5, 100.0, 135)
        return grid, lats, lons

    @staticmethod
    def read_temp_10(filepath):
        """
        Parses IMD Pune 1.0 x 1.0 degree binary max temperature file.
        Grid shape: 31 columns (longitudes 67.5 to 97.5) x 31 rows (latitudes 7.5 to 37.5)
        Data format: 32-bit floats. Undefined value is 99.9
        """
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"IMD Temperature file not found at: {filepath}")
            
        with open(filepath, 'rb') as f:
            raw_data = np.fromfile(f, dtype=np.float32)
            
        # Reshape to standard row-major (31, 31)
        grid = raw_data.reshape((31, 31))
        grid = np.flip(grid, axis=0)
        grid[grid > 99.0] = np.nan
        
        lats = np.linspace(37.5, 7.5, 31)
        lons = np.linspace(67.5, 97.5, 31)
        return grid, lats, lons

    @staticmethod
    def read_rain_025_year(filepath):
        """
        Parses an entire year's daily grids from a single IMD Pune 0.25x0.25 rainfall file.
        Returns a 3D numpy array of shape (num_days, 129, 135), lats, lons.
        """
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"IMD Rainfall file not found at: {filepath}")
            
        with open(filepath, 'rb') as f:
            raw_data = np.fromfile(f, dtype=np.float32)
            
        rows, cols = 129, 135
        grid_size = rows * cols
        num_days = len(raw_data) // grid_size
        
        grids = raw_data[:num_days * grid_size].reshape((num_days, rows, cols))
        grids = np.flip(grids, axis=1)
        grids[grids < 0.0] = np.nan
        
        lats = np.linspace(38.5, 6.5, rows)
        lons = np.linspace(66.5, 100.0, cols)
        return grids, lats, lons

    @staticmethod
    def read_temp_10_year(filepath):
        """
        Parses an entire year's daily grids from a single IMD Pune 1.0x1.0 temperature file.
        Returns a 3D numpy array of shape (num_days, 31, 31), lats, lons.
        """
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"IMD Temperature file not found at: {filepath}")
            
        with open(filepath, 'rb') as f:
            raw_data = np.fromfile(f, dtype=np.float32)
            
        rows, cols = 31, 31
        grid_size = rows * cols
        num_days = len(raw_data) // grid_size
        
        grids = raw_data[:num_days * grid_size].reshape((num_days, rows, cols))
        grids = np.flip(grids, axis=1)
        grids[grids > 99.0] = np.nan
        
        lats = np.linspace(37.5, 7.5, rows)
        lons = np.linspace(67.5, 97.5, cols)
        return grids, lats, lons



class MOSDACINSATReader:
    """
    Parser for Space Applications Centre (SAC) / ISRO MOSDAC INSAT-3D/3DR HDF5 datasets.
    Supports products:
    1. 3RIMG_L2B_LST (Land Surface Temperature)
    2. 3RIMG_L2B_SST (Sea Surface Temperature)
    3. 3RIMG_L2B_IMC (Rainfall intensity products)
    """
    @staticmethod
    def read_lst_sst_rain(filepath, product_type='LST'):
        """
        Parses MOSDAC HDF5 format variables and extracts coordinates.
        Note: Requires h5py library installed.
        """
        if h5py is None:
            raise ImportError(
                "The 'h5py' library is required to parse MOSDAC HDF5 products. "
                "Please run: pip install h5py"
            )
            
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"MOSDAC HDF5 file not found at: {filepath}")
            
        # Select target dataset based on product types
        # Standard INSAT-3D/3DR product variable mappings
        dataset_mappings = {
            'LST': 'LST',
            'SST': 'SST',
            'RAIN': 'Rainfall'
        }
        dataset_name = dataset_mappings.get(product_type.upper(), 'LST')
        
        with h5py.File(filepath, 'r') as f:
            if dataset_name not in f:
                # Search dynamically for datasets matching name keys
                matches = [key for key in f.keys() if dataset_name.lower() in key.lower()]
                if not matches:
                    raise KeyError(
                        f"Dataset '{dataset_name}' not found in HDF5 keys: {list(f.keys())}"
                    )
                dataset_name = matches[0]
                
            dataset = f[dataset_name]
            grid_data = dataset[:]
            
            # Read scale factors and fill values from metadata attributes
            fill_value = dataset.attrs.get('_FillValue', np.nan)
            scale_factor = dataset.attrs.get('scale_factor', 1.0)
            add_offset = dataset.attrs.get('add_offset', 0.0)
            
            # Convert to float array and mask fill value
            grid_data = grid_data.astype(np.float32)
            if not np.isnan(fill_value):
                grid_data[grid_data == fill_value] = np.nan
                
            # Apply scaling calibration
            grid_data = grid_data * scale_factor + add_offset
            
            # Extract coordinates if available
            if 'Latitude' in f and 'Longitude' in f:
                lats = f['Latitude'][:]
                lons = f['Longitude'][:]
            elif 'lat' in f and 'lon' in f:
                lats = f['lat'][:]
                lons = f['lon'][:]
            else:
                # Fallback to standard INSAT Indian sector projection bounds
                # INSAT-3DR Imager coordinates defaults: Lat (50N to 10S), Lon (40E to 110E)
                rows, cols = grid_data.shape
                lats = np.linspace(50.0, -10.0, rows)
                lons = np.linspace(40.0, 110.0, cols)
                
            return grid_data, lats, lons


class CoordinateGridInterpolator:
    """
    Utility class to interpolate various source grids onto VayuMitra's 
    target Indian coordinate grid bounds at 0.25 degree shape (121 x 121).
    """
    @staticmethod
    def interpolate_to_target(src_grid, src_lats, src_lons, target_lats, target_lons):
        """
        Bilinear/spline interpolation onto target grids.
        """
        if RegularGridInterpolator is None:
            # Simple nearest-neighbor fallback if SciPy is missing
            print("Warning: SciPy RegularGridInterpolator not available, falling back to nearest neighbor.")
            target_rows = len(target_lats)
            target_cols = len(target_lons)
            output_grid = np.zeros((target_rows, target_cols))
            
            for r in range(target_rows):
                lat = target_lats[r]
                # Find nearest row index in source
                lat_idx = np.argmin(np.abs(src_lats - lat))
                for c in range(target_cols):
                    lon = target_lons[c]
                    lon_idx = np.argmin(np.abs(src_lons - lon))
                    output_grid[r, c] = src_grid[lat_idx, lon_idx]
            return output_grid
            
        # Ensure coordinates are sorted in ascending order for SciPy
        lat_order = np.argsort(src_lats)
        lon_order = np.argsort(src_lons)
        
        sorted_lats = src_lats[lat_order]
        sorted_lons = src_lons[lon_order]
        # Re-index grid
        sorted_grid = src_grid[lat_order][:, lon_order]
        
        # Clean NaNs before interpolating
        mask = np.isnan(sorted_grid)
        clean_grid = sorted_grid.copy()
        if np.all(mask):
            return np.full((len(target_lats), len(target_lons)), np.nan)
        if np.any(mask):
            clean_grid[mask] = np.nanmean(sorted_grid)
            
        # Fit Regular Grid Interpolator
        interp_func = RegularGridInterpolator(
            (sorted_lats, sorted_lons), 
            clean_grid, 
            bounds_error=False, 
            fill_value=np.nan
        )
        
        # Build coordinates query matrix
        target_rows = len(target_lats)
        target_cols = len(target_lons)
        output_grid = np.zeros((target_rows, target_cols))
        
        for r in range(target_rows):
            for c in range(target_cols):
                pt = [target_lats[r], target_lons[c]]
                output_grid[r, c] = interp_func(pt)[0]
                
        return output_grid
