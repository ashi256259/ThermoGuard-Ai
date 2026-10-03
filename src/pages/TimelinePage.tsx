import React, { useState, useEffect } from "react";
import { History, Calendar, Clock, Flame, BarChart2, TrendingUp, Layers, RefreshCw, ArrowLeft, FileText, ChevronRight } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from "recharts";
import { apiService, HotspotItem } from "../services/api";

interface TimelinePageProps {
  selectedHotspot?: HotspotItem | null;
  onSelectHotspot?: (hotspot: HotspotItem) => void;
  onInspectDetails?: (hotspot: HotspotItem) => void;
  onReturnToMap?: () => void;
  initialFilterPersistent?: boolean;
}

interface TimelineObservation {
  id?: string;
  date?: string;
  timestamp?: string;
  frp: number;
  brightness: number;
  satellite: string;
  confidence?: number;
  daynight?: string;
}

interface TimelineResponseMeta {
  time_range?: {
    days_requested: number | string;
    earliest_pass: string;
    latest_pass: string;
    span_days: number;
  };
  summary?: {
    total_passes: number;
    active_days: number;
    avg_frp: number;
    max_frp: number;
    min_frp: number;
    avg_brightness: number;
    day_passes: number;
    night_passes: number;
    satellites: string[];
  };
}

export const TimelinePage: React.FC<TimelinePageProps> = ({
  selectedHotspot,
  onSelectHotspot,
  onInspectDetails,
  onReturnToMap,
  initialFilterPersistent
}) => {
  const [hotspots, setHotspots] = useState<HotspotItem[]>([]);
  const [activeHotspot, setActiveHotspot] = useState<HotspotItem | null>(selectedHotspot || null);
  const [timelineData, setTimelineData] = useState<TimelineObservation[]>([]);
  const [timelineMeta, setTimelineMeta] = useState<TimelineResponseMeta | null>(null);
  const [selectedRange, setSelectedRange] = useState<"7" | "30" | "90" | "all">("90");
  const [loadingTimeline, setLoadingTimeline] = useState<boolean>(false);
  const [filterPersistent, setFilterPersistent] = useState<boolean>(initialFilterPersistent || false);

  useEffect(() => {
    if (initialFilterPersistent !== undefined) {
      setFilterPersistent(initialFilterPersistent);
    }
  }, [initialFilterPersistent]);

  useEffect(() => {
    async function loadHotspots() {
      try {
        const data = await apiService.getHotspots();
        setHotspots(data);
        if (initialFilterPersistent) {
          const pers = data.find((h) => h.temporal_profile?.is_persistent);
          if (pers) {
            setActiveHotspot(pers);
          } else if (!activeHotspot && data.length > 0) {
            setActiveHotspot(data[0]);
          }
        } else if (!activeHotspot && data.length > 0) {
          setActiveHotspot(data[0]);
        }
      } catch (err) {
        console.error("Failed to load hotspots for timeline", err);
      }
    }
    loadHotspots();
  }, [initialFilterPersistent]);

  useEffect(() => {
    if (selectedHotspot) {
      setActiveHotspot(selectedHotspot);
    }
  }, [selectedHotspot]);

  const fetchTimeline = async (hotspotToLoad: HotspotItem, range: "7" | "30" | "90" | "all" = selectedRange) => {
    try {
      setLoadingTimeline(true);
      const res = await apiService.getHotspotTimeline(hotspotToLoad.event.id, range);
      const history: TimelineObservation[] = Array.isArray(res)
        ? res
        : Array.isArray(res?.observation_history)
        ? res.observation_history
        : [];
      setTimelineData(history);
      setTimelineMeta({
        time_range: res?.time_range,
        summary: res?.summary
      });
    } catch (err) {
      console.error("Failed to load timeline passes", err);
      setTimelineData([]);
      setTimelineMeta(null);
    } finally {
      setLoadingTimeline(false);
    }
  };

  useEffect(() => {
    if (activeHotspot) {
      fetchTimeline(activeHotspot, selectedRange);
    }
  }, [activeHotspot, selectedRange]);

  const handleSelectTarget = (target: HotspotItem) => {
    setActiveHotspot(target);
    if (onSelectHotspot) onSelectHotspot(target);
  };

  const passesToRender: TimelineObservation[] =
    timelineData.length > 0
      ? timelineData
      : activeHotspot
      ? [
          {
            date: activeHotspot.event.timestamp ? activeHotspot.event.timestamp.split("T")[0] : "Current",
            timestamp: activeHotspot.event.timestamp,
            frp: activeHotspot.event.frp,
            brightness: activeHotspot.event.brightness,
            satellite: activeHotspot.event.satellite,
            confidence: activeHotspot.event.confidence
          }
        ]
      : [];

  const chartSeries = passesToRender.map((item, idx) => ({
    timestamp: item.date || (item.timestamp ? item.timestamp.split("T")[0] : `Pass ${idx + 1}`),
    time: item.timestamp ? item.timestamp.slice(11, 16) : "",
    frp: Number(item.frp?.toFixed(1) || 0),
    brightness: Number(item.brightness?.toFixed(1) || 0),
    satellite: item.satellite || "VIIRS",
    confidence: item.confidence || activeHotspot?.event.confidence || 90
  }));

  return (
    <div className="h-full overflow-y-auto p-3.5 sm:p-6 bg-slate-50 text-slate-800 space-y-4 sm:space-y-6">
      {/* Top Navigation & Target Selector Bar */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 p-3.5 sm:p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
          {onReturnToMap && (
            <button
              onClick={onReturnToMap}
              className="px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer min-h-[38px]"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-blue-600" />
              <span>Map</span>
            </button>
          )}

          {/* Target Selector */}
          <div className="flex items-center gap-2 flex-1 sm:flex-initial min-w-0">
            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap hidden sm:inline">Target Hotspot:</span>
            <select
              value={activeHotspot?.event.id || ""}
              onChange={(e) => {
                const found = hotspots.find((h) => h.event.id === e.target.value);
                if (found) handleSelectTarget(found);
              }}
              className="px-2.5 sm:px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-blue-700 font-mono font-medium focus:outline-none focus:border-blue-500 cursor-pointer w-full sm:w-auto truncate min-h-[38px]"
            >
              {(filterPersistent ? hotspots.filter((h) => h.temporal_profile?.is_persistent) : hotspots).map((h, idx) => (
                <option key={h.event.id ? `${h.event.id}-${idx}` : `h-${idx}`} value={h.event.id}>
                  {h.event.id} — {h.classification.predicted_class} ({h.geo_context.nearest_industrial_facility})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => {
              const next = !filterPersistent;
              setFilterPersistent(next);
              if (next) {
                const pers = hotspots.find((h) => h.temporal_profile?.is_persistent);
                if (pers) handleSelectTarget(pers);
              }
            }}
            className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer min-h-[38px] ${
              filterPersistent
                ? "bg-teal-50 text-teal-800 border-teal-300"
                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-teal-700" />
            <span className="whitespace-nowrap">Persistent</span>
          </button>
        </div>

        <div className="flex items-center gap-2 justify-end">
          {activeHotspot && onInspectDetails && (
            <button
              onClick={() => onInspectDetails(activeHotspot)}
              className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer min-h-[38px]"
            >
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              <span>Dossier</span>
              <ChevronRight className="w-3.5 h-3.5 text-blue-600" />
            </button>
          )}

          {activeHotspot && (
            <button
              onClick={() => fetchTimeline(activeHotspot)}
              title="Refresh orbit trajectory passes"
              className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 cursor-pointer transition min-h-[38px] min-w-[38px] flex items-center justify-center"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingTimeline ? "animate-spin text-blue-600" : ""}`} />
            </button>
          )}
        </div>
      </div>

      {/* Header Bar with Time Range Filter Controls */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              Temporal Persistence & Multi-Pass Timeline
            </h2>
            <span className="px-2.5 py-0.5 rounded text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200 uppercase">
              Temporal Intelligence Active
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Historical NASA FIRMS VIIRS/MODIS satellite overpasses clustered across time to isolate persistent industrial sources from transient fires.
          </p>
        </div>

        {/* Time Window Range Selector */}
        <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl border border-slate-200/80 self-start md:self-auto">
          <span className="text-[10px] font-semibold text-slate-500 uppercase px-2 hidden sm:inline">Window:</span>
          {(
            [
              { id: "7", label: "7 Days" },
              { id: "30", label: "30 Days" },
              { id: "90", label: "90 Days" },
              { id: "all", label: "All History" }
            ] as const
          ).map((rng) => (
            <button
              key={rng.id}
              onClick={() => setSelectedRange(rng.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                selectedRange === rng.id
                  ? "bg-white text-blue-700 shadow-xs border border-slate-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {rng.label}
            </button>
          ))}
        </div>
      </div>

      {activeHotspot && (
        <div className="space-y-4 sm:space-y-6">
          {/* Metrics summary row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
            <div className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl bg-white border border-slate-200/80 shadow-xs">
              <div className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Temporal Signature</div>
              <div className="text-sm sm:text-base font-bold text-slate-900 mt-1">
                {activeHotspot.temporal_profile.is_persistent ? (
                  <span className="text-teal-700 font-bold">Persistent Source</span>
                ) : (
                  <span className="text-slate-600 font-bold">Transient Anomaly</span>
                )}
              </div>
              <div className="text-[10px] sm:text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                Cluster: {activeHotspot.temporal_profile.cluster_id}
              </div>
            </div>

            <div className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl bg-white border border-slate-200/80 shadow-xs">
              <div className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Active Span</div>
              <div className="text-xl sm:text-2xl font-black text-blue-600 font-mono mt-0.5 sm:mt-1">
                {timelineMeta?.time_range?.span_days ?? activeHotspot.temporal_profile.persistence_days} <span className="text-xs text-slate-400 font-normal">days</span>
              </div>
              <div className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 truncate">
                {timelineMeta?.time_range?.earliest_pass ? `From ${timelineMeta.time_range.earliest_pass.split('T')[0]}` : `First seen ${activeHotspot.temporal_profile.first_seen}`}
              </div>
            </div>

            <div className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl bg-white border border-slate-200/80 shadow-xs">
              <div className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Satellite Passes</div>
              <div className="text-xl sm:text-2xl font-black text-amber-600 font-mono mt-0.5 sm:mt-1">
                {passesToRender.length} <span className="text-xs text-slate-400 font-normal">passes</span>
              </div>
              <div className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 truncate">
                {timelineMeta?.summary?.active_days ? `${timelineMeta.summary.active_days} active dates` : `~${activeHotspot.temporal_profile.frequency_per_week} passes / wk`}
              </div>
            </div>

            <div className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl bg-white border border-slate-200/80 shadow-xs">
              <div className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Avg / Peak FRP</div>
              <div className="text-xl sm:text-2xl font-black text-teal-700 font-mono mt-0.5 sm:mt-1">
                {timelineMeta?.summary?.avg_frp ?? activeHotspot.event.frp} <span className="text-xs text-slate-400 font-normal">/ {timelineMeta?.summary?.max_frp ?? activeHotspot.event.frp} MW</span>
              </div>
              <div className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 truncate">
                {activeHotspot.temporal_profile.seasonal_pattern || "Continuous signature"}
              </div>
            </div>
          </div>

          {/* Interactive Time-Series Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart 1: Fire Radiative Power (MW) Over Time */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                  <Flame className="w-4 h-4 text-orange-600" />
                  <span>Fire Radiative Power (FRP) Trajectory</span>
                </div>
                <span className="text-[10px] font-mono font-semibold text-orange-700 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                  Units: MW
                </span>
              </div>

              <div className="h-60 w-full">
                {loadingTimeline ? (
                  <div className="h-full flex items-center justify-center text-slate-400 text-xs">Loading trajectory...</div>
                ) : chartSeries.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartSeries} margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="timestamp" stroke="#94a3b8" tick={{ fontSize: 10, fill: "#64748b" }} />
                      <YAxis stroke="#94a3b8" tick={{ fontSize: 10, fill: "#64748b" }} unit=" MW" />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", fontSize: "11px", color: "#0f172a", borderRadius: "12px", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="frp"
                        name="FRP (MW)"
                        stroke="#f97316"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: "#f97316" }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400 text-xs">No historical orbit passes recorded</div>
                )}
              </div>
            </div>

            {/* Chart 2: Brightness Temperature (K) Over Time */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                  <TrendingUp className="w-4 h-4 text-amber-600" />
                  <span>Brightness Temperature (K) Trajectory</span>
                </div>
                <span className="text-[10px] font-mono font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  Units: Kelvin (K)
                </span>
              </div>

              <div className="h-60 w-full">
                {loadingTimeline ? (
                  <div className="h-full flex items-center justify-center text-slate-400 text-xs">Loading trajectory...</div>
                ) : chartSeries.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartSeries} margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="timestamp" stroke="#94a3b8" tick={{ fontSize: 10, fill: "#64748b" }} />
                      <YAxis
                        stroke="#94a3b8"
                        tick={{ fontSize: 10, fill: "#64748b" }}
                        domain={["dataMin - 10", "dataMax + 10"]}
                        unit=" K"
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", fontSize: "11px", color: "#0f172a", borderRadius: "12px", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="brightness"
                        name="Brightness (K)"
                        stroke="#f59e0b"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: "#f59e0b" }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400 text-xs">No historical orbit passes recorded</div>
                )}
              </div>
            </div>
          </div>

          {/* Temporal Reasoning Assessment Box */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
            <h3 className="text-xs font-bold text-slate-900 mb-2 flex items-center gap-2">
              <History className="w-4 h-4 text-blue-600" />
              <span>Multi-Pass Temporal Assessment</span>
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              The temporal engine clusters satellite passes within 500 meters of this coordinate across historical orbits.
              {activeHotspot.temporal_profile.is_persistent
                ? ` With ${activeHotspot.temporal_profile.observation_count} distinct detections over ${activeHotspot.temporal_profile.persistence_days} days and ${Math.round(activeHotspot.temporal_profile.recurrence_ratio * 100)}% recurrence, this source displays the persistent signature characteristic of continuous operational infrastructure rather than transient biomass burning.`
                : ` With only single-epoch or low recurrence observations (${activeHotspot.temporal_profile.observation_count} pass), this source displays transient thermal behavior characteristic of short-lived fire events.`}
            </p>
          </div>

          {/* Chronological Pass Orbit Log */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-teal-700" />
                <span>Historical Satellite Orbit Passes ({passesToRender.length} Records)</span>
              </h3>
              <span className="text-[11px] text-slate-500 font-mono font-medium">VIIRS Day/Night Band & MODIS</span>
            </div>

            <div className="space-y-2.5 text-xs">
              {passesToRender.map((pass, idx) => {
                const passDate = pass.date || pass.timestamp || activeHotspot.event.timestamp || new Date().toISOString();
                const frpValue = pass.frp ?? activeHotspot.event.frp;
                const brightnessValue = pass.brightness ?? activeHotspot.event.brightness;
                const satName = pass.satellite || activeHotspot.event.satellite || "VIIRS-SNPP";

                return (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-slate-100/60 transition"
                  >
                    <div className="flex items-center gap-3">
                      <Clock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span className="font-mono text-slate-900 font-semibold">
                        {passDate.replace("T", " ").replace("Z", "")} UTC
                      </span>
                      <span className="text-slate-500 font-mono text-[11px]">Sensor: {satName}</span>
                    </div>

                    <div className="flex items-center gap-4 font-mono">
                      <div>
                        <span className="text-slate-500 text-[10px] mr-1">FRP:</span>
                        <span className="text-orange-700 font-bold">{frpValue.toFixed(1)} MW</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] mr-1">Temp:</span>
                        <span className="text-amber-700 font-bold">{brightnessValue.toFixed(1)} K</span>
                      </div>
                      <span className="text-[10px] px-2.5 py-0.5 rounded font-bold bg-teal-50 text-teal-700 border border-teal-200">
                        Confidence {pass.confidence || activeHotspot.event.confidence}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

