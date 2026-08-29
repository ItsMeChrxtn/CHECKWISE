import axios from "axios";

export const TOKEN_KEY = "checkwise.token";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

/**
 * Where the server itself lives, with the `/api` suffix stripped off.
 *
 * Empty during development, because the Vite dev server proxies both `/api`
 * and `/uploads` to localhost:5000 and a relative path already works.
 *
 * In a deployed build there is no proxy: the site is on one host and the API
 * on another, so anything the server serves outside `/api` — the scan images
 * under `/uploads` — has to be addressed absolutely or it 404s against the
 * static host.
 */
export const API_ORIGIN = (import.meta.env.VITE_API_URL || "").replace(/\/api\/?$/, "");

/** Resolves a server-relative file path (`/uploads/...`) for the current host. */
export function fileUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//.test(path)) return path;
  return `${API_ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Normalises every failure into an Error carrying:
 *   .message  - a sentence safe to show the user
 *   .status   - HTTP status (0 when the request never reached the server)
 *   .errors   - optional field -> message map for form highlighting
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status ?? 0;
    const data = error.response?.data;

    let message =
      data?.message ||
      (status === 0
        ? "Cannot reach the CheckWise server. Check that it is running."
        : "Something went wrong. Please try again.");

    if (error.code === "ECONNABORTED") {
      message = "The request timed out. Please try again.";
    }

    // An expired or invalid session: clear it so the router redirects to login.
    if (status === 401) {
      localStorage.removeItem(TOKEN_KEY);
    }

    const normalised = new Error(message);
    normalised.status = status;
    normalised.errors = data?.errors || null;
    return Promise.reject(normalised);
  }
);

export default api;
