import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import { env } from "../config/env.js";
import { BUCKETS, UPLOAD_ROOT } from "../services/storageService.js";
import ApiError from "../utils/ApiError.js";

const MB = 1024 * 1024;

function buildStorage(bucket) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(UPLOAD_ROOT, bucket)),
    filename: (_req, file, cb) => {
      // Never trust the client filename on disk - keep only a safe extension.
      const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
    },
  });
}

function fileFilter(allowedMime, label) {
  return (_req, file, cb) => {
    if (allowedMime.includes(file.mimetype)) return cb(null, true);
    cb(ApiError.badRequest(`Only ${label} files are accepted.`));
  };
}

/** Single exam PDF, field name "pdf". */
export const uploadExamPdf = multer({
  storage: buildStorage(BUCKETS.exams),
  limits: { fileSize: env.maxUploadMb * MB, files: 1 },
  fileFilter: fileFilter(["application/pdf"], "PDF"),
}).single("pdf");

/**
 * The pages of one student's answer sheet, field name "images".
 *
 * A sheet can run to several pages, and they belong to one paper - taking them
 * together means the student is scored once, not once per page.
 */
export const uploadScannedImages = multer({
  storage: buildStorage(BUCKETS.scanned),
  limits: { fileSize: env.maxUploadMb * MB, files: 8 },
  // PDFs too: a document scanner or copier hands back one PDF of several pages
  // rather than loose images, and that is how a stack of papers usually arrives.
  fileFilter: fileFilter(
    ["image/jpeg", "image/jpg", "image/png", "application/pdf"],
    "JPG, PNG and PDF"
  ),
}).array("images", 8);
