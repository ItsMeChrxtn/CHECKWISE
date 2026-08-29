import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export const UPLOAD_ROOT = path.join(serverRoot, "uploads");

export const BUCKETS = {
  exams: "exams",
  answerSheets: "answer-sheets",
  scanned: "scanned",
};

/**
 * Local-disk storage driver.
 *
 * Every path stored in MongoDB is a bucket-relative key such as
 * "exams/1724750000000-midterm.pdf" - never an absolute disk path. Swapping in
 * Cloudinary / R2 / S3 later means reimplementing this module's four functions
 * and leaving the rest of the app untouched.
 */
export async function ensureBuckets() {
  await Promise.all(
    Object.values(BUCKETS).map((bucket) =>
      fs.mkdir(path.join(UPLOAD_ROOT, bucket), { recursive: true })
    )
  );
}

export function resolveKey(key) {
  const full = path.resolve(UPLOAD_ROOT, key);
  // Guard against path traversal via a crafted key.
  if (!full.startsWith(UPLOAD_ROOT)) {
    throw new Error("Refusing to resolve a storage key outside the upload root");
  }
  return full;
}

export function publicUrl(key) {
  return key ? `/uploads/${key.split(path.sep).join("/")}` : null;
}

export async function saveBuffer(bucket, filename, buffer) {
  const key = `${bucket}/${filename}`;
  await fs.mkdir(path.dirname(resolveKey(key)), { recursive: true });
  await fs.writeFile(resolveKey(key), buffer);
  return key;
}

export async function remove(key) {
  if (!key) return;
  await fs.rm(resolveKey(key), { force: true });
}
