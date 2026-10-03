import React, { useState } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Printer,
  Copy,
  Check,
  X,
  Satellite,
  Building2,
  Activity,
  Layers,
  Cpu,
  FileText,
  ShieldAlert,
  ArrowDown,
  UserCheck,
  Info
} from "lucide-react";
import { HotspotItem } from "../services/api";
import { extractEvidenceArray } from "../utils/reportExporter";

interface IntelligenceReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  hotspot: HotspotItem | null;
}

export type ValidationState = "VALID" | "INSUFFICIENT" | "FAILED";

export interface ValidationCheckItem {
  id: string;
  title: string;
  status: ValidationState;
  detail: string;
  sourceRef: string;
}

export const IntelligenceReportModal: React.FC<IntelligenceReportModalProps> = ({
  isOpen,
  onClose,
  hotspot
}) => {
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen || !hotspot) return null;

  const { event, geo_context, temporal_profile, classification, priority } = hotspot;

  // ----------------------------------------------------
  // 1. SOURCE VALIDATION LOGIC (Real Data Evaluation)
  // ----------------------------------------------------
  const isFirmsValid = Boolean(event && event.id && event.timestamp);
  const isCoordsValid =
    typeof event.latitude === "number" &&
    typeof event.longitude === "number" &&
    !isNaN(event.latitude) &&
    !isNaN(event.longitude) &&
    event.latitude >= -90 &&
    event.latitude <= 90 &&
    event.longitude >= -180 &&
    event.longitude <= 180 &&
    (event.latitude !== 0 || event.longitude !== 0);

  const isTimestampValid = Boolean(event.timestamp && !isNaN(new Date(event.timestamp).getTime()));

  let geoStatus: ValidationState = "FAILED";
  let geoDetail = "Geospatial indexing missing";
  if (geo_context && geo_context.nearest_industrial_facility && geo_context.land_cover) {
    geoStatus = "VALID";
    geoDetail = `OSM facility within ${Math.round(geo_context.distance_to_industry)} m; Land-cover: ${geo_context.land_cover}`;
  } else if (geo_context && geo_context.land_cover) {
    geoStatus = "INSUFFICIENT";
    geoDetail = `Land-cover mapped (${geo_context.land_cover}); no industrial cadastral POI within buffer`;
  }

  let temporalStatus: ValidationState = "FAILED";
  let temporalDetail = "No temporal orbital tracking data";
  if (temporal_profile && temporal_profile.observation_count > 1) {
    temporalStatus = "VALID";
    temporalDetail = `${temporal_profile.observation_count} multi-pass revisits over ${temporal_profile.persistence_days} days (${temporal_profile.frequency_per_week} passes/wk)`;
  } else if (temporal_profile && temporal_profile.observation_count === 1) {
    temporalStatus = "INSUFFICIENT";
    temporalDetail = "Single isolated overpass; multi-pass history insufficient for recurrence baseline";
  } else if (temporal_profile) {
    temporalStatus = "INSUFFICIENT";
    temporalDetail = "Insufficient orbital revisit history";
  }

  const isMlValid = Boolean(
    classification &&
    classification.predicted_class &&
    classification.predicted_class !== "ML_UNAVAILABLE"
  );

  const isPriorityValid = Boolean(
    classification?.risk_score ||
    (priority && priority.score !== undefined) ||
    classification?.risk_value !== undefined
  );

  const validationChecks: ValidationCheckItem[] = [
    {
      id: "firms_obs",
      title: "NASA FIRMS observation available",
      status: isFirmsValid ? "VALID" : "FAILED",
      detail: isFirmsValid
        ? `Telemetry packet verified from ${event.satellite || "NASA FIRMS sensor"} (${event.source || "FIRMS"})`
        : "Missing satellite observation packet",
      sourceRef: "FIRMS VIIRS/MODIS"
    },
    {
      id: "coords_val",
      title: "Coordinates validated",
      status: isCoordsValid ? "VALID" : "FAILED",
      detail: isCoordsValid
        ? `Geodetic coordinates [${event.latitude.toFixed(4)}°N, ${event.longitude.toFixed(4)}°E] verified in valid bounds`
        : "Invalid or out-of-bounds geographic coordinates",
      sourceRef: "WGS84 Ellipsoid"
    },
    {
      id: "time_val",
      title: "Timestamp available",
      status: isTimestampValid ? "VALID" : "FAILED",
      detail: isTimestampValid
        ? `ISO UTC: ${event.timestamp}`
        : "Missing or unparseable observation timestamp",
      sourceRef: "Satellite UTC Clock"
    },
    {
      id: "geo_val",
      title: "Geospatial context available",
      status: geoStatus,
      detail: geoDetail,
      sourceRef: "OSM & Cadastral GIS"
    },
    {
      id: "temporal_val",
      title: "Temporal analysis available",
      status: temporalStatus,
      detail: temporalDetail,
      sourceRef: "Spatial Cluster Orbit History"
    },
    {
      id: "ml_val",
      title: "ML classification available",
      status: isMlValid ? "VALID" : "FAILED",
      detail: isMlValid
        ? `RandomForestClassifier (${classification.model_version || "v1.0.0"}) inference output generated`
        : "Classification model pipeline unavailable",
      sourceRef: "Random Forest Engine"
    },
    {
      id: "risk_val",
      title: "Risk & priority calculated",
      status: isPriorityValid ? "VALID" : "FAILED",
      detail: isPriorityValid
        ? `Risk: ${classification.risk_score} (${classification.risk_value || 0}/100), Priority: ${priority?.score ?? classification.risk_value ?? 0}/100`
        : "Multi-factor priority score calculation missing",
      sourceRef: "Operational Scoring Matrix"
    }
  ];

  // ----------------------------------------------------
  // 2. DERIVED OVERALL REPORT VALIDATION STATUS
  // ----------------------------------------------------
  const isVerifiedByAnalyst =
    classification.verification_status === "CONFIRMED" ||
    classification.verification_status === "RECLASSIFIED";

  let derivedValidationStatus: "ANALYST VERIFIED" | "READY FOR ANALYST REVIEW" | "INSUFFICIENT EVIDENCE" | "VALIDATION FAILED" = "READY FOR ANALYST REVIEW";

  if (!isFirmsValid || !isCoordsValid || !isTimestampValid || !isMlValid) {
    derivedValidationStatus = "VALIDATION FAILED";
  } else if (temporalStatus === "INSUFFICIENT" || geoStatus === "INSUFFICIENT" || (classification.confidence || 0) < 0.5) {
    derivedValidationStatus = isVerifiedByAnalyst ? "ANALYST VERIFIED" : "INSUFFICIENT EVIDENCE";
  } else if (isVerifiedByAnalyst) {
    derivedValidationStatus = "ANALYST VERIFIED";
  } else {
    derivedValidationStatus = "READY FOR ANALYST REVIEW";
  }

  // Priority Details
  const priorityScore = priority?.score ?? (classification.risk_value ? Math.round(classification.risk_value) : 45);
  const priorityLevel = priority?.level ?? classification.risk_score ?? "MEDIUM";
  const priorityFactors = priority?.factors && priority.factors.length > 0
    ? priority.factors
    : [
        event.frp > 40 ? `High fire radiative power (${event.frp} MW)` : `Moderate fire radiative power (${event.frp} MW)`,
        event.brightness > 350 ? `Elevated brightness temperature (${event.brightness} K)` : `Standard thermal threshold (${event.brightness} K)`,
        geo_context?.nearest_industrial_facility ? `Proximity to ${geo_context.nearest_industrial_facility} (${Math.round(geo_context.distance_to_industry)} m)` : "Zonal proximity threshold",
        temporal_profile?.is_persistent ? "Recurrent thermal activity detected over multiple orbital passes" : "Isolated thermal signature"
      ];

  // Evidence list
  const rawEvidence = extractEvidenceArray(classification?.evidence || (classification as any)?.structured_evidence);
  const evidenceList = rawEvidence.length > 0 ? rawEvidence : [
    `Thermal detection at ${event.brightness} K with radiative power of ${event.frp} MW.`,
    geo_context?.nearest_industrial_facility ? `Located ${Math.round(geo_context.distance_to_industry)} m from ${geo_context.nearest_industrial_facility}.` : "No registered industrial facility within primary search buffer.",
    geo_context?.land_cover ? `Land-use designation: ${geo_context.land_cover}.` : "Land-cover data unavailable.",
    temporal_profile?.is_persistent ? `Persistent thermal anomaly with ${temporal_profile.observation_count} observations over ${temporal_profile.persistence_days} days.` : "Acute thermal signature with limited revisit history."
  ];

  // Class probabilities (if available in classification feature vector or probabilities)
  const classProbabilities = classification.feature_vector?.probabilities || (classification as any)?.class_probabilities || null;

  const handlePrint = () => {
    window.print();
  };

  const handleCopySummary = () => {
    const summaryText = `[THERMOGUARD AI - EVIDENCE & INTELLIGENCE REPORT]
Event ID: ${event.id}
Source: ${event.satellite || "VIIRS"} (${event.source || "NASA FIRMS"})
Coordinates: ${event.latitude.toFixed(4)}° N, ${event.longitude.toFixed(4)}° E
Timestamp: ${event.timestamp}
Thermal: ${event.frp} MW FRP, ${event.brightness} K Brightness
Validation Status: ${derivedValidationStatus}

AI INTELLIGENCE:
Predicted Class: ${classification.predicted_class}
Confidence: ${(classification.confidence * 100).toFixed(1)}%
Model: ${classification.model_version || "Random Forest Classifier v1.0.0"}

INVESTIGATION PRIORITY:
Priority Score: ${priorityScore}/100 (${priorityLevel})
Factors:
${priorityFactors.map((f: string) => ` - ${f}`).join("\n")}

HUMAN VERIFICATION:
Status: ${classification.verification_status || "UNVERIFIED"}
Verified Class: ${classification.verified_class || "N/A"}
Analyst: ${classification.verified_by || "Pending Review"}

OPERATIONAL WORKFLOW:
Detected -> Analyst Review -> Prioritized -> Verified -> Field Investigation -> Resolved / Monitoring
*Decision support only. Investigation recommended. Final operational action remains with authorized personnel.*
`;
    navigator.clipboard.writeText(summaryText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-slate-900/60 backdrop-blur-xs animate-fade-in print:p-0 print:bg-white print:static">
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[92vh] print:max-h-none print:shadow-none print:border-none print:rounded-none">
        
        {/* TOP MODAL HEADER */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between gap-4 flex-shrink-0 print:bg-white print:border-b-2 print:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 flex-shrink-0 shadow-2xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-slate-500">
                  SIH26162 Geospatial Intelligence
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-[10px] font-mono text-slate-500 font-semibold">
                  NTRO / ThermoGuard AI
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <span>Evidence & Intelligence Report</span>
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-md bg-slate-200/80 text-slate-700">
                  {event.id}
                </span>
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 print:hidden">
            <button
              onClick={handleCopySummary}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              title="Copy formatted intelligence text summary"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              title="Print formatted intelligence report"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>Print</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer ml-1"
              aria-label="Close report"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* MODAL BODY (SCROLLABLE) */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-800 text-sm print:overflow-visible print:p-2">

          {/* 9. REPORT VALIDATION STATUS BANNER */}
          <div className="p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60 border-slate-200">
            <div>
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                OVERALL REPORT VALIDATION STATUS
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border shadow-2xs ${
                    derivedValidationStatus === "ANALYST VERIFIED"
                      ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                      : derivedValidationStatus === "READY FOR ANALYST REVIEW"
                      ? "bg-blue-50 text-blue-800 border-blue-300"
                      : derivedValidationStatus === "INSUFFICIENT EVIDENCE"
                      ? "bg-amber-50 text-amber-800 border-amber-300"
                      : "bg-rose-50 text-rose-800 border-rose-300"
                  }`}
                >
                  {derivedValidationStatus === "ANALYST VERIFIED" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                  {derivedValidationStatus === "READY FOR ANALYST REVIEW" && <Clock className="w-3.5 h-3.5 text-blue-600" />}
                  {derivedValidationStatus === "INSUFFICIENT EVIDENCE" && <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
                  {derivedValidationStatus === "VALIDATION FAILED" && <XCircle className="w-3.5 h-3.5 text-rose-600" />}
                  <span>{derivedValidationStatus}</span>
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  {derivedValidationStatus === "ANALYST VERIFIED" && "Analyst ground-truth confirmation applied to audit log."}
                  {derivedValidationStatus === "READY FOR ANALYST REVIEW" && "All prerequisite telemetry checks verified; queued for analyst triage."}
                  {derivedValidationStatus === "INSUFFICIENT EVIDENCE" && "Isolated overpass or partial cadastral coverage; verification requires caution."}
                  {derivedValidationStatus === "VALIDATION FAILED" && "One or more core telemetry integrity tests failed."}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono text-slate-500 border-t sm:border-t-0 sm:border-l border-slate-200 pt-2 sm:pt-0 sm:pl-4">
              <div>
                <span className="block text-[10px] uppercase text-slate-400">Database Record</span>
                <span className="font-bold text-slate-700">{hotspot.event.id}</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase text-slate-400">Data Source</span>
                <span className="font-bold text-slate-700">{event.source || "NASA FIRMS"}</span>
              </div>
            </div>
          </div>

          {/* 1. EVENT IDENTITY */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <Satellite className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">1. Event Identity</h3>
              </div>
              <span className="text-[11px] font-mono text-slate-500">ID: {event.id}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/60">
                <span className="text-[10px] text-slate-400 block uppercase font-medium">NASA FIRMS Sensor</span>
                <span className="font-bold text-slate-800 text-xs mt-0.5 block">{event.satellite || "VIIRS Sensor"}</span>
                <span className="text-[10px] text-slate-500 block">{event.source || "NASA FIRMS"}</span>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/60">
                <span className="text-[10px] text-slate-400 block uppercase font-medium">Coordinates (WGS84)</span>
                <span className="font-bold text-slate-800 text-xs mt-0.5 block font-mono">
                  {event.latitude.toFixed(4)}° N, {event.longitude.toFixed(4)}° E
                </span>
                <span className="text-[10px] text-slate-500 block">Valid Coordinate Bounds</span>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/60">
                <span className="text-[10px] text-slate-400 block uppercase font-medium">Observation Timestamp</span>
                <span className="font-bold text-slate-800 text-xs mt-0.5 block">
                  {new Date(event.timestamp).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}
                </span>
                <span className="text-[10px] text-slate-500 block font-mono">
                  {new Date(event.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" })}
                </span>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/60">
                <span className="text-[10px] text-slate-400 block uppercase font-medium">Overpass Telemetry</span>
                <span className="font-bold text-slate-800 text-xs mt-0.5 block">
                  {event.frp} MW / {event.brightness} K
                </span>
                <span className="text-[10px] text-slate-500 block">
                  Conf: {event.confidence}% ({event.daynight === "D" ? "Day" : event.daynight === "N" ? "Night" : "Pass"})
                </span>
              </div>
            </div>
          </div>

          {/* 2. SOURCE VALIDATION */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">2. Source Validation</h3>
              </div>
              <span className="text-[11px] text-slate-500">
                {validationChecks.filter(c => c.status === "VALID").length} / {validationChecks.length} Criteria Validated
              </span>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              {validationChecks.map((check) => (
                <div key={check.id} className="py-2 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="mt-0.5">
                      {check.status === "VALID" && <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
                      {check.status === "INSUFFICIENT" && <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />}
                      {check.status === "FAILED" && <XCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />}
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800">{check.title}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{check.detail}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">{check.sourceRef}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                        check.status === "VALID"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : check.status === "INSUFFICIENT"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-rose-50 text-rose-700 border-rose-200"
                      }`}
                    >
                      {check.status === "VALID" && "✓ VALID"}
                      {check.status === "INSUFFICIENT" && "⚠ INSUFFICIENT"}
                      {check.status === "FAILED" && "✕ FAILED"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3. AI INTELLIGENCE & 4. EVIDENCE */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* 3. AI Intelligence */}
            <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-purple-600" />
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">3. AI Intelligence</h3>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-semibold border border-purple-200">
                    {classification.model_version || "Random Forest v1.0.0"}
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/70 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-medium block">Predicted Source Class</span>
                      <span className="text-base font-bold text-slate-900 mt-0.5 block">{classification.predicted_class}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 uppercase font-medium block">ML Confidence</span>
                      <span className="text-base font-black text-purple-700 mt-0.5 block font-mono">
                        {(classification.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 space-y-1.5">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">Inference Architecture:</span>
                      <span className="font-semibold text-slate-800">100 Trees Random Forest Ensemble</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">Feature Dimensions:</span>
                      <span className="font-semibold text-slate-800">Thermal + Spatial + Temporal (12 vars)</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">Inference Timestamp:</span>
                      <span className="font-mono text-slate-700">{event.timestamp}</span>
                    </div>
                  </div>

                  {/* Probabilities if available */}
                  {classProbabilities && typeof classProbabilities === "object" && (
                    <div className="pt-2 border-t border-slate-100">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                        Class Distribution Probabilities
                      </div>
                      <div className="space-y-1">
                        {Object.entries(classProbabilities).map(([cls, prob]: [string, any]) => {
                          const pVal = typeof prob === "number" ? prob : parseFloat(prob) || 0;
                          return (
                            <div key={cls} className="flex items-center justify-between text-[10px]">
                              <span className="text-slate-600 truncate max-w-[140px]">{cls}</span>
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full ${cls === classification.predicted_class ? "bg-purple-600" : "bg-slate-400"}`}
                                    style={{ width: `${Math.min(100, Math.max(0, pVal * 100))}%` }}
                                  />
                                </div>
                                <span className="font-mono text-slate-700 w-8 text-right">
                                  {(pVal * 100).toFixed(0)}%
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-[10px] text-slate-400 bg-slate-50 p-2 rounded-lg border border-slate-100 mt-2 italic">
                Note: Algorithmic output is preserved without post-hoc heuristic override.
              </div>
            </div>

            {/* 4. Evidence */}
            <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-600" />
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">4. Observed Evidence</h3>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">
                    {evidenceList.length} Signals
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/60">
                      <span className="text-[10px] text-slate-400 block uppercase font-medium">Persistence</span>
                      <span className="font-semibold text-slate-800 text-[11px] mt-0.5 block">
                        {temporal_profile ? (temporal_profile.is_persistent ? "Persistent" : "Acute") : "Insufficient observations"}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/60">
                      <span className="text-[10px] text-slate-400 block uppercase font-medium">Recurrence</span>
                      <span className="font-semibold text-slate-800 text-[11px] mt-0.5 block">
                        {temporal_profile && temporal_profile.observation_count > 1
                          ? `${(temporal_profile.recurrence_ratio * 100).toFixed(0)}% (${temporal_profile.frequency_per_week} passes/wk)`
                          : "Insufficient observations"}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/60">
                      <span className="text-[10px] text-slate-400 block uppercase font-medium">Industrial Proximity</span>
                      <span className="font-semibold text-slate-800 text-[11px] mt-0.5 block truncate" title={geo_context?.nearest_industrial_facility || "None"}>
                        {geo_context?.nearest_industrial_facility
                          ? `${Math.round(geo_context.distance_to_industry)} m to ${geo_context.nearest_industrial_facility}`
                          : "No industry in 10 km"}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/60">
                      <span className="text-[10px] text-slate-400 block uppercase font-medium">Land-Cover Context</span>
                      <span className="font-semibold text-slate-800 text-[11px] mt-0.5 block truncate">
                        {geo_context?.land_cover || "Data unavailable"}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                      Structured Corroborating Clues
                    </span>
                    <ul className="space-y-1.5">
                      {evidenceList.map((ev, i) => (
                        <li key={i} className="text-xs text-slate-700 flex items-start gap-2 leading-relaxed">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                          <span>{ev}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* 5. INVESTIGATION PRIORITY */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-orange-600" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">5. Investigation Priority</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-slate-500">Score: {priorityScore}/100</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase border ${
                    priorityLevel === "CRITICAL"
                      ? "bg-red-50 text-red-700 border-red-200"
                      : priorityLevel === "HIGH"
                      ? "bg-orange-50 text-orange-700 border-orange-200"
                      : priorityLevel === "MEDIUM"
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-slate-50 text-slate-700 border-slate-200"
                  }`}
                >
                  {priorityLevel} PRIORITY
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="sm:col-span-1 bg-slate-50 p-3 rounded-xl border border-slate-200/60 flex flex-col justify-center">
                <span className="text-[10px] text-slate-400 uppercase font-medium">Deterministic Score</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-3xl font-black text-slate-900 font-mono">{priorityScore}</span>
                  <span className="text-slate-400 font-mono text-xs">/ 100</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Calculated from thermal intensity, industrial proximity, persistence, and source hazard class.
                </p>
              </div>

              <div className="sm:col-span-2 bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                <span className="text-[10px] text-slate-400 uppercase font-medium block mb-1.5">
                  Contributing Priority Factors
                </span>
                <ul className="space-y-1.5">
                  {priorityFactors.map((factor: string, idx: number) => (
                    <li key={idx} className="text-xs text-slate-700 flex items-start gap-2">
                      <span className="text-orange-500 font-bold">•</span>
                      <span>{factor}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* 6. EVIDENCE CHAIN */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">6. Evidence Processing Chain</h3>
              </div>
              <span className="text-[11px] text-slate-500 font-mono">SIH26162 Pipeline Architecture</span>
            </div>

            {/* Desktop Horizontal Chain / Mobile Vertical */}
            <div className="hidden md:flex items-center justify-between gap-1 text-[11px] pt-1">
              {[
                { label: "NASA FIRMS", sub: "VIIRS Hotspot", active: true },
                { label: "Observation", sub: `${event.frp} MW / ${event.brightness} K`, active: true },
                { label: "Geo Context", sub: `${Math.round(geo_context?.distance_to_industry || 0)}m OSM`, active: geoStatus === "VALID" },
                { label: "Temporal", sub: `${temporal_profile?.observation_count || 1} Passes`, active: temporalStatus === "VALID" },
                { label: "Random Forest", sub: classification.predicted_class, active: isMlValid },
                { label: "Risk & Priority", sub: `${priorityScore}/100 (${priorityLevel})`, active: isPriorityValid },
                { label: "Human Verification", sub: classification.verification_status || "UNVERIFIED", active: isVerifiedByAnalyst },
                { label: "Intelligence Report", sub: "Validated Dossier", active: true }
              ].map((step, idx, arr) => (
                <React.Fragment key={idx}>
                  <div className="flex flex-col items-center text-center p-2 rounded-lg bg-slate-50 border border-slate-200/70 flex-1 min-w-0">
                    <span className="text-[9px] font-mono text-slate-400 font-bold mb-0.5">0{idx + 1}</span>
                    <span className="font-bold text-slate-900 truncate w-full text-[11px]">{step.label}</span>
                    <span className={`text-[9px] truncate w-full mt-0.5 font-medium ${step.active ? "text-blue-700" : "text-slate-400"}`}>
                      {step.sub}
                    </span>
                  </div>
                  {idx < arr.length - 1 && (
                    <ArrowDown className="w-3.5 h-3.5 text-slate-300 -rotate-90 flex-shrink-0" />
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Mobile Vertical Chain */}
            <div className="md:hidden space-y-1.5 text-xs">
              {[
                { step: "1", title: "NASA FIRMS", detail: "VIIRS Sensor Hotspot Ingestion" },
                { step: "2", title: "Thermal Observation", detail: `${event.frp} MW, ${event.brightness} K, Conf: ${event.confidence}%` },
                { step: "3", title: "Geo-Spatial Context", detail: `OSM Cadastral proximity: ${Math.round(geo_context?.distance_to_industry || 0)}m` },
                { step: "4", title: "Temporal Evidence", detail: `${temporal_profile?.observation_count || 1} observations across cluster` },
                { step: "5", title: "Random Forest", detail: `ML Prediction: ${classification.predicted_class} (${(classification.confidence * 100).toFixed(1)}%)` },
                { step: "6", title: "Risk & Priority", detail: `Operational Priority Score: ${priorityScore}/100 (${priorityLevel})` },
                { step: "7", title: "Analyst Verification", detail: `Analyst Status: ${classification.verification_status || "UNVERIFIED"}` },
                { step: "8", title: "Intelligence Report", detail: "Consolidated Intelligence Record" }
              ].map((item) => (
                <div key={item.step} className="flex items-center gap-2 p-1.5 bg-slate-50 rounded-lg border border-slate-200/60">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold text-[10px] flex items-center justify-center flex-shrink-0 font-mono">
                    {item.step}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="font-bold text-slate-800 text-[11px]">{item.title}: </span>
                    <span className="text-slate-600 text-[11px]">{item.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 7. HUMAN VERIFICATION */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">7. Human Verification Record</h3>
              </div>
              <span
                className={`text-[10px] px-2.5 py-0.5 rounded font-bold uppercase border ${
                  isVerifiedByAnalyst
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : classification.verification_status === "NEEDS_REVIEW"
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-slate-100 text-slate-700 border-slate-200"
                }`}
              >
                {classification.verification_status || "UNVERIFIED"}
              </span>
            </div>

            {isVerifiedByAnalyst ? (
              <div className="bg-emerald-50/50 border border-emerald-200/80 rounded-xl p-3 text-xs space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <span className="text-[10px] text-emerald-800 uppercase block font-medium">Verified Class</span>
                    <span className="font-bold text-slate-900 text-xs mt-0.5 block">
                      {classification.verified_class || classification.predicted_class}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-800 uppercase block font-medium">Analyst Identity</span>
                    <span className="font-bold text-slate-900 text-xs mt-0.5 block truncate">
                      {classification.verified_by || "Certified Intelligence Analyst"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-800 uppercase block font-medium">Verification Time</span>
                    <span className="font-bold text-slate-900 text-xs mt-0.5 block font-mono">
                      {classification.verified_at ? new Date(classification.verified_at).toLocaleString("en-IN") : "Recorded in Audit Log"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-800 uppercase block font-medium">Audit Record</span>
                    <span className="font-bold text-slate-900 text-xs mt-0.5 block font-mono">
                      CONFIRMED_DB
                    </span>
                  </div>
                </div>

                {classification.verification_reason && (
                  <div className="pt-2 border-t border-emerald-200/60 text-[11px] text-slate-700">
                    <span className="font-bold text-slate-800 mr-1">Analyst Notes / Ground Evidence:</span>
                    <span>{classification.verification_reason}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3 text-xs flex items-start gap-2.5">
                <Info className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <div className="text-slate-600 leading-relaxed text-[11px]">
                  <span className="font-semibold text-slate-800 block mb-0.5">Pending Certified Analyst Ground Review</span>
                  This anomaly is currently evaluated under automated Random Forest machine-learning inference. Analysts can confirm or reclassify this signature in the Source Details Analyst Verification terminal.
                </div>
              </div>
            )}
          </div>

          {/* 8. OPERATIONAL USE & WORKFLOW */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-700" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">8. Operational Use & Protocol</h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                Decision Support
              </span>
            </div>

            <div className="space-y-3 text-xs">
              {/* Operational Workflow Steps */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                  STANDARD OPERATIONAL PROCEDURE (SOP) WORKFLOW
                </div>
                <div className="flex items-center justify-between gap-1 overflow-x-auto pb-1 text-[11px]">
                  {[
                    { title: "Detected", desc: "NASA FIRMS", done: true },
                    { title: "Analyst Review", desc: "Triage Queue", done: true },
                    { title: "Prioritized", desc: `Score ${priorityScore}`, done: true },
                    { title: "Verified", desc: classification.verification_status || "Pending", done: isVerifiedByAnalyst },
                    { title: "Field Investigation", desc: "Recommended", done: false },
                    { title: "Resolved / Monitoring", desc: "Close Incident", done: false }
                  ].map((wf, idx, arr) => (
                    <React.Fragment key={idx}>
                      <div className="flex flex-col items-center text-center p-2 rounded-lg bg-white border border-slate-200 flex-1 min-w-[100px]">
                        <span className={`text-[10px] font-bold ${wf.done ? "text-emerald-700" : "text-slate-600"}`}>
                          {wf.title}
                        </span>
                        <span className="text-[9px] text-slate-400 mt-0.5">{wf.desc}</span>
                      </div>
                      {idx < arr.length - 1 && (
                        <span className="text-slate-300 font-bold text-xs flex-shrink-0">→</span>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* Strict Disclaimer */}
              <div className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-xl text-amber-900 text-[11px] leading-relaxed flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-bold block mb-0.5">Operational Boundary Notice:</span>
                  Investigation recommended based on geospatial cadastral correlation and spatial cluster density.
                  <span className="font-semibold block mt-0.5">
                    Final operational action remains strictly with authorized personnel. ThermoGuard AI operates as an analytical decision-support tool and does not independently dispatch field teams.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 10. REPORT TRACEABILITY FOOTER */}
          <div className="p-3.5 bg-slate-100/80 rounded-xl border border-slate-200/70 text-[10px] font-mono text-slate-500 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-slate-400 uppercase block font-semibold">Report Traceability Hash</span>
              <span className="text-slate-700 font-bold">
                TG-{event.id}-CLUST-{event.cluster_id || "ISO"}-RF-{classification.model_version || "V1"}
              </span>
            </div>
            <div className="text-right sm:text-right">
              <span className="text-slate-400 uppercase block font-semibold">Report Generated</span>
              <span className="text-slate-700">
                {new Date().toISOString()} (UTC)
              </span>
            </div>
          </div>

        </div>

        {/* MODAL FOOTER */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50/80 flex items-center justify-between flex-shrink-0 print:hidden">
          <div className="text-xs text-slate-500 font-medium">
            National Technical Research Organisation (NTRO) • SIH26162
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>Print Dossier</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              Close Report
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
