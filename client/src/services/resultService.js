import api from "./api.js";

export const resultService = {
  /**
   * Sends one student's paper. Several images are one paper - a sheet that runs
   * to two pages is still a single score - so they go in one request.
   */
  async scan(examId, { files, studentName, studentId }, onProgress) {
    const form = new FormData();
    for (const file of files) form.append("images", file);
    form.append("studentName", studentName);
    if (studentId) form.append("studentId", studentId);

    const { data } = await api.post(`/exams/${examId}/scan`, form, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 180000,
      onUploadProgress: (event) => {
        if (onProgress && event.total) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      },
    });
    return data;
  },

  /**
   * Every paper the caller may see, newest first.
   *
   * The server decides the scope from the role — a teacher's own, or all of
   * them for an administrator — so there is nothing to pass here.
   */
  async listAll(limit = 50) {
    const { data } = await api.get("/results", { params: { limit } });
    return data.data.results;
  },

  async listForExam(examId) {
    const { data } = await api.get(`/exams/${examId}/results`);
    return data.data;
  },

  async get(id) {
    const { data } = await api.get(`/results/${id}`);
    return data.data;
  },

  /** `answers` is a questionNumber -> answer map; the server regrades the paper. */
  async update(id, payload) {
    const { data } = await api.patch(`/results/${id}`, payload);
    return data;
  },

  async remove(id) {
    const { data } = await api.delete(`/results/${id}`);
    return data;
  },
};
