import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Radio,
  Compass,
  FileSearch,
  History,
  BellRing,
  BarChart3,
  Wifi,
  WifiOff,
  RefreshCw,
  Clock,
  Satellite,
  LogOut,
  UserCheck,
  ShieldAlert,
  Search,
  ChevronDown,
  Settings,
  Menu,
  Flame,
  X,
  User,
  Shield,
  ExternalLink,
  CheckCircle2
} from "lucide-react";
import { useHealthStatus } from "../hooks/useHealthStatus";
import { useAuth } from "../context/AuthContext";
import { APP_CONFIG } from "../config/constants";
import { apiService, HotspotItem } from "../services/api";
import { ScenarioDrawer } from "../components/ScenarioDrawer";
import { DemoScenario, AlertItem } from "../types";

export type NavPage =
  | "dashboard"
  | "explorer"
  | "details"
  | "timeline"
  | "alerts"
  | "analytics"
  | "admin"
  | "settings";

interface MainLayoutProps {
  currentPage: NavPage;
  onSelectPage: (page: NavPage) => void;
  children: React.ReactNode;
  onSelectHotspot?: (hotspot: HotspotItem) => void;
  isLiveMode?: boolean;
  activeScenario?: DemoScenario | null;
  onSelectScenario?: (scenario: DemoScenario) => void;
  onResetToLive?: () => void;
  hotspots?: HotspotItem[];
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  currentPage,
  onSelectPage,
  children,
  onSelectHotspot,
  isLiveMode = true,
  activeScenario = null,
  onSelectScenario,
  onResetToLive,
  hotspots: externalHotspots
}) => {
  const { user, logout, canAccessAdminDashboard, isAdmin } = useAuth();
  const { connectionState, healthData, errorMessage, refresh } = useHealthStatus();
  const [utcTime, setUtcTime] = useState<string>("");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState<boolean>(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState<boolean>(false);

  // Top header state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [hasExecutedSearch, setHasExecutedSearch] = useState<boolean>(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState<boolean>(false);
  const [isScenarioDrawerOpen, setIsScenarioDrawerOpen] = useState<boolean>(false);
  const [internalHotspots, setInternalHotspots] = useState<HotspotItem[]>([]);
  const [activeAlertsCount, setActiveAlertsCount] = useState<number>(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDropdownRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Load hotspots if not passed from parent
  useEffect(() => {
    if (!externalHotspots || externalHotspots.length === 0) {
      apiService.getHotspots()
        .then((data) => setInternalHotspots(data))
        .catch(() => {});
    }
  }, [externalHotspots]);

  // Load active alerts count
  useEffect(() => {
    apiService.getAlerts()
      .then((alerts: AlertItem[]) => {
        const active = alerts.filter((a) => a.status === "ACTIVE");
        setActiveAlertsCount(active.length);
      })
      .catch(() => {});
  }, [currentPage]);

  const activeHotspots = externalHotspots && externalHotspots.length > 0 ? externalHotspots : internalHotspots;

  // Global keyboard shortcuts: "/" to focus search, "Escape" to clear/close
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== searchInputRef.current) {
        const tagName = (document.activeElement as HTMLElement)?.tagName;
        if (tagName !== "INPUT" && tagName !== "TEXTAREA" && !(document.activeElement as HTMLElement)?.isContentEditable) {
          e.preventDefault();
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
          setIsSearchOpen(true);
        }
      } else if (e.key === "Escape") {
        setIsSearchOpen(false);
        setIsUserMenuOpen(false);
        setIsScenarioDrawerOpen(false);
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  // Outside click listener for search and user menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchDropdownRef.current &&
        !searchDropdownRef.current.contains(e.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(e.target as Node)
      ) {
        setIsSearchOpen(false);
      }
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Search filtering logic
  const filteredSearchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return activeHotspots.filter((h) => {
      const idMatch = h.event.id.toLowerCase().includes(q);
      const classMatch = h.classification.predicted_class.toLowerCase().includes(q);
      const facilityMatch = h.geo_context.nearest_industrial_facility?.toLowerCase().includes(q);
      const landMatch = h.geo_context.land_cover?.toLowerCase().replace(/_/g, " ").includes(q);
      const latStr = String(h.event.latitude);
      const lonStr = String(h.event.longitude);
      const coordMatch = latStr.includes(q) || lonStr.includes(q);
      const satelliteMatch = h.event.satellite?.toLowerCase().includes(q);
      return idMatch || classMatch || facilityMatch || landMatch || coordMatch || satelliteMatch;
    });
  }, [activeHotspots, searchQuery]);

  // Handle Enter in search input
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      setHasExecutedSearch(true);
      setIsSearchOpen(true);
      if (filteredSearchResults.length > 0) {
        handleSelectSearchResult(filteredSearchResults[0]);
      }
    } else if (e.key === "Escape") {
      setIsSearchOpen(false);
      searchInputRef.current?.blur();
    }
  };

  // Select a search result
  const handleSelectSearchResult = (hotspot: HotspotItem) => {
    setIsSearchOpen(false);
    if (onSelectHotspot) {
      onSelectHotspot(hotspot);
    }
    if (currentPage !== "dashboard") {
      onSelectPage("dashboard");
    }
  };

  // Handle NASA FIRMS (Live) click
  const handleLiveModeClick = () => {
    if (onResetToLive) {
      onResetToLive();
    }
    refresh();
    if (currentPage !== "dashboard") {
      onSelectPage("dashboard");
    }
  };

  // Handle Demo Scenario selection
  const handleScenarioSelected = (scenario: DemoScenario) => {
    if (onSelectScenario) {
      onSelectScenario(scenario);
    }
    setIsScenarioDrawerOpen(false);
    if (currentPage !== "dashboard") {
      onSelectPage("dashboard");
    }
  };

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setUtcTime(now.toUTCString().replace("GMT", "UTC"));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const operationalNavItems: Array<{ id: NavPage; label: string; icon: React.ReactNode }> = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: <Radio className="w-[18px] h-[18px]" />
    },
    {
      id: "explorer",
      label: "Hotspot Catalog",
      icon: <Compass className="w-[18px] h-[18px]" />
    },
    {
      id: "details",
      label: "Source Analysis",
      icon: <FileSearch className="w-[18px] h-[18px]" />
    },
    {
      id: "timeline",
      label: "Temporal Trends",
      icon: <History className="w-[18px] h-[18px]" />
    },
    {
      id: "alerts",
      label: "Incident Alerts",
      icon: <BellRing className="w-[18px] h-[18px]" />
    },
    {
      id: "analytics",
      label: "Analytics & ML",
      icon: <BarChart3 className="w-[18px] h-[18px]" />
    }
  ];

  const adminNavItems: Array<{ id: NavPage; label: string; icon: React.ReactNode; adminOnly?: boolean }> = [
    {
      id: "settings",
      label: "Settings",
      icon: <Settings className="w-[18px] h-[18px]" />
    },
    ...(canAccessAdminDashboard || isAdmin
      ? [
          {
            id: "admin" as NavPage,
            label: "Admin Command",
            icon: <ShieldAlert className="w-[18px] h-[18px]" />,
            adminOnly: true
          }
        ]
      : [])
  ];

  const userName = user?.name || "Dr. Vikram Sethi";
  const userRole = user?.role === "CHIEF_SURVEILLANCE_OFFICER" ? "Officer" : user?.role === "ADMIN" ? "Admin" : user?.role === "SENIOR_GIS_ANALYST" ? "Analyst" : "Officer";

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-800 font-sans antialiased">
      {/* 1. DESKTOP SIDEBAR (Hidden on mobile < md) */}
      <aside className="hidden md:flex md:w-64 flex-shrink-0 flex-col border-r border-slate-200 bg-white z-30 justify-between">
        <div className="flex flex-col flex-1 overflow-y-auto">
          {/* Brand Header */}
          <div className="px-5 py-5 flex items-center gap-3 border-b border-slate-100">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 text-white shadow-sm flex-shrink-0">
              <Flame className="w-5 h-5 fill-current" />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-slate-900 text-sm tracking-tight leading-none">ThermoGuard AI</div>
              <p className="text-[10px] text-slate-500 font-medium mt-1 leading-none">Detect • Classify • Protect</p>
            </div>
          </div>

          {/* Navigation List */}
          <div className="px-3 py-4 space-y-6">
            {/* OPERATIONAL VIEWS */}
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-2">
                OPERATIONAL VIEWS
              </div>
              <nav className="flex flex-col gap-0.5">
                {operationalNavItems.map((item) => {
                  const isActive = currentPage === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onSelectPage(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all cursor-pointer ${
                        isActive
                          ? "bg-blue-50 text-blue-700 font-semibold"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                      }`}
                    >
                      <div className={isActive ? "text-blue-600" : "text-slate-400"}>
                        {item.icon}
                      </div>
                      <span>{item.label}</span>
                      {item.id === "alerts" && activeAlertsCount > 0 && (
                        <span className="ml-auto px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                          {activeAlertsCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* ADMINISTRATION */}
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-2">
                ADMINISTRATION
              </div>
              <nav className="flex flex-col gap-0.5">
                {adminNavItems.map((item) => {
                  const isActive = currentPage === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onSelectPage(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all cursor-pointer ${
                        isActive
                          ? "bg-blue-50 text-blue-700 font-semibold"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                      }`}
                    >
                      <div className={isActive ? "text-blue-600" : "text-slate-400"}>
                        {item.icon}
                      </div>
                      <span>{item.label}</span>
                      {item.adminOnly && (
                        <span className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          Admin
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
        </div>

        {/* User Profile & Footer */}
        <div className="p-4 border-t border-slate-100 mt-auto bg-white">
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl bg-slate-50 border border-slate-200/60 mb-2">
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm flex-shrink-0 border border-blue-200">
              {userName.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900 truncate">
                {userName}
              </div>
              <div className="text-xs text-slate-500 truncate font-medium">
                {userRole}
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4 text-slate-400 group-hover:text-red-600" />
            <span>Sign Out</span>
          </button>

          <div className="px-2 mt-3 flex items-center justify-between text-[10px] text-slate-400 font-medium">
            <span>SIH26162 • NTRO</span>
            <span className="font-mono">v2.4</span>
          </div>
        </div>
      </aside>

      {/* 2. MOBILE SLIDE-OVER NAVIGATION DRAWER */}
      {isMobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileNavOpen(false)}
          />

          {/* Drawer Panel */}
          <div className="relative flex-1 flex flex-col max-w-[280px] w-full bg-white h-full z-50 shadow-2xl animate-fade-in justify-between">
            <div className="flex flex-col flex-1 overflow-y-auto">
              {/* Drawer Header */}
              <div className="p-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 text-white shadow-sm flex-shrink-0">
                    <Flame className="w-5 h-5 fill-current" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-sm leading-none">ThermoGuard AI</div>
                    <p className="text-[9px] text-slate-500 font-medium mt-1 leading-none">Detect • Classify • Protect</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileNavOpen(false)}
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 min-w-[40px] min-h-[40px] flex items-center justify-center cursor-pointer"
                  title="Close Navigation"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Navigation List */}
              <div className="p-3 space-y-5">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-2">
                    OPERATIONAL VIEWS
                  </div>
                  <nav className="flex flex-col gap-1">
                    {operationalNavItems.map((item) => {
                      const isActive = currentPage === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            onSelectPage(item.id);
                            setIsMobileNavOpen(false);
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px] cursor-pointer ${
                            isActive
                              ? "bg-blue-50 text-blue-700 font-semibold shadow-2xs"
                              : "text-slate-700 hover:text-slate-900 hover:bg-slate-50"
                          }`}
                        >
                          <div className={isActive ? "text-blue-600" : "text-slate-400"}>
                            {item.icon}
                          </div>
                          <span>{item.label}</span>
                          {item.id === "alerts" && activeAlertsCount > 0 && (
                            <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                              {activeAlertsCount}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </nav>
                </div>

                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-2">
                    ADMINISTRATION
                  </div>
                  <nav className="flex flex-col gap-1">
                    {adminNavItems.map((item) => {
                      const isActive = currentPage === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            onSelectPage(item.id);
                            setIsMobileNavOpen(false);
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px] cursor-pointer ${
                            isActive
                              ? "bg-blue-50 text-blue-700 font-semibold shadow-2xs"
                              : "text-slate-700 hover:text-slate-900 hover:bg-slate-50"
                          }`}
                        >
                          <div className={isActive ? "text-blue-600" : "text-slate-400"}>
                            {item.icon}
                          </div>
                          <span>{item.label}</span>
                          {item.adminOnly && (
                            <span className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              Admin
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </nav>
                </div>
              </div>
            </div>

            {/* Mobile User Profile & Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white border border-slate-200/80 mb-2.5 shadow-2xs">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs flex-shrink-0 border border-blue-200">
                  {userName.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-900 truncate">
                    {userName}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate font-medium">
                    {userRole}
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  setIsMobileNavOpen(false);
                  setShowLogoutConfirm(true);
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200/70 transition-all min-h-[44px] cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out of Session</span>
              </button>

              <div className="mt-3 flex items-center justify-between text-[10px] text-slate-400 font-medium px-1">
                <span>SIH26162 • NTRO</span>
                <span className="font-mono">v2.4</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 relative">
        {/* TOP HEADER */}
        <header className="h-14 sm:h-16 flex-shrink-0 bg-white border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between z-20 gap-2 sm:gap-4">
          
          {/* Left: Mobile Menu Button & Brand Title */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* Hamburger Button (Mobile only) */}
            <button
              type="button"
              onClick={() => setIsMobileNavOpen(true)}
              className="md:hidden p-2 rounded-xl text-slate-700 hover:bg-slate-100 active:bg-slate-200 min-w-[40px] min-h-[40px] flex items-center justify-center cursor-pointer transition-colors"
              title="Open Navigation Menu"
            >
              <Menu className="w-5 h-5 text-slate-800" />
            </button>

            {/* Mobile Logo / Title */}
            <div className="flex items-center gap-2 md:hidden">
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-600 text-white shadow-2xs flex-shrink-0">
                <Flame className="w-4 h-4 fill-current" />
              </div>
              <span className="font-bold text-slate-900 text-xs xs:text-sm tracking-tight leading-none truncate max-w-[110px] xs:max-w-none">
                ThermoGuard
              </span>
            </div>

            {/* Desktop Brand Subtitle (hidden on md where sidebar shows it) */}
            <div className="hidden lg:block lg:w-40">
              <div className="font-bold text-slate-900 text-sm tracking-tight leading-none">ThermoGuard AI</div>
              <p className="text-[10px] text-slate-500 font-medium mt-1 leading-none">Detect • Classify • Protect</p>
            </div>
          </div>

          {/* Middle: Search */}
          <div className="flex-1 flex items-center max-w-xs sm:max-w-sm md:max-w-md relative min-w-0">
             <div className="relative w-full">
               <div className="absolute inset-y-0 left-0 pl-2.5 sm:pl-3 flex items-center pointer-events-none">
                 <Search className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-400" />
               </div>
               <input 
                 ref={searchInputRef}
                 type="text" 
                 value={searchQuery}
                 onChange={(e) => {
                   setSearchQuery(e.target.value);
                   setIsSearchOpen(true);
                   setHasExecutedSearch(false);
                 }}
                 onFocus={() => {
                   if (searchQuery.trim().length > 0) {
                     setIsSearchOpen(true);
                   }
                 }}
                 onKeyDown={handleSearchKeyDown}
                 placeholder="Search hotspot ID, class..." 
                 className="block w-full pl-8 sm:pl-9 pr-7 sm:pr-8 py-1.5 border border-slate-200 rounded-lg bg-slate-50 text-[11px] sm:text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-500 transition-colors truncate"
               />
               <div className="absolute inset-y-0 right-0 pr-2 flex items-center">
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery("");
                        setIsSearchOpen(false);
                        setHasExecutedSearch(false);
                      }}
                      className="p-0.5 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                      title="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <span className="hidden sm:inline-block text-[10px] text-slate-400 bg-white px-1 py-0.2 rounded border border-slate-200 font-mono shadow-2xs">
                      /
                    </span>
                  )}
               </div>
             </div>

             {/* Search Results Dropdown (Mobile-contained) */}
             {isSearchOpen && searchQuery.trim().length > 0 && (
               <div 
                 ref={searchDropdownRef}
                 className="absolute top-full left-0 right-0 sm:left-0 sm:right-auto sm:w-[380px] max-w-[calc(100vw-24px)] mt-2 bg-white rounded-xl border border-slate-200 shadow-xl p-2 z-50 max-h-80 overflow-y-auto divide-y divide-slate-100 animate-fade-in"
               >
                 {filteredSearchResults.length === 0 ? (
                   <div className="p-4 text-center text-xs text-slate-500 font-medium">
                     No matching thermal events found.
                   </div>
                 ) : (
                   <div>
                     <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                       <span>Matching Thermal Events</span>
                       <span>{filteredSearchResults.length} found</span>
                     </div>
                     <div className="space-y-0.5">
                       {filteredSearchResults.slice(0, 8).map((h, idx) => (
                         <button
                           key={h.event.id ? `${h.event.id}-${idx}` : `search-res-${idx}`}
                           onClick={() => handleSelectSearchResult(h)}
                           className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 flex items-center justify-between gap-2 transition-colors cursor-pointer group"
                         >
                           <div className="min-w-0 flex-1">
                             <div className="flex items-center gap-1.5 flex-wrap">
                               <span className="font-mono text-xs font-bold text-blue-600 group-hover:underline">
                                 {h.event.id}
                               </span>
                               <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                                 h.classification.risk_score === "CRITICAL"
                                   ? "bg-red-50 text-red-700 border-red-200"
                                   : h.classification.risk_score === "HIGH"
                                   ? "bg-orange-50 text-orange-700 border-orange-200"
                                   : h.classification.risk_score === "MEDIUM"
                                   ? "bg-amber-50 text-amber-700 border-amber-200"
                                   : "bg-emerald-50 text-emerald-700 border-emerald-200"
                               }`}>
                                 {h.classification.risk_score}
                               </span>
                               <span className="text-xs font-semibold text-slate-900 truncate">
                                 {h.classification.predicted_class}
                               </span>
                             </div>
                             <div className="text-[10px] text-slate-500 truncate mt-0.5">
                               {h.geo_context.nearest_industrial_facility} ({Math.round(h.geo_context.distance_to_industry)}m) • FRP: {h.event.frp.toFixed(1)} MW
                             </div>
                           </div>
                           <div className="text-right text-[10px] text-slate-400 font-mono flex-shrink-0 hidden xs:block">
                             {h.event.latitude.toFixed(2)}, {h.event.longitude.toFixed(2)}
                           </div>
                         </button>
                       ))}
                     </div>
                   </div>
                 )}
               </div>
             )}
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
            
            {/* Mode Selector */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button 
                onClick={handleLiveModeClick}
                className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-semibold transition-all cursor-pointer ${
                  isLiveMode
                    ? "bg-white text-blue-600 shadow-2xs border border-slate-200/50"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="Active satellite telemetry from NASA FIRMS VIIRS/MODIS"
              >
                <div className={`w-1.5 h-1.5 rounded-full ${isLiveMode ? "bg-blue-500" : "bg-slate-400"}`}></div>
                <span className="hidden xs:inline">NASA </span>FIRMS
              </button>
              <button 
                onClick={() => setIsScenarioDrawerOpen(true)}
                className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-medium transition-all cursor-pointer ${
                  !isLiveMode
                    ? "bg-white text-blue-600 font-semibold shadow-2xs border border-slate-200/50"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="Select Smart India Hackathon 2026 validation scenario"
              >
                {!isLiveMode && <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></div>}
                <span>Demo</span>
              </button>
            </div>

            {/* Status Indicator */}
            {!isLiveMode ? (
              <div 
                className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-semibold cursor-pointer"
                onClick={() => setIsScenarioDrawerOpen(true)}
                title={`Active Demo Scenario: ${activeScenario?.title || "Custom Scenario"}. Click to change.`}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                Demo
              </div>
            ) : connectionState === "connected" && healthData?.status === "ok" ? (
              <div 
                className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold cursor-pointer hover:bg-emerald-100/70 transition"
                onClick={refresh}
                title={`NASA FIRMS Mode: ${healthData?.providers?.firms || "Operational"} • System Nominal. Click to refresh.`}
              >
                 <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                 Live
              </div>
            ) : connectionState === "loading" ? (
              <div 
                className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-semibold"
              >
                 <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                 Syncing
              </div>
            ) : (
              <div 
                className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-semibold cursor-pointer"
                onClick={refresh}
                title={errorMessage || "Backend offline. Click to retry."}
              >
                 <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                 Offline
              </div>
            )}

            {/* Region Indicator (Desktop/Tablet only) */}
            <div 
              className="hidden md:flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg select-none"
              title="Monitored Area: India (NASA FIRMS South Asia Sector)"
            >
              <Compass className="w-3.5 h-3.5 text-blue-600" />
              <span>India</span>
            </div>

            {/* Refresh Surveillance / Telemetry Button */}
            <button
              onClick={() => {
                refresh();
                if (onResetToLive) {
                  onResetToLive();
                }
              }}
              className="p-1.5 sm:p-2 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
              title="Refresh NASA FIRMS telemetry and system health"
            >
              <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${connectionState === "loading" ? "animate-spin text-blue-600" : ""}`} />
            </button>

            {/* Incident Alert Bell */}
            <button 
              onClick={() => onSelectPage("alerts")}
              className="relative p-1.5 sm:p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
              title={activeAlertsCount > 0 ? `${activeAlertsCount} Active Incident Alerts` : "Incident Alerts"}
            >
              <BellRing className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              {activeAlertsCount > 0 && (
                <div className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white animate-pulse"></div>
              )}
            </button>
            
            {/* User Avatar & Dropdown */}
            <div className="relative" ref={userMenuRef}>
              <button 
                onClick={() => setIsUserMenuOpen((prev) => !prev)}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-700 font-bold text-xs border border-blue-200 hover:ring-2 hover:ring-blue-400/30 transition-all cursor-pointer flex-shrink-0"
                title={`User: ${userName} (${userRole})`}
              >
                {userName.charAt(0)}
              </button>

              {isUserMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-60 sm:w-64 max-w-[calc(100vw-32px)] bg-white rounded-xl border border-slate-200 shadow-xl p-3 z-50 animate-fade-in text-slate-800">
                  <div className="px-3 py-2.5 bg-slate-50 rounded-lg border border-slate-200/60 mb-2">
                    <div className="text-xs font-bold text-slate-900 truncate">{userName}</div>
                    <div className="text-[11px] text-slate-500 truncate">{user?.email || "v.sethi@ntro.gov.in"}</div>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        {userRole}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">Level 3 Clearance</span>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <button
                      onClick={() => {
                        onSelectPage("settings");
                        setIsUserMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5 text-slate-400" />
                      <span>Account & Preferences</span>
                    </button>

                    {(canAccessAdminDashboard || isAdmin) && (
                      <button
                        onClick={() => {
                          onSelectPage("admin");
                          setIsUserMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <ShieldAlert className="w-3.5 h-3.5 text-blue-600" />
                        <span>Admin Command Center</span>
                      </button>
                    )}

                    <div className="my-1 border-t border-slate-100" />

                    <button
                      onClick={() => {
                        setShowLogoutConfirm(true);
                        setIsUserMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 overflow-hidden relative">
          <div className="absolute inset-0 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6 pb-20">
             {children}
          </div>
        </main>
      </div>

      {/* Scenario Drawer for demonstration */}
      <ScenarioDrawer
        isOpen={isScenarioDrawerOpen}
        onClose={() => setIsScenarioDrawerOpen(false)}
        onSelectScenario={handleScenarioSelected}
        activeScenarioId={activeScenario?.id}
      />

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-sm p-6 transform transition-all">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Sign Out</h3>
            <p className="text-slate-500 text-xs sm:text-sm mb-6">
              Are you sure you want to end your current operational session?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={logout}
                className="px-4 py-2 rounded-xl text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
