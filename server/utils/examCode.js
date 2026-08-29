import crypto from "crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 - avoids OCR ambiguity

/**
 * Builds a human-readable exam identifier, e.g. CHK-2026-8F42A.
 * Encoded into the answer sheet QR code so the scanner can resolve the answer key.
 */
export function generateExamCode(year = new Date().getFullYear()) {
  const bytes = crypto.randomBytes(5);
  let suffix = "";
  for (const byte of bytes) suffix += ALPHABET[byte % ALPHABET.length];
  return `CHK-${year}-${suffix}`;
}
