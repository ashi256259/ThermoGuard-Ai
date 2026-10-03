import React from "react";
import { AlertTriangle, Clock, Factory, Database, Satellite } from "lucide-react";
import { StatisticsData } from "../types";

interface KpiMetricsProps {
  stats: StatisticsData | null;
  onOpenTotalHotspots?: () => void;
  onOpenHighCriticalRisk?: () => void;
  onOpenPersistentSources?: () => void;
  onOpenIndustrialFlares?: () => void;
  onOpenSourceTelemetry?: () => void;
  onFilterByRisk?: (risk: string) => void;
  onFilterByClass?: (cls: string) => void;
  onFilterByPersistent?: () => void;
}

export const KpiMetrics: React.FC<KpiMetricsProps> = ({
  stats,
  onOpenTotalHotspots,
  onOpenHighCriticalRisk,
  onOpenPersistentSources,
  onOpenIndustrialFlares,
  onOpenSourceTelemetry,
  onFilterByRisk,
  onFilterByClass,
  onFilterByPersistent,
}) => {
  if (!stats) {
    return (
      <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className={`h-24 sm:h-28 bg-white animate-pulse rounded-xl sm:rounded-2xl border border-slate-200 ${i === 4 ? "xs:col-span-2 md:col-span-1" : ""}`} />
        ))}
      </div>
    );
  }

  const industrialCount = stats.industrial_sources ?? ((stats.by_class?.["Gas Flare"] || 0) + (stats.by_class?.["Industrial Fire"] || 0));

  const handleCardKeyDown = (e: React.KeyboardEvent, callback?: () => void) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      callback?.();
    }
  };

  return (
    <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
      {/* 1. Total Hotspots */}
      <div 
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onOpenTotalHotspots?.();
        }}
        onKeyDown={(e) => handleCardKeyDown(e, onOpenTotalHotspots)}
        title="Open Hotspot Catalog (Live FIRMS Hotspots)"
        aria-label="Total Hotspots: Open Hotspot Catalog showing live FIRMS observations"
        className="bg-white border border-slate-200/80 hover:border-blue-300 hover:shadow-md hover:scale-[1.01] shadow-xs p-3.5 sm:p-4 lg:p-5 rounded-xl sm:rounded-2xl flex items-center gap-3 sm:gap-4 cursor-pointer transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500/30 group"
      >
        <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-blue-50 group-hover:bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 border border-blue-100 transition-colors">
          <Database className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate group-hover:text-blue-600 transition-colors">
            Total Hotspots
          </div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight leading-none my-0.5 sm:my-1">
            {stats.total_hotspots}
          </div>
          <div className="text-[11px] sm:text-xs text-slate-500 font-medium truncate flex items-center gap-1">
            <span>Live FIRMS Data</span>
            <span className="text-blue-600 text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity">View →</span>
          </div>
        </div>
      </div>

      {/* 2. High/Critical Risk */}
      <div 
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onOpenHighCriticalRisk?.();
        }}
        onKeyDown={(e) => handleCardKeyDown(e, onOpenHighCriticalRisk)}
        title="Open Incident Alerts (Filtered to High & Critical Events)"
        aria-label="High and Critical Risk: Open Incident Alerts filtered to High and Critical events"
        className="bg-white border border-slate-200/80 hover:border-red-300 hover:shadow-md hover:scale-[1.01] shadow-xs p-3.5 sm:p-4 lg:p-5 rounded-xl sm:rounded-2xl flex items-center gap-3 sm:gap-4 cursor-pointer transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-red-500/30 group"
      >
        <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-red-50 group-hover:bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0 border border-red-100 transition-colors">
          <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] sm:text-[11px] font-bold text-red-500 uppercase tracking-wider truncate">
            High / Critical Risk
          </div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight leading-none my-0.5 sm:my-1">
            {stats.high_risk_count}
          </div>
          <div className="text-[11px] sm:text-xs text-slate-500 font-medium truncate flex items-center gap-1">
            <span>Needs Attention</span>
            <span className="text-red-600 text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity">Alerts →</span>
          </div>
        </div>
      </div>

      {/* 3. Persistent Sources */}
      <div 
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onOpenPersistentSources?.();
        }}
        onKeyDown={(e) => handleCardKeyDown(e, onOpenPersistentSources)}
        title="Open Temporal Trends (Filtered to Persistent Sources)"
        aria-label="Persistent Sources: Open Temporal Trends filtered to persistent sources"
        className="bg-white border border-slate-200/80 hover:border-teal-300 hover:shadow-md hover:scale-[1.01] shadow-xs p-3.5 sm:p-4 lg:p-5 rounded-xl sm:rounded-2xl flex items-center gap-3 sm:gap-4 cursor-pointer transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-teal-500/30 group"
      >
        <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-teal-50 group-hover:bg-teal-100 text-teal-700 flex items-center justify-center flex-shrink-0 border border-teal-100 transition-colors">
          <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate group-hover:text-teal-700 transition-colors">
            Persistent Sources
          </div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight leading-none my-0.5 sm:my-1">
            {stats.persistent_sources}
          </div>
          <div className="text-[11px] sm:text-xs text-slate-500 font-medium truncate flex items-center gap-1">
            <span>Recurrent Site</span>
            <span className="text-teal-700 text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity">Trends →</span>
          </div>
        </div>
      </div>

      {/* 4. Industrial & Flares */}
      <div 
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onOpenIndustrialFlares?.();
        }}
        onKeyDown={(e) => handleCardKeyDown(e, onOpenIndustrialFlares)}
        title="Open Source Analysis (Filtered to Industrial & Flares)"
        aria-label="Industrial & Flares: Open Source Analysis filtered to Industrial and Flares"
        className="bg-white border border-slate-200/80 hover:border-blue-300 hover:shadow-md hover:scale-[1.01] shadow-xs p-3.5 sm:p-4 lg:p-5 rounded-xl sm:rounded-2xl flex items-center gap-3 sm:gap-4 cursor-pointer transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500/30 group"
      >
        <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-blue-50 group-hover:bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 border border-blue-100 transition-colors">
          <Factory className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate group-hover:text-blue-600 transition-colors">
            Industrial & Flares
          </div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight leading-none my-0.5 sm:my-1">
            {industrialCount}
          </div>
          <div className="text-[11px] sm:text-xs text-slate-500 font-medium truncate flex items-center gap-1">
            <span>Facility Proximity</span>
            <span className="text-blue-600 text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity">Analysis →</span>
          </div>
        </div>
      </div>

      {/* 5. NASA FIRMS Live */}
      <div 
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onOpenSourceTelemetry?.();
        }}
        onKeyDown={(e) => handleCardKeyDown(e, onOpenSourceTelemetry)}
        title="Open Source Telemetry & Provider Status (Live NASA FIRMS Connection)"
        aria-label="NASA FIRMS VIIRS NRT: Open Source Telemetry and Provider Status showing live connection"
        className="bg-white border border-slate-200/80 hover:border-emerald-300 hover:shadow-md hover:scale-[1.01] shadow-xs p-3.5 sm:p-4 lg:p-5 rounded-xl sm:rounded-2xl flex items-center gap-3 sm:gap-4 cursor-pointer transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 group xs:col-span-2 md:col-span-1"
      >
        <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-emerald-50 group-hover:bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0 border border-emerald-100 transition-colors">
          <Satellite className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate group-hover:text-emerald-600 transition-colors">
            NASA FIRMS
          </div>
          <div className="text-base sm:text-lg lg:text-xl font-bold text-emerald-600 tracking-tight leading-none my-0.5 sm:my-1 truncate flex items-center gap-1.5">
            <span>VIIRS NRT (Live)</span>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          </div>
          <div className="text-[11px] sm:text-xs text-slate-500 font-medium truncate flex items-center gap-1">
            <span>Real-time satellite</span>
            <span className="text-emerald-600 text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity">Status →</span>
          </div>
        </div>
      </div>

    </div>
  );
};
