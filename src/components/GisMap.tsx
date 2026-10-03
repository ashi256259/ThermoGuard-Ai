import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { Layers, Eye, EyeOff, MapPin, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { HotspotRecord } from "../types";

interface GisMapProps {
  hotspots: HotspotRecord[];
  selectedHotspot: HotspotRecord | null;
  onSelectHotspot: (h: HotspotRecord) => void;
  mapCenter: [number, number];
  mapZoom: number;
}

const INDUSTRIAL_POIS = [
  { name: "Jamnagar Mega Refinery Complex", type: "oil_refinery", lat: 22.3582, lon: 69.8645 },
  { name: "Hazira Petrochemicals & LNG Terminal", type: "chemical_plant", lat: 21.1124, lon: 72.6718 },
  { name: "Gevra & Dipka Opencast Coal Mines", type: "mine", lat: 22.3418, lon: 82.5934 },
  { name: "Angul Integrated Steel & Pellet Plant", type: "steel_plant", lat: 20.8412, lon: 85.0863 },
  { name: "NTPC Vindhyachal Super Thermal Power", type: "power_station", lat: 24.0984, lon: 82.6641 }
];

export const GisMap: React.FC<GisMapProps> = ({
  hotspots,
  selectedHotspot,
  onSelectHotspot,
  mapCenter,
  mapZoom,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const facilitiesLayerRef = useRef<L.LayerGroup | null>(null);
  const buffersLayerRef = useRef<L.LayerGroup | null>(null);

  // Layer toggles
  const [showHotspots, setShowHotspots] = useState(true);
  const [showFacilities, setShowFacilities] = useState(true);
  const [showBuffers, setShowBuffers] = useState(true);

  // Helper color mappings
  const getClassColor = (cls: string): string => {
    switch (cls) {
      case "Industrial Fire":
        return "#ef4444"; // Red
      case "Gas Flare":
        return "#f97316"; // Burnt/Flame Orange
      case "Agricultural Burning":
        return "#eab308"; // Amber / Gold
      case "Wildfire":
        return "#10b981"; // Emerald
      case "Mining":
        return "#0284c7"; // Cyan
      case "ML_UNAVAILABLE":
        return "#d97706"; // Amber
      default:
        return "#64748b"; // Slate
    }
  };

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return; // already initialized

    const map = L.map(mapContainerRef.current, {
      center: mapCenter,
      zoom: mapZoom,
      zoomControl: false,
      dragging: true,
      
      touchZoom: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      boxZoom: true,
      attributionControl: true,
    });

    // Reliable OpenStreetMap public basemap
    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }
    ).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    facilitiesLayerRef.current = L.layerGroup().addTo(map);
    buffersLayerRef.current = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;

    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      clearTimeout(timer);
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update map view when mapCenter or mapZoom changes externally
  useEffect(() => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView(mapCenter, mapZoom, { animate: true });
    }
  }, [mapCenter, mapZoom]);

  // Render Industrial Facilities Layer
  useEffect(() => {
    if (!facilitiesLayerRef.current || !mapInstanceRef.current) return;
    facilitiesLayerRef.current.clearLayers();

    if (!showFacilities) return;

    INDUSTRIAL_POIS.forEach((poi) => {
      const facilityIcon = L.divIcon({
        className: "custom-facility-marker",
        html: `
          <div style="
            background-color: #ffffff;
            border: 1.5px solid #0284c7;
            border-radius: 4px;
            padding: 3px 6px;
            color: #0369a1;
            font-size: 10px;
            font-family: monospace;
            font-weight: bold;
            display: flex;
            align-items: center;
            gap: 4px;
            white-space: nowrap;
            box-shadow: 0 0 12px rgba(2, 132, 199, 0.4);
          ">
            <span>🏭</span>
            <span>${poi.name.split(" ")[0]}</span>
          </div>
        `,
        iconSize: [80, 24],
        iconAnchor: [40, 12],
      });

      const marker = L.marker([poi.lat, poi.lon], { icon: facilityIcon });
      marker.bindPopup(`
        <div style="background-color: #ffffff; color: #0f172a; font-family: system-ui, sans-serif; font-size: 12px; padding: 10px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <strong style="font-size: 13px; color: #1e40af; display: block; margin-bottom: 2px;">${poi.name}</strong>
          <span style="color: #64748b; font-size: 11px; font-weight: 600;">TYPE: ${poi.type.replace("_", " ").toUpperCase()}</span>
        </div>
      `);
      facilitiesLayerRef.current?.addLayer(marker);
    });
  }, [showFacilities]);

  // Render Hotspots & Buffers Layer
  useEffect(() => {
    if (!markersLayerRef.current || !buffersLayerRef.current || !mapInstanceRef.current) return;
    markersLayerRef.current.clearLayers();
    buffersLayerRef.current.clearLayers();

    if (!showHotspots) return;

    hotspots.forEach((h) => {
      const color = getClassColor(h.classification.predicted_class);
      const isSelected = selectedHotspot?.event.id === h.event.id;
      const riskScore = h.classification.risk_score;
      const isCritical = riskScore === "CRITICAL";
      const isHigh = riskScore === "HIGH";
      const isMedium = riskScore === "MEDIUM";

      let markerHtml = "";
      if (isCritical) {
        markerHtml = `
          <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; cursor: pointer;">
            ${isSelected ? `<div style="position: absolute; width: 32px; height: 32px; border: 1.5px dashed #38bdf8; border-radius: 50%; opacity: 0.95;"></div>` : ""}
            <div class="pulse-ring-critical" style="position: absolute; width: 24px; height: 24px; border-radius: 50%; border: 1.5px solid #ef4444; background: rgba(239, 68, 68, 0.15); pointer-events: none;"></div>
            <div style="position: absolute; width: 18px; height: 18px; transform: rotate(45deg); border-radius: 2px; background: rgba(239, 68, 68, 0.22);"></div>
            <div style="position: relative; width: 11px; height: 11px; transform: rotate(45deg); background: #ef4444; border: 1.5px solid #ffffff; border-radius: 1px; box-shadow: 0 0 6px rgba(239, 68, 68, 0.7);"></div>
          </div>
        `;
      } else if (isHigh) {
        markerHtml = `
          <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; cursor: pointer;">
            ${isSelected ? `<div style="position: absolute; width: 30px; height: 30px; border: 1.5px dashed #38bdf8; border-radius: 50%; opacity: 0.95;"></div>` : ""}
            <div class="pulse-ring-high" style="position: absolute; width: 22px; height: 22px; border-radius: 50%; border: 1.2px solid #f97316; background: rgba(249, 115, 22, 0.12); pointer-events: none;"></div>
            <div style="position: absolute; width: 16px; height: 16px; border-radius: 3px; background: rgba(249, 115, 22, 0.2);"></div>
            <div style="position: relative; width: 10px; height: 10px; border-radius: 2px; background: #f97316; border: 1.5px solid #ffffff; box-shadow: 0 0 5px rgba(249, 115, 22, 0.6);"></div>
          </div>
        `;
      } else if (isMedium) {
        markerHtml = `
          <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; cursor: pointer;">
            ${isSelected ? `<div style="position: absolute; width: 26px; height: 26px; border: 1.5px dashed #38bdf8; border-radius: 50%; opacity: 0.95;"></div>` : ""}
            <div style="position: absolute; width: 16px; height: 16px; border-radius: 50%; background: rgba(245, 158, 11, 0.18);"></div>
            <div style="position: relative; width: 0; height: 0; border-left: 5.5px solid transparent; border-right: 5.5px solid transparent; border-bottom: 9.5px solid #f59e0b; filter: drop-shadow(0 0 2px rgba(245, 158, 11, 0.8));"></div>
          </div>
        `;
      } else {
        markerHtml = `
          <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; cursor: pointer;">
            ${isSelected ? `<div style="position: absolute; width: 22px; height: 22px; border: 1.5px dashed #38bdf8; border-radius: 50%; opacity: 0.95;"></div>` : ""}
            <div style="position: absolute; width: 14px; height: 14px; border-radius: 50%; background: rgba(20, 184, 166, 0.2);"></div>
            <div style="position: relative; width: 8px; height: 8px; border-radius: 50%; background: #14b8a6; border: 1.2px solid #ffffff; box-shadow: 0 0 4px rgba(20, 184, 166, 0.5);"></div>
          </div>
        `;
      }

      // 1. Hotspot Marker with distinct CSS-based risk shapes & muted pulsing
      const markerIcon = L.divIcon({
        className: "custom-hotspot-marker",
        html: markerHtml,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      const marker = L.marker([h.event.latitude, h.event.longitude], { icon: markerIcon });

      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        onSelectHotspot(h);
      });

      marker.bindTooltip(
        `<strong>${h.classification.predicted_class}</strong><br/>Risk: ${h.classification.risk_score} | FRP: ${h.event.frp} MW`,
        { direction: "top", offset: [0, -10], className: "tactical-map-tooltip" }
      );

      markersLayerRef.current?.addLayer(marker);

      // 2. Spatial Hazard Buffers (300m critical perimeter & 1000m facility radius)
      if (showBuffers && (isSelected || isCritical || h.classification.predicted_class === "Gas Flare")) {
        // 300m Inner Buffer (Red/Amber)
        const innerCircle = L.circle([h.event.latitude, h.event.longitude], {
          radius: 300,
          color: color,
          fillColor: color,
          fillOpacity: 0.12,
          weight: 1,
          dashArray: "3, 6",
        });
        buffersLayerRef.current?.addLayer(innerCircle);

        // 1000m Outer Hazard Zone
        const outerCircle = L.circle([h.event.latitude, h.event.longitude], {
          radius: 1000,
          color: color,
          fillOpacity: 0.03,
          weight: 0.75,
          dashArray: "4, 8",
        });
        buffersLayerRef.current?.addLayer(outerCircle);
      }
    });
  }, [hotspots, selectedHotspot, showHotspots, showBuffers]);

  const handleZoomIn = () => mapInstanceRef.current?.zoomIn();
  const handleZoomOut = () => mapInstanceRef.current?.zoomOut();
  const handleResetView = () => mapInstanceRef.current?.setView([22.5, 78.5], 5);

  return (
    <div className="relative w-full h-full min-h-0 bg-slate-50 overflow-hidden flex-1">
      {/* Map Target Div */}
      <div ref={mapContainerRef} className="absolute inset-0 z-10" />

      {/* Map Control Overlay (Top-Right) */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2.5">
        {/* Layer Toggles Panel */}
        <div className="bg-white/95 backdrop-blur-xs border border-slate-200/80 rounded-2xl p-3 text-xs shadow-2xs">
          <div className="flex items-center gap-2 text-slate-800 font-bold mb-2 pb-1.5 border-b border-slate-100">
            <Layers className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">GIS Layers</span>
          </div>

          <div className="flex flex-col gap-2 text-slate-700 text-xs font-medium">
            <label className="flex items-center gap-2 cursor-pointer hover:text-slate-900">
              <input
                type="checkbox"
                checked={showHotspots}
                onChange={(e) => setShowHotspots(e.target.checked)}
                className="accent-blue-600 rounded cursor-pointer"
              />
              <span>FIRMS Hotspots</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer hover:text-slate-900">
              <input
                type="checkbox"
                checked={showFacilities}
                onChange={(e) => setShowFacilities(e.target.checked)}
                className="accent-blue-600 rounded cursor-pointer"
              />
              <span>Industrial POIs</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer hover:text-slate-900">
              <input
                type="checkbox"
                checked={showBuffers}
                onChange={(e) => setShowBuffers(e.target.checked)}
                className="accent-blue-600 rounded cursor-pointer"
              />
              <span>Hazard Buffers</span>
            </label>
          </div>
        </div>

        {/* Navigation / Zoom Controls */}
        <div className="bg-white/95 backdrop-blur-xs border border-slate-200/80 rounded-2xl flex flex-col p-1 shadow-2xs text-slate-600">
          <button
            onClick={handleZoomIn}
            className="p-2 hover:bg-slate-100 hover:text-slate-900 rounded-xl transition cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2 hover:bg-slate-100 hover:text-slate-900 rounded-xl transition cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <div className="h-px bg-slate-100 my-0.5" />
          <button
            onClick={handleResetView}
            className="p-2 hover:bg-slate-100 hover:text-slate-900 rounded-xl transition cursor-pointer"
            title="Reset to All India Overview"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Floating Map Legend (Bottom-Left) */}
      <div className="absolute bottom-5 left-5 z-10 bg-white/95 backdrop-blur-xs border border-slate-200/80 rounded-2xl p-3.5 text-xs shadow-2xs max-w-xs">
        <span className="font-bold text-slate-500 text-[10px] block mb-2 uppercase tracking-wider">
          Source Classification Key
        </span>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="text-slate-700 font-medium">Industrial Fire</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
            <span className="text-slate-700 font-medium">Gas Flare</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="text-slate-700 font-medium">Agricultural</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-slate-700 font-medium">Wildfire</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
            <span className="text-slate-700 font-medium">Mining</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
            <span className="text-slate-700 font-medium">Other</span>
          </div>
        </div>

        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
          <span>Dotted: 300m / 1km Buffers</span>
          <span className="text-red-600 font-semibold">Pulsing: High/Critical</span>
        </div>
      </div>
    </div>
  );
};
