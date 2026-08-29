import api, { TOKEN_KEY } from "./api.js";

export const authService = {
  async register(payload) {
    const { data } = await api.post("/auth/register", payload);
    return data.data;
  },

  async login(payload) {
    const { data } = await api.post("/auth/login", payload);
    return data.data;
  },

  async me() {
    const { data } = await api.get("/auth/me");
    return data.data.user;
  },

  async logout() {
    try {
      await api.post("/auth/logout");
    } catch {
      // The token is discarded locally regardless of the network result.
    }
  },

  storeToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  },

  clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  },

  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },
};
