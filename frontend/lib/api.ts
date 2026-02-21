import axios from "axios";
import { supabase } from "@/lib/supabase";

const baseURL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: `${baseURL}/api/v1`,
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
  try {
    const raw = localStorage.getItem("lumen-project");
    if (raw) {
      const parsed = JSON.parse(raw);
      const projectId = parsed?.state?.currentProjectId;
      if (projectId) {
        config.params = { project_id: projectId, ...config.params };
      }
    }
  } catch {}
  return config;
});
