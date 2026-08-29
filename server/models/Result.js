import mongoose from "mongoose";

/**
 * How one question was answered on one paper.
 *
 * `status` separates the three things a teacher needs to tell apart: the
 * scanner read a mark and it was right or wrong; the scanner read nothing it
 * trusts, so a person must look; or the question is not machine-readable at all
 * (a written word) and is waiting to be typed in. Only `correct` and `partial`
 * carry marks, so an unreviewed paper can never quietly score full points.
 */
export const ANSWER_STATUSES = [
  "correct",
  "partial",
  "wrong",
  "blank",
  "ambiguous",
  "needs-review",
];

const answerSchema = new mongoose.Schema(
  {
    questionNumber: { type: Number, required: true, min: 1 },
    section: { type: String, default: "" },
    sectionNumber: { type: Number, default: null },
    questionType: { type: String, default: "" },

    /** What the student put: a letter, TRUE/FALSE, or written text. */
    studentAnswer: { type: String, default: "" },
    /** The key, in a form that can be shown next to the student's answer. */
    correctAnswer: { type: String, default: "" },

    pointsPossible: { type: Number, default: 1, min: 0 },
    pointsEarned: { type: Number, default: 0, min: 0 },

    /** 0-1, from how much darker the chosen bubble was than the runner-up. */
    confidence: { type: Number, default: 0, min: 0, max: 1 },
    /** The strip of the scan showing what the student wrote, when there is one. */
    writeInCrop: { type: String, default: null },
    status: { type: String, enum: ANSWER_STATUSES, required: true },
    manuallyCorrected: { type: Boolean, default: false },
  },
  { _id: false }
);

const resultSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam",
      required: true,
      index: true,
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    studentName: { type: String, required: true, trim: true, maxlength: 120 },
    studentId: { type: String, default: "", trim: true, maxlength: 60 },

    answers: { type: [answerSchema], default: [] },

    totalQuestions: { type: Number, required: true, min: 0 },
    correctAnswers: { type: Number, default: 0, min: 0 },
    wrongAnswers: { type: Number, default: 0, min: 0 },
    blankAnswers: { type: Number, default: 0, min: 0 },
    ambiguousAnswers: { type: Number, default: 0, min: 0 },
    /** Written items still waiting to be typed in by the teacher. */
    pendingReview: { type: Number, default: 0, min: 0 },

    score: { type: Number, default: 0, min: 0 },
    totalPoints: { type: Number, default: 0, min: 0 },
    percentage: { type: Number, default: 0, min: 0, max: 100 },
    passed: { type: Boolean, default: false },

    scannedImage: { type: String, default: null },
    /** Every page of this paper, in the order they were read. */
    scannedPages: { type: [String], default: [] },
    /** Which page of a multi-page sheet this scan covered. */
    pageNumber: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true }
);

resultSchema.index({ teacherId: 1, createdAt: -1 });
resultSchema.index({ examId: 1, studentName: 1 });

/**
 * The headline numbers are recomputed from `answers` before every save, so a
 * manual correction can never leave the score disagreeing with the paper.
 *
 * This hooks `validate` rather than `save`: Mongoose registers validation as a
 * pre-save hook of its own before any added here, so a `save` hook would run
 * too late to satisfy the required fields it fills in.
 */
resultSchema.pre("validate", function recount(next) {
  const answers = this.answers || [];

  this.totalQuestions = answers.length;
  this.correctAnswers = answers.filter((a) => a.status === "correct").length;
  this.wrongAnswers = answers.filter((a) => a.status === "wrong").length;
  this.blankAnswers = answers.filter((a) => a.status === "blank").length;
  this.ambiguousAnswers = answers.filter((a) => a.status === "ambiguous").length;
  this.pendingReview = answers.filter((a) => a.status === "needs-review").length;

  this.score = round(answers.reduce((sum, a) => sum + (a.pointsEarned || 0), 0));
  this.totalPoints = round(answers.reduce((sum, a) => sum + (a.pointsPossible || 0), 0));
  this.percentage = this.totalPoints > 0 ? round((this.score / this.totalPoints) * 100) : 0;

  next();
});

/** Marks can be fractional with enumeration partial credit; keep two places. */
function round(value) {
  return Math.round(value * 100) / 100;
}

export default mongoose.model("Result", resultSchema);
