import axios from "axios";
import { supabase } from "@/lib/supabase";
import { useProjectStore } from "@/store/project";

function resolveApiBaseURL(): string {
  // Browser requests should always use the current origin to avoid stale
  // NEXT_PUBLIC_API_URL values after domain or tunnel changes.
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/v1`;
  }

  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  const fallback = configured || "http://localhost:8088";
  return `${fallback.replace(/\/$/, "")}/api/v1`;
}

export const api = axios.create({
  baseURL: resolveApiBaseURL(),
  timeout: 30000,
});

api.interceptors.request.use(
  async (config) => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const token = data.session?.access_token;
      if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (err) {
      console.error("[api] Failed to get session token:", err);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.request.use((config) => {
  const hasUsableValue = (value: unknown): boolean => {
    if (value === undefined || value === null) return false;
    return String(value).trim().length > 0;
  };

  const resolveProjectId = (): string | null => {
    try {
      const inMemory = useProjectStore.getState().currentProjectId;
      if (typeof inMemory === "string" && inMemory.trim()) return inMemory;
    } catch {}

    if (typeof window === "undefined") return null;

    try {
      const raw = localStorage.getItem("lumen-project");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const persisted = parsed?.state?.currentProjectId;
      if (typeof persisted === "string" && persisted.trim()) return persisted;
    } catch {}
    return null;
  };

  try {
    const projectId = resolveProjectId();
    if (!projectId) return config;

    const params = config.params;
    if (params instanceof URLSearchParams) {
      if (!params.has("project_id")) {
        params.set("project_id", projectId);
      }
      config.params = params;
      return config;
    }

    if (params && typeof params === "object") {
      const existing = (params as Record<string, unknown>).project_id;
      config.params = hasUsableValue(existing)
        ? params
        : { ...(params as Record<string, unknown>), project_id: projectId };
      return config;
    }

    config.params = { project_id: projectId };
  } catch {}
  return config;
});
