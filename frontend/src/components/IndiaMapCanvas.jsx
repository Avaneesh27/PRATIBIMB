import React, { useRef, useEffect, useState } from 'react';
import indiaStatesData from '../assets/india_states_simplified.json';

// Helper to shift GeoJSON features horizontally
const getShiftedGeoJSON = (data, shift) => {
  if (shift === 0) return data;
  const cloned = JSON.parse(JSON.stringify(data));
  cloned.features.forEach(feature => {
    const geom = feature.geometry;
    if (geom.type === 'Polygon') {
      geom.coordinates.forEach(ring => {
        ring.forEach(coords => {
          coords[0] += shift;
        });
      });
    } else if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach(polygon => {
        polygon.forEach(ring => {
          ring.forEach(coords => {
            coords[0] += shift;
          });
        });
      });
    }
  });
  return cloned;
};


// Map each city to its state name in the GeoJSON
const CITY_TO_STATE = {
  "Delhi": "Delhi",
  "Mumbai": "Maharashtra",
  "Kolkata": "West Bengal",
  "Chennai": "Tamil Nadu",
  "Bengaluru": "Karnataka",
  "Hyderabad": "Andhra Pradesh",
  "Ahmedabad": "Gujarat",
  "Jaipur": "Rajasthan",
  "Lucknow": "Uttar Pradesh",
  "Patna": "Bihar",
  "Bhopal": "Madhya Pradesh",
  "Guwahati": "Assam",
  "Srinagar": "Jammu and Kashmir",
  "Leh": "Jammu and Kashmir",
  "Bhubaneswar": "Orissa",
  "Thiruvananthapuram": "Kerala",
  "Ranchi": "Jharkhand",
  "Raipur": "Chhattisgarh",
  "Dehradun": "Uttaranchal",
  "Shimla": "Himachal Pradesh",
  "Panaji": "Goa",
  "Itanagar": "Arunachal Pradesh",
  "Port Blair": "Andaman and Nicobar",
  "Imphal": "Manipur",
  "Shillong": "Meghalaya",
  "Chandigarh": "Punjab",
  "Indore": "Madhya Pradesh",
  "Pune": "Maharashtra",
  "Nagpur": "Maharashtra",
  "Jodhpur": "Rajasthan",
  "Varanasi": "Uttar Pradesh",
  "Visakhapatnam": "Andhra Pradesh",
  "Kochi": "Kerala",
  "Amritsar": "Punjab",
  "Agartala": "Tripura",
  "Darjeeling": "West Bengal"
};

const getAlertColor = (alert) => {
  switch (alert) {
    case 'Green': return 'rgba(0, 240, 255, 0.85)';
    case 'Yellow': return 'rgba(255, 235, 0, 0.85)';
    case 'Orange': return 'rgba(255, 120, 0, 0.85)';
    case 'Red': return 'rgba(255, 0, 60, 0.85)';
    default: return 'rgba(255,255,255,0.7)';
  }
};

const getColorForValue = (val, gridType) => {
  // Normalize value color coding schemes
  switch (gridType) {
    case 'temp_ground':
    case 'lst_satellite':
    case 'temp_assimilated':
      // Temperature range: 5C (Blue) -> 45C (Red)
      const t = Math.min(1.0, Math.max(0.0, (val - 5.0) / 40.0));
      if (t < 0.25) return `rgba(0, 50, 255, ${0.15 + t})`;
      if (t < 0.50) return `rgba(0, 255, 170, ${0.25 + (t-0.25)*0.5})`;
      if (t < 0.75) return `rgba(255, 230, 0, ${0.45 + (t-0.5)*0.5})`;
      return `rgba(255, 50, 0, ${0.60 + (t-0.75)*1.2})`;

    case 'rain_ground':
    case 'rain_predicted':
      // Rain: 0mm (transparent) -> 50mm+ (deep purple)
      const r = Math.min(1.0, Math.max(0.0, val / 50.0));
      if (r < 0.1) return 'rgba(0,0,0,0)';
      if (r < 0.3) return `rgba(0, 180, 255, ${0.15 + r * 0.5})`;
      if (r < 0.7) return `rgba(0, 50, 255, ${0.30 + (r-0.3) * 0.8})`;
      return `rgba(180, 0, 255, ${0.55 + (r-0.7) * 1.5})`;

    case 'crop_stress_cwsi':
      // CWSI: 0 (No stress, Blue) -> 1.0 (High stress, Red)
      const c = Math.min(1.0, Math.max(0.0, val));
      return `rgba(${Math.floor(c * 255)}, ${Math.floor((1.0 - c) * 200)}, 100, ${0.1 + c * 0.55})`;

    case 'soil_moisture_smi':
      // SMI: 0 (Dry, Red) -> 1.0 (Wet, Blue)
      const m = Math.min(1.0, Math.max(0.0, val));
      return `rgba(${Math.floor((1.0 - m) * 255)}, ${Math.floor(m * 180)}, ${Math.floor(m * 255)}, ${0.15 + m * 0.5})`;

    case 'heatwave_risk':
      if (val === 0) return 'rgba(0, 255, 100, 0.02)';
      if (val === 1) return 'rgba(255, 120, 0, 0.65)';
      return 'rgba(255, 0, 0, 0.8)';

    case 'flood_risk':
      if (val === 0) return 'rgba(0, 150, 255, 0.02)';
      if (val === 1) return 'rgba(255, 235, 0, 0.65)';
      if (val === 2) return 'rgba(255, 60, 0, 0.75)';
      return 'rgba(180, 0, 255, 0.85)';

    default:
      return 'rgba(255, 255, 255, 0.2)';
  }
};

export default function IndiaMapCanvas({
  gridData,
  gridType, // 'temp_ground', 'rain_ground', etc.
  districtsData = {},
  selectedDistrict = null,
  onSelectDistrict = () => {},
  title = "India Digital Twin Analysis",
  mapBounds = { minLon: 67.0, maxLon: 98.0, minLat: 7.0, maxLat: 38.0 },
  highlightCities = [],
  highlightStates = []
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const canvasOverlayRef = useRef(null);
  const geojsonLayerRef = useRef(null);
  const markersLayerRef = useRef(null);

  const gridDataRef = useRef(gridData);
  const gridTypeRef = useRef(gridType);

  // Synchronise refs on every render pass to keep closures fresh
  gridDataRef.current = gridData;
  gridTypeRef.current = gridType;

  const [hoveredDistrict, setHoveredDistrict] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [zoomLevel, setZoomLevel] = useState(4.5);
  const [leafletLoaded, setLeafletLoaded] = useState(false);

  // 1. Initialise Leaflet Map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    if (typeof window === 'undefined' || !window.L) {
      // Retry in 100ms if script is not ready
      const timer = setTimeout(() => setLeafletLoaded(prev => !prev), 100);
      return () => clearTimeout(timer);
    }

    // Centered over central India
    const map = window.L.map(mapContainerRef.current, {
      center: [21.5, 80.0],
      zoom: 4.5,
      minZoom: 4,
      maxZoom: 19,
      zoomControl: false,
      attributionControl: false
    });
    mapRef.current = map;

    // Define base layers
    const satelliteBase = window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19
    });
    
    // Esri Place Names overlay (transparent tiles with borders, cities, towns, and village labels)
    const satelliteLabels = window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19
    });

    // Create hybrid satellite layer group showing places and roads on top of satellite imagery
    const satelliteHybrid = window.L.layerGroup([satelliteBase, satelliteLabels]);

    const darkMatter = window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    });

    // Default to hybrid satellite tile layer group
    satelliteHybrid.addTo(map);

    window.L.control.layers({
      "Satellite with Place Names (Cities/Villages)": satelliteHybrid,
      "Dark Vector Map": darkMatter
    }, null, { position: 'bottomright' }).addTo(map);

    // Initialise vector layers in triplicate for horizontal globe-like wrapping
    const geojsonLayers = [];
    [-360, 0, 360].forEach(shift => {
      const shiftedData = getShiftedGeoJSON(indiaStatesData, shift);
      const layer = window.L.geoJSON(shiftedData, {
        style: {
          fillColor: '#050a14',
          fillOpacity: 0.45,
          color: 'rgba(255, 255, 255, 0.05)',
          weight: 1.0
        }
      }).addTo(map);
      geojsonLayers.push(layer);
    });
    geojsonLayerRef.current = geojsonLayers;

    markersLayerRef.current = window.L.layerGroup().addTo(map);

    // Track map zoom dynamically to update slider UI
    map.on('zoomend', () => {
      setZoomLevel(map.getZoom());
    });

    // Toroidal view wrapping for globe-like feel
    let isWrapping = false;
    map.on('move', () => {
      if (isWrapping) return;

      const center = map.getCenter();
      let newLat = center.lat;
      let newLng = center.lng;
      let changed = false;

      // Wrap longitude globally to keep within [-180, 180]
      if (center.lng > 180) {
        newLng = center.lng - 360;
        changed = true;
      } else if (center.lng < -180) {
        newLng = center.lng + 360;
        changed = true;
      }

      // Wrap latitude within India range: 5.0 to 40.0
      const minLat = 5.0;
      const maxLat = 40.0;
      const latRange = maxLat - minLat;

      if (center.lat > maxLat) {
        newLat = minLat + (center.lat - maxLat) % latRange;
        changed = true;
      } else if (center.lat < minLat) {
        newLat = maxLat - (minLat - center.lat) % latRange;
        changed = true;
      }

      if (changed) {
        isWrapping = true;
        map.setView([newLat, newLng], map.getZoom(), { animate: false });
        isWrapping = false;
      }

      drawGridOverlay();
    });

    setLeafletLoaded(true);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [leafletLoaded]);

  // 2. Synchronize Map Bounds focus transitions
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapBounds) return;

    // Transition zoom bounds smoothly
    map.fitBounds([
      [mapBounds.minLat, mapBounds.minLon],
      [mapBounds.maxLat, mapBounds.maxLon]
    ], { padding: [15, 15], animate: true, duration: 1.0 });
  }, [mapBounds]);

  const getSubheadingText = () => {
    if (['temp_ground', 'rain_ground', 'lst_satellite'].includes(gridType)) {
      return "OBSERVATIONAL DATA (SATELLITE MATCH / IMD GROUND SENSORS)";
    }
    return "PREDICTED DATA FROM TRAINED MODEL (NOT SATELLITE DATA)";
  };

  const getGridValueForLatLng = (lat, lon) => {
    const currentGridData = gridDataRef.current;
    if (!currentGridData || currentGridData.length === 0) return null;
    
    const rows = currentGridData.length;
    const cols = currentGridData[0].length;
    
    let gridLatMin = 8.0, gridLatMax = 38.0;
    let gridLonMin = 68.0, gridLonMax = 98.0;
    
    if (rows === 31 && cols === 31) {
      gridLatMin = 7.5;
      gridLatMax = 37.5;
      gridLonMin = 67.5;
      gridLonMax = 97.5;
    } else if (rows === 129 && cols === 135) {
      gridLatMin = 6.5;
      gridLatMax = 38.5;
      gridLonMin = 66.5;
      gridLonMax = 100.0;
    }
    
    const r = Math.round((gridLatMax - lat) / ((gridLatMax - gridLatMin) / (rows - 1)));
    const c = Math.round((lon - gridLonMin) / ((gridLonMax - gridLonMin) / (cols - 1)));
    
    if (r >= 0 && r < rows && c >= 0 && c < cols) {
      const val = currentGridData[r][c];
      return val !== null && !isNaN(val) ? val.toFixed(1) : null;
    }
    return null;
  };

  // 3. Draw Grid Cells Overlay onto canvas overlay in triplicate (horizontal globe-like wrapping)
  // Highly optimized: precomputes row and column projections once per redraw, avoiding costly Leaflet operations in loops.
  const drawGridOverlay = () => {
    const map = mapRef.current;
    const canvas = canvasOverlayRef.current;
    const currentGridData = gridDataRef.current;
    const currentGridType = gridTypeRef.current;
    if (!map || !canvas || !currentGridData || currentGridData.length === 0) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvasOverlayRef.current.clientWidth;
    const height = canvas.height = canvasOverlayRef.current.clientHeight;

    ctx.clearRect(0, 0, width, height);

    const rows = currentGridData.length;
    const cols = currentGridData[0].length;
    
    let gridLatMin = 8.0, gridLatMax = 38.0;
    let gridLonMin = 68.0, gridLonMax = 98.0;
    
    if (rows === 31 && cols === 31) {
      gridLatMin = 7.5;
      gridLatMax = 37.5;
      gridLonMin = 67.5;
      gridLonMax = 97.5;
    } else if (rows === 129 && cols === 135) {
      gridLatMin = 6.5;
      gridLatMax = 38.5;
      gridLonMin = 66.5;
      gridLonMax = 100.0;
    }
    
    const cellLatStep = (gridLatMax - gridLatMin) / (rows - 1);
    const cellLonStep = (gridLonMax - gridLonMin) / (cols - 1);

    const bounds = map.getBounds();
    const west = bounds.getWest();
    const east = bounds.getEast();

    // Determine overlapping shifts
    const minShift = Math.floor((west - gridLonMax) / 360) * 360;
    const maxShift = Math.ceil((east - gridLonMin) / 360) * 360;

    for (let shift = minShift; shift <= maxShift; shift += 360) {
      // Calculate dynamic cell size based on zoom level to draw correctly sized cells
      const pCenter = map.latLngToContainerPoint(window.L.latLng(20.0, 80.0 + shift));
      const pOffset = map.latLngToContainerPoint(window.L.latLng(20.0 + cellLatStep, 80.0 + shift + cellLonStep));
      const cellWidth = Math.ceil(Math.abs(pOffset.x - pCenter.x));
      const cellHeight = Math.ceil(Math.abs(pOffset.y - pCenter.y));

      ctx.save();

      // Precompute X and Y projections once per grid redraw
      const xCoords = new Int32Array(cols);
      for (let c = 0; c < cols; c++) {
        const lon = gridLonMin + c * cellLonStep + shift;
        xCoords[c] = Math.round(map.latLngToContainerPoint(window.L.latLng(20.0, lon)).x);
      }

      const yCoords = new Int32Array(rows);
      for (let r = 0; r < rows; r++) {
        const lat = gridLatMax - r * cellLatStep;
        yCoords[r] = Math.round(map.latLngToContainerPoint(window.L.latLng(lat, 80.0)).y);
      }

      // Draw active cells inside viewport bounds
      for (let r = 0; r < rows; r++) {
        const y = yCoords[r];
        if (y < -cellHeight || y > height + cellHeight) continue;
        
        for (let c = 0; c < cols; c++) {
          const val = currentGridData[r][c];
          if (val !== null && !isNaN(val)) {
            const x = xCoords[c];
            if (x < -cellWidth || x > width + cellWidth) continue;
            
            ctx.fillStyle = getColorForValue(val, currentGridType);
            ctx.fillRect(x - cellWidth / 2, y - cellHeight / 2, cellWidth + 0.5, cellHeight + 0.5);
          }
        }
      }

      ctx.restore();
    }
  };

  // Re-draw grid layer overlay whenever grid data shifts
  useEffect(() => {
    drawGridOverlay();
  }, [gridData, gridType]);

  // 4. Update GeoJSON styles and district nodes markers overlay in triplicate
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Apply state outline glows to all shifted geojson layers
    if (geojsonLayerRef.current && Array.isArray(geojsonLayerRef.current)) {
      geojsonLayerRef.current.forEach(layer => {
        layer.setStyle(feature => {
          const stateName = feature.properties.NAME_1;
          const activeState = CITY_TO_STATE[hoveredDistrict] || CITY_TO_STATE[selectedDistrict];
          const isHoveredOrSelected = activeState === stateName;
          const isHighlighted = !highlightStates || highlightStates.length === 0 || highlightStates.includes(stateName);

          if (isHoveredOrSelected) {
            return {
              fillColor: 'rgba(0, 240, 255, 0.12)',
              color: 'rgba(0, 240, 255, 0.85)',
              weight: 2.0,
              fillOpacity: 0.35
            };
          }
          if (isHighlighted) {
            return {
              fillColor: 'rgba(0, 240, 255, 0.01)',
              color: 'rgba(0, 240, 255, 0.25)',
              weight: 1.0,
              fillOpacity: 0.15
            };
          }
          return {
            fillColor: '#050a14',
            color: 'rgba(255,255,255,0.02)',
            weight: 0.5,
            fillOpacity: 0.65
          };
        });
      });
    }

    // Refresh city nodes across all three horizontal worlds
    if (markersLayerRef.current) {
      markersLayerRef.current.clearLayers();

      [-360, 0, 360].forEach(shift => {
        Object.keys(districtsData).forEach(name => {
          const dist = districtsData[name];
          const isSelected = selectedDistrict === name;
          const isHovered = hoveredDistrict === name;

          // Custom styled vector circles, offset horizontally by shift
          const marker = window.L.circleMarker([dist.lat, dist.lon + shift], {
            radius: isSelected || isHovered ? 9 : 5.5,
            fillColor: getAlertColor(dist.alert),
            fillOpacity: 0.95,
            color: isSelected ? 'var(--cyan)' : isHovered ? 'white' : 'transparent',
            weight: 2.0
          });

          marker.on({
            mouseover: (e) => {
              setHoveredDistrict(name);
              const pt = map.latLngToContainerPoint([dist.lat, dist.lon + shift]);
              setTooltipPos({ x: pt.x + 15, y: pt.y - 15 });
            },
            mouseout: () => {
              setHoveredDistrict(null);
            },
            click: () => {
              onSelectDistrict(name);
            }
          });

          marker.addTo(markersLayerRef.current);
        });
      });
    }
  }, [districtsData, selectedDistrict, hoveredDistrict, highlightStates]);

  const renderScale = () => {
    switch (gridType) {
      case 'temp_ground':
      case 'lst_satellite':
      case 'temp_assimilated':
        return (
          <>
            <div className="legend-title">Temperature Range</div>
            <div className="legend-scale" style={{ background: 'linear-gradient(to right, #0032ff, #00ffaa, #ffff00, #ff6400, #ff0032)' }}></div>
            <div className="legend-labels">
              <span>&lt;10°C</span>
              <span>25°C</span>
              <span>38°C</span>
              <span>45°C+</span>
            </div>
          </>
        );
      case 'rain_ground':
      case 'rain_predicted':
        return (
          <>
            <div className="legend-title">Rainfall Intensity</div>
            <div className="legend-scale" style={{ background: 'linear-gradient(to right, rgba(0,0,0,0), rgba(0,180,255,0.4), rgba(0,50,255,0.7), rgba(180,0,255,0.95))' }}></div>
            <div className="legend-labels">
              <span>Dry</span>
              <span>Light</span>
              <span>Heavy</span>
              <span>50mm+</span>
            </div>
          </>
        );
      case 'crop_stress_cwsi':
        return (
          <>
            <div className="legend-title">Crop Water Stress (CWSI)</div>
            <div className="legend-scale" style={{ background: 'linear-gradient(to right, #64c864, #ffff64, #ff6400, #ff0000)' }}></div>
            <div className="legend-labels">
              <span>No Stress</span>
              <span>Moderate</span>
              <span>High</span>
              <span>Critical</span>
            </div>
          </>
        );
      case 'soil_moisture_smi':
        return (
          <>
            <div className="legend-title">Soil Moisture Index (SMI)</div>
            <div className="legend-scale" style={{ background: 'linear-gradient(to right, #ff0000, #ffcc00, #64c864, #0096ff)' }}></div>
            <div className="legend-labels">
              <span>Dry</span>
              <span>Moderate</span>
              <span>Optimal</span>
              <span>Saturated</span>
            </div>
          </>
        );
      case 'heatwave_risk':
        return (
          <>
            <div className="legend-title">IMD Heatwave Warnings</div>
            <div className="legend-scale" style={{ display: 'flex', gap: '2px', height: '10px' }}>
              <div style={{ flex: 1, backgroundColor: 'rgba(0,255,100,0.02)', border: '1px solid rgba(0,255,100,0.2)' }}></div>
              <div style={{ flex: 1, backgroundColor: 'rgba(255,120,0,0.65)' }}></div>
              <div style={{ flex: 1, backgroundColor: 'rgba(255,0,0,0.8)' }}></div>
            </div>
            <div className="legend-labels">
              <span>Normal</span>
              <span>Moderate</span>
              <span>Severe</span>
            </div>
          </>
        );
      case 'flood_risk':
        return (
          <>
            <div className="legend-title">Flood Warning Risk</div>
            <div className="legend-scale" style={{ display: 'flex', gap: '2px', height: '10px' }}>
              <div style={{ flex: 1, backgroundColor: 'rgba(0,150,255,0.02)', border: '1px solid rgba(0,150,255,0.2)' }}></div>
              <div style={{ flex: 1, backgroundColor: 'rgba(255,235,0,0.65)' }}></div>
              <div style={{ flex: 1, backgroundColor: 'rgba(255,60,0,0.75)' }}></div>
              <div style={{ flex: 1, backgroundColor: 'rgba(180,0,255,0.85)' }}></div>
            </div>
            <div className="legend-labels">
              <span>Low</span>
              <span>Mod</span>
              <span>High</span>
              <span>Extreme</span>
            </div>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="map-visualizer-container" style={{ position: 'relative' }}>
      <div className="map-viewport">
        <div className="map-title-overlay" style={{ zIndex: 1000 }}>
          <div className="map-title-text" style={{ color: 'var(--cyan)' }}>
            {title}
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="pulse-indicator" style={{ backgroundColor: ['temp_ground', 'rain_ground', 'lst_satellite'].includes(gridType) ? 'var(--cyan)' : 'var(--red)' }}></span>
            {getSubheadingText()}
          </div>
        </div>
        
        {/* Leaflet map container mount */}
        <div 
          ref={mapContainerRef} 
          style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 1 }}
        />

        {/* High performance hardware-accelerated Canvas Overlay */}
        <canvas 
          ref={canvasOverlayRef} 
          style={{ 
            width: '100%', 
            height: '100%', 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            zIndex: 2, 
            pointerEvents: 'none' // Allow all pan/scroll gestures to fall-through directly to Leaflet layer
          }}
        />

        {/* Interactive Custom React Zoom Bar Controller */}
        <div style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: 'rgba(10, 16, 30, 0.85)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(0, 240, 255, 0.25)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 10px',
          boxShadow: '0 4px 15px rgba(0, 0, 0, 0.5)',
          zIndex: 1000
        }}>
          <button 
            style={{
              width: '28px',
              height: '28px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '4px',
              color: 'white',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.2s',
              userSelect: 'none'
            }}
            onClick={() => mapRef.current && mapRef.current.zoomIn()}
            title="Zoom In"
          >
            +
          </button>
          
          <input 
            type="range"
            min="4"
            max="19"
            step="0.5"
            value={zoomLevel}
            onChange={(e) => mapRef.current && mapRef.current.setZoom(parseFloat(e.target.value))}
            style={{
              WebkitAppearance: 'slider-vertical',
              width: '8px',
              height: '80px',
              padding: '0 5px',
              background: 'rgba(255, 255, 255, 0.1)',
              cursor: 'pointer'
            }}
            title={`Zoom Level: ${zoomLevel}`}
          />
          
          <button 
            style={{
              width: '28px',
              height: '28px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '4px',
              color: 'white',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.2s',
              userSelect: 'none'
            }}
            onClick={() => mapRef.current && mapRef.current.zoomOut()}
            title="Zoom Out"
          >
            -
          </button>
          
          <button 
            style={{
              marginTop: '4px',
              backgroundColor: 'transparent',
              border: 'none',
              color: 'var(--cyan)',
              fontSize: '0.65rem',
              fontWeight: 700,
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              userSelect: 'none'
            }}
            onClick={() => {
              if (mapRef.current) {
                mapRef.current.setView([21.5, 80.0], 4.5);
              }
            }}
            title="Reset Map View"
          >
            Reset
          </button>
        </div>

        {/* Hover Tooltip */}
        {hoveredDistrict && districtsData[hoveredDistrict] && (
          <div style={{
            position: 'absolute',
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y}px`,
            background: 'hsla(222, 25%, 8%, 0.95)',
            border: `1px solid ${
              ['temp_ground', 'rain_ground', 'lst_satellite'].includes(gridType)
                ? 'var(--cyan)'
                : getAlertColor(districtsData[hoveredDistrict].alert)
            }`,
            borderRadius: 'var(--radius-sm)',
            padding: '8px 12px',
            pointerEvents: 'none',
            zIndex: 1000,
            fontSize: '0.75rem',
            color: 'var(--text-main)',
            boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}>
            {['temp_ground', 'rain_ground', 'lst_satellite'].includes(gridType) ? (
              // Observational Tooltip
              <>
                <div style={{ fontWeight: 700, color: 'white', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '3px', marginBottom: '3px', display: 'flex', justifyContent: 'space-between', gap: '15px' }}>
                  <span>{hoveredDistrict}</span>
                  <span style={{ color: 'var(--cyan)', fontSize: '0.65rem', textTransform: 'uppercase' }}>IMD/Satellite Ground Observational</span>
                </div>
                {gridType === 'rain_ground' && (
                  <div>Observed Rainfall: <strong>{getGridValueForLatLng(districtsData[hoveredDistrict].lat, districtsData[hoveredDistrict].lon) ?? districtsData[hoveredDistrict].rain} mm</strong></div>
                )}
                {gridType === 'temp_ground' && (
                  <div>Observed Temp: <strong>{getGridValueForLatLng(districtsData[hoveredDistrict].lat, districtsData[hoveredDistrict].lon) ?? districtsData[hoveredDistrict].temp}°C</strong></div>
                )}
                {gridType === 'lst_satellite' && (
                  <div>Observed Satellite LST: <strong>{getGridValueForLatLng(districtsData[hoveredDistrict].lat, districtsData[hoveredDistrict].lon) ?? (districtsData[hoveredDistrict].temp + 1.2)}°C</strong></div>
                )}
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: '3px', marginTop: '3px' }}>
                  Source: {
                    gridType === 'rain_ground' ? 'IMD Pune Gridded Gauge Logs' :
                    gridType === 'temp_ground' ? 'IMD Automatic Weather Stations' :
                    'INSAT-3D Meteorological Field'
                  }
                </div>
              </>
            ) : (
              // Predicted/Assimilated Tooltip
              <>
                <div style={{ fontWeight: 700, color: 'white', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '3px', marginBottom: '3px', display: 'flex', justifyContent: 'space-between', gap: '15px' }}>
                  <span>{hoveredDistrict}</span>
                  <span style={{ color: getAlertColor(districtsData[hoveredDistrict].alert) }}>
                    {districtsData[hoveredDistrict].alert} Alert
                  </span>
                </div>
                <div>DCVI Risk: <strong>{districtsData[hoveredDistrict].dcvi}%</strong></div>
                <div>Temp: <strong>{districtsData[hoveredDistrict].temp}°C</strong></div>
                <div>Rain: <strong>{districtsData[hoveredDistrict].rain} mm</strong></div>
                <div>Soil Moisture: <strong>{districtsData[hoveredDistrict].smi}%</strong></div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: '3px', marginTop: '3px' }}>
                  Confidence: {districtsData[hoveredDistrict].confidence}%
                </div>
              </>
            )}
          </div>
        )}

        <div className="map-legend" style={{ zIndex: 1000 }}>
          {renderScale()}
        </div>
      </div>
    </div>
  );
}
