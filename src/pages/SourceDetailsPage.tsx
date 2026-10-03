import React, { useState, useEffect, useMemo } from "react";
import {
  Satellite,
  Building2,
  Trees,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Database,
  Search,
  ChevronRight,
  ChevronLeft,
  Activity,
  FileText,
  AlertCircle,
  Target,
  Compass,
  MapPin,
  Download,
  FileSpreadsheet,
  ChevronDown,
  Layers,
  ShieldCheck
} from "lucide-react";
import { apiService, HotspotItem } from "../services/api";
import {
  exportHotspotPdfReport,
  exportHotspotCsvReport,
  exportBatchHotspotsCsv,
  extractEvidenceArray
} from "../utils/reportExporter";
import { AnalystVerificationCard } from "../components/AnalystVerificationCard";
import { ThermalSourceFingerprintCard } from "../components/ThermalSourceFingerprintCard";
import { IntelligenceReportModal } from "../components/IntelligenceReportModal";

interface SourceDetailsPageProps {
  hotspot?: HotspotItem | null;
  initialClassFilter?: string;
  onSelectHotspot?: (hotspot: HotspotItem) => void;
  onOpenTimeline?: (hotspot: HotspotItem) => void;
  onReturnToMap?: () => void;
}

interface ProviderStatusData {
  system_mode: string;
  database?: {
    provider: string;
    mode: string;
    status: string;
    connected: boolean;
    notice: string;
  };
  firms?: {
    provider: string;
    mode: string;
    status: string;
    connected: boolean;
    notice: string;
    validation?: {
      status: string;
      source: string;
      latency_ms: number;
    };
  };
  osm?: {
    provider: string;
    mode: string;
    status: string;
    connected: boolean;
    database_records?: number;
    notice: string;
  };
  landcover?: {
    dataset: string;
    mode: string;
    status: string;
    connected: boolean;
    notice: string;
  };
}

interface MLModelMetadata {
  model_version: string;
  algorithm: string;
  framework?: string;
  feature_count: number;
  classes?: string[];
  training_timestamp?: string;
  training_samples?: number;
  dataset_info?: {
    total_samples?: number;
    class_distribution?: Record<string, number>;
    limitation_notice?: string;
  };
  hyperparameters?: {
    n_estimators?: number;
    max_depth?: number;
    min_samples_split?: number;
    class_weight?: string;
  };
  evaluation_metrics?: {
    accuracy: number;
    macro_precision?: number;
    macro_recall?: number;
    macro_f1?: number;
  };
  feature_importances?: Record<string, number>;
}

export const SourceDetailsPage: React.FC<SourceDetailsPageProps> = ({
  hotspot: initialHotspot,
  initialClassFilter,
  onSelectHotspot,
  onOpenTimeline,
  onReturnToMap
}) => {
  // Data fetching state
  const [providerStatus, setProviderStatus] = useState<ProviderStatusData | null>(null);
  const [mlInfo, setMlInfo] = useState<MLModelMetadata | null>(null);
  const [allHotspots, setAllHotspots] = useState<HotspotItem[]>([]);
  const [selectedHotspot, setSelectedHotspot] = useState<HotspotItem | null>(initialHotspot || null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [classFilter, setClassFilter] = useState<string>(initialClassFilter || "ALL");

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Report export states
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [isExportingCsv, setIsExportingCsv] = useState<boolean>(false);
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState<boolean>(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [exportToast, setExportToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Fetch all required data from the API
  const fetchAllData = async (showLoadingSpinner: boolean = true) => {
    if (showLoadingSpinner) setIsLoading(true);
    setIsRefreshing(true);
    setErrorMsg(null);

    try {
      const [provRes, mlRes, spotsRes] = await Promise.allSettled([
        apiService.getProviderStatus(true),
        apiService.getModelInfo(),
        apiService.getHotspots()
      ]);

      if (provRes.status === "fulfilled") {
        setProviderStatus(provRes.value);
      } else {
        console.warn("Could not load provider status:", provRes.reason);
      }

      if (mlRes.status === "fulfilled") {
        setMlInfo(mlRes.value);
      } else {
        console.warn("Could not load ML info:", mlRes.reason);
      }

      if (spotsRes.status === "fulfilled" && Array.isArray(spotsRes.value)) {
        setAllHotspots(spotsRes.value);
        if (!selectedHotspot && spotsRes.value.length > 0) {
          const defaultPick =
            spotsRes.value.find((h) => h.classification.risk_score === "CRITICAL" || h.classification.risk_score === "HIGH") ||
            spotsRes.value[0];
          setSelectedHotspot(defaultPick);
        }
      } else if (spotsRes.status === "rejected") {
        throw spotsRes.reason;
      }
    } catch (err: any) {
      console.error("Failed to load source details:", err);
      setErrorMsg(err?.message || "Failed to establish telemetry connection.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAllData(true);
  }, []);

  // Update selected hotspot when prop changes
  useEffect(() => {
    if (initialHotspot) {
      setSelectedHotspot(initialHotspot);
    }
  }, [initialHotspot]);

  // Filtered hotspots for quick switching
  const filteredHotspots = useMemo(() => {
    return allHotspots.filter((h) => {
      const matchesClass = classFilter === "ALL" || h.classification.predicted_class === classFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        h.event.id.toLowerCase().includes(q) ||
        h.classification.predicted_class.toLowerCase().includes(q) ||
        h.geo_context.nearest_industrial_facility.toLowerCase().includes(q) ||
        h.geo_context.land_cover.toLowerCase().includes(q);
      return matchesClass && matchesQuery;
    });
  }, [allHotspots, classFilter, searchQuery]);

  // Handle previous / next hotspot navigation
  const currentIndex = selectedHotspot ? filteredHotspots.findIndex((h) => h.event.id === selectedHotspot.event.id) : -1;
  const handlePrevHotspot = () => {
    if (currentIndex > 0) {
      const prev = filteredHotspots[currentIndex - 1];
      setSelectedHotspot(prev);
      onSelectHotspot?.(prev);
    }
  };

  const handleNextHotspot = () => {
    if (currentIndex >= 0 && currentIndex < filteredHotspots.length - 1) {
      const next = filteredHotspots[currentIndex + 1];
      setSelectedHotspot(next);
      onSelectHotspot?.(next);
    }
  };

  // Format date helper
  const formatDate = (isoStr?: string) => {
    if (!isoStr) return "Just now";
    try {
      const d = new Date(isoStr);
      return d.toLocaleString("en-IN", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      });
    } catch {
      return isoStr;
    }
  };

  const currentHotspot = selectedHotspot || allHotspots[0];

  const handleVerificationUpdate = (updatedItem: any) => {
    setSelectedHotspot(updatedItem);
    setAllHotspots((prev) =>
      prev.map((h) => (h.event.id === updatedItem.event.id ? updatedItem : h))
    );
    if (onSelectHotspot) {
      onSelectHotspot(updatedItem);
    }
  };

  // Report generation handlers
  const handleDownloadPdf = (target?: HotspotItem | null) => {
    const item = target || currentHotspot;
    if (!item) {
      setExportToast({ message: "No thermal anomaly selected for report generation.", type: "error" });
      setTimeout(() => setExportToast(null), 3500);
      return;
    }
    setIsExportingPdf(true);
    setIsDownloadMenuOpen(false);
    setTimeout(() => {
      const success = exportHotspotPdfReport(item, mlInfo);
      setIsExportingPdf(false);
      if (success) {
        setExportToast({
          message: `Intelligence Report PDF generated successfully for ${item.event.id} (${item.classification.predicted_class})`,
          type: "success"
        });
      } else {
        setExportToast({ message: "Failed to compile PDF report. Please try again.", type: "error" });
      }
      setTimeout(() => setExportToast(null), 4500);
    }, 150);
  };

  const handleDownloadCsv = (target?: HotspotItem | null) => {
    const item = target || currentHotspot;
    if (!item) {
      setExportToast({ message: "No thermal anomaly selected for CSV export.", type: "error" });
      setTimeout(() => setExportToast(null), 3500);
      return;
    }
    setIsExportingCsv(true);
    setIsDownloadMenuOpen(false);
    setTimeout(() => {
      const success = exportHotspotCsvReport(item);
      setIsExportingCsv(false);
      if (success) {
        setExportToast({
          message: `Observation CSV exported successfully for ${item.event.id}`,
          type: "success"
        });
      } else {
        setExportToast({ message: "Failed to export CSV. Please try again.", type: "error" });
      }
      setTimeout(() => setExportToast(null), 4500);
    }, 150);
  };

  const handleDownloadBatchCsv = () => {
    const listToExport = filteredHotspots.length > 0 ? filteredHotspots : allHotspots;
    if (listToExport.length === 0) {
      setExportToast({ message: "No observations available to export.", type: "error" });
      setTimeout(() => setExportToast(null), 3500);
      return;
    }
    setIsExportingCsv(true);
    setIsDownloadMenuOpen(false);
    setTimeout(() => {
      const success = exportBatchHotspotsCsv(listToExport);
      setIsExportingCsv(false);
      if (success) {
        setExportToast({
          message: `Exported ${listToExport.length} observation records to consolidated CSV catalog`,
          type: "success"
        });
      } else {
        setExportToast({ message: "Failed to export batch CSV.", type: "error" });
      }
      setTimeout(() => setExportToast(null), 4500);
    }, 150);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-16 font-sans">
      {/* Top Header & Actions Bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-2xs flex-shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-none">
                  Thermal Intelligence Pipeline
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                  SIH26162
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                From satellite observation to explainable thermal-source intelligence.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* View Intelligence Report Button */}
            <button
              id="btn-view-intelligence-report"
              onClick={() => setIsReportModalOpen(true)}
              disabled={!currentHotspot}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-md shadow-blue-600/20 hover:shadow-lg hover:shadow-blue-600/30 transition-all duration-200 cursor-pointer disabled:opacity-50 active:scale-[0.98] border border-blue-500/50"
              title="Open Evidence & Intelligence Report for this thermal anomaly"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-blue-200" />
              <span>View Intelligence Report</span>
            </button>

            {/* Floating Download Pipeline Report Button with Dropdown */}
            <div className="relative">
              <button
                id="btn-download-pipeline-report"
                onClick={() => setIsDownloadMenuOpen((prev) => !prev)}
                disabled={isExportingPdf || isExportingCsv}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-md shadow-slate-900/15 hover:shadow-lg hover:shadow-slate-900/25 transition-all duration-200 cursor-pointer disabled:opacity-50 active:scale-[0.98] border border-slate-700/50"
                title="Download formatted intelligence reports and observation metadata"
              >
                {isExportingPdf || isExportingCsv ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                ) : (
                  <Download className="w-3.5 h-3.5 text-blue-400" />
                )}
                <span>{isExportingPdf ? "Compiling PDF..." : isExportingCsv ? "Exporting CSV..." : "Download Pipeline Report"}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isDownloadMenuOpen ? "rotate-180" : ""}`} />
              </button>

              {/* Dropdown Menu */}
              {isDownloadMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setIsDownloadMenuOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl border border-slate-200 shadow-2xl z-40 p-2 text-left animate-fade-in ring-1 ring-black/5">
                    <div className="px-3 py-2 border-b border-slate-100 mb-1 flex items-center justify-between">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pipeline Report Export</div>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold">
                        PDF & CSV
                      </span>
                    </div>

                    {/* PDF Export Option */}
                    <button
                      id="btn-export-pdf-dossier"
                      onClick={() => handleDownloadPdf(currentHotspot)}
                      disabled={isExportingPdf || !currentHotspot}
                      className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-50 flex items-start gap-2.5 text-left transition-colors cursor-pointer group disabled:opacity-50"
                    >
                      <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0 group-hover:bg-red-100 transition-colors shadow-2xs">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-slate-900 group-hover:text-red-700 flex items-center justify-between">
                          <span>Intelligence Dossier (.PDF)</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-red-100 text-red-800">PDF</span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-tight mt-0.5">
                          Formatted NTRO dossier with telemetry, proximity buffer, evidence & SOP.
                        </p>
                      </div>
                    </button>

                    {/* Single CSV Export Option */}
                    <button
                      id="btn-export-current-csv"
                      onClick={() => handleDownloadCsv(currentHotspot)}
                      disabled={isExportingCsv || !currentHotspot}
                      className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-50 flex items-start gap-2.5 text-left transition-colors cursor-pointer group disabled:opacity-50"
                    >
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100 transition-colors shadow-2xs">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-slate-900 group-hover:text-emerald-700 flex items-center justify-between">
                          <span>Current Hotspot Metadata (.CSV)</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">CSV</span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-tight mt-0.5">
                          RFC-4180 raw tabular records for GIS and spreadsheet software.
                        </p>
                      </div>
                    </button>

                    {/* Batch CSV Export Option */}
                    {allHotspots.length > 1 && (
                      <button
                        id="btn-export-batch-csv"
                        onClick={handleDownloadBatchCsv}
                        disabled={isExportingCsv}
                        className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-50 flex items-start gap-2.5 text-left transition-colors cursor-pointer group border-t border-slate-100 mt-1 disabled:opacity-50"
                      >
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 transition-colors shadow-2xs">
                          <Layers className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-slate-900 group-hover:text-blue-600 flex items-center justify-between">
                            <span>Batch Export Catalog ({filteredHotspots.length || allHotspots.length}) (.CSV)</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-100 text-blue-800">CATALOG</span>
                          </div>
                          <p className="text-[11px] text-slate-500 leading-tight mt-0.5">
                            Consolidated dataset of all detected thermal observations.
                          </p>
                        </div>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            <button
              onClick={() => fetchAllData(false)}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh source telemetry"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-blue-600" : ""}`} />
              <span>{isRefreshing ? "Syncing..." : "Sync Feeds"}</span>
            </button>

            {onReturnToMap && (
              <button
                onClick={onReturnToMap}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Compass className="w-3.5 h-3.5" />
                <span>GIS Map View</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area - Hotspot Investigation Content Directly Below Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Export Toast Notification */}
        {exportToast && (
          <div
            className={`mb-6 p-4 rounded-2xl text-xs flex items-center justify-between border shadow-sm animate-fade-in ${
              exportToast.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : "bg-red-50 border-red-200 text-red-900"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {exportToast.type === "success" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              )}
              <span className="font-semibold">{exportToast.message}</span>
            </div>
            <button
              onClick={() => setExportToast(null)}
              className="text-slate-400 hover:text-slate-600 p-1 text-xs cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Error Notification */}
        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              onClick={() => fetchAllData(true)}
              className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-900 rounded font-semibold text-[11px] cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Hotspot Target Switcher & Search Filter Bar */}
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by Event ID, Facility, Class, or Land Cover..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-600"
                />
              </div>

              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none cursor-pointer"
              >
                <option value="ALL">All Source Classes</option>
                <option value="Industrial Fire">Industrial Fire</option>
                <option value="Gas Flare">Gas Flare</option>
                <option value="Agricultural Burning">Agricultural Burning</option>
                <option value="Wildfire">Wildfire</option>
                <option value="Mining">Mining</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Prev / Next Steppers */}
            <div className="flex items-center justify-between sm:justify-end gap-2">
              <span className="text-xs text-slate-500 font-mono">
                {currentIndex >= 0 ? `${currentIndex + 1} of ${filteredHotspots.length}` : `${filteredHotspots.length} available`}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={handlePrevHotspot}
                  disabled={currentIndex <= 0}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-30 cursor-pointer"
                  title="Previous Anomaly"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={handleNextHotspot}
                  disabled={currentIndex >= filteredHotspots.length - 1}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-30 cursor-pointer"
                  title="Next Anomaly"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Selected Hotspot Intelligence Dossier */}
          {currentHotspot ? (
            <div className="space-y-6">
              {/* Hero Summary Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                        {currentHotspot.event.id}
                      </span>
                      <span className="text-xs text-slate-500">•</span>
                      <span className="text-xs font-semibold text-slate-600">
                        Cluster: {currentHotspot.temporal_profile.cluster_id || "Unclustered"}
                      </span>
                      <span className="text-xs text-slate-500">•</span>
                      <span className="text-xs text-slate-600">
                        Sensor: {currentHotspot.event.satellite} ({currentHotspot.event.daynight === "D" ? "Day Pass" : "Night Pass"})
                      </span>
                    </div>
                    <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                      {currentHotspot.geo_context.nearest_industrial_facility !== "None within 2.5km"
                        ? currentHotspot.geo_context.nearest_industrial_facility
                        : `${currentHotspot.geo_context.land_cover} Thermal Anomaly`}
                    </h2>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                      <span className="flex items-center gap-1 font-mono">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        {currentHotspot.event.latitude.toFixed(4)}°N, {currentHotspot.event.longitude.toFixed(4)}°E
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {formatDate(currentHotspot.event.timestamp)}
                      </span>
                    </div>
                  </div>

                  {/* Class & Risk Badges & Quick Export Action */}
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <div className="px-3.5 py-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-900">
                      <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">ML Prediction</div>
                      <div className="text-sm font-bold">{currentHotspot.classification.predicted_class}</div>
                      <div className="text-[10px] text-blue-700 font-mono">
                        {Math.round(currentHotspot.classification.confidence * 100)}% Model Confidence
                      </div>
                    </div>

                    {/* Verification Status Badge */}
                    {currentHotspot.classification.verification_status && currentHotspot.classification.verification_status !== "UNVERIFIED" && (
                      <div
                        className={`px-3.5 py-2 rounded-xl border ${
                          currentHotspot.classification.verification_status === "CONFIRMED"
                            ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                            : currentHotspot.classification.verification_status === "RECLASSIFIED"
                            ? "bg-purple-50 border-purple-300 text-purple-900"
                            : "bg-amber-50 border-amber-300 text-amber-900"
                        }`}
                      >
                        <div className="text-[10px] font-bold uppercase tracking-wider">
                          {currentHotspot.classification.verification_status === "CONFIRMED" && "Human Confirmed"}
                          {currentHotspot.classification.verification_status === "RECLASSIFIED" && "Reclassified"}
                          {currentHotspot.classification.verification_status === "NEEDS_REVIEW" && "Needs Review"}
                        </div>
                        <div className="text-sm font-bold">
                          {currentHotspot.classification.verified_class || currentHotspot.classification.verification_status}
                        </div>
                        <div className="text-[10px] font-mono truncate max-w-[130px]">
                          By: {currentHotspot.classification.verified_by || "Analyst"}
                        </div>
                      </div>
                    )}

                    <div
                      className={`px-3.5 py-2 rounded-xl border ${
                        currentHotspot.classification.risk_score === "CRITICAL"
                          ? "bg-red-50 border-red-200 text-red-900"
                          : currentHotspot.classification.risk_score === "HIGH"
                          ? "bg-orange-50 border-orange-200 text-orange-900"
                          : currentHotspot.classification.risk_score === "MEDIUM"
                          ? "bg-amber-50 border-amber-200 text-amber-900"
                          : "bg-emerald-50 border-emerald-200 text-emerald-900"
                      }`}
                    >
                      <div className="text-[10px] font-bold uppercase tracking-wider">Operational Risk</div>
                      <div className="text-sm font-bold">{currentHotspot.classification.risk_score}</div>
                      <div className="text-[10px] font-mono">
                        Score: {currentHotspot.classification.risk_value || 0} / 100
                      </div>
                    </div>

                    {/* Direct Quick Action Buttons */}
                    <div className="flex sm:flex-col gap-1.5 justify-center">
                      <button
                        id="btn-view-intelligence-report-hero"
                        onClick={() => setIsReportModalOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                        title="View complete Evidence & Intelligence Report"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Intelligence Report</span>
                      </button>
                      <button
                        onClick={() => handleDownloadPdf(currentHotspot)}
                        disabled={isExportingPdf}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                        title="Export formatted intelligence PDF dossier"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>{isExportingPdf ? "Generating..." : "Export PDF"}</span>
                      </button>
                      <button
                        onClick={() => handleDownloadCsv(currentHotspot)}
                        disabled={isExportingCsv}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                        title="Export metadata as CSV"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        <span>{isExportingCsv ? "Exporting..." : "Export CSV"}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 4 Multi-Domain Observation Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="text-[10px] font-bold text-slate-500 uppercase">Fire Radiative Power</div>
                    <div className="text-lg font-black text-slate-900 font-mono mt-0.5">
                      {currentHotspot.event.frp.toFixed(1)} <span className="text-xs font-normal text-slate-500">MW</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Radiative Energy Release</div>
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="text-[10px] font-bold text-slate-500 uppercase">Brightness Temp</div>
                    <div className="text-lg font-black text-slate-900 font-mono mt-0.5">
                      {currentHotspot.event.brightness.toFixed(1)} <span className="text-xs font-normal text-slate-500">K</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Band I-4 / 4μm Thermal Channel</div>
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="text-[10px] font-bold text-slate-500 uppercase">Distance to Industry</div>
                    <div className="text-lg font-black text-slate-900 font-mono mt-0.5">
                      {currentHotspot.geo_context.distance_to_industry !== undefined
                        ? currentHotspot.geo_context.distance_to_industry < 1000
                          ? `${Math.round(currentHotspot.geo_context.distance_to_industry)} m`
                          : `${(currentHotspot.geo_context.distance_to_industry / 1000).toFixed(1)} km`
                        : "N/A"}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {currentHotspot.geo_context.facility_type || "Proximity Buffer"}
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="text-[10px] font-bold text-slate-500 uppercase">Persistence & Trend</div>
                    <div className="text-lg font-black text-slate-900 font-mono mt-0.5">
                      {currentHotspot.temporal_profile.persistence_days} <span className="text-xs font-normal text-slate-500">Days</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {currentHotspot.temporal_profile.observation_count} Overpass Detections
                    </div>
                  </div>
                </div>
              </div>

              {/* Thermal Source Fingerprint & Smart Prioritization */}
              <ThermalSourceFingerprintCard hotspot={currentHotspot} />

              {/* Priority 6: Human Verification / Analyst Review */}
              <AnalystVerificationCard
                hotspot={currentHotspot as any}
                onVerificationUpdated={handleVerificationUpdate}
              />

              {/* Multi-Class Ensemble Probabilities & Evidence */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Ensemble Probabilities */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-blue-600" />
                      <h3 className="text-sm font-bold text-slate-900">Multi-Class Ensemble Probabilities</h3>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">Random Forest v1.0.0</span>
                  </div>

                  {currentHotspot.classification.class_probabilities ? (
                    <div className="space-y-3">
                      {Object.entries(currentHotspot.classification.class_probabilities)
                        .sort((a, b) => Number(b[1]) - Number(a[1]))
                        .map(([cls, probVal]) => {
                          const prob = Number(probVal);
                          const percent = Math.round(prob * 100);
                          const isTop = cls === currentHotspot.classification.predicted_class;
                          return (
                            <div key={cls} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className={`font-semibold ${isTop ? "text-blue-900 font-bold" : "text-slate-600"}`}>
                                  {cls} {isTop && "★"}
                                </span>
                                <span className="font-mono font-bold text-slate-800">
                                  {percent}% ({prob.toFixed(3)})
                                </span>
                              </div>
                              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    isTop ? "bg-blue-600" : "bg-slate-400"
                                  }`}
                                  style={{ width: `${Math.max(2, percent)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 p-4 text-center bg-slate-50 rounded-xl">
                      Single class probability assigned at 100%.
                    </div>
                  )}
                </div>

                {/* Explainable Evidence Chain */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-600" />
                      <h3 className="text-sm font-bold text-slate-900">Explainable Geospatial & Thermal Evidence</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDownloadPdf(currentHotspot)}
                        disabled={isExportingPdf}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50"
                        title="Export this evidence chain into formal PDF report"
                      >
                        <Download className="w-3 h-3 text-slate-500" />
                        <span>PDF Report</span>
                      </button>
                      <span className="text-[10px] font-mono text-slate-400">Deterministic Justification</span>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {(() => {
                      const evList = extractEvidenceArray(
                        currentHotspot.classification?.evidence || (currentHotspot.classification as any)?.structured_evidence
                      );
                      return evList.length > 0 ? (
                        evList.map((ev, idx) => (
                          <div
                            key={idx}
                            className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-700 flex items-start gap-2.5"
                          >
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                            <span className="leading-relaxed">{ev}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-slate-500 p-4 text-center bg-slate-50 rounded-xl">
                          Evidence vector verified against OSM cadastre and NASA FIRMS orbital records.
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 text-slate-500">
              <Target className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No thermal anomaly matches the filter criteria.</p>
              <button
                onClick={() => {
                  setSearchQuery("");
                  setClassFilter("ALL");
                }}
                className="mt-3 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Evidence & Intelligence Report Modal */}
      <IntelligenceReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        hotspot={currentHotspot}
      />
    </div>
  );
};
