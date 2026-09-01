import { Router } from "express";
import {
  confirmAnswerKey,
  createAnswerSheet,
  createExam,
  downloadAnswerSheet,
  deleteExam,
  getExam,
  listExams,
  replaceQuestions,
  updateExam,
  uploadExamDocument,
} from "../controllers/examController.js";
import { getExamAnalysis, listResults, scanAnswerSheet } from "../controllers/resultController.js";
import { protect } from "../middleware/authMiddleware.js";
import { uploadExamPdf, uploadScannedImages } from "../middleware/uploadMiddleware.js";
import { validate } from "../middleware/validationMiddleware.js";

const router = Router();

// Shared field rules. Create marks them required; PATCH reuses them as
// optional, since the validator skips any field that was not sent.
const TITLE = { minLength: 3, maxLength: 160 };
const SUBJECT = { minLength: 2, maxLength: 120 };
const DESCRIPTION = { maxLength: 1000 };
const PASSING_SCORE = { integer: true, min: 1, max: 100 };
const MTF_SCORING = { oneOf: ["whole", "split"] };

router.use(protect);

router.post(
  "/",
  validate({
    title: { required: true, ...TITLE },
    subject: { required: true, ...SUBJECT },
    description: DESCRIPTION,
    passingScore: { required: true, ...PASSING_SCORE },
    modifiedTrueFalseScoring: MTF_SCORING,
  }),
  createExam
);

router.get("/", listExams);

router.get("/:id", getExam);

router.patch(
  "/:id",
  validate({
    title: TITLE,
    subject: SUBJECT,
    description: DESCRIPTION,
    passingScore: PASSING_SCORE,
    modifiedTrueFalseScoring: MTF_SCORING,
  }),
  updateExam
);

router.delete("/:id", deleteExam);

// Phase 3-4: upload the finished exam PDF, review what was read from it, and
// confirm the answer key. Multer runs before the controller so `req.file` is
// already on disk by the time the text is extracted.
router.post("/:id/document", uploadExamPdf, uploadExamDocument);
router.put("/:id/questions", replaceQuestions);
router.post("/:id/confirm", confirmAnswerKey);

// Phase 5: the printable sheet, built from the confirmed answer key.
router.post("/:id/answer-sheet", createAnswerSheet);
router.get("/:id/answer-sheet", downloadAnswerSheet);

// Phase 6: read a completed sheet and score it against the confirmed key.
router.post("/:id/scan", uploadScannedImages, scanAnswerSheet);
router.get("/:id/results", listResults);

// How the class did per item - difficulty, discrimination and the distractors.
router.get("/:id/analysis", getExamAnalysis);

export default router;
