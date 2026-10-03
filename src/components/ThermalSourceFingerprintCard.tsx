import React from "react";
import {
  Fingerprint,
  Clock,
  Activity,
  Calendar,
  Moon,
  Sun,
  Factory,
  Trees,
  Layers,
  Flame,
  AlertCircle,
  HelpCircle,
  ShieldAlert,
  Compass
} from "lucide-react";
import { ThermalSourceFingerprint, SmartAlertPriority } from "../types";
import { computeThermalFingerprint, computeSmartPriority } from "../utils/fingerprintPriority";

interface ThermalSourceFingerprintCardProps {
  hotspot: any;
  showPriorityBadge?: boolean;
  compact?: boolean;
}

export const ThermalSourceFingerprintCard: React.FC<ThermalSourceFingerprintCardProps> = ({
  hotspot,
  showPriorityBadge = true,
  compact = false
}) => {
  if (!hotspot) return null;

  // Use precomputed fingerprint/priority if available, or compute on-the-fly deterministically
  const fingerprint: ThermalSourceFingerprint =
    hotspot.fingerprint ||
    computeThermalFingerprint(
      hotspot.event,
      hotspot.geo_context,
      hotspot.temporal_profile,
      hotspot.classification
    );

  const priority: SmartAlertPriority =
    hotspot.priority ||
    computeSmartPriority(
      hotspot.event,
      hotspot.geo_context,
      hotspot.temporal_profile,
      hotspot.classification
    );

  // Persistence color mapping
  const getPersistenceBadge = (level: string) => {
    switch (level) {
      case "HIGH":
        return "bg-rose-500/15 text-rose-300 border-rose-500/30";
      case "MEDIUM":
        return "bg-amber-500/15 text-amber-300 border-amber-500/30";
      case "LOW":
        return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
      default:
        return "bg-slate-500/15 text-slate-400 border-slate-500/30";
    }
  };

  // Pattern color mapping
  const getPatternBadge = (pattern: string) => {
    switch (pattern) {
      case "Persistent":
        return "bg-rose-500/10 text-rose-400 border-rose-500/30";
      case "Recurrent":
        return "bg-amber-500/10 text-amber-400 border-amber-500/30";
      case "Episodic":
        return "bg-sky-500/10 text-sky-400 border-sky-500/30";
      case "Isolated":
        return "bg-slate-500/10 text-slate-400 border-slate-600/30";
      default:
        return "bg-slate-500/10 text-slate-400 border-slate-700/30";
    }
  };

  // Priority color
  const getPriorityColor = (level: string) => {
    switch (level) {
      case "CRITICAL":
        return "text-rose-400 border-rose-500/40 bg-rose-500/10";
      case "HIGH":
        return "text-amber-400 border-amber-500/40 bg-amber-500/10";
      case "MEDIUM":
        return "text-yellow-400 border-yellow-500/40 bg-yellow-500/10";
      default:
        return "text-emerald-400 border-emerald-500/40 bg-emerald-500/10";
    }
  };

  const isInsufficient = fingerprint.persistence_level === "INSUFFICIENT_DATA";

  return (
    <div
      id="thermal-source-fingerprint-card"
      className={`bg-slate-900/95 rounded-xl border border-slate-800 shadow-md ${
        compact ? "p-3 space-y-3" : "p-4 sm:p-5 space-y-4"
      }`}
    >
      {/* Header */}
      <div className={`flex flex-wrap items-start justify-between gap-2 border-b border-slate-800/80 ${compact ? "pb-2" : "pb-3"}`}>
        <div className="space-y-0.5">
          <div className="flex items-center space-x-2">
            <div className="p-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Fingerprint className={`${compact ? "w-3.5 h-3.5" : "w-4 h-4"}`} />
            </div>
            <h3 className={`${compact ? "text-xs" : "text-sm"} font-semibold tracking-wide text-slate-100 uppercase`}>
              Thermal Source Fingerprint
            </h3>
          </div>
          <p className={`${compact ? "text-[11px]" : "text-xs"} text-slate-400`}>
            Empirical behavioral & contextual signature derived from orbital passes and spatial zoning.
          </p>
        </div>

        {/* Pattern Tag */}
        <div className="flex items-center gap-1.5">
          <span
            className={`${compact ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1"} font-medium rounded-full border ${getPatternBadge(
              fingerprint.temporal_pattern
            )}`}
          >
            {fingerprint.summary_pattern}
          </span>

          {showPriorityBadge && priority && (
            <div
              className={`${compact ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1"} font-semibold rounded-full border flex items-center space-x-1 ${getPriorityColor(
                priority.level
              )}`}
              title={`Smart Priority Score: ${priority.score}/100 (${priority.level})`}
            >
              <ShieldAlert className={`${compact ? "w-3 h-3 mr-0.5" : "w-3.5 h-3.5 mr-1"}`} />
              <span>Priority {priority.score}/100</span>
              <span className="opacity-75 font-normal">({priority.level})</span>
            </div>
          )}
        </div>
      </div>

      {/* Metrics Grid */}
      <div className={`grid ${compact ? "grid-cols-2 gap-2" : "grid-cols-2 sm:grid-cols-3 gap-3"}`}>
        {/* Persistence */}
        <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-800/60">
          <div className="flex items-center space-x-1.5 text-xs text-slate-400 mb-1">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Persistence</span>
          </div>
          <div className="flex items-center space-x-2">
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded border ${getPersistenceBadge(
                fingerprint.persistence_level
              )}`}
            >
              {fingerprint.persistence}
            </span>
          </div>
        </div>

        {/* Recurrence */}
        <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-800/60">
          <div className="flex items-center space-x-1.5 text-xs text-slate-400 mb-1">
            <Activity className="w-3.5 h-3.5 text-slate-400" />
            <span>Recurrence</span>
          </div>
          <div className="text-xs font-medium text-slate-200 truncate" title={fingerprint.recurrence}>
            {fingerprint.recurrence}
          </div>
        </div>

        {/* Active Days */}
        <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-800/60">
          <div className="flex items-center space-x-1.5 text-xs text-slate-400 mb-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>Active Days</span>
          </div>
          <div className="text-xs font-medium text-slate-200">
            {typeof fingerprint.active_days === "number"
              ? `${fingerprint.active_days} active day${fingerprint.active_days === 1 ? "" : "s"}`
              : fingerprint.active_days}
          </div>
        </div>

        {/* Temporal Pattern */}
        <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-800/60">
          <div className="flex items-center space-x-1.5 text-xs text-slate-400 mb-1">
            <Activity className="w-3.5 h-3.5 text-slate-400" />
            <span>Temporal Pattern</span>
          </div>
          <div className="text-xs font-medium text-slate-200">
            {fingerprint.temporal_pattern}
          </div>
        </div>

        {/* Night Activity */}
        <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-800/60">
          <div className="flex items-center space-x-1.5 text-xs text-slate-400 mb-1">
            {fingerprint.night_activity.includes("Night") ? (
              <Moon className="w-3.5 h-3.5 text-indigo-400" />
            ) : (
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span>Night Activity</span>
          </div>
          <div className="text-xs font-medium text-slate-200 truncate" title={fingerprint.night_activity}>
            {fingerprint.night_activity}
          </div>
        </div>

        {/* Industrial Proximity */}
        <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-800/60">
          <div className="flex items-center space-x-1.5 text-xs text-slate-400 mb-1">
            <Factory className="w-3.5 h-3.5 text-slate-400" />
            <span>Industrial Proximity</span>
          </div>
          <div
            className="text-xs font-medium text-slate-200 truncate"
            title={fingerprint.industrial_proximity_label}
          >
            {fingerprint.industrial_proximity_label}
          </div>
        </div>

        {/* Land-Cover */}
        <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-800/60">
          <div className="flex items-center space-x-1.5 text-xs text-slate-400 mb-1">
            <Trees className="w-3.5 h-3.5 text-slate-400" />
            <span>Land Cover</span>
          </div>
          <div className="text-xs font-medium text-slate-200 truncate" title={fingerprint.land_cover}>
            {fingerprint.land_cover}
          </div>
        </div>

        {/* Cluster Density */}
        <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-800/60">
          <div className="flex items-center space-x-1.5 text-xs text-slate-400 mb-1">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span>Cluster Density</span>
          </div>
          <div className="text-xs font-medium text-slate-200 truncate" title={fingerprint.cluster_density}>
            {fingerprint.cluster_density}
          </div>
        </div>

        {/* Thermal Intensity */}
        <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-800/60">
          <div className="flex items-center space-x-1.5 text-xs text-slate-400 mb-1">
            <Flame className="w-3.5 h-3.5 text-rose-400" />
            <span>Thermal Intensity</span>
          </div>
          <div className="text-xs font-medium text-slate-200 truncate" title={fingerprint.thermal_intensity}>
            {fingerprint.thermal_intensity}
          </div>
        </div>
      </div>

      {/* Insufficient Data Warning Notice when applicable */}
      {isInsufficient && (
        <div className="flex items-center space-x-2 bg-slate-800/40 border border-slate-700/60 rounded-lg px-3 py-2 text-xs text-slate-300">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong>Insufficient temporal history:</strong> Hotspot has only 1 orbital observation or temporal data is pending subsequent satellite revisits.
          </span>
        </div>
      )}

      {/* Smart Priority Factors Summary (if available) */}
      {priority && priority.factors && priority.factors.length > 0 && (
        <div className="bg-slate-950/60 rounded-lg p-3 border border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              Contributing Priority Factors ({priority.score}/100 • {priority.level}):
            </span>
            <span className="text-[11px] text-slate-400">Deterministic Multi-Factor Scoring</span>
          </div>
          <ul className="text-xs text-slate-300 space-y-1 pl-4 list-disc marker:text-cyan-400">
            {priority.factors.map((factor, idx) => (
              <li key={idx} className="leading-relaxed">
                {factor}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
