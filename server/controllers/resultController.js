import path from "node:path";
import mongoose from "mongoose";
import Exam from "../models/Exam.js";
import Result from "../models/Result.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  BUCKETS,
  publicUrl,
  remove as removeFile,
  saveBuffer,
} from "../services/storageService.js";
import { readScan } from "../services/omrService.js";
import { gradeAnswers } from "../services/gradingService.js";
import { readHandwriting } from "../services/handwritingService.js";

/** Teachers see their own papers; admins see everything. */
function buildScope(user) {
  return user.role === "admin" ? {} : { teacherId: new mongoose.Types.ObjectId(user._id) };
}

async function findOwnedExam(id, user) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest("Invalid exam id provided.");

  const exam = await Exam.findById(id);
  if (!exam) throw ApiError.notFound("That exam no longer exists.");

  const owns = exam.teacherId.toString() === user._id.toString();
  if (!owns && user.role !== "admin") throw ApiError.notFound("That exam no longer exists.");

  return exam;
}

async function findOwnedResult(id, user) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest("Invalid result id provided.");

  const result = await Result.findById(id);
  if (!result) throw ApiError.notFound("That result no longer exists.");

  const owns = result.teacherId.toString() === user._id.toString();
  if (!owns && user.role !== "admin") throw ApiError.notFound("That result no longer exists.");

  return result;
}

/**
 * POST /api/exams/:id/scan
 * Reads one scanned answer sheet and records what it scored.
 */
export const scanAnswerSheet = asyncHandler(async (req, res) => {
  const exam = await findOwnedExam(req.params.id, req.user);

  const files = req.files ?? [];
  if (files.length === 0) {
    throw ApiError.badRequest('Attach the scanned sheet using the "images" field.');
  }

  const keys = files.map((file) => `${BUCKETS.scanned}/${file.filename}`);
  const discard = () => Promise.all(keys.map((key) => removeFile(key).catch(() => {})));

  // A name is not required: pointing a camera at a stack of papers should not
  // stop for typing. Unnamed papers are numbered and renamed from the list.
  const studentName =
    (req.body.studentName || "").trim() ||
    `Paper ${(await Result.countDocuments({ examId: exam._id })) + 1}`;

  if (!exam.answerSheetLayout) {
    await discard();
    throw ApiError.badRequest(
      "Generate this exam's answer sheet before scanning papers - the scanner reads it to know where the bubbles are."
    );
  }

  // Images are read as pages 1..n in the order they were attached, unless the
  // client says otherwise - a teacher scanning a stack should not have to.
  const declared = String(req.body.pages || "")
    .split(",")
    .map((page) => Number(page.trim()))
    .filter((page) => Number.isInteger(page) && page > 0);

  const marks = new Map();
  const diagnostics = [];
  const pagesRead = [];
  const crops = new Map();

  try {
    for (let i = 0; i < keys.length; i += 1) {
      // Each page says which one it is, so files can arrive in any order - and
      // one PDF can hold every page of the sheet at once.
      const readings = await readScan(keys[i], exam.answerSheetLayout, declared[i] ?? null);
      for (const reading of readings) {
        for (const [questionNumber, mark] of reading.marks) marks.set(questionNumber, mark);
        for (const crop of reading.crops ?? []) crops.set(crop.questionNumber, crop);
        pagesRead.push(reading.page);
        diagnostics.push({ page: reading.page, ...reading.diagnostics });
      }
    }
  } catch (error) {
    await discard();
    throw error;
  }

  // Read the handwriting off the ruled lines and grade it like a typed answer:
  // the matching is deliberately forgiving about spelling, so a reading that is
  // close enough still earns the mark.
  const readings = await readHandwriting([...crops.values()]);
  const written = new Map();
  for (const [questionNumber, reading] of readings) {
    if (reading.text) written.set(questionNumber, reading.text);
  }

  const answers = gradeAnswers(exam, marks, written);

  // Keep the strip of the paper showing each written answer, so a mark that is
  // questioned can be checked against what the student actually wrote.
  const stem = path.basename(keys[0], path.extname(keys[0]));
  for (const answer of answers) {
    const crop = crops.get(answer.questionNumber);
    if (!crop) continue;

    answer.writeInCrop = await saveBuffer(
      BUCKETS.scanned,
      `${stem}-q${answer.questionNumber}.png`,
      crop.png
    );

    const reading = readings.get(answer.questionNumber);
    if (reading) answer.confidence = reading.confidence;
  }

  const result = await Result.create({
    examId: exam._id,
    teacherId: exam.teacherId,
    studentName,
    studentId: (req.body.studentId || "").trim(),
    answers,
    scannedImage: keys[0],
    scannedPages: keys,
    pageNumber: pagesRead[0] ?? 1,
  });

  result.passed = result.percentage >= exam.passingScore;
  await result.save();

  res.status(201).json({
    success: true,
    message: summarise(result, exam),
    data: {
      result: result.toJSON(),
      scanUrls: keys.map((key) => publicUrl(key)),
      diagnostics,
    },
  });
});

function summarise(result, exam) {
  const base = `${result.studentName}: ${result.score} / ${result.totalPoints} (${result.percentage}%)`;
  if (result.pendingReview > 0) {
    return `${base}. ${result.pendingReview} written answer${result.pendingReview === 1 ? "" : "s"} still need typing in.`;
  }
  if (result.ambiguousAnswers > 0) {
    return `${base}. ${result.ambiguousAnswers} unclear mark${result.ambiguousAnswers === 1 ? "" : "s"} need a look.`;
  }
  return `${base} - ${result.percentage >= exam.passingScore ? "passed" : "did not pass"}.`;
}

/**
 * PATCH /api/results/:id
 * Types in the written answers, or overrides what the scanner read, then
 * regrades the whole paper so the score can never drift from the answers.
 */
export const updateResult = asyncHandler(async (req, res) => {
  const result = await findOwnedResult(req.params.id, req.user);
  const exam = await Exam.findById(result.examId);
  if (!exam) throw ApiError.notFound("The exam this paper belongs to no longer exists.");

  const { answers: submitted } = req.body;
  if (submitted !== undefined && typeof submitted !== "object") {
    throw ApiError.badRequest("`answers` must be an object of questionNumber -> answer.");
  }

  // What the scanner read stays the baseline; corrections are layered on top.
  const marks = new Map();
  const written = new Map();

  const correctedByHand = new Set(
    result.answers.filter((a) => a.manuallyCorrected).map((a) => a.questionNumber)
  );

  for (const answer of result.answers) {
    if (isBubbleType(answer.questionType) && answer.studentAnswer) {
      marks.set(answer.questionNumber, {
        value: answer.studentAnswer,
        status: "read",
        confidence: answer.confidence,
      });
    } else if (answer.studentAnswer) {
      // Whatever is already recorded for a written item - read off the paper or
      // typed in - is the baseline, or a regrade would throw the reading away.
      written.set(answer.questionNumber, answer.studentAnswer);
    }
  }

  for (const [questionNumber, value] of Object.entries(submitted ?? {})) {
    written.set(Number(questionNumber), String(value ?? ""));
    correctedByHand.add(Number(questionNumber));
  }

  // Regrading rebuilds the answers from scratch, so the strips cut from the
  // scan have to be carried across or the review screen would lose them.
  const crops = new Map(
    result.answers.filter((a) => a.writeInCrop).map((a) => [a.questionNumber, a.writeInCrop])
  );

  const confidences = new Map(result.answers.map((a) => [a.questionNumber, a.confidence]));

  result.answers = gradeAnswers(exam, marks, written).map((answer) => ({
    ...answer,
    writeInCrop: crops.get(answer.questionNumber) ?? null,
    confidence: answer.confidence || confidences.get(answer.questionNumber) || 0,
    manuallyCorrected: correctedByHand.has(answer.questionNumber),
  }));

  if (req.body.studentName !== undefined) result.studentName = String(req.body.studentName).trim();
  if (req.body.studentId !== undefined) result.studentId = String(req.body.studentId).trim();

  await result.save();
  result.passed = result.percentage >= exam.passingScore;
  await result.save();

  res.json({
    success: true,
    message: `${result.studentName}: ${result.score} / ${result.totalPoints} (${result.percentage}%).`,
    data: { result: result.toJSON() },
  });
});

function isBubbleType(type) {
  return type === "multiple-choice" || type === "true-false" || type === "modified-true-false";
}

/** GET /api/exams/:id/results */
export const listResults = asyncHandler(async (req, res) => {
  const exam = await findOwnedExam(req.params.id, req.user);

  const results = await Result.find({ examId: exam._id })
    .sort({ createdAt: -1 })
    .select("-answers")
    .lean();

  res.json({ success: true, data: { results, exam: { title: exam.title, passingScore: exam.passingScore } } });
});

/** GET /api/results/:id */
export const getResult = asyncHandler(async (req, res) => {
  const result = await findOwnedResult(req.params.id, req.user);
  res.json({
    success: true,
    data: { result: result.toJSON(), scanUrl: publicUrl(result.scannedImage) },
  });
});

/** DELETE /api/results/:id */
export const deleteResult = asyncHandler(async (req, res) => {
  const result = await findOwnedResult(req.params.id, req.user);

  if (result.scannedImage) await removeFile(result.scannedImage).catch(() => {});
  await result.deleteOne();

  res.json({ success: true, message: `${result.studentName}'s paper was deleted.` });
});

/** GET /api/results - every paper the caller can see, newest first. */
export const listAllResults = asyncHandler(async (req, res) => {
  const results = await Result.find(buildScope(req.user))
    .sort({ createdAt: -1 })
    .limit(Math.min(100, Number(req.query.limit) || 25))
    .select("-answers")
    .populate("examId", "title subject examCode")
    .lean();

  res.json({ success: true, data: { results } });
});
