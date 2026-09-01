import api from "./api.js";

export const examService = {
  /** params: { q, status, sort, page, limit } - blank values are omitted. */
  async list(params = {}) {
    const query = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== "" && v !== undefined && v !== null)
    );
    const { data } = await api.get("/exams", { params: query });
    return data.data;
  },

  async get(id) {
    const { data } = await api.get(`/exams/${id}`);
    return data.data;
  },

  async create(payload) {
    const { data } = await api.post("/exams", payload);
    return data.data.exam;
  },

  async update(id, payload) {
    const { data } = await api.patch(`/exams/${id}`, payload);
    return data.data.exam;
  },

  async remove(id) {
    const { data } = await api.delete(`/exams/${id}`);
    return data;
  },

  /**
   * Sends the finished exam PDF. The server reads it and derives the questions,
   * so the response carries both the updated exam and a `parse` report of what
   * could not be read with confidence.
   *
   * Reading a large PDF outruns the 30s default, hence the longer timeout.
   */
  async uploadDocument(id, file, onProgress) {
    const form = new FormData();
    form.append("pdf", file);

    const { data } = await api.post(`/exams/${id}/document`, form, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120000,
      onUploadProgress: (event) => {
        if (onProgress && event.total) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      },
    });
    return data;
  },

  async saveQuestions(id, questions) {
    const { data } = await api.put(`/exams/${id}/questions`, { questions });
    return data;
  },

  /** How the class did per item: difficulty, discrimination and distractors. */
  async analysis(id) {
    const { data } = await api.get(`/exams/${id}/analysis`, { timeout: 60000 });
    return data.data;
  },

  async confirmKey(id) {
    const { data } = await api.post(`/exams/${id}/confirm`);
    return data;
  },

  async generateAnswerSheet(id) {
    // An empty object, not null: express.json() runs in strict mode and rejects
    // a top-level `null` body as malformed JSON before the route is reached.
    const { data } = await api.post(`/exams/${id}/answer-sheet`, {}, { timeout: 60000 });
    return data;
  },

  /** Fetches the sheet as a blob so the download keeps the Authorization header. */
  async downloadAnswerSheet(id, examCode) {
    const response = await api.get(`/exams/${id}/answer-sheet`, { responseType: "blob" });

    const url = URL.createObjectURL(response.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${examCode}-answer-sheet.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoking immediately can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  },
};
