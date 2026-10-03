/**
 * ThermoGuard AI - Authentication Service
 */

const API_BASE_URL = (((import.meta as any).env?.VITE_API_BASE_URL as string) || "").replace(/\/$/, "");
const AUTH_TOKEN_KEY = "thermoguard_auth_token";

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  name: string;
  role: "CHIEF_SURVEILLANCE_OFFICER" | "SENIOR_GIS_ANALYST" | "ANALYST" | "FIELD_OPERATIONS_OFFICER" | "OPERATOR" | string;
  organisation: string;
  department: string;
  badge_number: string;
  clearance_level: string;
  created_at: string;
  last_login?: string;
}

export interface DemoAccount {
  name: string;
  username: string;
  email: string;
  role: string;
  clearance_level: string;
  description: string;
}

export const authService = {
  getToken(): string | null {
    try {
      return localStorage.getItem(AUTH_TOKEN_KEY);
    } catch {
      return null;
    }
  },

  setToken(token: string): void {
    try {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } catch (e) {
      console.error("Failed to persist auth token", e);
    }
  },

  removeToken(): void {
    try {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    } catch (e) {
      console.error("Failed to remove auth token", e);
    }
  },

  async login(username: string, password: string): Promise<{ user: UserProfile; token: string }> {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || data.error || "Authentication failed.");
    }

    this.setToken(data.token);
    return { user: data.user, token: data.token };
  },

  async register(params: {
    username: string;
    email: string;
    name: string;
    password: string;
    role?: string;
    department?: string;
  }): Promise<{ user: UserProfile; token: string }> {
    const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || data.error || "Registration failed.");
    }

    this.setToken(data.token);
    return { user: data.user, token: data.token };
  },

  async getMe(): Promise<UserProfile | null> {
    const token = this.getToken();
    if (!token) return null;

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) {
        this.removeToken();
        return null;
      }

      const data = await res.json();
      return data.user || null;
    } catch (err) {
      console.warn("Failed to verify user session", err);
      return null;
    }
  },

  async logout(): Promise<void> {
    const token = this.getToken();
    if (token) {
      try {
        await fetch(`${API_BASE_URL}/api/auth/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ token })
        });
      } catch (err) {
        console.warn("Logout API notice:", err);
      }
    }
    this.removeToken();
  },

  async getDemoAccounts(): Promise<DemoAccount[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/demo-accounts`);
      if (res.ok) {
        const data = await res.json();
        return data.demo_accounts || [];
      }
    } catch {
      // Fallback
    }
    return [
      {
        name: "Dr. Vikram Sethi",
        username: "ntro.officer",
        email: "officer@thermoguard.gov.in",
        role: "Chief Surveillance Officer",
        clearance_level: "Level 4 (Restricted)",
        description: "Full command authority, priority disaster dispatch & model telemetry"
      },
      {
        name: "Pooja Sharma",
        username: "gis.analyst",
        email: "analyst.gis@thermoguard.gov.in",
        role: "Senior GIS Analyst",
        clearance_level: "Level 3 (Confidential)",
        description: "Thermal hotspot cataloging, spatial attribution & temporal audit"
      },
      {
        name: "Aditi Roy",
        username: "analyst.user",
        email: "analyst@thermoguard.gov.in",
        role: "GIS Intelligence Analyst",
        clearance_level: "Level 2 (Restricted)",
        description: "Surveillance exploration, source telemetry, ML inference & temporal analysis"
      },
      {
        name: "Captain Rajesh Verma",
        username: "field.ops",
        email: "field.dispatch@thermoguard.gov.in",
        role: "Field Operations Officer",
        clearance_level: "Level 3 (Confidential)",
        description: "Incident hazard acknowledgment, emergency triage & field response"
      }
    ];
  }
};
