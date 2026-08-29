import mongoose from "mongoose";

/** The six question types CheckWise understands, as stored on disk. */
export const QUESTION_TYPES = [
  "multiple-choice",
  "true-false",
  "modified-true-false",
  "identification",
  "fill-in-the-blanks",
  "enumeration",
];

/** Human labels for UI and exported reports. */
export const QUESTION_TYPE_LABELS = {
  "multiple-choice": "Multiple Choice",
  "true-false": "True or False",
  "modified-true-false": "Modified True or False",
  identification: "Identification",
  "fill-in-the-blanks": "Fill in the Blanks",
  enumeration: "Enumeration",
};

export const EXAM_STATUSES = ["draft", "needs-review", "ready"];

/**
 * One question of any of the six supported types.
 *
 * The shape is deliberately a superset rather than six separate schemas: a
 * teacher may change a question's type on the review screen (Phase 4) without
 * the document having to be recreated. Fields not relevant to the current type
 * simply stay empty.
 *
 *   multiple-choice      -> correctAnswers: ["B"],  choices: ["A","B","C","D"]
 *   true-false           -> correctAnswers: ["TRUE"], choices: ["TRUE","FALSE"]
 *   modified-true-false  -> truthValue: "FALSE", correctionAnswers: ["JavaScript"]
 *   identification       -> correctAnswers: ["React","ReactJS","React.js"]
 *   fill-in-the-blanks   -> correctAnswers: ["JavaScript"]
 *   enumeration          -> correctAnswers: ["HTML","CSS","JS"], enumerationCount: 3
 *
 * `correctAnswers` holds *acceptable variations* for written types - any one of
 * them scores the mark - but for enumeration it holds the distinct items the
 * student must list.
 */
const questionSchema = new mongoose.Schema(
  {
    /** Unique across the whole exam - what results and grading key on. */
    questionNumber: { type: Number, required: true, min: 1 },
    /**
     * Exams are written in sections that each restart at 1 ("TEST II" begins
     * again at item 1), so the number printed on the paper is kept separately.
     * The answer sheet prints `sectionNumber` under its `section` heading, so
     * what the student sees matches the questionnaire in their hands.
     */
    section: { type: String, default: "", trim: true, maxlength: 120 },
    sectionNumber: { type: Number, default: null, min: 1 },
    questionType: { type: String, enum: QUESTION_TYPES, required: true },
    questionText: { type: String, default: "", trim: true, maxlength: 2000 },
    correctAnswers: { type: [String], default: [] },
    choices: { type: [String], default: [] },
    truthValue: { type: String, enum: ["TRUE", "FALSE", null], default: null },
    correctionAnswers: { type: [String], default: [] },
    enumerationCount: { type: Number, default: null, min: 1 },
    points: { type: Number, default: 1, min: 0, max: 100 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const gradingConfigSchema = new mongoose.Schema(
  {
    /**
     * How a Modified True or False question is worth marks.
     *   "whole" - 1 point, and BOTH the truth value and the correction must be right
     *   "split" - truth value 1 point + correction 1 point, scored independently
     */
    modifiedTrueFalseScoring: {
      type: String,
      enum: ["whole", "split"],
      default: "whole",
    },
    /** Enumeration awards one point per correct item rather than all-or-nothing. */
    enumerationPartialCredit: { type: Boolean, default: true },

    /**
     * Written answers must match the key exactly.
     *
     * Strict is the default because the answer key is the teacher's ruling, and
     * software should not quietly widen it. The cost is that the handwriting
     * reader's own misreadings ("usedtate" for "useState") then land on the
     * student, so an exam scored from scans may want this turned off.
     */
    strictWrittenAnswers: { type: Boolean, default: true },
  },
  { _id: false }
);

const examSchema = new mongoose.Schema(
  {
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    subject: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: "", trim: true, maxlength: 1000 },
    passingScore: { type: Number, required: true, min: 1, max: 100, default: 75 },

    gradingConfig: { type: gradingConfigSchema, default: () => ({}) },

    // Populated in Phase 3 (upload) and Phase 4 (parse).
    examPdfPath: { type: String, default: null },
    examPdfOriginalName: { type: String, default: null },
    answerKeyPath: { type: String, default: null },
    answerKeyOriginalName: { type: String, default: null },

    questions: { type: [questionSchema], default: [] },
    answerKeyConfirmed: { type: Boolean, default: false },

    examCode: { type: String, required: true, unique: true, index: true },
    answerSheetPath: { type: String, default: null },

    /**
     * Where every bubble sits on the generated sheet, in PDF points.
     *
     * Written by the sheet generator and read by the scanner, so a printed
     * paper is always read with the geometry it was printed with - changing the
     * layout later cannot silently misread sheets already in students' hands.
     * Deliberately schemaless: it is an opaque record produced and consumed by
     * one pair of services, never queried.
     */
    answerSheetLayout: { type: mongoose.Schema.Types.Mixed, default: null },

    /**
     * Denormalised so exam lists and dashboard widgets stay a single indexed
     * read - .lean() queries skip virtuals, so these must be real fields.
     * Recomputed from `questions` on every save.
     */
    totalQuestions: { type: Number, default: 0, min: 0 },
    totalPoints: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: EXAM_STATUSES, default: "draft", index: true },
  },
  { timestamps: true }
);

// Search by title/subject/code from the exam list.
examSchema.index({ teacherId: 1, createdAt: -1 });

/** Derives the counters and workflow status from what is actually stored. */
function syncDerivedFields(doc) {
  const questions = doc.questions || [];
  doc.totalQuestions = questions.length;
  doc.totalPoints = questions.reduce((sum, q) => sum + (q.points ?? 0), 0);

  if (questions.length === 0) {
    doc.status = "draft";
    // A confirmed key cannot survive its questions being removed.
    doc.answerKeyConfirmed = false;
  } else {
    doc.status = doc.answerKeyConfirmed ? "ready" : "needs-review";
  }
}

examSchema.pre("save", function syncOnSave(next) {
  syncDerivedFields(this);
  next();
});

examSchema.virtual("isReadyToScan").get(function isReadyToScan() {
  return this.status === "ready" && this.questions.length > 0;
});

examSchema.set("toJSON", { virtuals: true });

export default mongoose.model("Exam", examSchema);
