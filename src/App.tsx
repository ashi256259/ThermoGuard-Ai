import React, { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { MainLayout, NavPage } from "./layouts/MainLayout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { HotspotExplorerPage } from "./pages/HotspotExplorerPage";
import { SourceDetailsPage } from "./pages/SourceDetailsPage";
import { TimelinePage } from "./pages/TimelinePage";
import { AlertsPage } from "./pages/AlertsPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { SettingsPage } from "./pages/SettingsPage";
import { apiService, HotspotItem } from "./services/api";
import { DemoScenario } from "./types";
import { Satellite, Activity } from "lucide-react";

function AuthenticatedApp() {
  const { isAuthenticated, isLoading } = useAuth();
  const [currentPage, setCurrentPage] = useState<NavPage>("dashboard");
  const [selectedHotspot, setSelectedHotspot] = useState<HotspotItem | null>(null);
  const [isLiveMode, setIsLiveMode] = useState<boolean>(true);
  const [activeScenario, setActiveScenario] = useState<DemoScenario | null>(null);
  const [hotspots, setHotspots] = useState<HotspotItem[]>([]);

  // Load initial hotspots
  useEffect(() => {
    apiService.getHotspots()
      .then((data) => {
        setHotspots(data);
        if (!selectedHotspot && data.length > 0) {
          setSelectedHotspot(data[0]);
        }
      })
      .catch((err) => console.warn("Failed to fetch initial hotspots in App:", err));
  }, []);

  const [alertsInitialSeverity, setAlertsInitialSeverity] = useState<string>("All");
  const [timelineInitialPersistent, setTimelineInitialPersistent] = useState<boolean>(false);
  const [detailsInitialClassFilter, setDetailsInitialClassFilter] = useState<string>("All");
  const [explorerInitialSourceFilter, setExplorerInitialSourceFilter] = useState<string>("All");
  const [adminInitialTab, setAdminInitialTab] = useState<any>("overview");

  const handleNavigateTo = (page: NavPage, options?: {
    hotspot?: HotspotItem;
    filterRisk?: string;
    filterClass?: string;
    filterPersistent?: boolean;
    filterSource?: string;
    adminTab?: string;
  }) => {
    if (options?.hotspot) {
      setSelectedHotspot(options.hotspot);
    }
    if (options?.filterRisk) {
      setAlertsInitialSeverity(options.filterRisk);
    }
    if (options?.filterPersistent !== undefined) {
      setTimelineInitialPersistent(options.filterPersistent);
    }
    if (options?.filterClass) {
      setDetailsInitialClassFilter(options.filterClass);
    }
    if (options?.filterSource) {
      setExplorerInitialSourceFilter(options.filterSource);
    }
    if (options?.adminTab) {
      setAdminInitialTab(options.adminTab);
    }
    setCurrentPage(page);
  };

  const handleInspectDetails = (hotspot: HotspotItem) => {
    setSelectedHotspot(hotspot);
    setDetailsInitialClassFilter("All");
    setCurrentPage("details");
  };

  const handleOpenTimeline = (hotspot: HotspotItem) => {
    setSelectedHotspot(hotspot);
    setTimelineInitialPersistent(false);
    setCurrentPage("timeline");
  };

  const handleViewOnMap = (hotspot?: HotspotItem) => {
    if (hotspot) {
      setSelectedHotspot(hotspot);
    }
    setCurrentPage("dashboard");
  };

  const handleSelectScenario = async (scenario: DemoScenario) => {
    setIsLiveMode(false);
    setActiveScenario(scenario);
    try {
      await apiService.loadScenario(scenario.id);
      const updated = await apiService.getHotspots();
      setHotspots(updated);
      const target = updated.find(
        (h) => h.event.id === scenario.sample_event_id || h.event.id.includes(scenario.id.replace("scenario-", "").split("-")[1])
      ) || updated[0];
      if (target) {
        setSelectedHotspot(target);
      }
    } catch (err) {
      console.warn("Failed to load scenario via API:", err);
    }
    setCurrentPage("dashboard");
  };

  const handleResetToLive = async () => {
    setIsLiveMode(true);
    setActiveScenario(null);
    try {
      const updated = await apiService.getHotspots();
      setHotspots(updated);
      const liveHotspot = updated.find((h) => h.event.source === "NASA_FIRMS_LIVE") || updated[0];
      if (liveHotspot) {
        setSelectedHotspot(liveHotspot);
      }
    } catch (err) {
      console.warn("Failed to reset to live surveillance:", err);
    }
    setCurrentPage("dashboard");
  };

  // Initial Auth Loading Screen
  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-[#070b14] flex flex-col items-center justify-center text-slate-100 font-sans">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-xl bg-[#0f172a] border border-[#1e293b] flex items-center justify-center text-cyan-400 shadow-xl shadow-cyan-950/40">
              <Satellite className="w-6 h-6 animate-pulse" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-teal-400 border-2 border-[#070b14] flex items-center justify-center">
              <Activity className="w-2.5 h-2.5 text-black animate-spin" />
            </div>
          </div>
          <div className="text-center">
            <h2 className="text-sm font-semibold tracking-tight text-white">ThermoGuard AI</h2>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">
              Verifying satellite intelligence clearance & security tokens...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Unauthenticated -> Show Login Page
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Authenticated -> Show Protected Surveillance Console
  return (
    <MainLayout
      currentPage={currentPage}
      onSelectPage={setCurrentPage}
      onSelectHotspot={handleViewOnMap}
      isLiveMode={isLiveMode}
      activeScenario={activeScenario}
      onSelectScenario={handleSelectScenario}
      onResetToLive={handleResetToLive}
      hotspots={hotspots}
    >
      {currentPage === "dashboard" && (
        <DashboardPage
          selectedHotspotProp={selectedHotspot}
          onSelectHotspot={setSelectedHotspot}
          onInspectDetails={handleInspectDetails}
          onOpenTimeline={handleOpenTimeline}
          onNavigateTo={handleNavigateTo}
          isLiveMode={isLiveMode}
          activeScenario={activeScenario}
        />
      )}

      {currentPage === "explorer" && (
        <HotspotExplorerPage
          initialSourceFilter={explorerInitialSourceFilter}
          onSelectHotspot={handleInspectDetails}
          onViewOnMap={handleViewOnMap}
          onOpenTimeline={handleOpenTimeline}
        />
      )}

      {currentPage === "details" && (
        <SourceDetailsPage
          hotspot={selectedHotspot}
          initialClassFilter={detailsInitialClassFilter}
          onSelectHotspot={setSelectedHotspot}
          onOpenTimeline={handleOpenTimeline}
          onReturnToMap={() => handleViewOnMap(selectedHotspot || undefined)}
        />
      )}

      {currentPage === "timeline" && (
        <TimelinePage
          selectedHotspot={selectedHotspot}
          initialFilterPersistent={timelineInitialPersistent}
          onSelectHotspot={setSelectedHotspot}
          onInspectDetails={handleInspectDetails}
          onReturnToMap={() => handleViewOnMap(selectedHotspot || undefined)}
        />
      )}

      {currentPage === "alerts" && (
        <AlertsPage
          hotspots={hotspots}
          initialSeverity={alertsInitialSeverity}
          onSelectHotspot={handleInspectDetails}
          onViewOnMap={handleViewOnMap}
          onOpenTimeline={handleOpenTimeline}
        />
      )}

      {currentPage === "analytics" && (
        <AnalyticsPage
          onNavigate={(page) => setCurrentPage(page)}
          onViewOnMap={() => handleViewOnMap()}
        />
      )}

      {currentPage === "admin" && (
        <AdminDashboardPage
          initialTab={adminInitialTab}
          onSelectHotspot={handleInspectDetails}
          onViewOnMap={handleViewOnMap}
          onOpenTimeline={handleOpenTimeline}
        />
      )}

      {currentPage === "settings" && (
        <SettingsPage
          onReturnToMap={() => handleViewOnMap(selectedHotspot || undefined)}
        />
      )}
    </MainLayout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}
