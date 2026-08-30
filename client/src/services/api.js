import axios from "axios";

export const TOKEN_KEY = "checkwise.token";

/**
 * Where the API lives, normalised so every reasonable spelling works.
 *
 * `VITE_API_URL` is set by hand in a hosting dashboard, and the two ways to get
 * it wrong both fail confusingly: a trailing slash, or a missing `/api`, turn
 * every request into `…/auth/login` and the server answers "Route not found"
 * rather than anything that hints at the cause. So rather than trusting the
 * value, it is trimmed and given the `/api` suffix if it lacks one. All of
 * these end up identical:
 *
 *   https://api.example.com        https://api.example.com/
 *   https://api.example.com/api    https://api.example.com/api/
 *
 * Left unset it stays a relative `/api`, which is the preferred setup: the Vite
 * dev server proxies it in development, and netlify.toml forwards it to the API
 * host in production. That keeps the browser on one origin, so CORS never
 * enters into it.
 */
function resolveApiBase() {
  const raw = (import.meta.env.VITE_API_URL || "").trim();
  if (!raw) return "/api";

  const trimmed = raw.replace(/\/+$/, "");
  return /\/api$/.test(trimmed) ? trimmed : `${trimmed}/api`;
}

const API_BASE = resolveApiBase();

const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

/**
 * The server's origin, with the `/api` suffix removed.
 *
 * Empty when the API is same-origin, so `/uploads/...` stays relative and is
 * proxied. Absolute when pointed at another host, because anything the server
 * serves outside `/api` — the scan images — would otherwise be requested from
 * the static host, which does not have them.
 */
export const API_ORIGIN = API_BASE.replace(/\/api$/, "");

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
