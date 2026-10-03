import React, { useState } from "react";
import {
  Settings,
  Shield,
  User,
  Sliders,
  Bell,
  MapPin,
  Layers,
  Save,
  CheckCircle2,
  RefreshCw,
  Compass,
  Satellite
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

interface SettingsPageProps {
  onReturnToMap?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onReturnToMap }) => {
  const { user } = useAuth();
  const [mapStyle, setMapStyle] = useState<string>("carto_voyager");
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(30);
  const [minConfidenceFilter, setMinConfidenceFilter] = useState<number>(50);
  const [enableSoundAlerts, setEnableSoundAlerts] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Settings className="w-5 h-5 text-blue-600" />
            Account & Operational Preferences
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Configure surveillance workstation display, alert thresholds, and security profile
          </p>
        </div>
        {onReturnToMap && (
          <button
            onClick={onReturnToMap}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
          >
            <Compass className="w-3.5 h-3.5 text-blue-600" />
            Back to Map
          </button>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* User Identity Section */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 mb-4">
            <User className="w-4 h-4 text-blue-600" />
            Active Operator Profile
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/70">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Operator Name</span>
              <span className="text-xs font-semibold text-slate-900 block">{user?.name || "Dr. Vikram Sethi"}</span>
            </div>
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/70">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Official ID</span>
              <span className="text-xs font-semibold text-slate-900 font-mono block">{user?.id || "OP-NTRO-842"}</span>
            </div>
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/70">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Clearance Level</span>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                <Shield className="w-3 h-3" />
                {user?.role ? user.role.toUpperCase() : "OFFICER"} • Level 3
              </span>
            </div>
          </div>
        </div>

        {/* GIS & Cartography Preferences */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 mb-4">
            <Layers className="w-4 h-4 text-blue-600" />
            GIS & Basemap Cartography
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Default Basemap Layer
              </label>
              <select
                value={mapStyle}
                onChange={(e) => setMapStyle(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
              >
                <option value="carto_voyager">CartoDB Voyager (High Clarity Light)</option>
                <option value="osm_standard">OpenStreetMap Standard</option>
                <option value="esri_world_imagery">ESRI World Imagery (Satellite True-Color)</option>
              </select>
              <p className="text-[11px] text-slate-400 mt-1">High-contrast basemap recommended for industrial facility context.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Telemetry Refresh Interval
              </label>
              <select
                value={autoRefreshInterval}
                onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
              >
                <option value={15}>15 Seconds (High Priority Incident Watch)</option>
                <option value={30}>30 Seconds (Default Operational Cycle)</option>
                <option value={60}>60 Seconds (Standard Monitoring)</option>
                <option value={300}>5 Minutes (Bandwidth Saver)</option>
              </select>
              <p className="text-[11px] text-slate-400 mt-1">Controls polling frequency for backend FIRMS thermal events.</p>
            </div>
          </div>
        </div>

        {/* Operational Filter Defaults */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 mb-4">
            <Sliders className="w-4 h-4 text-blue-600" />
            Detection & ML Filter Thresholds
          </div>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Minimum Model Confidence Threshold
                </label>
                <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {minConfidenceFilter}%
                </span>
              </div>
              <input
                type="range"
                min={30}
                max={95}
                step={5}
                value={minConfidenceFilter}
                onChange={(e) => setMinConfidenceFilter(Number(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1">
                <span>30% (High Recall)</span>
                <span>65% (Balanced)</span>
                <span>95% (High Precision)</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-700 block">Critical Emergency Audio Tones</span>
                <span className="text-[11px] text-slate-400 block">Play audio chime when a CRITICAL industrial incident is classified</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableSoundAlerts}
                  onChange={(e) => setEnableSoundAlerts(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Save Bar */}
        <div className="flex items-center justify-between pt-2">
          <div>
            {saveSuccess && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 animate-fade-in">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Preferences updated successfully
              </span>
            )}
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            Save Preferences
          </button>
        </div>
      </form>
    </div>
  );
};
