import React, { useState, useEffect } from "react";
import { Search, AlertCircle, Radio, X, MapPin, FileText, Clock } from "lucide-react";
import { apiService, HotspotItem } from "../services/api";

interface HotspotExplorerProps {
  onSelectHotspot?: (hotspot: HotspotItem) => void;
  onViewOnMap?: (hotspot: HotspotItem) => void;
  onOpenTimeline?: (hotspot: HotspotItem) => void;
  initialSourceFilter?: string;
}

export const HotspotExplorerPage: React.FC<HotspotExplorerProps> = ({
  onSelectHotspot,
  onViewOnMap,
  onOpenTimeline,
  initialSourceFilter
}) => {
  const [hotspots, setHotspots] = useState<HotspotItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedClass, setSelectedClass] = useState<string>("All");
  const [sourceFilter, setSourceFilter] = useState<string>(initialSourceFilter || "All");

  useEffect(() => {
    if (initialSourceFilter) {
      setSourceFilter(initialSourceFilter);
    }
  }, [initialSourceFilter]);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await apiService.getHotspots();
        setHotspots(data);
        setError(null);
      } catch (err: any) {
        setError(err.message || "Failed to load hotspots catalog");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = hotspots.filter((h) => {
    const matchesSearch =
      h.event.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      h.geo_context.nearest_industrial_facility.toLowerCase().includes(searchQuery.toLowerCase()) ||
      h.classification.predicted_class.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesClass = selectedClass === "All" || h.classification.predicted_class === selectedClass;
    const matchesSource = sourceFilter === "All" || (sourceFilter === "LIVE_FIRMS" ? (h.event.source === "NASA_FIRMS_LIVE" || !h.event.id.startsWith("te-scen-")) : true);
    return matchesSearch && matchesClass && matchesSource;
  });

  return (
    <div className="h-full flex flex-col p-3.5 sm:p-6 overflow-y-auto bg-slate-50 text-slate-800 space-y-3.5 sm:space-y-5">
      {/* Header Bar */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3.5 sm:gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              Thermal Observation Catalog
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 uppercase">
              NASA FIRMS & PostGIS
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Registered thermal anomaly observations with contextual spatial and temporal attributes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="relative w-full sm:w-auto">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 sm:top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search ID, facility, or class..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-7 py-1.5 sm:py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-full sm:w-64 transition-all min-h-[38px]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2.5 sm:top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer shadow-2xs min-h-[38px]"
          >
            <option value="All">All Sources</option>
            <option value="LIVE_FIRMS">Live NASA FIRMS Only</option>
          </select>

          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer min-h-[38px]"
          >
            <option value="All">All Source Classes</option>
            <option value="Industrial Fire">Industrial Fire</option>
            <option value="Gas Flare">Gas Flare</option>
            <option value="Agricultural Burning">Agricultural Burning</option>
            <option value="Wildfire">Wildfire</option>
            <option value="Mining">Mining</option>
            <option value="Other">Other</option>
            <option value="ML_UNAVAILABLE">ML Unavailable</option>
          </select>

          {(selectedClass !== "All" || sourceFilter !== "All" || searchQuery) && (
            <button
              onClick={() => {
                setSelectedClass("All");
                setSourceFilter("All");
                setSearchQuery("");
              }}
              className="px-3 py-1.5 sm:py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer min-h-[38px]"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Status Strip */}
      <div className="p-3 rounded-xl bg-white border border-slate-200/80 flex items-center justify-between text-xs shadow-2xs">
        <div className="flex items-center gap-2 text-slate-600">
          <Radio className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
          <span className="text-[11px] sm:text-xs">
            Showing <strong className="text-slate-900">{filtered.length}</strong> of <strong className="text-slate-900">{hotspots.length}</strong> observations.
          </span>
        </div>
        <span className="text-[10px] sm:text-[11px] text-slate-400 font-mono hidden sm:inline">
          Coordinate System: EPSG:4326 (WGS-84)
        </span>
      </div>

      {/* Catalog Table */}
      <div className="flex-1 rounded-xl sm:rounded-2xl border border-slate-200/80 bg-white overflow-hidden flex flex-col shadow-xs">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-xs p-12">
            Loading observation records...
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center text-red-600 text-xs gap-2 p-12">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        ) : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs min-w-[700px]">
              <thead className="bg-slate-50/80 text-slate-600 font-semibold text-[11px] border-b border-slate-200">
                <tr>
                  <th className="px-3.5 sm:px-4 py-3">Event ID</th>
                  <th className="px-3.5 sm:px-4 py-3">Coordinates</th>
                  <th className="px-3.5 sm:px-4 py-3">FRP / Temp</th>
                  <th className="px-3.5 sm:px-4 py-3">Nearest Facility</th>
                  <th className="px-3.5 sm:px-4 py-3">Distance</th>
                  <th className="px-3.5 sm:px-4 py-3">Land Cover</th>
                  <th className="px-3.5 sm:px-4 py-3">Predicted Class</th>
                  <th className="px-3.5 sm:px-4 py-3">Risk Level</th>
                  <th className="px-3.5 sm:px-4 py-3">Persistence</th>
                  <th className="px-3.5 sm:px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filtered.map((item, idx) => {
                  const isCrit = item.classification.risk_score === "CRITICAL";
                  const isHigh = item.classification.risk_score === "HIGH";
                  const isMed = item.classification.risk_score === "MEDIUM";
                  return (
                    <tr
                      key={item.event.id ? `${item.event.id}-${idx}` : `hotspot-${idx}`}
                      className="hover:bg-blue-50/30 transition-colors"
                    >
                      <td
                        className="px-3.5 sm:px-4 py-3 font-mono text-blue-600 font-bold cursor-pointer hover:underline"
                        onClick={() => onSelectHotspot && onSelectHotspot(item)}
                      >
                        {item.event.id}
                      </td>
                      <td className="px-3.5 sm:px-4 py-3 font-mono text-slate-600">
                        {item.event.latitude.toFixed(4)}, {item.event.longitude.toFixed(4)}
                      </td>
                      <td className="px-3.5 sm:px-4 py-3 font-mono">
                        <span className="text-amber-700 font-semibold">{item.event.frp.toFixed(1)} MW</span>
                        <span className="text-slate-400 ml-1 text-[11px]">({item.event.brightness.toFixed(1)} K)</span>
                      </td>
                      <td className="px-3.5 sm:px-4 py-3 text-slate-700 font-medium truncate max-w-[180px]" title={item.geo_context.nearest_industrial_facility}>
                        {item.geo_context.nearest_industrial_facility}
                      </td>
                      <td className="px-3.5 sm:px-4 py-3 font-mono font-medium text-emerald-700">
                        {item.geo_context.distance_to_industry < 1000
                          ? `${Math.round(item.geo_context.distance_to_industry)} m`
                          : `${(item.geo_context.distance_to_industry / 1000).toFixed(2)} km`}
                      </td>
                      <td className="px-3.5 sm:px-4 py-3 text-slate-600 capitalize">
                        {item.geo_context.land_cover.replace("_", " ")}
                      </td>
                      <td className="px-3.5 sm:px-4 py-3">
                        <span className="text-slate-900 font-semibold">
                          {item.classification.predicted_class}
                        </span>
                      </td>
                      <td className="px-3.5 sm:px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${
                            isCrit
                              ? "bg-red-50 text-red-700 border-red-200"
                              : isHigh
                              ? "bg-orange-50 text-orange-700 border-orange-200"
                              : isMed
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          }`}
                        >
                          {item.classification.risk_score}
                        </span>
                      </td>
                      <td className="px-3.5 sm:px-4 py-3 text-slate-600">
                        {item.temporal_profile.is_persistent ? (
                          <span className="text-teal-700 font-medium bg-teal-50 px-2 py-0.5 rounded text-[11px] border border-teal-200">
                            Persistent ({item.temporal_profile.persistence_days}d)
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Transient (1d)</span>
                        )}
                      </td>
                      <td className="px-3.5 sm:px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onSelectHotspot && onSelectHotspot(item)}
                            title="Inspect Detailed Dossier"
                            className="p-1.5 rounded-lg bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-600 border border-slate-200 transition-colors cursor-pointer min-w-[32px] min-h-[32px] flex items-center justify-center"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onViewOnMap && onViewOnMap(item)}
                            title="View on Surveillance Map"
                            className="p-1.5 rounded-lg bg-slate-50 hover:bg-emerald-50 text-slate-600 hover:text-emerald-600 border border-slate-200 transition-colors cursor-pointer min-w-[32px] min-h-[32px] flex items-center justify-center"
                          >
                            <MapPin className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onOpenTimeline && onOpenTimeline(item)}
                            title="Temporal Timeline"
                            className="p-1.5 rounded-lg bg-slate-50 hover:bg-teal-50 text-slate-600 hover:text-teal-600 border border-slate-200 transition-colors cursor-pointer min-w-[32px] min-h-[32px] flex items-center justify-center"
                          >
                            <Clock className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
