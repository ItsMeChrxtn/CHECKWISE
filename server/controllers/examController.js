import mongoose from "mongoose";
import Exam, { EXAM_STATUSES } from "../models/Exam.js";
import Result from "../models/Result.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { generateExamCode } from "../utils/examCode.js";
import {
  BUCKETS,
  publicUrl,
  remove as removeFile,
  resolveKey,
} from "../services/storageService.js";
import { extractDocument } from "../services/pdfService.js";
import { parseExamDocument } from "../services/answerKeyParser.js";
import { generateAnswerSheet } from "../services/answerSheetService.js";

const MAX_LIMIT = 50;
const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  title: { title: 1 },
  subject: { subject: 1 },
};

/** Teachers are confined to their own exams; admins see everything. */
function buildScope(user) {
  return user.role === "admin" ? {} : { teacherId: new mongoose.Types.ObjectId(user._id) };
}

/** Loads an exam the caller is allowed to see, or throws the right error. */
async function findOwnedExam(id, user) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest("Invalid exam id provided.");

  const exam = await Exam.findById(id);
  if (!exam) throw ApiError.notFound("That exam no longer exists.");

  const owns = exam.teacherId.toString() === user._id.toString();
  if (!owns && user.role !== "admin") {
    // Deliberately 404 rather than 403: a teacher should not be able to probe
    // for the existence of another teacher's exam ids.
    throw ApiError.notFound("That exam no longer exists.");
  }

  return exam;
}

/** Escapes user input before it reaches a regex, so `.` and `*` stay literal. */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Retries on the astronomically unlikely exam-code collision. */
async function createWithUniqueCode(payload, attempts = 5) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await Exam.create({ ...payload, examCode: generateExamCode() });
    } catch (error) {
      const isDuplicateCode = error.code === 11000 && error.keyValue?.examCode;
      if (!isDuplicateCode || i === attempts - 1) throw error;
    }
  }
  throw ApiError.conflict("Could not allocate a unique exam code. Please try again.");
}

/** Maps the flat request body onto the nested gradingConfig sub-document. */
function readGradingConfig(body, existing = {}) {
  const config = { ...existing };

  if (body.modifiedTrueFalseScoring !== undefined) {
    config.modifiedTrueFalseScoring = body.modifiedTrueFalseScoring;
  }
  if (body.enumerationPartialCredit !== undefined) {
    config.enumerationPartialCredit =
      body.enumerationPartialCredit === true || body.enumerationPartialCredit === "true";
  }
  if (body.strictWrittenAnswers !== undefined) {
    config.strictWrittenAnswers =
      body.strictWrittenAnswers === true || body.strictWrittenAnswers === "true";
  }

  return config;
}

/** POST /api/exams */
export const createExam = asyncHandler(async (req, res) => {
  const { title, subject, description = "", passingScore } = req.body;

  const exam = await createWithUniqueCode({
    teacherId: req.user._id,
    title,
    subject,
    description,
    passingScore,
    gradingConfig: readGradingConfig(req.body),
  });

  res.status(201).json({
    success: true,
    message: `"${exam.title}" has been created.`,
    data: { exam: exam.toJSON() },
  });
});

/**
 * GET /api/exams
 * Supports ?q= &status= &sort= &page= &limit=
 */
export const listExams = asyncHandler(async (req, res) => {
  const filter = buildScope(req.user);

  const q = (req.query.q || "").trim();
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ title: rx }, { subject: rx }, { examCode: rx }];
  }

  const status = (req.query.status || "").trim();
  if (status && status !== "all") {
    if (!EXAM_STATUSES.includes(status)) {
      throw ApiError.badRequest(`Status must be one of: ${EXAM_STATUSES.join(", ")}.`);
    }
    filter.status = status;
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || 10));
  const sort = SORTS[req.query.sort] || SORTS.newest;

  const [items, total] = await Promise.all([
    Exam.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      // The questions array is never needed for a list row and can be large.
      .select("-questions")
      .populate("teacherId", "name email")
      .lean(),
    Exam.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: {
      exams: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasPrev: page > 1,
        hasNext: page * limit < total,
      },
    },
  });
});

/** GET /api/exams/:id */
export const getExam = asyncHandler(async (req, res) => {
  const exam = await findOwnedExam(req.params.id, req.user);
  await exam.populate("teacherId", "name email");

  // How many papers have already been checked against this exam.
  const resultCount = await Result.countDocuments({ examId: exam._id });

  res.json({ success: true, data: { exam: exam.toJSON(), resultCount } });
});

/** PATCH /api/exams/:id */
export const updateExam = asyncHandler(async (req, res) => {
  const exam = await findOwnedExam(req.params.id, req.user);

  // Only these are editable here. examCode, teacherId, questions and the
  // upload paths are owned by their own workflows, never by this form.
  for (const field of ["title", "subject", "description", "passingScore"]) {
    if (req.body[field] !== undefined) exam[field] = req.body[field];
  }

  exam.gradingConfig = readGradingConfig(req.body, exam.gradingConfig?.toObject?.() ?? {});

  await exam.save();

  res.json({
    success: true,
    message: "Exam updated.",
    data: { exam: exam.toJSON() },
  });
});

/**
 * DELETE /api/exams/:id
 * Removes the exam, every result recorded against it and any uploaded files,
 * so nothing is orphaned.
 */
export const deleteExam = asyncHandler(async (req, res) => {
  const exam = await findOwnedExam(req.params.id, req.user);

  const { deletedCount } = await Result.deleteMany({ examId: exam._id });

  await Promise.all(
    [exam.examPdfPath, exam.answerKeyPath, exam.answerSheetPath]
      .filter(Boolean)
      .map((key) => removeFile(key).catch(() => {}))
  );

  await exam.deleteOne();

  res.json({
    success: true,
    message:
      deletedCount > 0
        ? `"${exam.title}" and ${deletedCount} recorded result${deletedCount === 1 ? "" : "s"} were deleted.`
        : `"${exam.title}" has been deleted.`,
    data: { deletedResults: deletedCount },
  });
});

/**
 * POST /api/exams/:id/document
 * Accepts the teacher's finished exam PDF, reads it, and derives the questions
 * and answer key from it. This is the step that replaces building an exam by
 * hand: upload once, review what was read, and the answer sheet follows.
 */
export const uploadExamDocument = asyncHandler(async (req, res) => {
  const exam = await findOwnedExam(req.params.id, req.user);

  if (!req.file) {
    throw ApiError.badRequest('Attach the exam PDF using the "pdf" field.');
  }

  const key = `${BUCKETS.exams}/${req.file.filename}`;

  let extraction;
  try {
    extraction = await extractDocument(key);
  } catch (error) {
    // An unreadable upload is not worth keeping on disk.
    await removeFile(key).catch(() => {});
    throw error;
  }

  const { questions, warnings, sections } = parseExamDocument(extraction.lines);

  if (questions.length === 0) {
    await removeFile(key).catch(() => {});
    throw ApiError.badRequest(
      "No questions could be read from that PDF. CheckWise looks for numbered " +
        'items such as "1." or "1)". Check the numbering and upload again.'
    );
  }

  // Re-uploading replaces the document and everything derived from it, so a
  // stale key can never outlive the questions it belonged to.
  const previousKey = exam.examPdfPath;

  exam.examPdfPath = key;
  exam.examPdfOriginalName = req.file.originalname;
  exam.questions = questions;
  // Parsed, never trusted: the pre-save hook moves this to "needs-review".
  exam.answerKeyConfirmed = false;
  await exam.save();

  if (previousKey && previousKey !== key) await removeFile(previousKey).catch(() => {});

  res.status(201).json({
    success: true,
    message: `Read ${questions.length} question${questions.length === 1 ? "" : "s"} from "${req.file.originalname}". Review them before generating the answer sheet.`,
    data: {
      exam: exam.toJSON(),
      parse: {
        warnings,
        sections,
        pageCount: extraction.pageCount,
        questionsFound: questions.length,
        highlightsFound: extraction.highlightCount,
      },
    },
  });
});

/**
 * PUT /api/exams/:id/questions
 * Saves the teacher's corrections from the review screen. The whole array is
 * replaced rather than patched item by item, because reordering, deleting and
 * retyping questions all happen together on that screen.
 */
export const replaceQuestions = asyncHandler(async (req, res) => {
  const exam = await findOwnedExam(req.params.id, req.user);
  const { questions } = req.body;

  if (!Array.isArray(questions)) {
    throw ApiError.badRequest("`questions` must be an array.");
  }

  exam.questions = questions;
  // Any edit invalidates a previous confirmation - the teacher confirms again.
  exam.answerKeyConfirmed = false;
  await exam.save();

  res.json({
    success: true,
    message: "Questions saved.",
    data: { exam: exam.toJSON() },
  });
});

/**
 * POST /api/exams/:id/confirm
 * Marks the answer key as checked by a human, which is what moves the exam to
 * "ready" and unlocks answer sheet generation.
 */
export const confirmAnswerKey = asyncHandler(async (req, res) => {
  const exam = await findOwnedExam(req.params.id, req.user);

  if (exam.questions.length === 0) {
    throw ApiError.badRequest("Upload an exam PDF before confirming the answer key.");
  }

  const incomplete = exam.questions.filter(isMissingAnswer).map((q) => q.questionNumber);
  if (incomplete.length > 0) {
    throw ApiError.badRequest(
      `These questions still have no answer: ${incomplete.join(", ")}.`
    );
  }

  exam.answerKeyConfirmed = true;
  await exam.save();

  res.json({
    success: true,
    message: `"${exam.title}" is ready. You can now generate its answer sheet.`,
    data: { exam: exam.toJSON() },
  });
});

/**
 * POST /api/exams/:id/answer-sheet
 * Builds the printable sheet from the confirmed questions. Regenerating simply
 * overwrites the previous file, so the code on the sheet stays the exam's own.
 */
export const createAnswerSheet = asyncHandler(async (req, res) => {
  const exam = await findOwnedExam(req.params.id, req.user);

  if (exam.questions.length === 0) {
    throw ApiError.badRequest("Upload an exam PDF before generating an answer sheet.");
  }
  if (!exam.answerKeyConfirmed) {
    throw ApiError.badRequest(
      "Review and confirm the answer key first - the sheet is built from it."
    );
  }

  const { key, pageCount, layout } = await generateAnswerSheet(exam);

  exam.answerSheetPath = key;
  exam.answerSheetLayout = layout;
  await exam.save();

  res.status(201).json({
    success: true,
    message: `Answer sheet ready (${pageCount} page${pageCount === 1 ? "" : "s"}).`,
    data: { exam: exam.toJSON(), answerSheetUrl: publicUrl(key), pageCount },
  });
});

/**
 * GET /api/exams/:id/answer-sheet
 * Streams the sheet as a download. Going through the API rather than the static
 * /uploads path keeps the ownership check on it.
 */
export const downloadAnswerSheet = asyncHandler(async (req, res) => {
  const exam = await findOwnedExam(req.params.id, req.user);

  if (!exam.answerSheetPath) {
    throw ApiError.notFound("No answer sheet has been generated for this exam yet.");
  }

  const filename = `${exam.examCode}-answer-sheet.pdf`;
  res.download(resolveKey(exam.answerSheetPath), filename);
});

/** A question is unanswerable if the field its own type grades on is empty. */
function isMissingAnswer(question) {
  if (question.questionType === "modified-true-false") {
    if (!question.truthValue) return true;
    // A FALSE statement is only gradable once the correction word is known.
    return question.truthValue === "FALSE" && question.correctionAnswers.length === 0;
  }
  return question.correctAnswers.length === 0;
}
