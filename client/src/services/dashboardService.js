import api from "./api.js";

export const dashboardService = {
  async getStats() {
    const { data } = await api.get("/dashboard/stats");
    return data.data;
  },
};
