import axios from "axios";

export const TOKEN_KEY = "checkwise.token";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

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
