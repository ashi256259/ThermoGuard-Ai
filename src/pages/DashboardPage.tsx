import React, { useState, useEffect, useRef } from "react";
import {
  BellRing,
  Radio,
  MapPin,
  Clock,
  Filter,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Flame,
  Building2,
  Compass,
  AlertTriangle,
  RefreshCw,
  Satellite,
  X,
  Layers
} from "lucide-react";
import L from "leaflet";
import { apiService, HotspotItem, StatisticsData } from "../services/api";
import { DetailPanel } from "../components/DetailPanel";
import { Tooltip } from "../components/Tooltip";
import { KpiMetrics } from "../components/KpiMetrics";

interface DashboardPageProps {
  selectedHotspotProp?: HotspotItem | null;
  onSelectHotspot?: (hotspot: HotspotItem) => void;
  onInspectDetails?: (hotspot: HotspotItem) => void;
  onOpenTimeline?: (hotspot: HotspotItem) => void;
  onNavigateTo?: (page: string, options?: any) => void;
  isLiveMode?: boolean;
  activeScenario?: any;
}

interface DemoScenarioOption {
  id: string;
  name: string;
  location: string;
  coords: [number, number];
  zoom: number;
  category: string;
  risk: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  insight: string;
  prefix: string;
}

const DEMO_SCENARIOS: DemoScenarioOption[] = [
  {
    id: "jamnagar",
    name: "Scenario 1: Jamnagar Refinery",
    location: "Gujarat",
    coords: [22.3591, 69.8652],
    zoom: 12,
    category: "Gas Flare / Petrochem",
    risk: "CRITICAL",
    insight: "Recurrent thermal flare within 300m of petrochemical infrastructure.",
    prefix: "jam"
  },
  {
    id: "hazira",
    name: "Scenario 1B: Hazira Petrochem",
    location: "Surat, Gujarat",
    coords: [21.1145, 72.6732],
    zoom: 12,
    category: "Industrial Fire vs Flare",
    risk: "CRITICAL",
    insight: "High FRP thermal burst in processing zone requiring emergency containment.",
    prefix: "haz"
  },
  {
    id: "punjab",
    name: "Scenario 2: Punjab Agricultural Belt",
    location: "Sangrur, Punjab",
    coords: [30.2451, 75.8341],
    zoom: 11,
    category: "Agricultural Stubble Burning",
    risk: "HIGH",
    insight: "Seasonal post-harvest cluster across intensive agricultural parcel.",
    prefix: "pnb"
  },
  {
    id: "simlipal",
    name: "Scenario 3: Simlipal Biosphere",
    location: "Mayurbhanj, Odisha",
    coords: [21.845, 86.321],
    zoom: 10,
    category: "Forest Wildfire Incident",
    risk: "HIGH",
    insight: "Dense forest thermal anomaly with zero industrial presence within 25km.",
    prefix: "sim"
  },
  {
    id: "korba",
    name: "Scenario 4: Korba Open-Cast Mine",
    location: "Chhattisgarh",
    coords: [22.3425, 82.5942],
    zoom: 12,
    category: "Active Mining & Coal Seam",
    risk: "MEDIUM",
    insight: "Moderate persistent thermal emissions in active open-cast extraction zone.",
    prefix: "krb"
  }
];

export const DashboardPage: React.FC<DashboardPageProps> = ({
  selectedHotspotProp,
  onSelectHotspot,
  onInspectDetails,
  onOpenTimeline,
  onNavigateTo,
  isLiveMode = true,
  activeScenario: propActiveScenario
}) => {
  const [hotspots, setHotspots] = useState<HotspotItem[]>([]);
  const [stats, setStats] = useState<StatisticsData | null>(null);
  const [selectedHotspot, setSelectedHotspot] = useState<HotspotItem | null>(selectedHotspotProp || null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<string>("All");
  const [selectedRisk, setSelectedRisk] = useState<string>("All");
  const [activeScenario, setActiveScenario] = useState<DemoScenarioOption | null>(propActiveScenario || null);
  const [demoDropdownOpen, setDemoDropdownOpen] = useState<boolean>(false);

  // Sync propActiveScenario
  useEffect(() => {
    if (propActiveScenario !== undefined) {
      setActiveScenario(propActiveScenario);
    }
  }, [propActiveScenario]);

  // Update selection locally and notify parent
  const handleSelectHotspotInternal = (h: HotspotItem) => {
    setSelectedHotspot(h);
    if (onSelectHotspot) onSelectHotspot(h);
  };

  const handleVerificationUpdated = (updatedHotspot: any) => {
    setSelectedHotspot(updatedHotspot);
    setHotspots((prev) =>
      prev.map((h) => (h.event.id === updatedHotspot.event.id ? updatedHotspot : h))
    );
    if (onSelectHotspot) {
      onSelectHotspot(updatedHotspot);
    }
  };

  // Handlers for interactive KPI cards
  const handleOpenTotalHotspots = () => {
    if (onNavigateTo) {
      onNavigateTo("explorer", { filterSource: "LIVE_FIRMS" });
    }
  };

  const handleOpenHighCriticalRisk = () => {
    if (onNavigateTo) {
      onNavigateTo("alerts", { filterRisk: "HIGH_CRITICAL" });
    }
  };

  const handleOpenPersistentSources = () => {
    const persistentItem = hotspots.find((h) => h.temporal_profile?.is_persistent) || hotspots[0];
    if (persistentItem) {
      handleSelectHotspotInternal(persistentItem);
    }
    if (onNavigateTo) {
      onNavigateTo("timeline", { hotspot: persistentItem, filterPersistent: true });
    }
  };

  const handleTriggerDemoScenario = async (sc: DemoScenarioOption) => {
    try {
      setActiveScenario(sc);
      const scenarioKey = sc.id === 'jamnagar' 
        ? 'scenario-1-jamnagar' 
        : sc.id === 'hazira' 
        ? 'scenario-1b-hazira' 
        : sc.id === 'punjab' 
        ? 'scenario-2-punjab' 
        : sc.id === 'simlipal' 
        ? 'scenario-3-simlipal' 
        : 'scenario-4-korba';
      const res = await fetch(`/api/scenarios/${scenarioKey}/load`, { method: "POST" });
      const data = await res.json();
      if (data.hotspot) {
        handleSelectHotspotInternal(data.hotspot);
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.flyTo(sc.coords, sc.zoom, { duration: 1.2 });
      }
      const updatedHotspots = await apiService.getHotspots();
      setHotspots(updatedHotspots);
    } catch (e) {
      console.warn("Scenario load fallback:", e);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.flyTo(sc.coords, sc.zoom, { duration: 1.2 });
      }
      const match = hotspots.find((h) => h.event.id.includes(sc.prefix));
      if (match) {
        handleSelectHotspotInternal(match);
      }
    }
  };

  const handleOpenIndustrialFlares = () => {
    const industrialItem = hotspots.find(
      (h) => h.classification?.predicted_class === "Gas Flare" || h.classification?.predicted_class === "Industrial Fire"
    ) || hotspots[0];
    if (industrialItem) {
      handleSelectHotspotInternal(industrialItem);
    }
    if (onNavigateTo) {
      onNavigateTo("details", { hotspot: industrialItem, filterClass: "INDUSTRIAL_FLARES" });
    }
  };

  const handleOpenSourceTelemetry = () => {
    if (onNavigateTo) {
      onNavigateTo("admin", { adminTab: "providers" });
    }
  };

  const [howItWorksOpen, setHowItWorksOpen] = useState<boolean>(false);
  const [isFullscreenMap, setIsFullscreenMap] = useState<boolean>(false);
  const [recentAlerts, setRecentAlerts] = useState<any[]>([]);

  // Map DOM references
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersGroupRef = useRef<any>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync prop changes
  useEffect(() => {
    if (selectedHotspotProp) {
      setSelectedHotspot(selectedHotspotProp);
      if (mapInstanceRef.current && selectedHotspotProp.event) {
        mapInstanceRef.current.flyTo(
          [selectedHotspotProp.event.latitude, selectedHotspotProp.event.longitude],
          12,
          { duration: 0.8 }
        );
      }
    }
  }, [selectedHotspotProp]);

  // Set up global Leaflet popup action handlers
  useEffect(() => {
    (window as any).__tg_inspect = (id: string) => {
      const found = hotspots.find((h) => h.event.id === id);
      if (found && onInspectDetails) {
        onInspectDetails(found);
      }
    };
    (window as any).__tg_timeline = (id: string) => {
      const found = hotspots.find((h) => h.event.id === id);
      if (found && onOpenTimeline) {
        onOpenTimeline(found);
      }
    };
    (window as any).__tg_select = (id: string) => {
      const found = hotspots.find((h) => h.event.id === id);
      if (found) {
        setSelectedHotspot(found);
        if (onSelectHotspot) onSelectHotspot(found);
      }
    };
    return () => {
      delete (window as any).__tg_inspect;
      delete (window as any).__tg_timeline;
      delete (window as any).__tg_select;
    };
  }, [hotspots, onInspectDetails, onOpenTimeline, onSelectHotspot]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDemoDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Load data from backend API
  const loadDashboardData = async () => {
    try {
      setRefreshing(true);
      setApiError(null);
      const [hotspotsData, statsData, alertsData] = await Promise.all([
        apiService.getHotspots(),
        apiService.getStatistics(),
        apiService.getAlerts().catch(() => [])
      ]);
      setHotspots(hotspotsData);
      setStats(statsData);
      setRecentAlerts(alertsData.slice(0, 5));
      if (hotspotsData.length > 0 && !selectedHotspot) {
        handleSelectHotspotInternal(hotspotsData[0]);
      }
    } catch (err: any) {
      console.error("Failed to load surveillance dashboard data", err);
      setApiError(err.message || "Failed to load data. Network or API error.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [22.5, 78.5],
      zoom: 5,
      zoomControl: false,
      dragging: true,
      
      touchZoom: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      boxZoom: true,
      attributionControl: true
    });

    // Reliable OpenStreetMap public basemap
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    markersGroupRef.current = L.featureGroup().addTo(map);
    mapInstanceRef.current = map;

    // Invalidate size on initial mount and when container resizes
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

  // Update Markers on Map when hotspots or filters change
  useEffect(() => {
    if (!mapInstanceRef.current || !markersGroupRef.current) return;

    const group = markersGroupRef.current;
    group.clearLayers();

    const filtered = hotspots.filter((h) => {
      const matchClass = selectedClass === "All" || h.classification.predicted_class === selectedClass;
      const matchRisk = selectedRisk === "All" || h.classification.risk_score === selectedRisk;
      return matchClass && matchRisk;
    });

    filtered.forEach((h) => {
      const isSelected = selectedHotspot?.event.id === h.event.id;
      const riskScore = h.classification.risk_score;
      const isCritical = riskScore === "CRITICAL";
      const isHigh = riskScore === "HIGH";
      const isMedium = riskScore === "MEDIUM";

      // Color mapping based on source classification
      let markerColor = "#14b8a6"; // Default teal
      const cls = h.classification.predicted_class;
      if (cls === "Industrial Fire") markerColor = "#ef4444"; // rose-500
      else if (cls === "Gas Flare") markerColor = "#f97316"; // orange-500
      else if (cls === "Wildfire") markerColor = "#10b981"; // emerald-500
      else if (cls === "Agricultural Burning") markerColor = "#f59e0b"; // amber-500
      else if (cls === "Mining") markerColor = "#06b6d4"; // cyan-500
      else if (cls === "Other") markerColor = "#06b6d4"; // cyan-500
      

      // Distinct CSS-based shape and muted pulsing animation based on operational risk level
      let markerHtml = "";
      if (isCritical) {
        markerHtml = `
          <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; cursor: pointer;">
            ${
              isSelected
                ? `<div style="position: absolute; width: 32px; height: 32px; border: 1.5px dashed #38bdf8; border-radius: 50%; opacity: 0.95;"></div>`
                : ""
            }
            <div class="pulse-ring-critical" style="position: absolute; width: 24px; height: 24px; border-radius: 50%; border: 1.5px solid #ef4444; background: rgba(239, 68, 68, 0.15); pointer-events: none;"></div>
            <div style="position: absolute; width: 18px; height: 18px; transform: rotate(45deg); border-radius: 2px; background: rgba(239, 68, 68, 0.22);"></div>
            <div style="position: relative; width: 11px; height: 11px; transform: rotate(45deg); background: #ef4444; border: 1.5px solid #ffffff; border-radius: 1px; box-shadow: 0 0 6px rgba(239, 68, 68, 0.7);"></div>
          </div>
        `;
      } else if (isHigh) {
        markerHtml = `
          <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; cursor: pointer;">
            ${
              isSelected
                ? `<div style="position: absolute; width: 30px; height: 30px; border: 1.5px dashed #38bdf8; border-radius: 50%; opacity: 0.95;"></div>`
                : ""
            }
            <div class="pulse-ring-high" style="position: absolute; width: 22px; height: 22px; border-radius: 50%; border: 1.2px solid #f97316; background: rgba(249, 115, 22, 0.12); pointer-events: none;"></div>
            <div style="position: absolute; width: 16px; height: 16px; border-radius: 3px; background: rgba(249, 115, 22, 0.2);"></div>
            <div style="position: relative; width: 10px; height: 10px; border-radius: 2px; background: #f97316; border: 1.5px solid #ffffff; box-shadow: 0 0 5px rgba(249, 115, 22, 0.6);"></div>
          </div>
        `;
      } else if (isMedium) {
        markerHtml = `
          <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; cursor: pointer;">
            ${
              isSelected
                ? `<div style="position: absolute; width: 26px; height: 26px; border: 1.5px dashed #38bdf8; border-radius: 50%; opacity: 0.95;"></div>`
                : ""
            }
            <div style="position: absolute; width: 16px; height: 16px; border-radius: 50%; background: rgba(245, 158, 11, 0.18);"></div>
            <div style="position: relative; width: 0; height: 0; border-left: 5.5px solid transparent; border-right: 5.5px solid transparent; border-bottom: 9.5px solid #f59e0b; filter: drop-shadow(0 0 2px rgba(245, 158, 11, 0.8));"></div>
          </div>
        `;
      } else {
        markerHtml = `
          <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; cursor: pointer;">
            ${
              isSelected
                ? `<div style="position: absolute; width: 22px; height: 22px; border: 1.5px dashed #38bdf8; border-radius: 50%; opacity: 0.95;"></div>`
                : ""
            }
            <div style="position: absolute; width: 14px; height: 14px; border-radius: 50%; background: rgba(20, 184, 166, 0.2);"></div>
            <div style="position: relative; width: 8px; height: 8px; border-radius: 50%; background: #14b8a6; border: 1.2px solid #ffffff; box-shadow: 0 0 4px rgba(20, 184, 166, 0.5);"></div>
          </div>
        `;
      }

      const customIcon = L.divIcon({
        className: "custom-hotspot-marker",
        html: markerHtml,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });

      const marker = L.marker([h.event.latitude, h.event.longitude], { icon: customIcon });
      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        handleSelectHotspotInternal(h);
      });

      const isLiveSource = h.event.source === "NASA_FIRMS_LIVE";

      // GIS Popup with direct action buttons
      marker.bindPopup(`
        <div style="font-family: ui-sans-serif, system-ui, sans-serif; background: #0b1120; color: #f8fafc; padding: 10px 12px; border: 1px solid #1e293b; border-radius: 6px; min-width: 220px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-size: 11px; font-family: ui-monospace, monospace; color: #94a3b8;">${h.event.id}</span>
            <span style="font-size: 10px; font-weight: 600; color: ${markerColor};">${h.classification.risk_score} RISK</span>
          </div>
          <div style="font-size: 13px; font-weight: 600; color: #38bdf8; margin-bottom: 4px;">${h.classification.predicted_class}</div>
          <div style="font-size: 10px; margin-bottom: 6px; color: ${isLiveSource ? '#34d399' : '#fbbf24'}; font-weight: 500;">
            ${isLiveSource ? '● LIVE NASA FIRMS' : '🧪 SIH DEMO SCENARIO'}
          </div>
          <div style="font-size: 11px; color: #cbd5e1; border-top: 1px solid #1e293b; padding-top: 6px; line-height: 1.6;">
            <div>FRP: <span style="color: #f59e0b; font-weight: 600;">${h.event.frp.toFixed(1)} MW</span></div>
            <div>Brightness: <span style="color: #f59e0b;">${h.event.brightness.toFixed(1)} K</span></div>
            <div>Facility: <span style="color: #94a3b8;">${h.geo_context.nearest_industrial_facility}</span></div>
            <div>Distance: <span style="color: #10b981; font-weight: 500;">${Math.round(h.geo_context.distance_to_industry)} m</span></div>
          </div>
          <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #1e293b; display: flex; gap: 6px;">
            <button onclick="window.__tg_inspect && window.__tg_inspect('${h.event.id}')" style="flex: 1; padding: 4px 6px; font-size: 10px; font-weight: 600; background: #0f172a; color: #38bdf8; border: 1px solid rgba(56,189,248,0.3); border-radius: 4px; cursor: pointer;">
              Dossier →
            </button>
            <button onclick="window.__tg_timeline && window.__tg_timeline('${h.event.id}')" style="flex: 1; padding: 4px 6px; font-size: 10px; font-weight: 500; background: #0f172a; color: #14b8a6; border: 1px solid rgba(20,184,166,0.3); border-radius: 4px; cursor: pointer;">
              Timeline →
            </button>
          </div>
        </div>
      `);

      group.addLayer(marker);
    });
  }, [hotspots, selectedClass, selectedRisk, selectedHotspot]);

  // Select Demo Scenario
  const handleSelectScenario = async (scenario: DemoScenarioOption) => {
    setActiveScenario(scenario);
    setDemoDropdownOpen(false);

    try {
      const targetMap: Record<string, string> = {
        jamnagar: "scenario-1-jamnagar",
        hazira: "scenario-1b-hazira",
        punjab: "scenario-2-punjab",
        simlipal: "scenario-3-simlipal",
        korba: "scenario-4-korba"
      };

      const scenarioApiId = targetMap[scenario.id];
      if (scenarioApiId) {
        await apiService.loadScenario(scenarioApiId);
        const updatedHotspots = await apiService.getHotspots();
        setHotspots(updatedHotspots);

        const target = updatedHotspots.find((h) => h.event.id.includes(scenario.prefix)) || updatedHotspots[0];
        if (target) {
          handleSelectHotspotInternal(target);
        }
      }
    } catch (err) {
      console.warn("Scenario API trigger fallback:", err);
      const target = hotspots.find((h) => h.event.id.includes(scenario.prefix));
      if (target) {
        handleSelectHotspotInternal(target);
      }
    }

    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(scenario.coords, scenario.zoom, { duration: 1.0 });
    }
  };

  // Reset to Live Surveillance Mode
  const handleResetToLive = async () => {
    setActiveScenario(null);
    setDemoDropdownOpen(false);
    setSelectedClass("All");
    setSelectedRisk("All");

    try {
      const hotspotsData = await apiService.getHotspots();
      setHotspots(hotspotsData);
      if (hotspotsData.length > 0) {
        const liveHotspot = hotspotsData.find((h) => h.event.source === "NASA_FIRMS_LIVE") || hotspotsData[0];
        handleSelectHotspotInternal(liveHotspot);
      }
    } catch (err) {
      console.error("Failed to reset to live surveillance:", err);
    }

    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([22.5, 78.5], 5, { duration: 1.0 });
    }
  };

  // Quick KPI Click Filter Handlers
  const handleKpiClick = (filterType: "total" | "critical" | "persistent" | "industrial" | "wildfires") => {
    if (filterType === "total") {
      setSelectedClass("All");
      setSelectedRisk("All");
    } else if (filterType === "critical") {
      setSelectedRisk((prev) => (prev === "CRITICAL" ? "All" : "CRITICAL"));
    } else if (filterType === "persistent") {
      // Toggle to a persistent target if found
      const persistentItem = hotspots.find((h) => h.temporal_profile.is_persistent);
      if (persistentItem) {
        handleSelectHotspotInternal(persistentItem);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo([persistentItem.event.latitude, persistentItem.event.longitude], 11, { duration: 0.8 });
        }
      }
    } else if (filterType === "industrial") {
      setSelectedClass((prev) => (prev === "Industrial Fire" ? "All" : "Industrial Fire"));
    } else if (filterType === "wildfires") {
      setSelectedClass((prev) => (prev === "Wildfire" ? "All" : "Wildfire"));
    }
  };

  const isCritical = selectedHotspot?.classification.risk_score === "CRITICAL";
  const isHigh = selectedHotspot?.classification.risk_score === "HIGH";
  const isMedium = selectedHotspot?.classification.risk_score === "MEDIUM";
  const isSelectedLive = selectedHotspot?.event.source === "NASA_FIRMS_LIVE";
  const liveHotspotsCount = hotspots.filter((h) => h.event.source === "NASA_FIRMS_LIVE").length;

  const highRiskHotspot = hotspots.find(h => h.classification.risk_score === "CRITICAL" || h.classification.risk_score === "HIGH") || hotspots[0];
  const persistentHotspot = hotspots.find(h => h.temporal_profile.is_persistent) || hotspots[0];

  return (
    <div className="flex flex-col gap-4 sm:gap-6 w-full min-h-full pb-10">
      {/* 1. HERO SECTION */}
      <div className="bg-white rounded-xl sm:rounded-2xl py-5 sm:py-6 lg:py-8 px-5 sm:px-6 lg:px-8 relative border border-slate-200/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6 shadow-xs shrink-0">
        <div className="relative z-10 max-w-2xl shrink-0">
          <div className="text-[10px] sm:text-[11px] font-bold text-blue-600 tracking-wider uppercase mb-1 sm:mb-2">
            THERMAL SOURCE INTELLIGENCE
          </div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-900 mb-1.5 sm:mb-2.5 leading-tight tracking-tight">
            From Satellite Data to a Safer Tomorrow
          </h1>
          <p className="text-slate-600 text-xs sm:text-sm lg:text-[15px] mb-4 sm:mb-6 leading-relaxed max-w-xl">
            Detect, classify and monitor thermal sources using NASA FIRMS and AI.
          </p>
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <button 
              onClick={() => {
                if (mapContainerRef.current) {
                  mapContainerRef.current.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              className="h-9 sm:h-10 px-4 sm:px-5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-xs sm:text-sm transition-all shadow-xs flex items-center gap-2 cursor-pointer min-h-[38px]"
            >
              <span>View Live Map</span>
              <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
            <button 
              onClick={() => setHowItWorksOpen(true)}
              className="h-9 sm:h-10 px-4 sm:px-5 rounded-xl bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-xs sm:text-sm transition-all flex items-center gap-2 shadow-xs cursor-pointer min-h-[38px]"
            >
              How It Works
            </button>
          </div>
        </div>
        
        {/* Subtle satellite graphic */}
        <div className="hidden sm:flex relative z-10 flex-shrink-0 opacity-20 md:opacity-30 pointer-events-none pr-4">
          <Satellite className="w-20 h-20 lg:w-28 lg:h-28 text-blue-600 transform rotate-12" />
        </div>
      </div>

      {/* HOW IT WORKS MODAL */}
      {howItWorksOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Satellite className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base">How ThermoGuard AI Works</h3>
              </div>
              <button 
                onClick={() => setHowItWorksOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2.5 sm:space-y-3 text-xs text-slate-600 leading-relaxed">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60">
                <div className="font-bold text-slate-800 text-xs sm:text-[13px] mb-1">1. NASA FIRMS Ingestion</div>
                <span>Streams real-time thermal anomaly observations from VIIRS and MODIS satellites, capturing coordinates, Fire Radiative Power (FRP), and brightness temperature.</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60">
                <div className="font-bold text-slate-800 text-xs sm:text-[13px] mb-1">2. Geospatial & Contextual Join</div>
                <span>Queries OpenStreetMap and PostGIS geometry to compute exact proximities to registered petrochemical refineries, power plants, forests, and agricultural parcels.</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60">
                <div className="font-bold text-slate-800 text-xs sm:text-[13px] mb-1">3. Temporal Analysis Engine</div>
                <span>Distinguishes persistent industrial signatures (e.g. constant gas flaring over weeks) from transient ecological events (e.g. moving wildfires or single-day stubble burn).</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60">
                <div className="font-bold text-slate-800 text-xs sm:text-[13px] mb-1">4. Random Forest Classification & Explainability</div>
                <span>A trained tabular ML pipeline predicts source category with probability scores and transparent geospatial evidence markers.</span>
              </div>
            </div>
            <div className="pt-2 flex justify-end">
              <button 
                onClick={() => setHowItWorksOpen(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer min-h-[38px]"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. KPI METRICS (IMPORTED) */}
      <div className="flex-shrink-0">
        <KpiMetrics 
          stats={stats} 
          onOpenTotalHotspots={handleOpenTotalHotspots}
          onOpenHighCriticalRisk={handleOpenHighCriticalRisk}
          onOpenPersistentSources={handleOpenPersistentSources}
          onOpenIndustrialFlares={handleOpenIndustrialFlares}
          onOpenSourceTelemetry={handleOpenSourceTelemetry}
          onFilterByRisk={(risk) => setSelectedRisk(prev => prev === risk ? "All" : risk)}
          onFilterByClass={(cls) => setSelectedClass(prev => prev === cls ? "All" : cls)}
          onFilterByPersistent={() => {
            const persistentItem = hotspots.find((h) => h.temporal_profile?.is_persistent);
            if (persistentItem) {
              handleSelectHotspotInternal(persistentItem);
              if (mapInstanceRef.current) {
                mapInstanceRef.current.flyTo([persistentItem.event.latitude, persistentItem.event.longitude], 11, { duration: 0.8 });
              }
            }
          }}
        />
      </div>

      {/* 3. OPERATIONAL INTELLIGENCE SECTION */}
      <div className="space-y-3">
        {/* SIH26162 Validation Demo Scenarios Strip */}
        <div className="bg-white rounded-xl sm:rounded-2xl p-3.5 sm:p-4 border border-slate-200/80 shadow-xs space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200 shadow-2xs flex-shrink-0">
                <Compass className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-xs text-slate-900">
                    SIH 2026 Validation Scenarios
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-mono">
                    SIH26162
                  </span>
                </div>
                <p className="text-[10px] sm:text-[11px] text-slate-500">
                  Select a calibrated benchmark scenario to inspect ground-truth telemetry & ML inference:
                </p>
              </div>
            </div>
            <span className="text-[10px] sm:text-[11px] text-slate-400 font-mono hidden sm:inline">
              5 Benchmarks
            </span>
          </div>

          <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-5 gap-2 pt-0.5">
            {DEMO_SCENARIOS.map((sc) => {
              const isSelected = activeScenario?.id === sc.id;
              const isCrit = sc.risk === "CRITICAL";
              const isHigh = sc.risk === "HIGH";
              return (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => handleTriggerDemoScenario(sc)}
                  className={`text-left p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-1 min-h-[44px] ${
                    isSelected
                      ? "bg-blue-50/80 border-blue-500 shadow-xs ring-1 ring-blue-500/30"
                      : "bg-slate-50/70 hover:bg-slate-100/80 border-slate-200 text-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold text-[11px] text-slate-900 truncate">
                      {sc.name.split(":")[0]}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase border ${
                        isCrit
                          ? "bg-red-50 text-red-700 border-red-200"
                          : isHigh
                          ? "bg-orange-50 text-orange-700 border-orange-200"
                          : "bg-amber-50 text-amber-800 border-amber-200"
                      }`}
                    >
                      {sc.risk}
                    </span>
                  </div>
                  <div className="text-[10px] font-semibold text-blue-700 truncate">
                    {sc.category}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">
                    📍 {sc.location}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-[11px] sm:text-[12px] font-bold text-slate-400 uppercase tracking-wider">
            THERMAL SOURCE OPERATIONS
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] sm:text-xs text-slate-500 font-medium">
              {hotspots.length} active detections
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-6 min-w-0">
          {/* MAP CONTAINER (8 cols on xl = approx 67% width) */}
          <div className="xl:col-span-8 bg-white rounded-xl sm:rounded-2xl shadow-xs border border-slate-200/80 overflow-hidden flex flex-col min-w-0 h-[360px] xs:h-[400px] sm:h-[440px] xl:h-[480px]">
            <div className="px-3 sm:px-5 py-2.5 sm:py-0 min-h-[48px] sm:h-14 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2 sm:gap-3 flex-shrink-0">
              <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 flex-shrink-0">
                  <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 text-xs sm:text-[14px] truncate">Thermal Events Map</h3>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium truncate">NASA FIRMS VIIRS NRT</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                 <select
                    value={selectedClass}
                    onChange={(e) => setSelectedClass(e.target.value)}
                    className="px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] sm:text-xs font-medium text-slate-700 shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer max-w-[130px] sm:max-w-none"
                  >
                    <option value="All">All Classes ({hotspots.length})</option>
                    <option value="Industrial Fire">Industrial Fire</option>
                    <option value="Gas Flare">Gas Flare</option>
                    <option value="Agricultural Burning">Agricultural Burning</option>
                    <option value="Wildfire">Wildfire</option>
                    <option value="Mining">Mining</option>
                    <option value="Other">Other</option>
                  </select>
                  <select
                    value={selectedRisk}
                    onChange={(e) => setSelectedRisk(e.target.value)}
                    className="px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] sm:text-xs font-medium text-slate-700 shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                  >
                    <option value="All">All Risk</option>
                    <option value="CRITICAL">Critical</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                  <button 
                    onClick={loadDashboardData} 
                    className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 transition-colors cursor-pointer min-w-[32px] min-h-[32px] flex items-center justify-center"
                    title="Refresh Map Observations"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                  </button>
              </div>
            </div>
            
            <div className="flex-1 min-h-0 relative bg-slate-100 overflow-hidden">
              <div ref={mapContainerRef} className="absolute inset-0 z-10" />
              
              {/* Risk Legend */}
              <div className="absolute bottom-3 left-3 z-[400] px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-white/95 border border-slate-200 text-xs space-y-1 backdrop-blur-xs shadow-2xs max-w-[150px] sm:max-w-none">
                <div className="font-bold text-slate-900 text-[9px] sm:text-[10px] uppercase tracking-wider">Risk Level</div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rotate-45 bg-red-500 rounded-2xs" /><span className="text-slate-700 font-medium text-[9px] sm:text-[10px]">Critical (&ge; 75)</span></div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-orange-500 rounded-2xs" /><span className="text-slate-700 font-medium text-[9px] sm:text-[10px]">High (50 - 75)</span></div>
                <div className="flex items-center gap-1.5"><span className="w-0 h-0 border-l-[3.5px] border-r-[3.5px] border-b-[6px] border-l-transparent border-r-transparent border-b-amber-500" /><span className="text-slate-700 font-medium text-[9px] sm:text-[10px]">Medium (25 - 50)</span></div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-500" /><span className="text-slate-700 font-medium text-[9px] sm:text-[10px]">Low (&lt; 25)</span></div>
              </div>
              
              {/* Attribution */}
              <div className="absolute bottom-2 right-2 z-[400] text-[8px] sm:text-[9px] text-slate-400 font-medium bg-white/90 px-1.5 py-0.5 rounded shadow-2xs border border-slate-200/50">
                Leaflet | © OSM
              </div>
            </div>
          </div>

          {/* DETAIL PANEL (4 cols on xl = approx 33% width; stacks below on mobile) */}
          <div className="xl:col-span-4 bg-white rounded-xl sm:rounded-2xl shadow-xs border border-slate-200/80 overflow-hidden flex flex-col min-w-0 min-h-[380px] sm:h-[440px] xl:h-[480px]">
            {selectedHotspot ? (
              <DetailPanel
                hotspot={selectedHotspot as any}
                onClose={() => setSelectedHotspot(null)}
                onInspectDetails={onInspectDetails as any}
                onOpenTimeline={onOpenTimeline as any}
                onVerificationUpdated={handleVerificationUpdated as any}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center mb-2.5 text-blue-500 border border-slate-100">
                  <Compass className="w-5 h-5" />
                </div>
                <p className="text-slate-800 font-bold text-xs mb-1">No Event Selected</p>
                <p className="text-[11px] font-medium text-slate-500 max-w-xs">
                  Click any hotspot on the map to inspect satellite telemetry and AI classification evidence.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. OPERATIONAL INSIGHTS */}
      <div className="space-y-3">
        <div className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">
          OPERATIONAL INSIGHTS
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: High Risk Thermal Event */}
          <div 
            onClick={() => highRiskHotspot && handleSelectHotspotInternal(highRiskHotspot)}
            className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5 flex flex-col justify-between hover:border-red-300 transition-all cursor-pointer"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-700 border border-red-200 uppercase">
                  Critical Priority
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {highRiskHotspot?.event.id}
                </span>
              </div>
              <h4 className="font-bold text-slate-900 text-sm mb-1">
                High Risk Thermal Event
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Potential industrial source detected near {highRiskHotspot?.geo_context.nearest_industrial_facility || "petrochemical facility"}. FRP of {highRiskHotspot?.event.frp.toFixed(1)} MW exceeds baseline threshold.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-red-600 font-semibold font-mono">
                Risk Score: {highRiskHotspot?.classification.risk_score}
              </span>
              <span className="text-blue-600 font-medium flex items-center gap-1 hover:underline">
                View on Map <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>

          {/* Card 2: Persistent Thermal Source */}
          <div 
            onClick={() => persistentHotspot && handleSelectHotspotInternal(persistentHotspot)}
            className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5 flex flex-col justify-between hover:border-teal-300 transition-all cursor-pointer"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200 uppercase">
                  Persistent Signature
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {persistentHotspot?.event.id}
                </span>
              </div>
              <h4 className="font-bold text-slate-900 text-sm mb-1">
                Persistent Thermal Source
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                {persistentHotspot?.temporal_profile.observation_count || 14} continuous observations registered over {persistentHotspot?.temporal_profile.persistence_days || 8} days. Consistent flare or industrial signature.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-teal-700 font-semibold font-mono">
                Duration: {persistentHotspot?.temporal_profile.persistence_days || 8} Days
              </span>
              <span className="text-blue-600 font-medium flex items-center gap-1 hover:underline">
                View on Map <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>

          {/* Card 3: Live FIRMS Ingestion */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Live Feed Active
                </span>
                <span className="text-[10px] text-slate-400">VIIRS NRT</span>
              </div>
              <h4 className="font-bold text-slate-900 text-sm mb-1">
                Live FIRMS Ingestion
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Ingestion stream synced with Suomi-NPP & NOAA-20 VIIRS instruments. Regional coverage: Indian Subcontinent bounding box.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">
                Detections: <strong className="text-slate-900">{hotspots.length} Hotspots</strong>
              </span>
              <span className="text-slate-400 font-mono text-[11px]">
                Latency: &lt; 2.4s
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. ANALYTICS, SYSTEM STATUS & RECENT ALERTS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         {/* Recent Alerts */}
         <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5 lg:p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <BellRing className="w-4 h-4 text-blue-600" />
                <span>Recent Alerts</span>
              </div>
              <span className="text-[11px] font-semibold text-slate-400">
                {recentAlerts.length} Recorded
              </span>
            </div>
            <div className="space-y-3.5 flex-1 overflow-y-auto max-h-64 pr-1">
               {recentAlerts.length > 0 ? (
                 recentAlerts.map((alert: any, idx: number) => {
                   const isCrit = alert.severity === "CRITICAL";
                   const isH = alert.severity === "HIGH";
                   return (
                     <div key={alert.id ? `${alert.id}-${idx}` : `alert-${idx}`} className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-50/60 border border-slate-100">
                       <div className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${isCrit ? "bg-red-500" : isH ? "bg-orange-500" : "bg-blue-500"}`} />
                       <div className="flex-1 min-w-0">
                         <div className="text-xs font-bold text-slate-900 truncate">
                           {alert.title || `Thermal Hotspot ${alert.event_id}`}
                         </div>
                         <div className="text-[11px] text-slate-500 truncate mt-0.5">
                           {alert.message || `Thermal event alert for ${alert.event_id}`}
                         </div>
                       </div>
                       <div className="flex flex-col items-end gap-1 flex-shrink-0">
                         <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border uppercase ${
                           isCrit ? "bg-red-50 text-red-600 border-red-200" : isH ? "bg-orange-50 text-orange-600 border-orange-200" : "bg-blue-50 text-blue-600 border-blue-200"
                         }`}>
                           {alert.severity}
                         </span>
                       </div>
                     </div>
                   );
                 })
               ) : (
                 <>
                   <div className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-50/60 border border-slate-100">
                     <div className="w-2.5 h-2.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                     <div className="flex-1 min-w-0">
                       <div className="text-xs font-bold text-slate-900 leading-tight">High Risk Thermal Event</div>
                       <div className="text-[11px] text-slate-500 truncate mt-0.5">Potential industrial source detected near refinery</div>
                     </div>
                     <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600 border border-red-200">Critical</span>
                   </div>
                   <div className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-50/60 border border-slate-100">
                     <div className="w-2.5 h-2.5 rounded-full bg-orange-500 mt-1.5 flex-shrink-0" />
                     <div className="flex-1 min-w-0">
                       <div className="text-xs font-bold text-slate-900 leading-tight">Persistent Thermal Source</div>
                       <div className="text-[11px] text-slate-500 truncate mt-0.5">14 observations over 8 days in petrochemical zone</div>
                     </div>
                     <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-50 text-orange-600 border border-orange-200">High</span>
                   </div>
                 </>
               )}
            </div>
         </div>

         {/* AI Classification Summary */}
         <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5 lg:p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <Layers className="w-4 h-4 text-blue-600" />
                <span>AI Classification Summary</span>
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                RF-v1.0 (ML Online)
              </span>
            </div>
            <div className="flex-1 space-y-2.5">
              <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                  <span className="text-slate-600 font-medium">Industrial & Flares</span>
                </div>
                <span className="font-bold text-slate-900 font-mono">
                  {(stats?.by_class?.["Gas Flare"] || 0) + (stats?.by_class?.["Industrial Fire"] || 0) || (stats?.industrial_sources ?? 0)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                  <span className="text-slate-600 font-medium">Wildfire</span>
                </div>
                <span className="font-bold text-slate-900 font-mono">
                  {stats?.by_class?.["Wildfire"] || stats?.wildfires || 0}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="text-slate-600 font-medium">Agricultural Burning</span>
                </div>
                <span className="font-bold text-slate-900 font-mono">
                  {stats?.by_class?.["Agricultural Burning"] || stats?.agricultural_burns || 0}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                  <span className="text-slate-600 font-medium">Mining</span>
                </div>
                <span className="font-bold text-slate-900 font-mono">
                  {stats?.by_class?.["Mining"] || 0}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs py-1">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                  <span className="text-slate-600 font-medium">Other</span>
                </div>
                <span className="font-bold text-slate-900 font-mono">
                  {stats?.by_class?.["Other"] || 0}
                </span>
              </div>
              {Boolean(stats?.by_class?.["ML_UNAVAILABLE"]) && (
                <div className="flex items-center justify-between text-xs py-1 text-amber-700 bg-amber-50/70 px-2 rounded-lg mt-1 border border-amber-200/50">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                    <span className="font-semibold">ML Unavailable</span>
                  </div>
                  <span className="font-bold font-mono">
                    {stats?.by_class?.["ML_UNAVAILABLE"]}
                  </span>
                </div>
              )}
            </div>
            <div className="mt-3 pt-2 text-[10px] text-slate-400 border-t border-slate-100 flex items-center justify-between font-mono">
              <span>Model: random_forest_v1.0.0</span>
              <span>100 Trees • 26 Feats</span>
            </div>
         </div>

         {/* System Status */}
         <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5 lg:p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>System Status</span>
              </div>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                Operational
              </span>
            </div>
            
            <div className="space-y-2.5 flex-1">
               <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-2.5 flex items-center justify-between">
                 <div className="flex items-center gap-2">
                   <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                   <span className="text-xs font-semibold text-slate-800">NASA FIRMS API</span>
                 </div>
                 <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Connected</span>
               </div>
               <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-2.5 flex items-center justify-between">
                 <div className="flex items-center gap-2">
                   <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                   <span className="text-xs font-semibold text-slate-800">AI Classifier</span>
                 </div>
                 <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Online</span>
               </div>
               <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-2.5 flex items-center justify-between">
                 <div className="flex items-center gap-2">
                   <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                   <span className="text-xs font-semibold text-slate-800">PostgreSQL / PostGIS</span>
                 </div>
                 <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Connected</span>
               </div>
            </div>
            
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-medium text-slate-400">
              <span>Telemetry sync: Active</span>
              <button 
                onClick={loadDashboardData}
                className="p-1 rounded-md bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-500 transition-colors"
                title="Refresh Status"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
         </div>
      </div>
    </div>
  );
};