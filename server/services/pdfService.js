import fs from "node:fs/promises";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import ApiError from "../utils/ApiError.js";
import { resolveKey } from "./storageService.js";

/**
 * Text extraction for uploaded exam documents.
 *
 * This reads more than the characters. Teachers mark the correct answer by
 * highlighting it, and that highlight is the only thing separating the right
 * choice from the wrong ones - the text layer of "d. Mounting" is identical
 * whether or not it is the answer. So every line is returned with the part of
 * it that sits on a highlight, which is what the parser grades on.
 *
 * Only the text layer is read; a scan or a photo has none, and is reported as
 * an error rather than silently producing an empty exam (OCR is Phase 6).
 */

/** A document yielding fewer characters than this is not a digital PDF. */
const MIN_CHARS = 40;

/** Highlighter colours: strongly saturated, light, and not near-white. */
function isHighlight(colour) {
  const rgb = toRgb(colour);
  if (!rgb) return false;
  const [r, g, b] = rgb;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  // Near-white and near-black fills are page furniture (rules, boxes), not marks.
  if (max < 120 || (min > 225 && max > 225)) return false;
  // A highlight is coloured: at least one channel clearly below the brightest.
  return max - min > 60;
}

function toRgb(colour) {
  if (typeof colour !== "string") return null;
  const hex = colour.replace("#", "");
  if (hex.length < 6) return null;
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

/** Applies a 2D transform matrix to a point. */
function apply(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/**
 * Reads a stored PDF into ordered lines carrying their highlighted text.
 *
 * @param {string} key - bucket-relative storage key
 * @returns {Promise<{ lines: Line[], text: string, pageCount: number, highlightCount: number }>}
 *
 * @typedef {object} Line
 * @property {number} page
 * @property {string} text        - the whole line
 * @property {string} highlighted - only the parts sitting on a highlight ("" if none)
 */
export async function extractDocument(key) {
  const buffer = await fs.readFile(resolveKey(key));

  // The loading task, not the document, owns the resources that must be freed.
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer), verbosity: 0 });

  let doc;
  try {
    doc = await loadingTask.promise;
  } catch (error) {
    await loadingTask.destroy().catch(() => {});
    throw ApiError.badRequest(
      `That PDF could not be opened (${error.message}). Re-export it from Word and try again.`
    );
  }

  const lines = [];
  let highlightCount = 0;

  try {
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
      const page = await doc.getPage(pageNo);
      const boxes = await readHighlightBoxes(page);
      highlightCount += boxes.length;

      const items = await readTextItems(page, boxes);
      lines.push(...toReadingOrder(items, page.view[2], pageNo));
    }
  } finally {
    await loadingTask.destroy().catch(() => {});
  }

  const text = lines.map((line) => line.text).join("\n");

  if (text.replace(/\s/g, "").length < MIN_CHARS) {
    throw ApiError.badRequest(
      "No text could be read from that PDF. It looks like a scan or a photo - " +
        "CheckWise needs a PDF exported from Word or Google Docs, which carries a real text layer."
    );
  }

  return { lines, text, pageCount: doc.numPages, highlightCount };
}

/** Filled rectangles in a highlighter colour, in page coordinates. */
async function readHighlightBoxes(page) {
  const ops = await page.getOperatorList();
  const boxes = [];

  let base = [1, 0, 0, 1, 0, 0];
  let fill = null;

  for (let i = 0; i < ops.fnArray.length; i += 1) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];

    if (fn === pdfjs.OPS.transform) base = args;
    else if (fn === pdfjs.OPS.setFillRGBColor) fill = args[0];
    else if (fn === pdfjs.OPS.constructPath && isHighlight(fill)) {
      // The third argument is the path's bounding box, which is all a
      // rectangular highlight needs - no need to walk the path operators.
      const bounds = args[2];
      if (!bounds) continue;
      const [x0, y0] = apply(base, bounds[0], bounds[1]);
      const [x1, y1] = apply(base, bounds[2], bounds[3]);
      boxes.push({
        minX: Math.min(x0, x1),
        maxX: Math.max(x0, x1),
        minY: Math.min(y0, y1),
        maxY: Math.max(y0, y1),
      });
    }
  }

  return boxes;
}

/** Text runs with their position and whether they sit on a highlight. */
async function readTextItems(page, boxes) {
  const content = await page.getTextContent();

  return content.items
    .filter((item) => item.str && item.str.trim())
    .map((item) => {
      const x = item.transform[4];
      const y = item.transform[5];
      const midX = x + item.width / 2;
      const midY = y + item.height / 2;

      return {
        text: item.str,
        x,
        endX: x + item.width,
        y,
        highlighted: boxes.some(
          (b) =>
            midX >= b.minX - 2 &&
            midX <= b.maxX + 2 &&
            midY >= b.minY - 2 &&
            midY <= b.maxY + 2
        ),
      };
    });
}

/**
 * Rebuilds lines and puts them in the order a person reads them.
 *
 * The exams are laid out in two columns interrupted by full-width headings
 * ("TEST II: TRUE OR FALSE"). Sorting by column alone would move a heading
 * away from the questions it introduces, so the page is cut into bands at each
 * full-width line: within a band the left column is read before the right.
 */
function toReadingOrder(items, pageWidth, pageNo) {
  const midX = pageWidth / 2;

  // Group runs sharing a baseline into one line - but per column, because the
  // left and right columns share baselines and would otherwise be spliced into
  // a single nonsensical line.
  const byBaseline = new Map();
  for (const item of items) {
    const column = item.x < midX ? 0 : 1;
    const key = `${column}:${Math.round(item.y)}`;
    if (!byBaseline.has(key)) byBaseline.set(key, []);
    byBaseline.get(key).push(item);
  }

  const rawLines = [...byBaseline.values()]
    .map((runs) => {
      runs.sort((a, b) => a.x - b.x);
      return {
        page: pageNo,
        y: runs[0].y,
        startX: runs[0].x,
        endX: Math.max(...runs.map((r) => r.endX)),
        text: joinRuns(runs.map((r) => r.text)),
        highlighted: joinRuns(runs.filter((r) => r.highlighted).map((r) => r.text)),
      };
    })
    // Page coordinates grow upwards, so descending y is top to bottom.
    .sort((a, b) => b.y - a.y);

  const spansPage = (line) => Boolean(line) && line.startX < midX && line.endX > midX + 20;

  /**
   * A band separator interrupts both columns and starts a new one. Two shapes
   * count: text that physically spans the page, and a short heading ("TEST II:
   * TRUE OR FALSE") sitting alone on its row directly above a full-width
   * paragraph - which is what a section heading and its directions look like.
   *
   * The "alone on its row" test alone is not enough: the last item of a column
   * also has nothing beside it, and treating that as a heading would reorder
   * the questions around it.
   */
  function isBandSeparator(line, index) {
    if (line.startX >= midX) return false;
    if (spansPage(line)) return true;

    const aloneOnRow = !rawLines.some(
      (other) => other !== line && other.startX >= midX && Math.abs(other.y - line.y) < 8
    );
    return aloneOnRow && spansPage(rawLines[index + 1]);
  }

  const ordered = [];
  let left = [];
  let right = [];

  const flush = () => {
    ordered.push(...left, ...right);
    left = [];
    right = [];
  };

  rawLines.forEach((line, index) => {
    if (isBandSeparator(line, index)) {
      flush();
      ordered.push(line);
      return;
    }
    if (line.startX < midX) left.push(line);
    else right.push(line);
  });
  flush();

  return ordered.map(({ page, text, highlighted }) => ({
    page,
    text: normalise(text),
    highlighted: normalise(highlighted),
  }));
}

/** Runs are already visually spaced; only insert a space where one is missing. */
function joinRuns(parts) {
  return parts
    .reduce((acc, part) => {
      if (!acc) return part;
      const needsSpace = !/\s$/.test(acc) && !/^\s/.test(part);
      return acc + (needsSpace ? " " : "") + part;
    }, "")
    .trim();
}

/**
 * Word exports carry non-breaking spaces and smart quotes. Normalising here
 * means every downstream pattern can assume plain ASCII punctuation.
 */
function normalise(raw) {
  return (raw || "")
    .replace(/ /g, " ")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}
