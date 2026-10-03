import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  Server,
  Users,
  Activity,
  Radio,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sliders,
  ShieldCheck,
  Key,
  UserPlus,
  Trash2,
  Power,
  Clock,
  Database,
  Layers,
  FileText,
  AlertCircle,
  Check,
  Lock,
  ChevronDown,
  ChevronUp,
  History,
  Cpu,
  Zap,
  Globe,
  Satellite,
  Search,
  ExternalLink
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { apiService, HotspotItem } from "../services/api";

type AdminTab = "overview" | "alerts" | "providers" | "users" | "sessions" | "config";

interface AdminDashboardPageProps {
  onSelectHotspot?: (hotspot: HotspotItem) => void;
  onViewOnMap?: (hotspot: HotspotItem) => void;
  onOpenTimeline?: (hotspot: HotspotItem) => void;
  initialTab?: AdminTab;
}

export const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({
  onSelectHotspot,
  onViewOnMap,
  onOpenTimeline,
  initialTab
}) => {
  const { user, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab || "overview");

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // Telemetry data
  const [overviewData, setOverviewData] = useState<any>(null);
  const [systemHealth, setSystemHealth] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [sessionsList, setSessionsList] = useState<any[]>([]);
  const [adminConfig, setAdminConfig] = useState<any>(null);

  // Action states
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [selectedAlertForAction, setSelectedAlertForAction] = useState<any | null>(null);
  const [actionNotes, setActionNotes] = useState<string>("");
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);

  // New User Form State
  const [showAddUserModal, setShowAddUserModal] = useState<boolean>(false);
  const [newUsername, setNewUsername] = useState<string>("");
  const [newName, setNewName] = useState<string>("");
  const [newEmail, setNewEmail] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [newRole, setNewRole] = useState<string>("ANALYST");
  const [newDepartment, setNewDepartment] = useState<string>("Thermal Geospatial Unit");

  // Config Form State
  const [configForm, setConfigForm] = useState<any>({});
  const [testingProvider, setTestingProvider] = useState<boolean>(false);
  const [providerTestResult, setProviderTestResult] = useState<any>(null);

  const showNotification = (type: "success" | "error" | "info", text: string) => {
    setActionMessage({ type, text });
    setTimeout(() => {
      setActionMessage(null);
    }, 5000);
  };

  const loadAllAdminData = async () => {
    try {
      setRefreshing(true);
      const [overview, health, alertsData, usersRes, sessionsRes, configRes] = await Promise.all([
        apiService.getAdminOverview().catch(() => null),
        apiService.getAdminSystemHealth().catch(() => null),
        apiService.getAlerts().catch(() => []),
        apiService.getAdminUsers().catch(() => ({ users: [] })),
        apiService.getAdminSessions().catch(() => ({ sessions: [] })),
        apiService.getAdminConfig().catch(() => ({ config: {} }))
      ]);

      setOverviewData(overview);
      setSystemHealth(health);
      setAlerts(alertsData);
      setUsersList(usersRes.users || []);
      setSessionsList(sessionsRes.sessions || []);
      if (configRes && configRes.config) {
        setAdminConfig(configRes);
        setConfigForm(configRes.config);
      }
    } catch (err: any) {
      console.error("Failed to load admin data", err);
      showNotification("error", err.message || "Failed to load administrative telemetry.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAllAdminData();
  }, []);

  const handleToggleDataMode = async () => {
    try {
      setActionLoadingId("mode-toggle");
      const res = await apiService.toggleAdminDataMode();
      showNotification("success", res.message || "Data mode updated.");
      await loadAllAdminData();
    } catch (err: any) {
      showNotification("error", err.message || "Failed to toggle data mode.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleExecuteAlertAction = async (alertId: string, action: "ACKNOWLEDGE" | "RESOLVE" | "REOPEN" | "ESCALATE") => {
    try {
      setActionLoadingId(`alert-${alertId}`);
      const res = await apiService.executeAlertAction(alertId, action, actionNotes || undefined);
      showNotification("success", res.message || `Alert ${action} successfully.`);
      setSelectedAlertForAction(null);
      setActionNotes("");
      await loadAllAdminData();
    } catch (err: any) {
      showNotification("error", err.message || "Failed to execute alert action.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newName || !newEmail || !newPassword) {
      showNotification("error", "All fields are required.");
      return;
    }
    try {
      setActionLoadingId("create-user");
      await apiService.createAdminUser({
        username: newUsername,
        name: newName,
        email: newEmail,
        password: newPassword,
        role: newRole,
        department: newDepartment
      });
      showNotification("success", `Account created for ${newName} [${newRole}].`);
      setShowAddUserModal(false);
      setNewUsername("");
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      await loadAllAdminData();
    } catch (err: any) {
      showNotification("error", err.message || "Failed to create user account.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleUpdateRole = async (userId: string, targetRole: string) => {
    try {
      setActionLoadingId(`user-role-${userId}`);
      await apiService.updateAdminUserRole(userId, targetRole);
      showNotification("success", `User role updated to ${targetRole}.`);
      await loadAllAdminData();
    } catch (err: any) {
      showNotification("error", err.message || "Failed to update role.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!window.confirm(`Are you sure you want to permanently revoke credentials for ${userName}?`)) {
      return;
    }
    try {
      setActionLoadingId(`delete-${userId}`);
      await apiService.deleteAdminUser(userId);
      showNotification("success", `Credentials for ${userName} revoked.`);
      await loadAllAdminData();
    } catch (err: any) {
      showNotification("error", err.message || "Failed to delete user.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRevokeSession = async (token: string) => {
    try {
      setActionLoadingId(`session-${token.substring(0, 8)}`);
      await apiService.revokeAdminSession(token);
      showNotification("success", "Active session invalidated.");
      await loadAllAdminData();
    } catch (err: any) {
      showNotification("error", err.message || "Failed to revoke session.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setActionLoadingId("save-config");
      await apiService.updateAdminConfig(configForm);
      showNotification("success", "Administrative system configuration updated.");
      await loadAllAdminData();
    } catch (err: any) {
      showNotification("error", err.message || "Failed to save configuration.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleTestProvider = async (provider: string) => {
    try {
      setTestingProvider(true);
      const res = await apiService.testAdminProvider(provider);
      setProviderTestResult(res);
      showNotification("success", `${provider} connectivity test completed.`);
    } catch (err: any) {
      showNotification("error", err.message || "Provider test failed.");
    } finally {
      setTestingProvider(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="h-full flex items-center justify-center p-6 bg-slate-50 text-slate-800">
        <div className="max-w-md w-full p-6 rounded-xl bg-white border border-rose-500/30 text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-rose-500/20 border border-rose-200 flex items-center justify-center text-rose-700">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Restricted Command Authorization</h2>
            <p className="text-xs text-slate-500 mt-1">
              Your active clearance role ({user?.role || "ANALYST"}) is designated for intelligence analysis and does not have administrative command privileges.
            </p>
          </div>
          <div className="p-3 rounded bg-white border border-slate-200 text-[11px] font-mono text-slate-500">
            Required Clearance: Level 4 Restricted (Command Authority / Administrator)
          </div>
        </div>
      </div>
    );
  }

  const isLive = overviewData?.system?.data_mode === "LIVE_SATELLITE_API";

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50 text-slate-800 font-sans">
      {/* 1. TOP COMMAND BAR */}
      <header className="flex-shrink-0 px-6 py-4 bg-white border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-2xs">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-base font-bold text-slate-900 tracking-tight">
                Command Authority & Administration Console
              </h1>
              <span className="px-2.5 py-0.5 rounded font-mono text-[10px] font-bold bg-red-50 text-red-700 border border-red-200 uppercase">
                L4 RESTRICTED
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              National Technical Research Organisation (NTRO) • SIH26162
            </p>
          </div>
        </div>

        {/* Global Action & Status Strip */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Data Mode Switcher */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-xs font-semibold text-slate-500">Data Feed:</span>
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
              isLive
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-teal-50 text-teal-700 border border-teal-200"
            }`}>
              {isLive ? "LIVE NASA SATELLITE" : "CALIBRATED DEMO FEED"}
            </span>

            <button
              onClick={handleToggleDataMode}
              disabled={actionLoadingId === "mode-toggle"}
              className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-xs font-semibold text-blue-700 transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50 shadow-2xs"
            >
              <Power className="w-3 h-3" />
              <span>{isLive ? "Switch to Demo" : "Switch to Live"}</span>
            </button>
          </div>

          <button
            onClick={loadAllAdminData}
            disabled={refreshing}
            className="px-3.5 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-blue-600" : "text-slate-500"}`} />
            <span>Refresh Telemetry</span>
          </button>
        </div>
      </header>

      {/* Action Notification Toast */}
      {actionMessage && (
        <div className={`px-6 py-2.5 text-xs font-medium flex items-center justify-between border-b ${
          actionMessage.type === "success"
            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
            : actionMessage.type === "error"
            ? "bg-red-50 text-red-800 border-red-200"
            : "bg-blue-50 text-blue-800 border-blue-200"
        }`}>
          <div className="flex items-center gap-2">
            {actionMessage.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
            {actionMessage.type === "error" && <AlertTriangle className="w-4 h-4 text-red-600" />}
            {actionMessage.type === "info" && <Activity className="w-4 h-4 text-blue-600" />}
            <span>{actionMessage.text}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. TAB NAVIGATION BAR */}
      <div className="flex-shrink-0 px-6 bg-white border-b border-slate-200 flex items-center gap-2 overflow-x-auto py-2">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === "overview"
              ? "bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs"
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>System Overview</span>
        </button>

        <button
          onClick={() => setActiveTab("alerts")}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === "alerts"
              ? "bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs"
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Incident Alert Authority</span>
          {alerts.filter(a => a.status === "ACTIVE").length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full font-mono text-[9px] bg-red-600 text-white font-bold">
              {alerts.filter(a => a.status === "ACTIVE").length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("providers")}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === "providers"
              ? "bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs"
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>Provider Ingestion</span>
        </button>

        <button
          onClick={() => setActiveTab("users")}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === "users"
              ? "bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs"
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>User & Clearance Roles</span>
          <span className="px-2 py-0.2 rounded font-mono text-[10px] font-bold bg-slate-100 text-slate-700">
            {usersList.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("sessions")}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === "sessions"
              ? "bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs"
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
          }`}
        >
          <Key className="w-3.5 h-3.5" />
          <span>Active Sessions</span>
          <span className="px-2 py-0.2 rounded font-mono text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            {sessionsList.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("config")}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === "config"
              ? "bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs"
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>System Parameters</span>
        </button>
      </div>

      {/* 3. TAB CONTENT AREA */}
      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* ========================================== */}
        {/* TAB 1: SYSTEM OVERVIEW                     */}
        {/* ========================================== */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* KPI Summary Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>Total Hotspots</span>
                  <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                    <Database className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold font-mono text-slate-900 mt-2 tracking-tight">
                  {overviewData?.counts?.total_hotspots || 0}
                </div>
                <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5 font-medium">
                  <span className="text-emerald-700 font-mono font-bold">{overviewData?.counts?.live_hotspots || 0} Live</span>
                  <span>•</span>
                  <span className="text-slate-600 font-mono">{overviewData?.counts?.demo_hotspots || 0} Demo</span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>Incident Alerts</span>
                  <div className="w-8 h-8 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold font-mono text-red-700 mt-2 tracking-tight">
                  {overviewData?.counts?.alerts?.active || 0}
                </div>
                <div className="text-xs text-slate-500 mt-1 font-medium truncate">
                  {overviewData?.counts?.alerts?.resolved || 0} Resolved • {overviewData?.counts?.alerts?.acknowledged || 0} Triaged
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>Registered Personnel</span>
                  <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                    <Users className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold font-mono text-slate-900 mt-2 tracking-tight">
                  {overviewData?.counts?.registered_users || 0}
                </div>
                <div className="text-xs text-slate-500 mt-1 font-mono font-medium">
                  {overviewData?.counts?.active_sessions || 0} Active JWT Sessions
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>System Uptime</span>
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                    <Clock className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold font-mono text-emerald-700 mt-2 truncate tracking-tight">
                  {overviewData?.system?.uptime_formatted || "Nominal"}
                </div>
                <div className="text-xs text-slate-500 mt-1 font-mono font-medium">
                  Node.js {overviewData?.system?.node_version || "v20"}
                </div>
              </div>
            </div>

            {/* Telemetry Architecture Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Process & Memory Telemetry */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                      <Cpu className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">Runtime & Memory Diagnostics</h3>
                  </div>
                  <span className="px-2.5 py-0.5 rounded font-mono text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    STATUS: NOMINAL
                  </span>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-slate-50">
                    <span className="text-slate-500 font-medium">RSS Resident Memory:</span>
                    <span className="font-mono font-bold text-blue-700">{overviewData?.system?.memory_mb?.rss || 0} MB</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-50">
                    <span className="text-slate-500 font-medium">Heap Total Allocated:</span>
                    <span className="font-mono text-slate-700 font-bold">{overviewData?.system?.memory_mb?.heap_total || 0} MB</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-50">
                    <span className="text-slate-500 font-medium">Heap In-Use:</span>
                    <span className="font-mono text-emerald-700 font-bold">{overviewData?.system?.memory_mb?.heap_used || 0} MB</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-500 font-medium">Host Architecture:</span>
                    <span className="font-mono text-slate-700 font-bold">{systemHealth?.telemetry?.cpu?.arch || "x64"} ({systemHealth?.telemetry?.cpu?.platform || "linux"})</span>
                  </div>
                </div>
              </div>

              {/* Spatial PostGIS Engine Telemetry */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-teal-50 flex items-center justify-center text-teal-600">
                      <Layers className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">PostGIS & Machine Learning Subsystem</h3>
                  </div>
                  <span className="px-2.5 py-0.5 rounded font-mono text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                    INDEX: GIST ACTIVE
                  </span>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-slate-50">
                    <span className="text-slate-500 font-medium">PostGIS Geometry Index:</span>
                    <span className="font-mono text-emerald-700 font-bold">geometry_gist_idx (Spatial Tree)</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-50">
                    <span className="text-slate-500 font-medium">ML Classifier Architecture:</span>
                    <span className="font-mono text-blue-700 font-bold">Random Forest Ensemble (100 Trees)</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-50">
                    <span className="text-slate-500 font-medium">Feature Engineering Pipeline:</span>
                    <span className="font-mono text-slate-700 font-bold">14 Thermal, Spatial & Temporal Features</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-500 font-medium">Model Version:</span>
                    <span className="font-mono text-amber-700 font-bold">random_forest_v1.0.0</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Provider Connectivity Grid */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                    <Globe className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">Geospatial Data Provider Interfaces</h3>
                </div>
                <button
                  onClick={() => setActiveTab("providers")}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                >
                  <span>Manage Ingestion</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900">NASA FIRMS API</span>
                    <span className={`px-2 py-0.5 rounded font-mono text-[9px] font-bold ${
                      isLive ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-teal-50 text-teal-700 border border-teal-200"
                    }`}>
                      {isLive ? "LIVE NRT" : "CALIBRATED FEED"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Thermal observations from VIIRS (SNPP/NOAA-20) & MODIS sensors.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900">OpenStreetMap (OSM)</span>
                    <span className="px-2 py-0.5 rounded font-mono text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                      POSTGIS SPATIAL
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Industrial refinery, gas flare stack, petrochemical & power plant cadastre.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900">ESA WorldCover 10m</span>
                    <span className="px-2 py-0.5 rounded font-mono text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      LAND COVER 10M
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    High-resolution cropland, dense forest reserve, cropland, and built-up land-use context.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 2: INCIDENT ALERT AUTHORITY             */}
        {/* ========================================== */}
        {activeTab === "alerts" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Incident Alert Management & Command Audit Trail
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Command-level triage, officer acknowledgement, hazard resolution, and timestamped forensic trail.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                  Total Alerts: {alerts.length}
                </span>
              </div>
            </div>

            {/* Alerts List with Audit Logs */}
            <div className="space-y-4">
              {alerts.length === 0 ? (
                <div className="p-12 text-center bg-white border border-slate-200/80 rounded-2xl text-slate-500 text-xs shadow-2xs">
                  No incident alerts logged. All thermal perimeters nominal.
                </div>
              ) : (
                alerts.map((alert, idx) => {
                  const isAck = alert.status === "ACKNOWLEDGED";
                  const isResolved = alert.status === "RESOLVED";
                  const isExpanded = expandedAlertId === alert.id;

                  return (
                    <div
                      key={alert.id ? `${alert.id}-${idx}` : `alert-${idx}`}
                      className={`p-5 rounded-2xl border transition-all ${
                        isResolved
                          ? "bg-white border-slate-200/80 opacity-85 shadow-2xs"
                          : alert.severity === "CRITICAL"
                          ? "bg-white border-red-200 shadow-sm"
                          : "bg-white border-amber-200 shadow-2xs"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-2.5 py-0.5 rounded font-mono text-[10px] font-bold border ${
                              alert.severity === "CRITICAL"
                                ? "bg-red-50 text-red-700 border-red-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                            }`}>
                              {alert.severity} HAZARD
                            </span>

                            <span className={`px-2.5 py-0.5 rounded font-mono text-[10px] font-bold border ${
                              isResolved
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : isAck
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : "bg-red-50 text-red-700 border-red-200"
                            }`}>
                              STATUS: {alert.status}
                            </span>

                            <span className="text-sm font-bold text-slate-900">
                              {alert.title}
                            </span>
                          </div>

                          <p className="text-xs text-slate-600 leading-relaxed">
                            {alert.description}
                          </p>

                          {alert.facility_name && (
                            <div className="text-xs text-blue-700 font-mono font-medium">
                              Perimeter Target: {alert.facility_name}
                            </div>
                          )}

                          {alert.action_recommended && (
                            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200/80 px-3 py-1.5 rounded-xl font-medium">
                              <span className="font-bold">Recommended Protocol: </span>
                              {alert.action_recommended}
                            </div>
                          )}
                        </div>

                        {/* Officer Action Buttons */}
                        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                          {!isAck && !isResolved && (
                            <button
                              onClick={() => {
                                setSelectedAlertForAction(alert);
                                setActionNotes("");
                              }}
                              disabled={actionLoadingId === `alert-${alert.id}`}
                              className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Acknowledge</span>
                            </button>
                          )}

                          {!isResolved && (
                            <button
                              onClick={() => {
                                setSelectedAlertForAction({ ...alert, _targetAction: "RESOLVE" });
                                setActionNotes("");
                              }}
                              disabled={actionLoadingId === `alert-${alert.id}`}
                              className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>Resolve</span>
                            </button>
                          )}

                          {isResolved && (
                            <button
                              onClick={() => handleExecuteAlertAction(alert.id, "REOPEN")}
                              disabled={actionLoadingId === `alert-${alert.id}`}
                              className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                            >
                              <span>Reopen</span>
                            </button>
                          )}

                          <button
                            onClick={() => setExpandedAlertId(isExpanded ? null : alert.id)}
                            className="px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                          >
                            <History className="w-3.5 h-3.5" />
                            <span>Audit Trail</span>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {/* Expandable Forensic Audit Trail */}
                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t border-slate-100 space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                            <span className="flex items-center gap-2">
                              <History className="w-4 h-4 text-blue-600" />
                              <span>Forensic Operational Audit Trail</span>
                            </span>
                            <span className="font-mono text-slate-500 text-[11px]">Alert ID: {alert.id}</span>
                          </div>

                          <div className="space-y-2 text-xs">
                            {alert.audit_trail && alert.audit_trail.length > 0 ? (
                              alert.audit_trail.map((log: any, idx: number) => (
                                <div key={idx} className="p-3 rounded-lg bg-white border border-slate-200 flex items-start justify-between gap-3 shadow-2xs">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2 font-mono text-xs">
                                      <span className="text-blue-700 font-bold">[{log.action}]</span>
                                      <span className="text-slate-800 font-semibold">{log.performed_by}</span>
                                    </div>
                                    <p className="text-xs text-slate-600 leading-relaxed">{log.notes}</p>
                                  </div>
                                  <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap">
                                    {new Date(log.timestamp).toLocaleString()}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <div className="text-xs text-slate-500 font-mono py-2">
                                System triggered alert logged on {new Date(alert.created_at).toLocaleString()}.
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Alert Action Modal */}
            {selectedAlertForAction && (
              <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="max-w-md w-full rounded-2xl bg-white border border-slate-200 p-6 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                        <ShieldAlert className="w-4 h-4" />
                      </div>
                      <span>Execute Command Authority Action</span>
                    </h3>
                    <button onClick={() => setSelectedAlertForAction(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="text-xs text-slate-600">
                    <span className="font-bold text-slate-900">Target Hazard: </span>
                    <span>{selectedAlertForAction.title}</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Command Operational Notes / Dispatch Action:
                    </label>
                    <textarea
                      value={actionNotes}
                      onChange={(e) => setActionNotes(e.target.value)}
                      placeholder="Enter verification notes, field team dispatch orders, or perimeter resolution details..."
                      rows={3}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 transition-colors"
                    />
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex justify-end gap-2.5">
                    <button
                      onClick={() => setSelectedAlertForAction(null)}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 cursor-pointer transition-colors"
                    >
                      Cancel
                    </button>

                    {selectedAlertForAction._targetAction === "RESOLVE" ? (
                      <button
                        onClick={() => handleExecuteAlertAction(selectedAlertForAction.id, "RESOLVE")}
                        disabled={actionLoadingId === `alert-${selectedAlertForAction.id}`}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>Confirm Resolution</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleExecuteAlertAction(selectedAlertForAction.id, "ACKNOWLEDGE")}
                        disabled={actionLoadingId === `alert-${selectedAlertForAction.id}`}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
                      >
                        <Check className="w-4 h-4" />
                        <span>Confirm Acknowledgment</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 3: PROVIDERS & INGESTION MONITORING     */}
        {/* ========================================== */}
        {activeTab === "providers" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Provider Status & Ingestion Telemetry
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time status of NASA FIRMS API, OpenStreetMap cadastre, ESA WorldCover, and pipeline throughput.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleTestProvider("NASA_FIRMS")}
                  disabled={testingProvider}
                  className="px-3.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-xs font-semibold text-blue-700 flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                >
                  <Zap className={`w-3.5 h-3.5 ${testingProvider ? "animate-spin text-blue-600" : "text-blue-600"}`} />
                  <span>Test FIRMS Connectivity</span>
                </button>
              </div>
            </div>

            {/* Provider Test Result Display */}
            {providerTestResult && (
              <div className="p-4 rounded-2xl bg-white border border-blue-200 shadow-2xs text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-blue-700 flex items-center gap-1.5">
                    <Activity className="w-4 h-4" />
                    <span>Diagnostic Test Result: {providerTestResult.provider}</span>
                  </span>
                  <button onClick={() => setProviderTestResult(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
                <pre className="p-3 rounded-xl bg-slate-50 font-mono text-[11px] text-slate-700 overflow-x-auto border border-slate-200">
                  {JSON.stringify(providerTestResult.result || providerTestResult, null, 2)}
                </pre>
              </div>
            )}

            {/* Provider Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* NASA FIRMS Provider */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                      <Satellite className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">NASA FIRMS API</h3>
                  </div>
                  <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                    isLive ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-teal-50 text-teal-700 border border-teal-200"
                  }`}>
                    {isLive ? "LIVE SATELLITE" : "CALIBRATED"}
                  </span>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-slate-50">
                    <span className="text-slate-500 font-medium">Endpoint:</span>
                    <span className="font-mono text-blue-700 font-bold">firms.modaps.eosdis.nasa.gov</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-50">
                    <span className="text-slate-500 font-medium">Key Security:</span>
                    <span className="font-mono text-emerald-700 font-bold">
                      {adminConfig?.firms_key_configured ? "Configured Server-Side" : "Demo Mode Only"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-50">
                    <span className="text-slate-500 font-medium">Supported Satellites:</span>
                    <span className="font-mono text-slate-700 font-bold">VIIRS (SNPP/NOAA-20), MODIS</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-500 font-medium">Default BBox:</span>
                    <span className="font-mono text-slate-700 font-bold">68.0, 6.5, 97.5, 37.5 (India)</span>
                  </div>
                </div>
              </div>

              {/* OpenStreetMap PostGIS Provider */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-600">
                      <Database className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">OpenStreetMap Cadastre</h3>
                  </div>
                  <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    ONLINE
                  </span>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-slate-50">
                    <span className="text-slate-500 font-medium">Infrastructure Layer:</span>
                    <span className="font-mono text-teal-700 font-bold">Refineries, Power Plants, Mines</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-50">
                    <span className="text-slate-500 font-medium">Spatial Index:</span>
                    <span className="font-mono text-emerald-700 font-bold">PostGIS GIST Tree</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-50">
                    <span className="text-slate-500 font-medium">Industrial POIs:</span>
                    <span className="font-mono text-slate-700 font-bold">12 Primary Facilities</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-500 font-medium">Query Mode:</span>
                    <span className="font-mono text-slate-700 font-bold">Spatial Joins (&lt;1ms)</span>
                  </div>
                </div>
              </div>

              {/* ESA WorldCover LandCover Provider */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                      <Layers className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">ESA WorldCover 10m</h3>
                  </div>
                  <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    ONLINE
                  </span>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-slate-50">
                    <span className="text-slate-500 font-medium">Resolution:</span>
                    <span className="font-mono text-blue-700 font-bold">10-meter Ground Grid</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-50">
                    <span className="text-slate-500 font-medium">Classifications:</span>
                    <span className="font-mono text-slate-700 font-bold">Cropland, Forest, Built-up</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-50">
                    <span className="text-slate-500 font-medium">Temporal Coverage:</span>
                    <span className="font-mono text-slate-700 font-bold">Annual Dynamic Layer</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-500 font-medium">Context Engine:</span>
                    <span className="font-mono text-emerald-700 font-bold">Instant Spatial Overlay</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Ingestion Pipeline Metrics */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Ingestion Pipeline Performance</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="text-slate-500 font-medium text-xs">Total Raw Ingested</div>
                  <div className="text-2xl font-mono font-bold text-slate-900 mt-1">
                    {overviewData?.ingestion_metrics?.total_ingested || 0}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="text-slate-500 font-medium text-xs">Valid Cleaned Hotspots</div>
                  <div className="text-2xl font-mono font-bold text-emerald-700 mt-1">
                    {overviewData?.ingestion_metrics?.valid_hotspots || 0}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="text-slate-500 font-medium text-xs">Rejected Bad Coordinates</div>
                  <div className="text-2xl font-mono font-bold text-slate-500 mt-1">
                    {overviewData?.ingestion_metrics?.rejected_duplicates || 0}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="text-slate-500 font-medium text-xs">Enriched &amp; Classified</div>
                  <div className="text-2xl font-mono font-bold text-blue-700 mt-1">
                    {overviewData?.ingestion_metrics?.enriched_records || 0}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 4: USER & ROLE ADMINISTRATION          */}
        {/* ========================================== */}
        {activeTab === "users" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  User Account &amp; Role-Based Clearance Administration
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Manage surveillance personnel, analysts, commanding officers, and role-based permissions.
                </p>
              </div>

              <button
                onClick={() => setShowAddUserModal(true)}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              >
                <UserPlus className="w-4 h-4" />
                <span>Add Officer / Analyst</span>
              </button>
            </div>

            {/* Users Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider text-[10px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Personnel</th>
                    <th className="px-4 py-3">Username / Email</th>
                    <th className="px-4 py-3">Role &amp; Clearance</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Sessions</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usersList.map((u) => {
                    return (
                      <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 font-bold text-xs shadow-2xs">
                              {u.name.charAt(0)}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900">{u.name}</div>
                              <div className="text-[10px] text-blue-700 font-mono font-medium">{u.badge_number || "SYS-001"}</div>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="text-slate-800 font-mono font-medium">{u.username}</div>
                          <div className="text-xs text-slate-500">{u.email}</div>
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <select
                              value={u.role}
                              onChange={(e) => handleUpdateRole(u.id, e.target.value)}
                              disabled={actionLoadingId === `user-role-${u.id}`}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 focus:outline-none focus:bg-white focus:border-blue-500 cursor-pointer transition-colors"
                            >
                              <option value="ADMIN">ADMIN (Level 4 Restricted)</option>
                              <option value="CHIEF_SURVEILLANCE_OFFICER">Chief Surveillance Officer (L4)</option>
                              <option value="SENIOR_GIS_ANALYST">Senior GIS Analyst (L3)</option>
                              <option value="ANALYST">GIS Intelligence Analyst (L2)</option>
                              <option value="FIELD_OPERATIONS_OFFICER">Field Operations Officer (L3)</option>
                            </select>
                          </div>
                        </td>

                        <td className="px-4 py-3.5 text-slate-600 font-medium">
                          {u.department || "Surveillance Command"}
                        </td>

                        <td className="px-4 py-3.5 font-mono text-blue-700 font-bold">
                          {u.session_count || 0} active
                        </td>

                        <td className="px-4 py-3.5 text-right">
                          <button
                            onClick={() => handleDeleteUser(u.id, u.name)}
                            disabled={actionLoadingId === `delete-${u.id}` || u.username === "admin" || u.username === "ntro.officer"}
                            title={u.username === "admin" ? "Default admin account cannot be deleted" : "Revoke credentials"}
                            className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-30 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Add User Modal */}
            {showAddUserModal && (
              <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="max-w-md w-full rounded-2xl bg-white border border-slate-200 p-6 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                        <UserPlus className="w-4 h-4" />
                      </div>
                      <span>Register New Personnel Account</span>
                    </h3>
                    <button onClick={() => setShowAddUserModal(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>

                  <form onSubmit={handleCreateUser} className="space-y-3.5 text-xs">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="e.g. Dr. Rajesh Khanna"
                        required
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Username</label>
                      <input
                        type="text"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        placeholder="e.g. rajesh.gis"
                        required
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 font-mono transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Official Email Address</label>
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="e.g. rajesh@thermoguard.gov.in"
                        required
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 font-mono transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Initial Password</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••••••"
                        required
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 font-mono transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Clearance Role</label>
                      <select
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500 transition-colors cursor-pointer"
                      >
                        <option value="ANALYST">GIS Intelligence Analyst (Level 2)</option>
                        <option value="SENIOR_GIS_ANALYST">Senior GIS Analyst (Level 3)</option>
                        <option value="CHIEF_SURVEILLANCE_OFFICER">Chief Surveillance Officer (Level 4)</option>
                        <option value="FIELD_OPERATIONS_OFFICER">Field Operations Officer (Level 3)</option>
                        <option value="ADMIN">System Administrator (Level 4)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Department / Division</label>
                      <input
                        type="text"
                        value={newDepartment}
                        onChange={(e) => setNewDepartment(e.target.value)}
                        placeholder="e.g. Thermal Satellite Division"
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 transition-colors"
                      />
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex justify-end gap-2.5">
                      <button
                        type="button"
                        onClick={() => setShowAddUserModal(false)}
                        className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 cursor-pointer transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={actionLoadingId === "create-user"}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
                      >
                        <UserPlus className="w-4 h-4" />
                        <span>Create Account</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 5: ACTIVE SESSIONS & SECURITY          */}
        {/* ========================================== */}
        {activeTab === "sessions" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Active Authentication Sessions &amp; Token Invalidation
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time inspection of active JWT tokens, login origin timestamps, and emergency session revocation.
                </p>
              </div>

              <div className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                Active Sessions: {sessionsList.length}
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider text-[10px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">User Profile</th>
                    <th className="px-4 py-3">Clearance Level</th>
                    <th className="px-4 py-3">Token Fingerprint</th>
                    <th className="px-4 py-3">Login Time</th>
                    <th className="px-4 py-3">Session Expiry</th>
                    <th className="px-4 py-3 text-right">Revocation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sessionsList.map((s) => (
                    <tr key={s.token} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-900">{s.name || s.username}</div>
                        <div className="text-xs text-slate-500 font-mono">{s.email}</div>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="px-2.5 py-0.5 rounded font-mono text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {s.role}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 font-mono text-xs text-slate-500">
                        {s.token.substring(0, 16)}...
                      </td>

                      <td className="px-4 py-3.5 text-xs text-slate-600 font-mono">
                        {new Date(s.created_at).toLocaleString()}
                      </td>

                      <td className="px-4 py-3.5 text-xs text-slate-500 font-mono">
                        {new Date(s.expires_at).toLocaleString()}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <button
                          onClick={() => handleRevokeSession(s.token)}
                          disabled={actionLoadingId === `session-${s.token.substring(0, 8)}`}
                          className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ml-auto shadow-2xs disabled:opacity-50"
                        >
                          <Power className="w-3.5 h-3.5" />
                          <span>Revoke</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 6: SYSTEM PARAMETERS & CONFIG          */}
        {/* ========================================== */}
        {activeTab === "config" && (
          <div className="space-y-6 max-w-2xl">
            <div className="pb-3 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-900">
                Administrative System Parameters &amp; Thresholds
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure operational thresholds for Fire Radiative Power (FRP), industrial proximity radius, and auto-sync intervals.
              </p>
            </div>

            <form onSubmit={handleSaveConfig} className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-6 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Critical FRP Threshold (MW)
                  </label>
                  <input
                    type="number"
                    value={configForm.critical_frp_threshold ?? 100}
                    onChange={(e) => setConfigForm({ ...configForm, critical_frp_threshold: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 font-mono transition-colors"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Surges above this value trigger Critical Tier-3 alert.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    High FRP Threshold (MW)
                  </label>
                  <input
                    type="number"
                    value={configForm.high_frp_threshold ?? 45}
                    onChange={(e) => setConfigForm({ ...configForm, high_frp_threshold: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 font-mono transition-colors"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Surges above this trigger High priority dispatch.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Industrial Proximity Radius (Meters)
                  </label>
                  <input
                    type="number"
                    value={configForm.industrial_proximity_radius_m ?? 1000}
                    onChange={(e) => setConfigForm({ ...configForm, industrial_proximity_radius_m: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 font-mono transition-colors"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Max spatial distance to associate hotspot with facility.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Minimum FIRMS Confidence Filter (%)
                  </label>
                  <input
                    type="number"
                    value={configForm.min_confidence_filter ?? 50}
                    onChange={(e) => setConfigForm({ ...configForm, min_confidence_filter: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 font-mono transition-colors"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Observations below this confidence are filtered out.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    FIRMS Auto-Sync Interval (Minutes)
                  </label>
                  <input
                    type="number"
                    value={configForm.sync_interval_mins ?? 15}
                    onChange={(e) => setConfigForm({ ...configForm, sync_interval_mins: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 font-mono transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Default FIRMS Bounding Box (minLon, minLat, maxLon, maxLat)
                  </label>
                  <input
                    type="text"
                    value={configForm.firms_default_bbox ?? "68.0,6.5,97.5,37.5"}
                    onChange={(e) => setConfigForm({ ...configForm, firms_default_bbox: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 font-mono transition-colors"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button
                  type="submit"
                  disabled={actionLoadingId === "save-config"}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-sm transition-colors"
                >
                  <Sliders className="w-4 h-4" />
                  <span>Save Configuration</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
};
