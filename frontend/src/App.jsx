import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  Sliders, 
  Database, 
  MapPin, 
  TrendingUp, 
  Activity, 
  Sparkles, 
  AlertTriangle, 
  Columns, 
  LineChart,
  FileText,
  CheckCircle,
  HelpCircle
} from 'lucide-react';
import IndiaMapCanvas from './components/IndiaMapCanvas';

const REGIONS = {
  "Whole India": {
    bounds: { minLon: 67.0, maxLon: 98.0, minLat: 7.0, maxLat: 38.0 },
    cities: ["Delhi", "Mumbai", "Kolkata", "Chennai", "Bengaluru", "Hyderabad", "Ahmedabad", "Jaipur", "Lucknow", "Patna", "Bhopal", "Guwahati", "Srinagar", "Leh", "Bhubaneswar", "Thiruvananthapuram", "Ranchi", "Raipur", "Dehradun", "Shimla", "Panaji", "Itanagar", "Port Blair", "Imphal", "Shillong", "Chandigarh", "Indore", "Pune", "Nagpur", "Jodhpur", "Varanasi", "Visakhapatnam", "Kochi", "Amritsar", "Agartala", "Darjeeling"],
    states: []
  },
  "Maharashtra & Goa": {
    bounds: { minLon: 71.5, maxLon: 81.5, minLat: 14.5, maxLat: 22.5 },
    cities: ["Mumbai", "Pune", "Nagpur", "Panaji"],
    states: ["Maharashtra", "Goa"]
  },
  "Rajasthan & Gujarat (West)": {
    bounds: { minLon: 68.0, maxLon: 79.5, minLat: 20.0, maxLat: 30.5 },
    cities: ["Ahmedabad", "Jaipur", "Jodhpur", "Indore"],
    states: ["Rajasthan", "Gujarat"]
  },
  "Delhi & Punjab & Hills (North)": {
    bounds: { minLon: 73.0, maxLon: 80.5, minLat: 26.5, maxLat: 33.5 },
    cities: ["Delhi", "Chandigarh", "Dehradun", "Shimla", "Amritsar"],
    states: ["Delhi", "Punjab", "Haryana", "Himachal Pradesh", "Uttaranchal"]
  },
  "J&K & Ladakh (Far North)": {
    bounds: { minLon: 72.5, maxLon: 81.0, minLat: 32.0, maxLat: 38.0 },
    cities: ["Srinagar", "Leh"],
    states: ["Jammu and Kashmir"]
  },
  "Northeast India": {
    bounds: { minLon: 88.0, maxLon: 97.5, minLat: 21.5, maxLat: 29.5 },
    cities: ["Guwahati", "Itanagar", "Imphal", "Shillong", "Agartala"],
    states: ["Assam", "Arunachal Pradesh", "Manipur", "Meghalaya", "Tripura", "Mizoram", "Nagaland"]
  },
  "West Bengal & Bihar & Odisha (East)": {
    bounds: { minLon: 81.0, maxLon: 90.5, minLat: 19.0, maxLat: 28.0 },
    cities: ["Kolkata", "Patna", "Bhubaneswar", "Ranchi", "Darjeeling"],
    states: ["West Bengal", "Bihar", "Orissa", "Jharkhand", "Sikkim"]
  },
  "Karnataka & Kerala (Southwest)": {
    bounds: { minLon: 73.0, maxLon: 79.0, minLat: 8.0, maxLat: 19.0 },
    cities: ["Bengaluru", "Thiruvananthapuram", "Kochi"],
    states: ["Karnataka", "Kerala"]
  },
  "Tamil Nadu & Andhra (Southeast)": {
    bounds: { minLon: 77.0, maxLon: 85.0, minLat: 8.0, maxLat: 20.0 },
    cities: ["Chennai", "Hyderabad", "Visakhapatnam"],
    states: ["Tamil Nadu", "Andhra Pradesh"]
  },
  "Madhya Pradesh & UP (Central)": {
    bounds: { minLon: 73.5, maxLon: 86.5, minLat: 18.0, maxLat: 30.5 },
    cities: ["Bhopal", "Lucknow", "Varanasi", "Raipur"],
    states: ["Madhya Pradesh", "Uttar Pradesh", "Chhattisgarh"]
  }
};

const getMosdacUrl = (layer) => {
  switch (layer) {
    case 'mosdac_weather': return 'https://www.mosdac.gov.in/weather/';
    case 'mosdac_temp': return 'https://mosdac.gov.in/temperature/';
    case 'mosdac_rain': return 'https://mosdac.gov.in/heavy-rain/';
    case 'mosdac_wind': return 'https://www.mosdac.gov.in/energy/';
    default: return '';
  }
};

const getMosdacTitle = (layer) => {
  switch (layer) {
    case 'mosdac_weather': return 'MOSDAC Live Weather Feed';
    case 'mosdac_temp': return 'MOSDAC Heat Wave & Temp Feed';
    case 'mosdac_rain': return 'MOSDAC Heavy Rain Tracker';
    case 'mosdac_wind': return 'MOSDAC Wind & Solar Energy Feed';
    default: return 'MOSDAC Portal';
  }
};

export default function App() {
  // Navigation State
  const [currentTab, setCurrentTab] = useState('map');
  const [selectedRegion, setSelectedRegion] = useState('Whole India');

  // Climatology / What-If Parameters
  const [day, setDay] = useState(180); // June 29 (Monsoon peak)
  const [tempAnomaly, setTempAnomaly] = useState(0.0);
  const [rainAnomaly, setRainAnomaly] = useState(0.0);
  
  // UI Selection States
  const [activeLayer, setActiveLayer] = useState('temp_assimilated'); 
  const [activeCompareLayer, setActiveCompareLayer] = useState('lst_satellite');
  const [compareMode, setCompareMode] = useState(false);
  const [selectedDistrict, setSelectedDistrict] = useState('Delhi');

  // Sync compare overlay parameter to match active layer on changes with predictive vs raw mapping
  useEffect(() => {
    if (activeLayer === 'temp_assimilated' || activeLayer === 'crop_stress_cwsi' || activeLayer === 'heatwave_risk') {
      setActiveCompareLayer('mosdac_temp'); // Default right map to MOSDAC Heat Wave & Temp Portal
    } else if (activeLayer === 'rain_predicted' || activeLayer === 'flood_risk') {
      setActiveCompareLayer('mosdac_rain');  // Default right map to MOSDAC Heavy Rain Tracker
    } else if (activeLayer === 'soil_moisture_smi') {
      setActiveCompareLayer('mosdac_weather'); // Default right map to MOSDAC Weather Portal
    }
  }, [activeLayer]);

  // Playing timeline loop
  const [isPlaying, setIsPlaying] = useState(false);
  const playIntervalRef = useRef(null);

  // Loaded API Data
  const [twinData, setTwinData] = useState(null);
  const [forecastData, setForecastData] = useState(null);
  const [selectedForecastStep, setSelectedForecastStep] = useState(null);
  const [loading, setLoading] = useState(true);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Validation Console data
  const [validationStats, setValidationStats] = useState(null);

  // Calendar dates lookup
  const getCalendarDate = (doy) => {
    const months = [
      { name: "Jan", days: 31 }, { name: "Feb", days: 28 }, { name: "Mar", days: 31 },
      { name: "Apr", days: 30 }, { name: "May", days: 31 }, { name: "Jun", days: 30 },
      { name: "Jul", days: 31 }, { name: "Aug", days: 31 }, { name: "Sep", days: 30 },
      { name: "Oct", days: 31 }, { name: "Nov", days: 30 }, { name: "Dec", days: 31 }
    ];
    let remainingDays = doy;
    for (let i = 0; i < months.length; i++) {
      if (remainingDays <= months[i].days) {
        return `${remainingDays} ${months[i].name}`;
      }
      remainingDays -= months[i].days;
    }
    return `${remainingDays} Dec`;
  };

  // Fetch twin state on slider changes
  useEffect(() => {
    const fetchTwinState = async () => {
      try {
        setLoading(true);
        const res = await fetch(`http://127.0.0.1:5000/api/climatology?day=${day}&temp_anomaly=${tempAnomaly}&rain_anomaly=${rainAnomaly}`);
        if (!res.ok) throw new Error("Could not connect to PRATIBIMB core twin engine.");
        const data = await res.json();
        setTwinData(data);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTwinState();
  }, [day, tempAnomaly, rainAnomaly]);

  // Handle auto-playing timeline
  useEffect(() => {
    if (isPlaying) {
      playIntervalRef.current = setInterval(() => {
        setDay((prevDay) => (prevDay % 365) + 1);
      }, 1400); // 1.4s per step
    } else {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    }
    return () => clearInterval(playIntervalRef.current);
  }, [isPlaying]);

  // Fetch 7-Day AI Ensemble Forecast
  const runAIForecast = async () => {
    try {
      setForecastLoading(true);
      const res = await fetch(`http://127.0.0.1:5000/api/forecast?day=${day}`);
      if (!res.ok) throw new Error("ConvLSTM spatiotemporal model failure.");
      const data = await res.json();
      setForecastData(data.forecast);
      setValidationStats(data.validation_console);
      setSelectedForecastStep(0); // Mapped day +1 by default
    } catch (err) {
      console.error(err);
    } finally {
      setForecastLoading(false);
    }
  };

  // Trigger CSV Report Download
  const downloadCSVReport = () => {
    window.open(`http://127.0.0.1:5000/api/download?day=${day}`, '_blank');
  };

  // Helper to extract active grid data for mapping
  const getActiveGrid = (layerType) => {
    if (!twinData) return [];
    
    // If a forecast step is selected, override grid data with predicted grids
    if (selectedForecastStep !== null && forecastData && forecastData[selectedForecastStep]) {
      const fcDay = forecastData[selectedForecastStep];
      if (layerType === 'temp_assimilated' || layerType === 'temp_ground' || layerType === 'lst_satellite') {
        return fcDay.grids.temp_max || [];
      } else if (layerType === 'temp_min') {
        return fcDay.grids.temp_min || [];
      } else if (layerType === 'rain_predicted' || layerType === 'rain_ground') {
        return fcDay.grids.rain || [];
      }
    }

    switch (layerType) {
      case 'temp_ground': return twinData.grids.temp_ground;
      case 'rain_ground': return twinData.grids.rain_ground;
      case 'rain_predicted': return twinData.grids.rain_predicted;
      case 'lst_satellite': return twinData.grids.lst_satellite;
      case 'temp_assimilated': return twinData.grids.temp_assimilated;
      case 'crop_stress_cwsi': return twinData.grids.crop_stress_cwsi;
      case 'soil_moisture_smi': return twinData.grids.soil_moisture_smi;
      case 'heatwave_risk': return twinData.grids.heatwave_risk;
      case 'flood_risk': return twinData.grids.flood_risk;
      default: return [];
    }
  };

  const getLayerTitle = (layerType) => {
    const isForecast = selectedForecastStep !== null ? ` [Forecast Day +${selectedForecastStep + 1}]` : "";
    switch (layerType) {
      case 'temp_ground': return `IMD Ground Temp${isForecast}`;
      case 'rain_ground': return `IMD Gridded Rainfall${isForecast}`;
      case 'rain_predicted': return `PRATIBIMB Predicted Rainfall${isForecast}`;
      case 'lst_satellite': return `INSAT LST Observation`;
      case 'temp_assimilated': return `PRATIBIMB Predicted Temp${isForecast}`;
      case 'crop_stress_cwsi': return `Crop Water Stress Index (CWSI)`;
      case 'soil_moisture_smi': return `Soil Moisture Index (SMI)`;
      case 'heatwave_risk': return `IMD Heatwave Alert levels`;
      case 'flood_risk': return `Flash Flood Risk levels`;
      default: return "Climatic Grid Layer";
    }
  };

  const getDistrictAlertColor = (alert) => {
    switch (alert) {
      case 'Red': return 'var(--red)';
      case 'Orange': return 'var(--amber)';
      case 'Yellow': return 'yellow';
      default: return 'var(--emerald)';
    }
  };

  const activeDistrictInfo = twinData?.districts?.[selectedDistrict] || null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      
      {/* PRATIBIMB Space Command Header */}
      <header className="app-header">
        <div className="app-title-wrapper">
          <div>
            <h1 className="app-title">
              <Sparkles size={24} style={{ color: 'var(--cyan)' }} />
              PRATIBIMB: Climate Digital Twin of India
            </h1>
            <div className="app-subtitle">INDIA NATIONAL CONV-LSTM FORECAST & DATA ASSIMILATION CENTER</div>
          </div>
        </div>

        {/* Dynamic Tab Navigation Bar */}
        <nav className="tab-navigation">
          <button 
            className={`nav-tab-btn ${currentTab === 'map' ? 'active' : ''}`}
            onClick={() => {
              setCurrentTab('map');
              setSelectedForecastStep(null);
            }}
          >
            Map Explorer
          </button>
          <button 
            className={`nav-tab-btn ${currentTab === 'forecast' ? 'active' : ''}`}
            onClick={() => {
              setCurrentTab('forecast');
              if (forecastData && selectedForecastStep === null) {
                setSelectedForecastStep(0);
              }
            }}
          >
            Predictive Models
          </button>
          <button 
            className={`nav-tab-btn ${currentTab === 'simulation' ? 'active' : ''}`}
            onClick={() => {
              setCurrentTab('simulation');
              setSelectedForecastStep(null);
            }}
          >
            Causal Sandbox
          </button>
          <button 
            className={`nav-tab-btn ${currentTab === 'directory' ? 'active' : ''}`}
            onClick={() => {
              setCurrentTab('directory');
              setSelectedForecastStep(null);
            }}
          >
            Vulnerability Directory
          </button>
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'right' }}>
            <div>ConvLSTM MET MODELS: <span style={{ color: 'var(--emerald)', fontWeight: 700 }}>TRAINED & ONLINE</span></div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.7rem' }}>GRID LAYOUT: 31x31 TEMP | 129x135 RAIN</div>
          </div>
          <div className="pulse-indicator" style={{ backgroundColor: 'var(--emerald)', boxShadow: '0 0 10px rgba(0,200,100,0.6)' }}></div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="dashboard-grid-tabs">
        
        {/* TAB 1: MAP EXPLORER */}
        {currentTab === 'map' && (
          <div className="tab-panel-grid tab-panel-map">
            
            {/* Left Column: Timeline and controls */}
            <section className="side-panel">
              <div className="glass-card">
                <h2 className="panel-title">
                  <Sliders size={18} />
                  Timeline & Focus Controls
                </h2>
                <div style={{ background: 'rgba(0, 200, 100, 0.08)', border: '1px solid rgba(0, 200, 100, 0.2)', padding: '10px', borderRadius: 'var(--radius-sm)', marginBottom: '15px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <Sparkles size={16} style={{ color: 'var(--emerald)' }} />
                  <span style={{ fontSize: '0.72rem', color: 'var(--emerald)', fontWeight: 600 }}>Trained climate models active on C:\Users\AVANEESH\Downloads datasets.</span>
                </div>
                
                <div className="control-group">
                  <div className="control-label">
                    <span>Regional / State Focus</span>
                  </div>
                  <select 
                    className="select-dropdown" 
                    value={selectedRegion} 
                    onChange={(e) => {
                      const newRegion = e.target.value;
                      setSelectedRegion(newRegion);
                      const regionCities = REGIONS[newRegion].cities;
                      if (regionCities.length > 0 && !regionCities.includes(selectedDistrict)) {
                        setSelectedDistrict(regionCities[0]);
                      }
                    }}
                  >
                    {Object.keys(REGIONS).map(rName => (
                      <option key={rName} value={rName}>{rName}</option>
                    ))}
                  </select>
                </div>

                <div className="control-group">
                  <div className="control-label">
                    <span>Active Target District</span>
                  </div>
                  <select 
                    className="select-dropdown" 
                    value={selectedDistrict} 
                    onChange={(e) => setSelectedDistrict(e.target.value)}
                  >
                    {twinData && Object.keys(twinData.districts)
                      .filter(name => REGIONS[selectedRegion].cities.includes(name))
                      .sort()
                      .map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                  </select>
                </div>

                <div className="control-group timeline-card">
                  <div className="control-label">
                    <span>Daily Timeline (1-365)</span>
                    <span className="label-value">{getCalendarDate(day)} (Day {day})</span>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max="365" 
                    value={day} 
                    onChange={(e) => {
                      setDay(parseInt(e.target.value));
                      setSelectedForecastStep(null);
                    }}
                  />
                  <button 
                    className="timeline-play-btn"
                    onClick={() => setIsPlaying(!isPlaying)}
                  >
                    {isPlaying ? (
                      <>
                        <Pause size={16} fill="var(--bg-deep)" />
                        Pause Model Run
                      </>
                    ) : (
                      <>
                        <Play size={16} fill="var(--bg-deep)" />
                        Play Daily Cycle
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Quick Info Guides */}
              <div className="glass-card">
                <h2 className="panel-title">
                  <HelpCircle size={18} />
                  Map Layers Info
                </h2>
                <div className="guide-content" style={{ fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--text-muted)' }}>
                  <div>
                    <strong style={{ color: 'var(--cyan)' }}>Twin Temp:</strong> Assimilated climate digital twin temperature (blends satellite & IMD sensors).
                  </div>
                  <div>
                    <strong style={{ color: 'var(--cyan)' }}>IMD Rain:</strong> Live IMD gridded daily precipitation tracking (mm).
                  </div>
                  <div>
                    <strong style={{ color: 'var(--cyan)' }}>CWSI Stress:</strong> Crop Water Stress Index. Higher index means severe crop drought stress.
                  </div>
                  <div>
                    <strong style={{ color: 'var(--cyan)' }}>SMI Soil:</strong> Soil Moisture Index. Brown represents dry, green/teal represent moist/wet conditions.
                  </div>
                  <div>
                    <strong style={{ color: 'var(--cyan)' }}>Heat Alerts:</strong> Indian Meteorological Department heatwave levels.
                  </div>
                  <div>
                    <strong style={{ color: 'var(--cyan)' }}>Flood Risk:</strong> Flash flood exposure index based on rainfall intensity.
                  </div>
                </div>
              </div>
            </section>

            {/* Center Column: Map and layer controls */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              
              {/* Layer Selection Header */}
              <div className="glass-card" style={{ padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  
                  <div className="layer-selector" style={{ flex: 1 }}>
                    <button 
                      className={`layer-btn ${activeLayer === 'temp_assimilated' ? 'active' : ''}`}
                      onClick={() => { setActiveLayer('temp_assimilated'); setSelectedForecastStep(null); }}
                    >
                      Predicted Temp
                    </button>
                    <button 
                      className={`layer-btn ${activeLayer === 'rain_predicted' ? 'active' : ''}`}
                      onClick={() => { setActiveLayer('rain_predicted'); setSelectedForecastStep(null); }}
                    >
                      Predicted Rain
                    </button>
                    <button 
                      className={`layer-btn ${activeLayer === 'crop_stress_cwsi' ? 'active' : ''}`}
                      onClick={() => { setActiveLayer('crop_stress_cwsi'); setSelectedForecastStep(null); }}
                    >
                      CWSI Stress
                    </button>
                    <button 
                      className={`layer-btn ${activeLayer === 'soil_moisture_smi' ? 'active' : ''}`}
                      onClick={() => { setActiveLayer('soil_moisture_smi'); setSelectedForecastStep(null); }}
                    >
                      SMI Soil
                    </button>
                    <button 
                      className={`layer-btn ${activeLayer === 'heatwave_risk' ? 'active' : ''}`}
                      onClick={() => { setActiveLayer('heatwave_risk'); setSelectedForecastStep(null); }}
                    >
                      Heat Alerts
                    </button>
                    <button 
                      className={`layer-btn ${activeLayer === 'flood_risk' ? 'active' : ''}`}
                      onClick={() => { setActiveLayer('flood_risk'); setSelectedForecastStep(null); }}
                    >
                      Flood Risk
                    </button>
                  </div>

                  <button 
                    className={`layer-btn ${compareMode ? 'active' : ''}`}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 'none', border: '1px solid var(--border-subtle)', width: 'auto' }}
                    onClick={() => setCompareMode(!compareMode)}
                  >
                    <Columns size={14} />
                    Compare Mode
                  </button>
                </div>

                {compareMode && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', padding: '6px', borderTop: '1px solid var(--border-subtle)', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Compare Overlay Parameter (Right Map - Satellite/Observations):</span>
                    <select 
                      className="select-dropdown" 
                      style={{ width: '320px', padding: '4px' }}
                      value={activeCompareLayer}
                      onChange={(e) => setActiveCompareLayer(e.target.value)}
                    >
                      <optgroup label="Ground & Satellite Grids">
                        <option value="lst_satellite">INSAT Satellite LST (Real-time)</option>
                        <option value="temp_ground">Real Ground Temp (IMD)</option>
                        <option value="rain_ground">Real Gridded Rainfall (IMD)</option>
                      </optgroup>
                      <optgroup label="Live ISRO MOSDAC Portals">
                        <option value="mosdac_weather">MOSDAC Live Weather Feed</option>
                        <option value="mosdac_temp">MOSDAC Heat Wave & Temp Feed</option>
                        <option value="mosdac_rain">MOSDAC Heavy Rain Tracker</option>
                        <option value="mosdac_wind">MOSDAC Wind & Solar Energy Feed</option>
                      </optgroup>
                    </select>
                  </div>
                )}
              </div>

              {/* Map Canvas */}
              <div style={{ flex: 1, minHeight: '380px' }}>
                {error ? (
                  <div className="glass-card" style={{ color: 'var(--red)', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    <AlertTriangle size={32} />
                    <h3>PRATIBIMB Server Connection Offline</h3>
                    <p style={{ fontSize: '0.8rem', opacity: 0.8 }}>{error}</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Make sure the Python API is active on <code>127.0.0.1:5000</code></p>
                  </div>
                ) : loading && !twinData ? (
                  <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '15px', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    <div className="pulse-indicator" style={{ width: '30px', height: '30px' }}></div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', color: 'var(--cyan)' }}>BLENDING MULTI-SOURCE SATELLITE FIELDS...</div>
                  </div>
                ) : (
                  <div style={{ height: '100%', width: '100%' }}>
                    {compareMode ? (
                      <div className="dual-viewport-grid">
                        <IndiaMapCanvas 
                          gridData={getActiveGrid(activeLayer)}
                          gridType={activeLayer}
                          districtsData={twinData?.districts}
                          selectedDistrict={selectedDistrict}
                          onSelectDistrict={setSelectedDistrict}
                          title={getLayerTitle(activeLayer)}
                          mapBounds={REGIONS[selectedRegion].bounds}
                          highlightCities={REGIONS[selectedRegion].cities}
                          highlightStates={REGIONS[selectedRegion].states || []}
                        />
                        {activeCompareLayer.startsWith('mosdac_') ? (
                          <div style={{ 
                            width: '100%', 
                            height: '100%', 
                            border: '1px solid var(--border-subtle)', 
                            borderRadius: 'var(--radius-md)', 
                            overflow: 'hidden', 
                            background: 'var(--bg-deep)', 
                            position: 'relative',
                            display: 'flex',
                            flexDirection: 'column'
                          }}>
                            <div style={{ 
                              padding: '10px 15px', 
                              background: 'hsla(222, 20%, 8%, 0.85)', 
                              borderBottom: '1px solid var(--border-subtle)',
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'center',
                              zIndex: 10
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="pulse-indicator" style={{ backgroundColor: 'var(--cyan)' }}></span>
                                <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem', color: 'var(--cyan)', fontWeight: 600 }}>
                                  {getMosdacTitle(activeCompareLayer)}
                                </span>
                              </div>
                              <a 
                                href={getMosdacUrl(activeCompareLayer)} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="timeline-play-btn"
                                style={{ 
                                  fontSize: '0.7rem', 
                                  padding: '4px 10px', 
                                  textDecoration: 'none',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  background: 'linear-gradient(135deg, var(--cyan), hsla(180,100%,35%,1))',
                                  color: 'var(--bg-deep)',
                                  width: 'auto'
                                }}
                              >
                                Open Portal In New Tab ↗
                              </a>
                            </div>
                            <div style={{ flex: 1, position: 'relative' }}>
                              <iframe 
                                src={getMosdacUrl(activeCompareLayer)} 
                                style={{ width: '100%', height: '100%', border: 'none', background: 'var(--bg-deep)' }}
                                title="MOSDAC Portal"
                                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                              />
                            </div>
                          </div>
                        ) : (
                          <IndiaMapCanvas 
                            gridData={getActiveGrid(activeCompareLayer)}
                            gridType={activeCompareLayer}
                            districtsData={twinData?.districts}
                            selectedDistrict={selectedDistrict}
                            onSelectDistrict={setSelectedDistrict}
                            title={getLayerTitle(activeCompareLayer)}
                            mapBounds={REGIONS[selectedRegion].bounds}
                            highlightCities={REGIONS[selectedRegion].cities}
                            highlightStates={REGIONS[selectedRegion].states || []}
                          />
                        )}
                      </div>
                    ) : (
                      <IndiaMapCanvas 
                        gridData={getActiveGrid(activeLayer)}
                        gridType={activeLayer}
                        districtsData={twinData?.districts}
                        selectedDistrict={selectedDistrict}
                        onSelectDistrict={setSelectedDistrict}
                        title={getLayerTitle(activeLayer)}
                        mapBounds={REGIONS[selectedRegion].bounds}
                        highlightCities={REGIONS[selectedRegion].cities}
                        highlightStates={REGIONS[selectedRegion].states || []}
                      />
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Right Column: Profile Overview */}
            <section className="side-panel">
              <div className="glass-card">
                <h2 className="panel-title">
                  <MapPin size={18} />
                  District Quick View
                </h2>

                {activeDistrictInfo ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                      <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'white' }}>{selectedDistrict}</span>
                      <span style={{ 
                        padding: '2px 8px', 
                        borderRadius: '4px', 
                        fontSize: '0.75rem', 
                        fontWeight: 700, 
                        backgroundColor: `rgba(${activeDistrictInfo.alert === 'Red' ? '255,0,0' : activeDistrictInfo.alert === 'Orange' ? '255,120,0' : '0,200,100'}, 0.25)`, 
                        color: getDistrictAlertColor(activeDistrictInfo.alert),
                        border: `1px solid ${getDistrictAlertColor(activeDistrictInfo.alert)}`
                      }}>
                        {activeDistrictInfo.alert} Alert
                      </span>
                    </div>

                    <div className="metric-row" style={{ marginBottom: '15px' }}>
                      <div className="metric-box">
                        <span className="metric-box-title">Temp</span>
                        <span className="metric-box-value">{activeDistrictInfo.temp}<span className="metric-box-unit">°C</span></span>
                      </div>
                      <div className="metric-box">
                        <span className="metric-box-title">Precip</span>
                        <span className="metric-box-value">{activeDistrictInfo.rain}<span className="metric-box-unit">mm</span></span>
                      </div>
                      <div className="metric-box">
                        <span className="metric-box-title">Soil Moist</span>
                        <span className="metric-box-value">{activeDistrictInfo.smi}<span className="metric-box-unit">%</span></span>
                      </div>
                      <div className="metric-box">
                        <span className="metric-box-title">Crop Stress</span>
                        <span className="metric-box-value">{activeDistrictInfo.cwsi}<span className="metric-box-unit">idx</span></span>
                      </div>
                      <div className="metric-box" style={{ borderColor: 'var(--cyan)' }}>
                        <span className="metric-box-title" style={{ color: 'var(--cyan)' }}>Confidence</span>
                        <span className="metric-box-value" style={{ color: 'var(--cyan)' }}>{activeDistrictInfo.confidence}<span className="metric-box-unit">%</span></span>
                      </div>
                    </div>

                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'hsla(222,25%,6%,0.5)', padding: '10px', border: '1px dashed var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
                      <strong>Composite Index (DCVI): {activeDistrictInfo.dcvi}%</strong>
                      <div style={{ marginTop: '5px', lineHeight: '1.3' }}>
                        {twinData?.alerts?.find(a => a.district === selectedDistrict)?.explanation || (
                          `District telemetry is stable with high prediction certainty (${activeDistrictInfo.confidence}%).`
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '15px' }}>
                    Loading district metrics...
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: PREDICTIVE MODELS */}
        {currentTab === 'forecast' && (
          <div className="tab-panel-grid tab-panel-forecast">
            
            {/* Left Column: Forecast Controls & Validation Console */}
            <section className="side-panel">
              <div className="glass-card">
                <h2 className="panel-title">
                  <LineChart size={18} />
                  AI Model Executor
                </h2>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '15px' }}>
                  Triggers the 7-day spatiotemporal ConvLSTM forecasting registry. Calculates confidence limits utilizing 50 Monte Carlo Dropout simulations.
                </p>

                <button 
                  className="timeline-play-btn" 
                  style={{ width: '100%', marginBottom: '15px' }}
                  onClick={runAIForecast}
                  disabled={forecastLoading}
                >
                  {forecastLoading ? 'Executing Spatiotemporal Models...' : 'Execute 7-Day AI Forecast'}
                </button>

                {forecastData && (
                  <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <span className="control-label" style={{ display: 'block', marginBottom: '5px' }}>Forecast Visual Layer:</span>
                      <select value={activeLayer} onChange={(e) => setActiveLayer(e.target.value)} style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', color: 'white', padding: '6px', borderRadius: 'var(--radius-sm)' }}>
                        <option value="temp_ground">Forecast Max Temperature</option>
                        <option value="temp_min">Forecast Min Temperature</option>
                        <option value="rain_ground">Forecast Rainfall</option>
                      </select>
                    </div>

                    <div>
                      <div className="control-label">
                        <span>Interactive Step View:</span>
                        <span className="label-value" style={{ color: 'var(--cyan)' }}>
                          Day +{selectedForecastStep + 1} ({getCalendarDate(forecastData[selectedForecastStep].day)})
                        </span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="6" 
                        value={selectedForecastStep !== null ? selectedForecastStep : 0} 
                        onChange={(e) => setSelectedForecastStep(parseInt(e.target.value))}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        <span>Step +1</span>
                        <span>Step +4</span>
                        <span>Step +7</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Scientific Validation console */}
              {validationStats ? (
                <div className="glass-card">
                  <h2 className="panel-title">
                    <TrendingUp size={18} style={{ color: 'var(--emerald)' }} />
                    AI Validation Registry
                  </h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ background: 'hsla(222,25%,8%,0.4)', padding: '8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Max Temp MAE (RMSE):</div>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--cyan)', fontSize: '1rem' }}>
                        {validationStats.tmax_mae} ({validationStats.tmax_rmse}) °C
                      </div>
                    </div>
                    <div style={{ background: 'hsla(222,25%,8%,0.4)', padding: '8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Min Temp MAE (RMSE):</div>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--cyan)', fontSize: '1rem' }}>
                        {validationStats.tmin_mae} ({validationStats.tmin_rmse}) °C
                      </div>
                    </div>
                    <div style={{ background: 'hsla(222,25%,8%,0.4)', padding: '8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Rainfall MAE (RMSE):</div>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--cyan)', fontSize: '1rem' }}>
                        {validationStats.rain_mae} ({validationStats.rain_rmse}) mm
                      </div>
                    </div>
                    <div style={{ background: 'hsla(222,25%,8%,0.4)', padding: '8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Model R² Score:</div>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--cyan)', fontSize: '1rem' }}>
                        {validationStats.r2_score}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="glass-card" style={{ padding: '20px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Awaiting 7-day model execution to load regression metrics.
                </div>
              )}

              {/* District predictions checklist table */}
              {forecastData && selectedDistrict && (
                <div className="glass-card">
                  <h2 className="panel-title">
                    <Database size={18} />
                    7-Day Forecast: {selectedDistrict}
                  </h2>
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '0.72rem', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                          <th style={{ textAlign: 'left', padding: '5px' }}>Day</th>
                          <th style={{ textAlign: 'center', padding: '5px' }}>Max T</th>
                          <th style={{ textAlign: 'center', padding: '5px' }}>Min T</th>
                          <th style={{ textAlign: 'center', padding: '5px' }}>Rain</th>
                        </tr>
                      </thead>
                      <tbody>
                        {forecastData.map((step, idx) => {
                          const distInfo = step.districts?.[selectedDistrict];
                          if (!distInfo) return null;
                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', color: idx === selectedForecastStep ? 'var(--cyan)' : 'white' }}>
                              <td style={{ padding: '5px', fontWeight: idx === selectedForecastStep ? 700 : 400 }}>+{idx + 1}</td>
                              <td style={{ textAlign: 'center', padding: '5px' }}>{distInfo.temp_max}°C</td>
                              <td style={{ textAlign: 'center', padding: '5px' }}>{distInfo.temp_min}°C</td>
                              <td style={{ textAlign: 'center', padding: '5px' }}>{distInfo.rain} mm</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>

            {/* Right Column: SVG Envelope Chart and SHAP Explainers */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
              
              {/* Uncertainty Chart */}
              <div className="glass-card">
                <h2 className="panel-title">
                  <TrendingUp size={18} />
                  ConvLSTM Spatiotemporal Prediction Envelope
                </h2>

                {forecastData ? (
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
                      {activeLayer === 'rain_ground' 
                        ? 'Rainfall prediction boundary shaded to ±1.5 standard deviations based on Monte Carlo ensembles:' 
                        : 'Temperature boundary shaded to ±1.5 standard deviations (Red: Max, Blue: Min):'}
                    </div>

                    <div className="chart-container" style={{ height: '240px', borderBottom: '1px solid var(--border-subtle)' }}>
                      <svg style={{ width: '100%', height: '100%' }}>
                        <defs>
                          <linearGradient id="envelope-glow-full" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--cyan)" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="var(--cyan)" stopOpacity="0.02" />
                          </linearGradient>
                        </defs>
                        
                        {/* Reference lines */}
                        <line x1="0" y1="50" x2="100%" y2="50" stroke="var(--border-subtle)" strokeWidth="0.5" />
                        <line x1="0" y1="120" x2="100%" y2="120" stroke="var(--border-subtle)" strokeWidth="0.5" />
                        <line x1="0" y1="180" x2="100%" y2="180" stroke="var(--border-subtle)" strokeWidth="0.5" />
                        
                        {(() => {
                          const isRain = activeLayer === 'rain_ground';
                          
                          const mapY = (val) => {
                            if (isRain) {
                              // map 0..15 to 220..20
                              return 220 - (val * 12);
                            } else {
                              // map 5..45 to 220..20
                              return 220 - ((val - 5) * 4.5);
                            }
                          };

                          if (isRain) {
                            const upperPoints = forecastData.map((d, idx) => `${(idx / 6) * 500 + 40},${mapY(d.avg_rain + 1.5 * d.uncertainty_rain)}`);
                            const lowerPoints = forecastData.map((d, idx) => `${(idx / 6) * 500 + 40},${mapY(Math.max(0, d.avg_rain - 1.5 * d.uncertainty_rain))}`).reverse();
                            const polygonPoints = [...upperPoints, ...lowerPoints].join(' ');
                            return (
                              <>
                                <polygon points={polygonPoints} fill="url(#envelope-glow-full)" stroke="hsla(180, 100%, 50%, 0.1)" strokeWidth="1" />
                                <path d={`M ${forecastData.map((d, idx) => `${(idx / 6) * 500 + 40} ${mapY(d.avg_rain)}`).join(' L ')}`} fill="none" stroke="var(--cyan)" strokeWidth="2.5" />
                                {forecastData.map((d, idx) => {
                                  const cx = (idx / 6) * 500 + 40;
                                  const cy = mapY(d.avg_rain);
                                  return (
                                    <g key={idx}>
                                      <circle cx={cx} cy={cy} r="5.5" fill="var(--cyan)" />
                                      <text x={cx} y={cy - 12} fill="white" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="Space Grotesk">
                                        {d.avg_rain}mm
                                      </text>
                                    </g>
                                  );
                                })}
                              </>
                            );
                          } else {
                            const maxUpper = forecastData.map((d, idx) => `${(idx / 6) * 500 + 40},${mapY(d.avg_temp_max + 1.5 * d.uncertainty_temp_max)}`);
                            const maxLower = forecastData.map((d, idx) => `${(idx / 6) * 500 + 40},${mapY(d.avg_temp_max - 1.5 * d.uncertainty_temp_max)}`).reverse();
                            const maxPolygon = [...maxUpper, ...maxLower].join(' ');

                            const minUpper = forecastData.map((d, idx) => `${(idx / 6) * 500 + 40},${mapY(d.avg_temp_min + 1.5 * d.uncertainty_temp_min)}`);
                            const minLower = forecastData.map((d, idx) => `${(idx / 6) * 500 + 40},${mapY(d.avg_temp_min - 1.5 * d.uncertainty_temp_min)}`).reverse();
                            const minPolygon = [...minUpper, ...minLower].join(' ');

                            return (
                              <>
                                <polygon points={maxPolygon} fill="rgba(255, 60, 0, 0.15)" stroke="rgba(255, 60, 0, 0.05)" strokeWidth="1" />
                                <path d={`M ${forecastData.map((d, idx) => `${(idx / 6) * 500 + 40} ${mapY(d.avg_temp_max)}`).join(' L ')}`} fill="none" stroke="var(--red)" strokeWidth="2.5" />

                                <polygon points={minPolygon} fill="rgba(0, 150, 255, 0.15)" stroke="rgba(0, 150, 255, 0.05)" strokeWidth="1" />
                                <path d={`M ${forecastData.map((d, idx) => `${(idx / 6) * 500 + 40} ${mapY(d.avg_temp_min)}`).join(' L ')}`} fill="none" stroke="var(--blue)" strokeWidth="2" />

                                {forecastData.map((d, idx) => {
                                  const cx = (idx / 6) * 500 + 40;
                                  const cyMax = mapY(d.avg_temp_max);
                                  const cyMin = mapY(d.avg_temp_min);
                                  return (
                                    <g key={idx}>
                                      <circle cx={cx} cy={cyMax} r="5" fill="var(--red)" />
                                      <text x={cx} y={cyMax - 10} fill="white" fontSize="9" fontWeight="bold" textAnchor="middle" fontFamily="Space Grotesk">
                                        {d.avg_temp_max}°
                                      </text>

                                      <circle cx={cx} cy={cyMin} r="4" fill="var(--blue)" />
                                      <text x={cx} y={cyMin + 14} fill="var(--text-muted)" fontSize="9" fontWeight="bold" textAnchor="middle" fontFamily="Space Grotesk">
                                        {d.avg_temp_min}°
                                      </text>
                                    </g>
                                  );
                                })}
                              </>
                            );
                          }
                        })()}
                      </svg>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', position: 'absolute', bottom: '0px', padding: '0 40px' }}>
                        {forecastData.map((d, idx) => (
                          <span key={idx} style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            Day +{d.step}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '50px', border: '1px dashed var(--border-subtle)', borderRadius: 'var(--radius-sm)', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Trigger the 7-day forecast loop to visualize uncertainty bands.
                  </div>
                )}
              </div>

              {/* SHAP explainability insights */}
              <div className="glass-card">
                <h2 className="panel-title">
                  <Activity size={18} />
                  Spatial SHAP Contribution Weighting
                </h2>
                {forecastData ? (
                  <div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
                      {forecastData[selectedForecastStep || 0]?.shap ? (
                        Object.entries(forecastData[selectedForecastStep || 0].shap).map(([key, val]) => (
                          <div key={key} style={{ display: 'flex', alignItems: 'center', fontSize: '0.75rem' }}>
                            <span style={{ width: '120px', color: 'var(--text-muted)', textTransform: 'capitalize', fontWeight: 600 }}>{key}</span>
                            <div style={{ flex: 1, height: '8px', background: 'var(--border-subtle)', borderRadius: '4px', overflow: 'hidden', margin: '0 12px' }}>
                              <div style={{ height: '100%', width: `${val}%`, background: 'var(--cyan)', boxShadow: '0 0 8px var(--cyan-glow)' }}></div>
                            </div>
                            <span style={{ width: '40px', textAlign: 'right', fontWeight: 600, color: 'white' }}>{val}%</span>
                          </div>
                        ))
                      ) : (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center' }}>
                          Awaiting SHAP indices...
                        </div>
                      )}
                    </div>
                    
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'hsla(222,25%,6%,0.5)', padding: '10px', border: '1px dashed var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
                      <strong>Active Target Focus: {selectedDistrict}</strong>
                      <div style={{ marginTop: '4px', lineHeight: '1.3' }}>
                        {twinData?.alerts?.find(a => a.district === selectedDistrict)?.explanation || (
                          `Upstream spatial temp residuals hold the highest impact weight at ${forecastData[selectedForecastStep || 0]?.shap?.temperature || 45}%. Model attribution weights are currently balanced.`
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Activate model forecast to fetch SHAP explainability vectors.
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* TAB 3: CAUSAL SANDBOX */}
        {currentTab === 'simulation' && (
          <div className="tab-panel-grid tab-panel-simulation">
            
            {/* Left Column: Sliders and Feedback details */}
            <section className="side-panel">
              
              {/* Sliders */}
              <div className="glass-card">
                <h2 className="panel-title">
                  <Sparkles size={18} style={{ color: 'var(--amber)' }} />
                  Causal Sandbox Controls
                </h2>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '15px' }}>
                  Inject anomaly offsets directly into the climate grid nodes to propagate downstream sector risks.
                </p>

                <div className="control-group">
                  <div className="control-label">
                    <span>Regional / State Focus</span>
                  </div>
                  <select 
                    className="select-dropdown" 
                    value={selectedRegion} 
                    onChange={(e) => {
                      const newRegion = e.target.value;
                      setSelectedRegion(newRegion);
                      const regionCities = REGIONS[newRegion].cities;
                      if (regionCities.length > 0 && !regionCities.includes(selectedDistrict)) {
                        setSelectedDistrict(regionCities[0]);
                      }
                    }}
                  >
                    {Object.keys(REGIONS).map(rName => (
                      <option key={rName} value={rName}>{rName}</option>
                    ))}
                  </select>
                </div>

                <div className="control-group">
                  <div className="control-label">
                    <span>Forced Temp Anomaly</span>
                    <span className="label-value" style={{ color: tempAnomaly > 0 ? 'var(--red)' : 'var(--cyan)' }}>
                      {tempAnomaly > 0 ? `+${tempAnomaly}` : tempAnomaly}°C
                    </span>
                  </div>
                  <input 
                    type="range" 
                    min="-3.0" 
                    max="5.0" 
                    step="0.5"
                    value={tempAnomaly} 
                    onChange={(e) => {
                      setTempAnomaly(parseFloat(e.target.value));
                      setSelectedForecastStep(null);
                    }}
                  />
                </div>

                <div className="control-group">
                  <div className="control-label">
                    <span>Forced Rainfall Anomaly</span>
                    <span className="label-value" style={{ color: rainAnomaly >= 0 ? 'var(--cyan)' : 'var(--red)' }}>
                      {rainAnomaly >= 0 ? `+${Math.round(rainAnomaly * 100)}` : `${Math.round(rainAnomaly * 100)}`}%
                    </span>
                  </div>
                  <input 
                    type="range" 
                    min="-1.0" 
                    max="1.0" 
                    step="0.1"
                    value={rainAnomaly} 
                    onChange={(e) => {
                      setRainAnomaly(parseFloat(e.target.value));
                      setSelectedForecastStep(null);
                    }}
                  />
                </div>
              </div>

              {/* Guide Card */}
              <div className="glass-card">
                <h2 className="panel-title">
                  <HelpCircle size={18} />
                  What-If Simulation Guide
                </h2>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  PRATIBIMB emulates immediate causal effects across districts when anomalies propagate. Temperature forcing alters the Crop Water Stress Index (CWSI), while rainfall forcing triggers flash-flood or drought flags.
                </p>
              </div>

              {/* Feedback Loop Logs */}
              <div className="glass-card">
                <h2 className="panel-title">
                  <Database size={18} />
                  Feedback Self-Correction
                </h2>
                
                {twinData && twinData.feedback_loop ? (
                  <div style={{ fontSize: '0.72rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ background: 'hsla(222,25%,8%,0.5)', padding: '8px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: 'white', marginBottom: '4px' }}>
                        <span>Prior Residuals</span>
                        <span style={{ color: 'var(--cyan)' }}>Corrected</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', color: 'var(--text-muted)' }}>
                        <div>Temp MAE: <strong style={{ color: 'white' }}>{twinData.feedback_loop.temp.mae} °C</strong></div>
                        <div>Rain MAE: <strong style={{ color: 'white' }}>{twinData.feedback_loop.rain.mae} mm</strong></div>
                      </div>
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle size={12} style={{ color: 'var(--emerald)' }} />
                      <span>Mean Calibration Shift: {twinData.feedback_loop.temp.correction_applied_mean} °C</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Awaiting calibration logs...
                  </div>
                )}
              </div>
            </section>

            {/* Right Column: Simulation Map */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: '15px', flex: 1 }}>
              <div className="glass-card" style={{ padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="layer-selector" style={{ flex: 1 }}>
                    <button 
                      className={`layer-btn ${activeLayer === 'temp_assimilated' ? 'active' : ''}`}
                      onClick={() => { setActiveLayer('temp_assimilated'); }}
                    >
                      Twin Temp (Simulated)
                    </button>
                    <button 
                      className={`layer-btn ${activeLayer === 'crop_stress_cwsi' ? 'active' : ''}`}
                      onClick={() => { setActiveLayer('crop_stress_cwsi'); }}
                    >
                      Crop Stress (CWSI)
                    </button>
                    <button 
                      className={`layer-btn ${activeLayer === 'soil_moisture_smi' ? 'active' : ''}`}
                      onClick={() => { setActiveLayer('soil_moisture_smi'); }}
                    >
                      Soil Moisture (SMI)
                    </button>
                    <button 
                      className={`layer-btn ${activeLayer === 'heatwave_risk' ? 'active' : ''}`}
                      onClick={() => { setActiveLayer('heatwave_risk'); }}
                    >
                      Heatwave Alerts
                    </button>
                    <button 
                      className={`layer-btn ${activeLayer === 'flood_risk' ? 'active' : ''}`}
                      onClick={() => { setActiveLayer('flood_risk'); }}
                    >
                      Flood Risk
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ flex: 1, minHeight: '380px' }}>
                {twinData && (
                  <IndiaMapCanvas 
                    gridData={getActiveGrid(activeLayer)}
                    gridType={activeLayer}
                    districtsData={twinData?.districts}
                    selectedDistrict={selectedDistrict}
                    onSelectDistrict={setSelectedDistrict}
                    title={`${getLayerTitle(activeLayer)} (Simulated Sandbox)`}
                    mapBounds={REGIONS[selectedRegion].bounds}
                    highlightCities={REGIONS[selectedRegion].cities}
                    highlightStates={REGIONS[selectedRegion].states || []}
                  />
                )}
              </div>
            </section>
          </div>
        )}

        {/* TAB 4: VULNERABILITY DIRECTORY */}
        {currentTab === 'directory' && (
          <div className="tab-panel-grid tab-panel-directory">
            
            {/* Left Column: Sorted DCVI Ranking Table */}
            <section className="side-panel" style={{ flex: 1.2 }}>
              <div className="glass-card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <h2 className="panel-title">
                  <Database size={18} />
                  District Vulnerability Rankings
                </h2>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  List of districts sorted dynamically by Composite Climate Risk Index (DCVI):
                </p>

                <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '15px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Region / State Focus</div>
                    <select 
                      className="select-dropdown" 
                      style={{ padding: '6px' }}
                      value={selectedRegion} 
                      onChange={(e) => {
                        const newRegion = e.target.value;
                        setSelectedRegion(newRegion);
                        const regionCities = REGIONS[newRegion].cities;
                        if (regionCities.length > 0 && !regionCities.includes(selectedDistrict)) {
                          setSelectedDistrict(regionCities[0]);
                        }
                      }}
                    >
                      {Object.keys(REGIONS).map(rName => (
                        <option key={rName} value={rName}>{rName}</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
                  <table className="district-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                    <thead>
                      <tr style={{ background: 'hsla(222,25%,8%,0.9)', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                        <th style={{ padding: '10px' }}>District</th>
                        <th style={{ padding: '10px', textAlign: 'center' }}>DCVI Risk</th>
                        <th style={{ padding: '10px', textAlign: 'center' }}>Alert</th>
                      </tr>
                    </thead>
                    <tbody>
                      {twinData && Object.entries(twinData.districts)
                        .filter(([name]) => REGIONS[selectedRegion].cities.includes(name))
                        .sort((a, b) => b[1].dcvi - a[1].dcvi)
                        .map(([name, data]) => (
                          <tr 
                            key={name}
                            onClick={() => setSelectedDistrict(name)}
                            style={{ 
                              borderBottom: '1px solid var(--border-subtle)', 
                              cursor: 'pointer', 
                              backgroundColor: selectedDistrict === name ? 'hsla(180, 100%, 50%, 0.08)' : 'transparent'
                            }}
                          >
                            <td style={{ padding: '10px', fontWeight: 600, color: 'white' }}>{name}</td>
                            <td style={{ padding: '10px', textAlign: 'center', color: 'var(--cyan)', fontWeight: 700 }}>{data.dcvi}%</td>
                            <td style={{ padding: '10px', textAlign: 'center' }}>
                              <span style={{ 
                                padding: '2px 6px', 
                                borderRadius: '4px', 
                                fontSize: '0.65rem', 
                                fontWeight: 700,
                                color: getDistrictAlertColor(data.alert),
                                border: `1px solid ${getDistrictAlertColor(data.alert)}`,
                                backgroundColor: `rgba(${data.alert === 'Red' ? '255,0,0' : data.alert === 'Orange' ? '255,120,0' : '0,200,100'}, 0.15)`
                              }}>
                                {data.alert}
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* Center Column: Selected District Details */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1.5 }}>
              <div className="glass-card" style={{ height: '100%' }}>
                {activeDistrictInfo ? (
                  <div>
                    <h2 className="panel-title">
                      <MapPin size={18} />
                      Climate Profile: {selectedDistrict}
                    </h2>
                    
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '20px' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Composite Vulnerability Score:</span>
                      <span style={{ 
                        padding: '4px 12px', 
                        borderRadius: '6px', 
                        fontSize: '0.9rem', 
                        fontWeight: 700, 
                        color: getDistrictAlertColor(activeDistrictInfo.alert),
                        border: `1px solid ${getDistrictAlertColor(activeDistrictInfo.alert)}`,
                        backgroundColor: `rgba(${activeDistrictInfo.alert === 'Red' ? '255,0,0' : activeDistrictInfo.alert === 'Orange' ? '255,120,0' : '0,200,100'}, 0.2)`
                      }}>
                        DCVI: {activeDistrictInfo.dcvi}% ({activeDistrictInfo.alert} Alert)
                      </span>
                    </div>

                    <div className="metric-row" style={{ marginBottom: '25px', gap: '15px' }}>
                      <div className="metric-box" style={{ padding: '15px' }}>
                        <span className="metric-box-title">Max Temperature</span>
                        <span className="metric-box-value" style={{ fontSize: '1.8rem' }}>{activeDistrictInfo.temp}<span className="metric-box-unit">°C</span></span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px' }}>Sensor-assimilated telemetry</span>
                      </div>
                      
                      <div className="metric-box" style={{ padding: '15px' }}>
                        <span className="metric-box-title">Rainfall</span>
                        <span className="metric-box-value" style={{ fontSize: '1.8rem' }}>{activeDistrictInfo.rain}<span className="metric-box-unit">mm</span></span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px' }}>IMD daily gauge logs</span>
                      </div>

                      <div className="metric-box" style={{ padding: '15px' }}>
                        <span className="metric-box-title">Soil Moisture</span>
                        <span className="metric-box-value" style={{ fontSize: '1.8rem' }}>{activeDistrictInfo.smi}<span className="metric-box-unit">%</span></span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px' }}>Radar backscatter scales</span>
                      </div>

                      <div className="metric-box" style={{ padding: '15px' }}>
                        <span className="metric-box-title">Crop Stress (CWSI)</span>
                        <span className="metric-box-value" style={{ fontSize: '1.8rem' }}>{activeDistrictInfo.cwsi}<span className="metric-box-unit">idx</span></span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px' }}>Evapotranspiration deficit anomaly</span>
                      </div>

                      <div className="metric-box" style={{ padding: '15px', borderColor: 'var(--cyan)' }}>
                        <span className="metric-box-title" style={{ color: 'var(--cyan)' }}>Confidence Score</span>
                        <span className="metric-box-value" style={{ fontSize: '1.8rem', color: 'var(--cyan)' }}>{activeDistrictInfo.confidence}<span className="metric-box-unit">%</span></span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px' }}>Model prediction ensemble certainty</span>
                      </div>
                    </div>

                    {/* Recommendations and assessment details */}
                    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      <h3 style={{ fontSize: '0.95rem', color: 'white', fontFamily: 'var(--font-display)', fontWeight: 600 }}>Climate Vulnerability Analysis</h3>
                      
                      <div style={{ fontSize: '0.8rem', background: 'hsla(222,25%,8%,0.4)', border: '1px solid var(--border-subtle)', padding: '15px', borderRadius: 'var(--radius-sm)', lineHeight: '1.4' }}>
                        <h4 style={{ color: 'var(--cyan)', marginBottom: '6px', fontWeight: 600 }}>District Risk Brief</h4>
                        <p style={{ color: 'var(--text-muted)' }}>
                          {twinData?.alerts?.find(a => a.district === selectedDistrict)?.explanation || (
                            `Vulnerability indicators for ${selectedDistrict} fall within expected seasonal baseline. Data integration reliability is currently estimated at ${activeDistrictInfo.confidence}%.`
                          )}
                        </p>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                        <div style={{ border: '1px solid var(--border-subtle)', padding: '12px', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem' }}>
                          <div style={{ color: 'white', fontWeight: 600, marginBottom: '6px' }}>Agricultural Sector Actions</div>
                          <span style={{ color: 'var(--text-muted)', lineHeight: '1.3' }}>
                            {activeDistrictInfo.cwsi > 0.65 ? 'Warning: High CWSI index. Trigger local micro-irrigation reservoirs immediately to protect crops.' : 'Optimal conditions. Continue standard seasonal irrigation protocols.'}
                          </span>
                        </div>
                        <div style={{ border: '1px solid var(--border-subtle)', padding: '12px', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem' }}>
                          <div style={{ color: 'white', fontWeight: 600, marginBottom: '6px' }}>Emergency Management Actions</div>
                          <span style={{ color: 'var(--text-muted)', lineHeight: '1.3' }}>
                            {activeDistrictInfo.alert === 'Red' ? 'Warning: Severe extreme hazard thresholds reached. Mobilize response crews and prepare alert broadcasts.' : 'Low composite hazard indices. Maintain routine telemetry monitoring.'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    Select a district from the ranking list to inspect details.
                  </div>
                )}
              </div>
            </section>

            {/* Right Column: Active warnings and exports */}
            <section className="side-panel" style={{ flex: 1 }}>
              
              {/* Warnings List */}
              <div className="glass-card" style={{ flex: 1 }}>
                <h2 className="panel-title">
                  <AlertTriangle size={18} style={{ color: 'var(--red)' }} />
                  Extreme Risk Tracker
                </h2>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '350px' }}>
                  {twinData && twinData.alerts && twinData.alerts.length > 0 ? (
                    twinData.alerts.map((alert, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => setSelectedDistrict(alert.district)}
                        style={{ 
                          border: '1px solid var(--border-subtle)', 
                          padding: '10px', 
                          borderRadius: 'var(--radius-sm)', 
                          cursor: 'pointer',
                          background: selectedDistrict === alert.district ? 'hsla(180, 100%, 50%, 0.05)' : 'hsla(222,25%,8%,0.4)',
                          borderColor: alert.severity === 'Red' ? 'var(--red-glow)' : 'var(--amber-glow)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.75rem', fontWeight: 700 }}>
                          <span style={{ color: 'white' }}>{alert.district}</span>
                          <span style={{ color: alert.severity === 'Red' ? 'var(--red)' : 'var(--amber)' }}>{alert.severity}</span>
                        </div>
                        <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: '1.3' }}>
                          {alert.explanation}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '15px' }}>
                      No active extreme risk alerts recorded.
                    </div>
                  )}
                </div>
              </div>

              {/* Data download */}
              <div className="glass-card">
                <h2 className="panel-title">
                  <FileText size={18} />
                  Export Data Reports
                </h2>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '15px' }}>
                  Download localized climate indices (DCVI) and variables in a consolidated CSV format for day {day}.
                </p>

                <button 
                  onClick={downloadCSVReport}
                  className="timeline-play-btn"
                  style={{ width: '100%', background: 'linear-gradient(135deg, var(--blue), hsla(210,100%,40%,1))' }}
                >
                  <FileText size={16} fill="var(--bg-deep)" />
                  Download CSV Report
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
