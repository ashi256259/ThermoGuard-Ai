import React, { useState } from "react";
import {
  UserCheck,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Lock,
  ChevronDown,
  ChevronUp,
  Info,
  History,
  FileCheck
} from "lucide-react";
import { HotspotRecord, SourceClass, VerificationStatus } from "../types";
import { useAuth } from "../context/AuthContext";
import { apiService } from "../services/api";

const SOURCE_CLASSES: SourceClass[] = [
  "Industrial Fire",
  "Gas Flare",
  "Agricultural Burning",
  "Wildfire",
  "Mining",
  "Other"
];

interface AnalystVerificationCardProps {
  hotspot: HotspotRecord;
  onVerificationUpdated?: (updatedHotspot: HotspotRecord) => void;
  compact?: boolean;
}

export const AnalystVerificationCard: React.FC<AnalystVerificationCardProps> = ({
  hotspot,
  onVerificationUpdated,
  compact = false
}) => {
  const { user, canVerifyClassification } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Active form modes: null | "CONFIRM" | "RECLASSIFY" | "NEEDS_REVIEW"
  const [activeAction, setActiveAction] = useState<"CONFIRM" | "RECLASSIFY" | "NEEDS_REVIEW" | null>(null);
  const [selectedClass, setSelectedClass] = useState<SourceClass>(
    hotspot.classification.predicted_class || "Industrial Fire"
  );
  const [reasonText, setReasonText] = useState("");
  const [showAuditTrail, setShowAuditTrail] = useState(false);

  const classification = hotspot.classification;
  const currentStatus: VerificationStatus = classification.verification_status || "UNVERIFIED";
  const verifiedClass = classification.verified_class || null;
  const verifiedBy = classification.verified_by || null;
  const verifiedAt = classification.verified_at || null;
  const verificationReason = classification.verification_reason || null;
  const auditTrail = classification.verification_audit_trail || [];

  const handleOpenAction = (action: "CONFIRM" | "RECLASSIFY" | "NEEDS_REVIEW") => {
    setError(null);
    setSuccessMessage(null);
    setActiveAction(action);
    if (action === "CONFIRM") {
      setSelectedClass(classification.predicted_class);
      setReasonText("Confirmed by GIS Analyst review based on multi-source satellite telemetry and geospatial infrastructure context.");
    } else if (action === "RECLASSIFY") {
      // Pick first class different from predicted
      const otherClass = SOURCE_CLASSES.find((c) => c !== classification.predicted_class) || "Gas Flare";
      setSelectedClass(otherClass);
      setReasonText("");
    } else if (action === "NEEDS_REVIEW") {
      setReasonText("");
    }
  };

  const handleCancelAction = () => {
    setActiveAction(null);
    setError(null);
    setReasonText("");
  };

  const handleSubmitVerification = async () => {
    if (!activeAction) return;

    if (activeAction === "RECLASSIFY") {
      if (!selectedClass) {
        setError("Please select a verified source class.");
        return;
      }
      if (!reasonText || reasonText.trim().length < 3) {
        setError("Operational justification reason (min 3 characters) is required for reclassification.");
        return;
      }
    }

    if (activeAction === "NEEDS_REVIEW") {
      if (!reasonText || reasonText.trim().length < 3) {
        setError("A reason detailing why secondary review is needed is required.");
        return;
      }
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const payload = {
        status: activeAction === "CONFIRM" ? ("CONFIRMED" as const) : activeAction === "RECLASSIFY" ? ("RECLASSIFIED" as const) : ("NEEDS_REVIEW" as const),
        verified_class: activeAction === "CONFIRM" ? classification.predicted_class : (activeAction === "RECLASSIFY" ? selectedClass : undefined),
        reason: reasonText.trim()
      };

      const response = await apiService.verifyThermalEvent(hotspot.event.id, payload);

      if (response && response.hotspot) {
        setSuccessMessage(`Event classification updated: ${payload.status}`);
        setActiveAction(null);
        setReasonText("");
        if (onVerificationUpdated) {
          onVerificationUpdated(response.hotspot);
        }
      } else {
        // Fallback update in case response format varies
        const updatedHotspot: HotspotRecord = {
          ...hotspot,
          classification: {
            ...hotspot.classification,
            verification_status: payload.status,
            verified_class: payload.verified_class || null,
            verified_by: user ? `${user.name} (${user.badge_number || user.role})` : "GIS Analyst",
            verified_by_name: user?.name || "GIS Analyst",
            verified_at: new Date().toISOString(),
            verification_reason: payload.reason || null
          }
        };
        setSuccessMessage(`Classification updated to ${payload.status}`);
        setActiveAction(null);
        setReasonText("");
        if (onVerificationUpdated) {
          onVerificationUpdated(updatedHotspot);
        }
      }
    } catch (err: any) {
      console.error("Verification error:", err);
      setError(err.message || "Failed to record verification decision.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = () => {
    switch (currentStatus) {
      case "CONFIRMED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            HUMAN VERIFIED: CONFIRMED
          </span>
        );
      case "RECLASSIFIED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-300">
            <RefreshCw className="w-3.5 h-3.5 text-purple-600" />
            HUMAN VERIFIED: RECLASSIFIED
          </span>
        );
      case "NEEDS_REVIEW":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            SECONDARY REVIEW FLAGGED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            UNVERIFIED (AWAITING ANALYST)
          </span>
        );
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3.5">
      {/* 1. SECTION HEADER */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
              ANALYST VERIFICATION
            </h3>
            <p className="text-[10px] text-slate-500 font-medium">
              Decision Support • AI Recommends, Human Verifies
            </p>
          </div>
        </div>
        {getStatusBadge()}
      </div>

      {/* 2. AI PREDICTION SUMMARY vs HUMAN VERIFIED */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {/* Box A: AI Prediction (The automated recommendation) */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            <span>AI Automated Recommendation</span>
            <span className="font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
              {classification.model_version || "RandomForest"}
            </span>
          </div>
          <div className="text-sm font-bold text-slate-900 mt-1 flex items-baseline gap-2">
            <span>{classification.predicted_class}</span>
            <span className="text-xs font-mono font-semibold text-blue-600">
              {(classification.confidence * 100).toFixed(1)}% Conf
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 flex-wrap text-[10px] text-slate-600">
            <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-medium">
              Risk: {classification.risk_score}
            </span>
            <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-medium">
              Persistence: {hotspot.temporal_profile.is_persistent ? "Persistent" : "Transient"}
            </span>
          </div>
        </div>

        {/* Box B: Verified Classification (Human Authority Decision) */}
        <div className={`rounded-lg p-3 border ${
          currentStatus === "CONFIRMED"
            ? "bg-emerald-50/70 border-emerald-200"
            : currentStatus === "RECLASSIFIED"
            ? "bg-purple-50/70 border-purple-200"
            : currentStatus === "NEEDS_REVIEW"
            ? "bg-amber-50/70 border-amber-200"
            : "bg-slate-50 border-slate-200/80"
        }`}>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Verified Source Authority</span>
            <span className="text-[10px] font-mono text-slate-400">
              {verifiedAt ? new Date(verifiedAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : "Pending"}
            </span>
          </div>
          <div className="text-sm font-bold text-slate-900 mt-1">
            {currentStatus === "CONFIRMED" && (
              <span className="text-emerald-800">
                {verifiedClass || classification.predicted_class} (Confirmed)
              </span>
            )}
            {currentStatus === "RECLASSIFIED" && (
              <span className="text-purple-800">
                {verifiedClass} (Reclassified)
              </span>
            )}
            {currentStatus === "NEEDS_REVIEW" && (
              <span className="text-amber-800">
                Flagged for Multi-Agency Review
              </span>
            )}
            {currentStatus === "UNVERIFIED" && (
              <span className="text-slate-400 italic text-xs font-normal">
                Pending operational analyst review
              </span>
            )}
          </div>
          {verifiedBy && (
            <div className="mt-1.5 text-[11px] text-slate-600 font-medium truncate">
              Verified by: <span className="font-semibold text-slate-800">{verifiedBy}</span>
            </div>
          )}
        </div>
      </div>

      {/* 3. VERIFICATION REASON / JUSTIFICATION DISPLAY (if verified) */}
      {verificationReason && (
        <div className="bg-slate-50/90 border border-slate-200/70 rounded-lg p-2.5 text-xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
            Analyst Justification / Operational Remarks:
          </span>
          <p className="text-slate-800 italic leading-relaxed">
            "{verificationReason}"
          </p>
          {verifiedAt && (
            <span className="text-[10px] text-slate-400 mt-1 block">
              Recorded at: {new Date(verifiedAt).toLocaleString()}
            </span>
          )}
        </div>
      )}

      {/* 4. SUCCESS & ERROR BANNERS */}
      {successMessage && (
        <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-800 text-xs font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-800 text-xs font-medium">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 5. ACTION BUTTONS OR ACTIVE INLINE FORM */}
      {!activeAction ? (
        <div>
          {canVerifyClassification ? (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                {/* Button 1: Confirm */}
                <button
                  type="button"
                  onClick={() => handleOpenAction("CONFIRM")}
                  className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer min-h-[38px]"
                  title="Confirm AI prediction as authoritative classification"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Confirm</span>
                </button>

                {/* Button 2: Reclassify */}
                <button
                  type="button"
                  onClick={() => handleOpenAction("RECLASSIFY")}
                  className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer min-h-[38px]"
                  title="Assign a different source class with reason"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reclassify</span>
                </button>

                {/* Button 3: Needs Review */}
                <button
                  type="button"
                  onClick={() => handleOpenAction("NEEDS_REVIEW")}
                  className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer min-h-[38px]"
                  title="Flag for secondary verification / field inspection"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Needs Review</span>
                </button>
              </div>
              <p className="text-[10px] text-slate-400 text-center">
                Signed in as: <span className="font-semibold text-slate-600">{user?.name || "Analyst"}</span> ({user?.role || "GIS_ANALYST"})
              </p>
            </div>
          ) : (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                <span>Verification requires GIS Intelligence Analyst or Command Officer clearance.</span>
              </div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase">Read-Only</span>
            </div>
          )}
        </div>
      ) : (
        /* INLINE VERIFICATION FORM */
        <div className="border border-blue-200 bg-blue-50/40 rounded-xl p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-blue-900 uppercase tracking-wide flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-blue-600" />
              {activeAction === "CONFIRM" && `Confirm: ${classification.predicted_class}`}
              {activeAction === "RECLASSIFY" && "Reclassify Thermal Source"}
              {activeAction === "NEEDS_REVIEW" && "Flag for Secondary Review"}
            </span>
            <button
              type="button"
              onClick={handleCancelAction}
              className="text-slate-400 hover:text-slate-600 text-xs font-medium cursor-pointer"
            >
              Cancel
            </button>
          </div>

          {/* Reclassify Class Dropdown */}
          {activeAction === "RECLASSIFY" && (
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Authoritative Source Class:
              </label>
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value as SourceClass)}
                className="w-full text-xs font-semibold bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-purple-500 cursor-pointer"
              >
                {SOURCE_CLASSES.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls} {cls === classification.predicted_class ? "(Current AI Recommendation)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Reason / Notes Textarea */}
          <div>
            <label className="text-[11px] font-bold text-slate-700 block mb-1">
              {activeAction === "CONFIRM" && "Confirmation Remarks (Optional):"}
              {activeAction === "RECLASSIFY" && "Mandatory Justification / Operational Evidence:"}
              {activeAction === "NEEDS_REVIEW" && "Secondary Review Justification:"}
            </label>
            <textarea
              rows={2}
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder={
                activeAction === "CONFIRM"
                  ? "e.g. Visual satellite inspection confirms flare stack continuous signature."
                  : activeAction === "RECLASSIFY"
                  ? "e.g. Imagery confirms agricultural crop stubble clearing; no industrial chimney present."
                  : "e.g. Ambiguous thermal plume at perimeter; request field reconnaissance verification."
              }
              className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Action Submission */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleCancelAction}
              disabled={isSubmitting}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmitVerification}
              disabled={isSubmitting}
              className={`px-4 py-1.5 rounded-lg text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
                activeAction === "CONFIRM"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : activeAction === "RECLASSIFY"
                  ? "bg-purple-600 hover:bg-purple-700"
                  : "bg-amber-600 hover:bg-amber-700"
              }`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Recording...</span>
                </>
              ) : (
                <>
                  <FileCheck className="w-3.5 h-3.5" />
                  <span>
                    {activeAction === "CONFIRM" && "Record Confirmation"}
                    {activeAction === "RECLASSIFY" && "Record Reclassification"}
                    {activeAction === "NEEDS_REVIEW" && "Flag for Review"}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 6. EXPANDABLE VERIFICATION AUDIT TRAIL */}
      {auditTrail.length > 0 && (
        <div className="border-t border-slate-100 pt-2">
          <button
            type="button"
            onClick={() => setShowAuditTrail(!showAuditTrail)}
            className="w-full flex items-center justify-between text-[11px] font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer py-1"
          >
            <span className="flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-slate-400" />
              <span>Verification Audit Log ({auditTrail.length})</span>
            </span>
            {showAuditTrail ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showAuditTrail && (
            <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {auditTrail.map((entry, idx) => (
                <div
                  key={idx}
                  className="bg-slate-50 p-2 rounded-lg border border-slate-200/70 text-[11px] space-y-0.5"
                >
                  <div className="flex items-center justify-between text-slate-700 font-semibold">
                    <span className="font-mono text-[10px] text-blue-700 bg-blue-50 px-1 py-0.2 rounded border border-blue-200">
                      {entry.action}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="text-slate-600">
                    By: <span className="font-medium text-slate-800">{entry.performed_by}</span>
                  </div>
                  {entry.verified_class && (
                    <div className="text-slate-600">
                      Class: <span className="font-semibold text-slate-800">{entry.verified_class}</span>
                    </div>
                  )}
                  {entry.reason && (
                    <div className="text-slate-500 italic text-[10px] mt-0.5">
                      "{entry.reason}"
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
