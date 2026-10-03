import { useState, useEffect, useCallback } from "react";
import { apiService, HealthResponse } from "../services/api";

export type ConnectionState = "connected" | "loading" | "error";

export function useHealthStatus(pollingIntervalMs: number = 30000) {
  const [connectionState, setConnectionState] = useState<ConnectionState>("loading");
  const [healthData, setHealthData] = useState<HealthResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const checkHealth = useCallback(async () => {
    try {
      setConnectionState((prev) => (prev === "connected" ? "connected" : "loading"));
      const data = await apiService.checkHealth();
      setHealthData(data);
      setConnectionState("connected");
      setErrorMessage(null);
    } catch (err: any) {
      setConnectionState("error");
      setErrorMessage(err?.message || "Failed to reach backend API");
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, pollingIntervalMs);
    return () => clearInterval(interval);
  }, [checkHealth, pollingIntervalMs]);

  return {
    connectionState,
    healthData,
    errorMessage,
    refresh: checkHealth
  };
}
