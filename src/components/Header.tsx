import React from "react";
import { Shield, Flame, AlertTriangle, Radio, Activity, Compass, Info } from "lucide-react";
import { StatisticsData } from "../types";

interface HeaderProps {
  stats: StatisticsData | null;
  onOpenAnalyze: () => void;
  onOpenScenarios: () => void;
  onOpenAbout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  stats,
  onOpenAnalyze,
  onOpenScenarios,
  onOpenAbout,
}) => {
  return (
    <header className="bg-white border-b border-slate-200/80 text-slate-800 px-4 lg:px-6 py-3 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-30 shadow-2xs">
      {/* Brand & Project Identity */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-2xs transition-transform hover:scale-105">
          <Flame className="w-5 h-5 fill-white/20" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 flex items-center gap-1.5">
              <span>THERMOGUARD</span>
              <span className="text-blue-600">AI</span>
            </h1>
            <span className="hidden md:inline-block text-[10px] text-slate-500 font-mono font-bold px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-full">
              SIH26162
            </span>
          </div>
          <p className="text-[10px] text-slate-500 tracking-wider font-semibold uppercase">
            NTRO Geospatial Intelligence Platform
          </p>
        </div>
      </div>

      {/* Center Operational Status */}
      <div className="hidden lg:flex items-center gap-3.5 text-xs font-mono bg-slate-50 px-3.5 py-1.5 rounded-xl border border-slate-200/80">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-emerald-700 font-bold uppercase tracking-wider text-[10px]">GIS PIPELINE NOMINAL</span>
        </div>
        <span className="text-slate-300">|</span>
        <div className="flex items-center gap-1.5 text-slate-600 text-xs">
          <Radio className="w-3.5 h-3.5 text-blue-600" />
          <span>DATA: <span className="text-slate-800 font-bold">CALIBRATED DEMO</span></span>
        </div>
        <span className="text-slate-300">|</span>
        <div className="flex items-center gap-1.5 text-slate-600 text-xs">
          <Activity className="w-3.5 h-3.5 text-blue-600" />
          <span>ML: <span className="text-blue-700 font-bold">RANDOM FOREST v1.2</span></span>
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={onOpenScenarios}
          className="flex items-center gap-1.5 text-xs font-semibold bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 px-3.5 py-2 rounded-xl transition cursor-pointer shadow-2xs"
          title="Explore 5 SIH Validation Scenarios"
        >
          <Compass className="w-4 h-4 text-blue-600" />
          <span>Scenarios</span>
        </button>

        <button
          onClick={onOpenAnalyze}
          className="flex items-center gap-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition shadow-xs cursor-pointer"
        >
          <Flame className="w-4 h-4" />
          <span>Analyze Hotspot</span>
        </button>

        <button
          onClick={onOpenAbout}
          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 bg-white border border-slate-200 rounded-xl transition cursor-pointer shadow-2xs"
          title="System Architecture & SIH Problem Statement"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
