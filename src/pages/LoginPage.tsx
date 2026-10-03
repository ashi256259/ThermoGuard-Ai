import React, { useState } from "react";
import {
  Flame,
  Lock,
  Mail,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Loader2,
  KeyRound
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

export const LoginPage: React.FC = () => {
  const { login, register, isLoading } = useAuth();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [identifier, setIdentifier] = useState<string>("officer@thermoguard.gov.in");
  const [password, setPassword] = useState<string>("Analyst@2026!");
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // Register state
  const [regName, setRegName] = useState<string>("");
  const [regUsername, setRegUsername] = useState<string>("");
  const [regEmail, setRegEmail] = useState<string>("");
  const [regPassword, setRegPassword] = useState<string>("");
  const [regRole, setRegRole] = useState<string>("ANALYST");
  const [regDepartment, setRegDepartment] = useState<string>("Thermal & Geospatial Intelligence Wing");

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!identifier.trim() || !password) {
      setErrorMsg("Please enter your official email address and password.");
      return;
    }

    try {
      setIsSubmitting(true);
      await login(identifier.trim(), password);
      setSuccessMsg("Clearance verified. Launching surveillance console...");
    } catch (err: any) {
      setErrorMsg(err.message || "Invalid credentials. Please verify your email and password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!regName.trim() || !regUsername.trim() || !regEmail.trim() || !regPassword) {
      setErrorMsg("Please fill in all required registration fields.");
      return;
    }

    if (regPassword.length < 6) {
      setErrorMsg("Password must be at least 6 characters in length.");
      return;
    }

    try {
      setIsSubmitting(true);
      await register({
        name: regName.trim(),
        username: regUsername.trim(),
        email: regEmail.trim(),
        password: regPassword,
        role: regRole,
        department: regDepartment.trim()
      });
      setSuccessMsg("Account successfully provisioned. Redirecting to workspace...");
    } catch (err: any) {
      setErrorMsg(err.message || "Registration failed. Username or email may already be in use.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const demoProfiles = [
    {
      shortName: "Vikram",
      clearance: "Level 4",
      role: "Chief Surveillance Officer",
      email: "officer@thermoguard.gov.in",
      pass: "Analyst@2026!"
    },
    {
      shortName: "Roy",
      clearance: "Level 2",
      role: "GIS Analyst",
      email: "analyst@thermoguard.gov.in",
      pass: "Analyst#2026"
    },
    {
      shortName: "Sharma",
      clearance: "Level 3",
      role: "Senior GIS Analyst",
      email: "analyst.gis@thermoguard.gov.in",
      pass: "Thermal#Secure2026"
    },
    {
      shortName: "Rajesh",
      clearance: "Level 3",
      role: "Field Operations Officer",
      email: "field.dispatch@thermoguard.gov.in",
      pass: "Dispatch@2026"
    }
  ];

  const quickLoginAs = async (emailVal: string, passVal: string) => {
    setMode("login");
    setIdentifier(emailVal);
    setPassword(passVal);
    setErrorMsg(null);
    try {
      setIsSubmitting(true);
      await login(emailVal, passVal);
      setSuccessMsg("Clearance verified. Launching surveillance console...");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to log in.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#F8FAFC] text-slate-900 flex flex-col items-center justify-center p-4 sm:p-6 font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Centered White Login Card */}
      <div className="w-full max-w-[440px] bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-7 my-auto">
        
        {/* 1. BRAND HEADER */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 mb-2.5 shadow-2xs">
            <Flame className="w-5 h-5 fill-blue-600/15" />
          </div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-snug">
            ThermoGuard AI Surveillance Console
          </h1>
          <p className="text-[10px] font-bold text-slate-400 tracking-wider uppercase mt-0.5">
            DETECT • CLASSIFY • PROTECT
          </p>
        </div>

        {/* 2. FAST DEMO LOGIN */}
        <div className="mb-5 p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-blue-600" />
              <span>1-Click Fast Demo Login</span>
            </span>
            <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
              Instant Access
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {demoProfiles.map((p) => (
              <button
                key={p.email}
                type="button"
                disabled={isSubmitting || isLoading}
                onClick={() => quickLoginAs(p.email, p.pass)}
                className="flex items-center justify-between p-2.5 sm:p-2 rounded-xl bg-white hover:bg-blue-50 hover:border-blue-300 text-slate-700 border border-slate-200 text-left transition cursor-pointer group shadow-2xs disabled:opacity-50 min-h-[44px]"
                title={`Instant login as ${p.shortName} (${p.role} - ${p.clearance})`}
              >
                <div className="truncate pr-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-slate-800 group-hover:text-blue-700 truncate">
                      {p.shortName}
                    </span>
                    <span className="text-[9px] font-mono font-bold px-1 py-0.2 rounded bg-slate-100 text-slate-500 group-hover:bg-blue-100 group-hover:text-blue-700">
                      {p.clearance}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium truncate mt-0.5 group-hover:text-blue-800">
                    {p.role}
                  </div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-600 flex-shrink-0 ml-1 transition-transform group-hover:translate-x-0.5" />
              </button>
            ))}
          </div>
        </div>

        {/* 3. AUTH TABS */}
        <div className="bg-slate-100 p-1 rounded-xl border border-slate-200/80 flex items-center mb-4">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              mode === "login"
                ? "bg-white text-slate-900 shadow-xs border border-slate-200/60"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            SIGN IN
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              mode === "register"
                ? "bg-white text-slate-900 shadow-xs border border-slate-200/60"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            REGISTER
          </button>
        </div>

        {/* Alert Banners */}
        {errorMsg && (
          <div className="mb-4 p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <span className="font-medium">{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <span className="font-medium">{successMsg}</span>
          </div>
        )}

        {/* 4. AUTHENTICATION SECTION */}
        {mode === "login" ? (
          <div>
            <div className="mb-3.5">
              <h2 className="text-xs font-bold text-slate-900">
                Analyst Authentication
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                Enter credentials or use the 1-click profiles above to access surveillance telemetry.
              </p>
            </div>

            <form onSubmit={handleLoginSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Official Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="officer@thermoguard.gov.in"
                    required
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-white border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition shadow-2xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Security Passcode
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter security passcode"
                    required
                    className="w-full h-10 pl-9 pr-9 rounded-xl bg-white border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition font-mono shadow-2xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || isLoading}
                className="w-full h-10 mt-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying Clearance...</span>
                  </>
                ) : (
                  <>
                    <span>Authenticate & Access Console</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          /* REGISTRATION FORM */
          <div>
            <div className="mb-3.5">
              <h2 className="text-xs font-bold text-slate-900">
                New Officer Registration
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                Register a verified officer profile with role-based operational clearance.
              </p>
            </div>

            <form onSubmit={handleRegisterSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Officer Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="e.g. Anand Kumar"
                    required
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-white border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition shadow-2xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    User Identifier
                  </label>
                  <input
                    type="text"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    placeholder="anand.kumar"
                    required
                    className="w-full h-10 px-3 rounded-xl bg-white border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition shadow-2xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Official Email
                  </label>
                  <input
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="name@ntro.gov.in"
                    required
                    className="w-full h-10 px-3 rounded-xl bg-white border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition shadow-2xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Clearance Role
                  </label>
                  <select
                    value={regRole}
                    onChange={(e) => setRegRole(e.target.value)}
                    className="w-full h-10 px-2.5 rounded-xl bg-white border border-slate-200 focus:border-blue-600 text-xs text-slate-900 outline-none cursor-pointer shadow-2xs"
                  >
                    <option value="ANALYST">GIS Analyst (L2)</option>
                    <option value="SENIOR_GIS_ANALYST">Senior GIS Analyst (L3)</option>
                    <option value="CHIEF_SURVEILLANCE_OFFICER">Chief Officer (L4)</option>
                    <option value="FIELD_OPERATIONS_OFFICER">Field Ops (L3)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Passcode
                  </label>
                  <input
                    type="password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Min 6 chars"
                    required
                    className="w-full h-10 px-3 rounded-xl bg-white border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition font-mono shadow-2xs"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || isLoading}
                className="w-full h-10 mt-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Creating Profile...</span>
                  </>
                ) : (
                  <>
                    <span>Register Clearance Profile</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        )}

      </div>

      {/* Minimal Footer */}
      <div className="mt-4 text-center text-[11px] text-slate-400">
        ThermoGuard AI • PS ID: SIH26162 • National Technical Research Organisation
      </div>
    </div>
  );
};
