import React, { useState, useEffect } from "react";
import {
  X,
  Flame,
  Shield,
  Clock,
  Factory,
  Compass,
  FileText,
  AlertTriangle,
  Radio,
  Sliders,
  ChevronDown,
  ChevronUp,
  MapPin,
  CheckCircle2
} from "lucide-react";
import { HotspotRecord, HotspotIntelligence } from "../types";
import { TimelineChart } from "./TimelineChart";
import { Tooltip } from "./Tooltip";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { extractEvidenceArray } from "../utils/reportExporter";
import { AnalystVerificationCard } from "./AnalystVerificationCard";
import { ThermalSourceFingerprintCard } from "./ThermalSourceFingerprintCard";
import { IntelligenceReportModal } from "./IntelligenceReportModal";

interface DetailPanelProps {
  hotspot: HotspotRecord | null;
  onClose: () => void;
  onInspectDetails?: (hotspot: HotspotRecord) => void;
  onOpenTimeline?: (hotspot: HotspotRecord) => void;
  onVerificationUpdated?: (updatedHotspot: HotspotRecord) => void;
}

export const DetailPanel: React.FC<DetailPanelProps> = ({
  hotspot,
  onClose,
  onInspectDetails,
  onOpenTimeline,
  onVerificationUpdated
}) => {
  const [activeHotspot, setActiveHotspot] = useState<HotspotRecord | null>(hotspot);
  const [timelineData, setTimelineData] = useState<any[]>([]);
  const [intelligenceData, setIntelligenceData] = useState<HotspotIntelligence | null>(null);
  const [showTechnical, setShowTechnical] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setActiveHotspot(hotspot);
  }, [hotspot]);

  useEffect(() => {
    if (!hotspot) return;
    setLoading(true);
    setError(null);
    
    Promise.all([
      fetch(`/api/hotspots/${hotspot.event.id}/timeline`).then((res) => {
        if (!res.ok) throw new Error("Failed to load timeline");
        return res.json();
      }),
      fetch(`/api/hotspots/${hotspot.event.id}/intelligence`).then((res) => {
        if (!res.ok) throw new Error("Failed to load intelligence");
        return res.json();
      })
    ]).then(([timelineData, intelData]) => {
      if (timelineData?.observation_history) {
        setTimelineData(timelineData.observation_history);
      }
      if (intelData) {
        setIntelligenceData(intelData);
      }
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setError("Partial data loaded. Some telemetry might be missing.");
      setLoading(false);
    });
  }, [hotspot?.event.id]);

  if (!hotspot) {
    return (
      <aside className="w-full h-full bg-white p-6 flex flex-col items-center justify-center text-center text-slate-500 z-20">
        <Compass className="w-10 h-10 text-slate-400 mb-3 animate-spin-slow" />
        <p className="text-sm font-semibold text-slate-700">No Thermal Event Selected</p>
        <p className="text-xs text-slate-400 mt-1 max-w-xs">
          Click any event marker on the map to inspect live satellite telemetry, ML classification, and geospatial risk.
        </p>
      </aside>
    );
  }

  const currentItem = activeHotspot || hotspot;
  const { event, geo_context, temporal_profile, classification } = currentItem;
  const intel = intelligenceData || currentItem.intelligence;
  
  const riskLevel = intel?.risk?.level || classification.risk_score || "LOW";

  const getRiskBadgeColor = (risk: string) => {
    switch (risk) {
      case "CRITICAL": return "bg-red-50 text-red-700 border-red-200";
      case "HIGH": return "bg-orange-50 text-orange-700 border-orange-200";
      case "MEDIUM": return "bg-amber-50 text-amber-700 border-amber-200";
      default: return "bg-emerald-50 text-emerald-700 border-emerald-200";
    }
  };

  const getClassBadgeColor = (cls: string) => {
    switch (cls) {
      case "Industrial Fire": return "text-red-700 bg-red-50 border-red-200";
      case "Gas Flare": return "text-blue-700 bg-blue-50 border-blue-200";
      case "Wildfire": return "text-emerald-700 bg-emerald-50 border-emerald-200";
      case "Mining": return "text-indigo-700 bg-indigo-50 border-indigo-200";
      case "Agricultural Burning": return "text-amber-700 bg-amber-50 border-amber-200";
      case "ML_UNAVAILABLE": return "text-amber-800 bg-amber-50 border-amber-300";
      default: return "text-slate-700 bg-slate-50 border-slate-200";
    }
  };

  return (
    <aside className="w-full flex-1 flex flex-col h-full min-h-0 overflow-y-auto text-slate-700 z-20">
      {/* 1. HEADER */}
      <div className="p-4 bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
              SELECTED THERMAL EVENT
            </div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-900 font-mono">
                {event.id}
              </h2>
              {loading && (
                <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 font-medium">
                  Syncing...
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
            title="Close panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Subtle Badges */}
        <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            LIVE NASA FIRMS VIIRS NRT
          </span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${getRiskBadgeColor(riskLevel)}`}>
            {riskLevel} RISK
          </span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${getClassBadgeColor(classification.predicted_class)}`}>
            AI: {classification.predicted_class}
          </span>
          {classification.verification_status && classification.verification_status !== "UNVERIFIED" && (
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
              classification.verification_status === "CONFIRMED"
                ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                : classification.verification_status === "RECLASSIFIED"
                ? "bg-purple-50 text-purple-800 border-purple-300"
                : "bg-amber-50 text-amber-800 border-amber-300"
            }`}>
              {classification.verification_status === "CONFIRMED" && `VERIFIED: ${classification.verified_class || classification.predicted_class}`}
              {classification.verification_status === "RECLASSIFIED" && `RECLASSIFIED: ${classification.verified_class}`}
              {classification.verification_status === "NEEDS_REVIEW" && "REVIEW FLAGGED"}
            </span>
          )}
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-50 text-slate-700 border border-slate-200">
            {(classification.confidence * 100).toFixed(1)}% Conf
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-50 text-slate-500 border border-slate-200">
            RF Model
          </span>
        </div>
      </div>

      {error && (
        <div className="m-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-amber-800 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
          <span>{error}</span>
        </div>
      )}

      <div className="p-4 space-y-4">
        {/* PRIORITY 6: HUMAN VERIFICATION & ANALYST REVIEW */}
        <AnalystVerificationCard
          hotspot={currentItem}
          onVerificationUpdated={(updated) => {
            setActiveHotspot(updated);
            if (onVerificationUpdated) {
              onVerificationUpdated(updated);
            }
          }}
          compact={true}
        />

        {/* THERMAL SOURCE FINGERPRINT & SMART PRIORITIZATION */}
        <ThermalSourceFingerprintCard hotspot={currentItem} compact={true} />

        {/* OVERVIEW */}
        <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3.5 space-y-2.5">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-red-500" />
              OVERVIEW
            </span>
            <span className="text-[10px] text-slate-400 font-mono">VIIRS NRT</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white p-2.5 rounded-lg border border-slate-200/70">
              <div className="text-[10px] text-slate-400 font-medium">FRP</div>
              <div className="text-sm font-bold text-slate-900 font-mono mt-0.5">
                {event.frp.toFixed(1)} MW
              </div>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-slate-200/70">
              <div className="text-[10px] text-slate-400 font-medium">Brightness</div>
              <div className="text-sm font-bold text-slate-900 font-mono mt-0.5">
                {event.brightness.toFixed(1)} K
              </div>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-slate-200/70">
              <div className="text-[10px] text-slate-400 font-medium">Sensor</div>
              <div className="text-xs font-semibold text-slate-800 mt-0.5 truncate">
                {event.satellite || "VIIRS (Suomi-NPP)"}
              </div>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-slate-200/70">
              <div className="text-[10px] text-slate-400 font-medium">Timestamp</div>
              <div className="text-xs font-mono font-medium text-slate-800 mt-0.5 truncate">
                {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
            </div>
          </div>
        </div>

        {/* LOCATION */}
        <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3.5 space-y-2">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-blue-600" />
            LOCATION
          </div>
          <div className="bg-white p-2.5 rounded-lg border border-slate-200/70 flex items-center justify-between font-mono text-xs">
            <span className="text-slate-500">Coordinates:</span>
            <span className="font-bold text-slate-900">
              {event.latitude.toFixed(4)}° N, {event.longitude.toFixed(4)}° E
            </span>
          </div>
        </div>

        {/* CONTEXT */}
        <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3.5 space-y-2.5">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Factory className="w-3.5 h-3.5 text-orange-500" />
            CONTEXT
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="bg-white p-2.5 rounded-lg border border-slate-200/70 flex items-center justify-between">
              <span className="text-slate-500">Industrial Facility:</span>
              <span className="font-semibold text-slate-900 text-right max-w-[190px] truncate" title={geo_context.nearest_industrial_facility}>
                {geo_context.nearest_industrial_facility || "None registered within radius"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200/70">
                <span className="text-[10px] text-slate-400 block">Distance to Facility</span>
                <span className="font-mono font-bold text-slate-900 mt-0.5 block">
                  {geo_context.distance_to_industry < 1000
                    ? `${Math.round(geo_context.distance_to_industry)} m`
                    : `${(geo_context.distance_to_industry / 1000).toFixed(1)} km`}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200/70">
                <span className="text-[10px] text-slate-400 block">Land Cover</span>
                <span className="font-medium text-slate-900 capitalize mt-0.5 block truncate">
                  {(geo_context.land_cover || "industrial").replace("_", " ")}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* TEMPORAL */}
        <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3.5 space-y-2.5">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-teal-600" />
            TEMPORAL
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-white p-2 rounded-lg border border-slate-200/70">
              <span className="text-[10px] text-slate-400 block">Persistence</span>
              <span className={`font-bold mt-0.5 block text-[11px] ${temporal_profile.is_persistent ? "text-teal-700" : "text-amber-700"}`}>
                {temporal_profile.is_persistent ? "PERSISTENT" : "TRANSIENT"}
              </span>
            </div>
            <div className="bg-white p-2 rounded-lg border border-slate-200/70">
              <span className="text-[10px] text-slate-400 block">Observations</span>
              <span className="font-bold text-slate-900 mt-0.5 block text-[11px]">
                {temporal_profile.observation_count}
              </span>
            </div>
            <div className="bg-white p-2 rounded-lg border border-slate-200/70">
              <span className="text-[10px] text-slate-400 block">Active Duration</span>
              <span className="font-bold text-slate-900 mt-0.5 block text-[11px]">
                {temporal_profile.persistence_days} days
              </span>
            </div>
          </div>

          <div className="pt-1">
            <TimelineChart observations={timelineData} />
          </div>
        </div>

        {/* EVIDENCE */}
        <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3.5 space-y-2">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            EVIDENCE
          </div>
          <div className="space-y-1.5">
            {(() => {
              const evList = extractEvidenceArray(classification?.evidence || (classification as any)?.structured_evidence);
              return evList.length > 0 ? (
                evList.map((ev, i) => (
                  <div key={i} className="text-slate-700 text-xs flex items-start gap-2 bg-white p-2 rounded-lg border border-slate-200/70 leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                    <span>{ev}</span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-400 bg-white p-2 rounded-lg border border-slate-200/70 italic">
                  Baseline thermal signature confirmed by Random Forest inference.
                </div>
              );
            })()}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-1 flex flex-col gap-2">
          <button
            id="btn-detail-panel-view-intelligence-report"
            onClick={() => setIsReportModalOpen(true)}
            className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer min-h-[44px]"
          >
            <ShieldCheck className="w-4 h-4 text-blue-100" />
            <span>View Intelligence Report</span>
          </button>

          {onInspectDetails && (
            <button
              onClick={() => onInspectDetails(hotspot)}
              className="w-full py-2.5 px-3 rounded-xl bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center justify-center gap-2 border border-slate-200 shadow-xs transition-all cursor-pointer min-h-[44px]"
            >
              <span>Detailed Telemetry Dossier</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
          {onOpenTimeline && (
            <button
              onClick={() => onOpenTimeline(hotspot)}
              className="w-full py-2.5 px-3 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-2 border border-slate-200 shadow-xs transition-all cursor-pointer min-h-[44px]"
            >
              <Clock className="w-3.5 h-3.5 text-teal-600" />
              <span>Revisit Timeline</span>
            </button>
          )}
        </div>
      </div>

      {/* Evidence & Intelligence Report Modal */}
      <IntelligenceReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        hotspot={activeHotspot}
      />
    </aside>
  );
};
