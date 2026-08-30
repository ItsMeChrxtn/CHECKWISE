import api from "./api.js";

/**
 * Account administration. Every call here is admin-only on the server, so a
 * teacher reaching them gets a 403 rather than a filtered list — the client
 * never has to be the thing keeping them out.
 */
export const userService = {
  /** params: { q, role } — blank values are omitted. */
  async list(params = {}) {
    const query = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== "" && v != null)
    );
    const { data } = await api.get("/users", { params: query });
    return data.data;
  },

  /** Changes a role, or suspends and restores an account. */
  async update(id, payload) {
    const { data } = await api.patch(`/users/${id}`, payload);
    return data.data.user;
  },

  async remove(id) {
    const { data } = await api.delete(`/users/${id}`);
    return data;
  },
};
