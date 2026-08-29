import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWorker } from "tesseract.js";

/**
 * Reads what a student wrote on the ruled lines.
 *
 * Tesseract is an optical character recogniser trained on printed text, so what
 * it does well is clean block capitals - which is exactly what the answer sheet
 * asks students for. Cursive and hurried writing it reads poorly, and it fails
 * by returning confident nonsense rather than by saying it is unsure.
 *
 * That is why `confidence` is carried through to the stored answer even though
 * nothing currently blocks on it: when a student queries a mark, the number is
 * there to look at.
 *
 * The worker is expensive to build and is kept for the life of the process; the
 * language data downloads once and is cached on disk next to the server.
 */

const serverRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CACHE_PATH = path.join(serverRoot, ".tesseract");

/** A line yielding less ink than this is an unanswered blank, not writing. */
const MIN_INK = 0.004;

let workerPromise = null;

function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker("eng", 1, {
      cachePath: CACHE_PATH,
      // Tesseract's own progress chatter is not useful in the API log.
      logger: () => {},
    }).then(async (worker) => {
      await worker.setParameters({
        // One answer per crop, so treat the image as a single line of text.
        tessedit_pageseg_mode: "7",
      });
      return worker;
    });

    // A failed start must not poison every later request.
    workerPromise.catch(() => {
      workerPromise = null;
    });
  }
  return workerPromise;
}

/** Frees the worker, so the process can exit cleanly. */
export async function shutdownHandwriting() {
  if (!workerPromise) return;
  const worker = await workerPromise.catch(() => null);
  workerPromise = null;
  if (worker) await worker.terminate().catch(() => {});
}

/**
 * Reads a batch of cropped answer lines.
 *
 * @param {{questionNumber: number, png: Buffer, ink: number}[]} crops
 * @returns {Promise<Map<number, {text: string, confidence: number}>>}
 */
export async function readHandwriting(crops) {
  const readings = new Map();
  if (crops.length === 0) return readings;

  // An empty line needs no reading, and skipping it keeps OCR off the majority
  // of lines on a half-finished paper.
  const written = crops.filter((crop) => crop.ink >= MIN_INK);
  for (const crop of crops) {
    if (crop.ink < MIN_INK) readings.set(crop.questionNumber, { text: "", confidence: 1 });
  }
  if (written.length === 0) return readings;

  let worker;
  try {
    worker = await getWorker();
  } catch (error) {
    // Without the language data nothing can be read; the papers still grade,
    // with the written answers left for the teacher.
    console.warn(`[CheckWise] Handwriting reader unavailable: ${error.message}`);
    return readings;
  }

  // Serial on one worker: Tesseract is CPU-bound, so running several at once on
  // the same machine finishes no sooner and competes with serving requests.
  for (const crop of written) {
    try {
      const { data } = await worker.recognize(crop.png);
      readings.set(crop.questionNumber, {
        text: tidy(data.text),
        confidence: Math.max(0, Math.min(1, (data.confidence ?? 0) / 100)),
      });
    } catch (error) {
      console.warn(`[CheckWise] Could not read item ${crop.questionNumber}: ${error.message}`);
    }
  }

  return readings;
}

/**
 * Trims the artefacts a line-mode read leaves behind: trailing newlines, and
 * the stray marks Tesseract makes of the ruled line at the edges of the crop.
 */
function tidy(raw) {
  return (
    String(raw ?? "")
      .replace(/\s+/g, " ")
      // Underscores and pipes are how the ruled line itself comes back; the
      // quotes, slashes and brackets are kept, because a code blank can be
      // nothing but punctuation.
      .replace(/[|_~^`]+/g, "")
      .trim()
  );
}
