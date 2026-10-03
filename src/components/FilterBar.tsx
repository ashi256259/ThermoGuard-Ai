import React from "react";
import { Filter, RotateCcw, MapPin, Sliders } from "lucide-react";

interface FilterBarProps {
  selectedClass: string;
  onSelectClass: (cls: string) => void;
  selectedRisk: string;
  onSelectRisk: (risk: string) => void;
  isPersistentOnly: boolean;
  onTogglePersistentOnly: () => void;
  minConfidence: number;
  onChangeMinConfidence: (conf: number) => void;
  selectedRegion: string;
  onSelectRegion: (regId: string) => void;
  onResetFilters: () => void;
  totalFilteredCount: number;
  totalCount: number;
}

const REGION_OPTIONS = [
  { id: "all_india", name: "All India Overview" },
  { id: "jamnagar_petro", name: "Gujarat Petro Corridor" },
  { id: "punjab_agri", name: "Punjab Agri Belt" },
  { id: "simlipal_forest", name: "Simlipal Forest Reserve" },
  { id: "korba_mining", name: "Korba Mining Basin" },
];

const CLASS_OPTIONS = [
  "All",
  "Industrial Fire",
  "Gas Flare",
  "Agricultural Burning",
  "Wildfire",
  "Mining",
  "Other"
];

const RISK_OPTIONS = ["All", "LOW", "MEDIUM", "HIGH", "CRITICAL"];

export const FilterBar: React.FC<FilterBarProps> = ({
  selectedClass,
  onSelectClass,
  selectedRisk,
  onSelectRisk,
  isPersistentOnly,
  onTogglePersistentOnly,
  minConfidence,
  onChangeMinConfidence,
  selectedRegion,
  onSelectRegion,
  onResetFilters,
  totalFilteredCount,
  totalCount,
}) => {
  return (
    <div className="bg-white border-b border-slate-200/80 px-4 lg:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-2xs">
      <div className="flex flex-wrap items-center gap-3">
        {/* Region Quick Selector */}
        <div className="flex items-center gap-1.5 text-slate-700 font-medium">
          <MapPin className="w-3.5 h-3.5 text-blue-600" />
          <span className="text-slate-500 text-xs">Region:</span>
          <select
            value={selectedRegion}
            onChange={(e) => onSelectRegion(e.target.value)}
            className="bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-900 px-3 py-1.5 rounded-xl focus:outline-none focus:bg-white focus:border-blue-500 font-semibold text-xs transition cursor-pointer"
          >
            {REGION_OPTIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div className="hidden md:block w-px h-5 bg-slate-200" />

        {/* Source Class Filter */}
        <div className="flex items-center gap-1.5 text-slate-700 font-medium">
          <span className="text-slate-500 text-xs">Class:</span>
          <select
            value={selectedClass}
            onChange={(e) => onSelectClass(e.target.value)}
            className="bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-900 px-3 py-1.5 rounded-xl focus:outline-none focus:bg-white focus:border-blue-500 font-semibold text-xs transition cursor-pointer"
          >
            {CLASS_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Risk Level Filter */}
        <div className="flex items-center gap-1.5 text-slate-700 font-medium">
          <span className="text-slate-500 text-xs">Risk:</span>
          <select
            value={selectedRisk}
            onChange={(e) => onSelectRisk(e.target.value)}
            className="bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-900 px-3 py-1.5 rounded-xl focus:outline-none focus:bg-white focus:border-blue-500 font-semibold text-xs transition cursor-pointer"
          >
            {RISK_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {/* Persistent Only Toggle */}
        <button
          onClick={onTogglePersistentOnly}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition text-xs font-semibold cursor-pointer ${
            isPersistentOnly
              ? "bg-blue-50 text-blue-700 border-blue-200 shadow-2xs"
              : "bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-100"
          }`}
        >
          <span>Persistent Only</span>
        </button>

        {/* Confidence Slider */}
        <div className="hidden lg:flex items-center gap-2 text-slate-600 text-xs font-medium">
          <Sliders className="w-3.5 h-3.5 text-slate-400" />
          <span>Min Conf:</span>
          <input
            type="range"
            min="0"
            max="100"
            value={minConfidence}
            onChange={(e) => onChangeMinConfidence(Number(e.target.value))}
            className="w-20 accent-blue-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
          />
          <span className="font-mono font-bold text-blue-700 w-8">{minConfidence}%</span>
        </div>
      </div>

      {/* Result Count and Reset Button */}
      <div className="flex items-center gap-3">
        <span className="text-slate-500 text-xs font-medium">
          Showing <strong className="text-slate-900 font-bold">{totalFilteredCount}</strong> of{" "}
          <span className="text-slate-600">{totalCount}</span> Hotspots
        </span>
        <button
          onClick={onResetFilters}
          className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold transition cursor-pointer shadow-2xs"
          title="Reset Filters to Default"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset</span>
        </button>
      </div>
    </div>
  );
};
