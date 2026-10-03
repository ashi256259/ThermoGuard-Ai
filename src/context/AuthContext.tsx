import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authService, UserProfile, DemoAccount } from "../services/auth";

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  isOfficer: boolean;
  isAnalyst: boolean;
  isFieldOps: boolean;
  canManageProviders: boolean;
  canResolveAlerts: boolean;
  canVerifyClassification: boolean;
  canAccessAdminDashboard: boolean;
  login: (username: string, password: string) => Promise<UserProfile>;
  register: (params: {
    username: string;
    email: string;
    name: string;
    password: string;
    role?: string;
    department?: string;
  }) => Promise<UserProfile>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  demoAccounts: DemoAccount[];
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(authService.getToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);

  const checkAuth = useCallback(async () => {
    try {
      setIsLoading(true);
      const storedToken = authService.getToken();
      if (storedToken) {
        const userProfile = await authService.getMe();
        if (userProfile) {
          setUser(userProfile);
          setToken(storedToken);
        } else {
          setUser(null);
          setToken(null);
        }
      } else {
        setUser(null);
        setToken(null);
      }

      // Preload demo accounts for login helper
      const accounts = await authService.getDemoAccounts();
      setDemoAccounts(accounts);
    } catch (err) {
      console.error("Auth check failed", err);
      setUser(null);
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (username: string, password: string): Promise<UserProfile> => {
    setIsLoading(true);
    try {
      const { user: userProfile, token: sessionToken } = await authService.login(username, password);
      setUser(userProfile);
      setToken(sessionToken);
      return userProfile;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (params: {
    username: string;
    email: string;
    name: string;
    password: string;
    role?: string;
    department?: string;
  }): Promise<UserProfile> => {
    setIsLoading(true);
    try {
      const { user: userProfile, token: sessionToken } = await authService.register(params);
      setUser(userProfile);
      setToken(sessionToken);
      return userProfile;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await authService.logout();
      setUser(null);
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshProfile = async (): Promise<void> => {
    const userProfile = await authService.getMe();
    if (userProfile) {
      setUser(userProfile);
    }
  };

  const userRole = user?.role || "";
  const isAdmin = userRole === "ADMIN" || userRole === "CHIEF_SURVEILLANCE_OFFICER" || userRole === "admin";
  const isOfficer = userRole === "CHIEF_SURVEILLANCE_OFFICER" || userRole === "admin" || userRole === "ADMIN";
  const isAnalyst = userRole === "ANALYST" || userRole === "SENIOR_GIS_ANALYST" || userRole === "OPERATOR" || isOfficer;
  const isFieldOps = userRole === "FIELD_OPERATIONS_OFFICER";
  const canManageProviders = isAdmin;
  const canResolveAlerts = isAdmin || isFieldOps;
  const canVerifyClassification = isAnalyst || isOfficer || isAdmin;
  const canAccessAdminDashboard = isAdmin;

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: Boolean(user && token),
        isLoading,
        isAdmin,
        isOfficer,
        isAnalyst,
        isFieldOps,
        canManageProviders,
        canResolveAlerts,
        canVerifyClassification,
        canAccessAdminDashboard,
        login,
        register,
        logout,
        refreshProfile,
        demoAccounts
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
