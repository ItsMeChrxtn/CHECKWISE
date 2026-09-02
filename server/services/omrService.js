import path from "node:path";
import fs from "node:fs/promises";
import { Jimp } from "jimp";
import { createCanvas } from "@napi-rs/canvas";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import ApiError from "../utils/ApiError.js";
import { resolveKey } from "./storageService.js";

/**
 * Reads a scanned answer sheet.
 *
 * The sheet records where it printed every bubble (see answerSheetService), so
 * reading one is a mapping problem rather than a search: find the four corner
 * markers in the photo, solve the projective transform that takes sheet points
 * to image pixels, then look at the pixels under each known bubble.
 *
 * That is what makes a phone photo workable - the transform absorbs rotation,
 * scale and the keystone of a camera held at an angle, so nothing here assumes
 * a flat-bed scan.
 *
 * Anything the reader is not sure about is reported rather than guessed: a
 * faint mark, two marks on one row, or none at all comes back for the teacher
 * to settle. A wrong confident answer costs a student marks; a flagged one
 * costs a few seconds.
 */

/** Pixels the marker search works at - big enough to see, small enough to be quick. */
const WORK_WIDTH = 1200;

/** A bubble is considered shaded when this much of its area is dark. */
const FILL_THRESHOLD = 0.32;
/** ...and the runner-up must be this much lighter, or the row is ambiguous. */
const FILL_MARGIN = 0.14;

/** Rasterising a scanned PDF at roughly this many dots per inch. */
const PDF_DPI = 180;

/**
 * Reads every sheet page in one uploaded file.
 *
 * A file is either one photo or a multi-page PDF straight off a copier, and
 * both are just pages as far as the reader is concerned - so a teacher can feed
 * a whole stack through a document scanner and upload the single PDF it makes.
 *
 * @param {string} key - bucket-relative storage key of the scan
 * @param {object} layout - exam.answerSheetLayout
 * @param {number} [pageNumber] - force which sheet page this is; by default each
 *        page is read off its own page marks, so any order works
 * @returns {Promise<Array<{ marks: Map<number, object>, page: number, diagnostics: object }>>}
 */
export async function readScan(key, layout, pageNumber = null) {
  if (!layout?.bubbles?.length) {
    throw ApiError.badRequest(
      "This exam has no answer sheet layout. Generate its answer sheet first."
    );
  }

  const pages = path.extname(key).toLowerCase() === ".pdf"
    ? await rasterisePdf(key)
    : [toGrayscale(await load(key))];

  const readings = [];
  for (const grey of pages) {
    // A forced page number can only mean anything for a single image; a
    // multi-page PDF must let each page identify itself.
    readings.push(analyse(grey, layout, pages.length === 1 ? pageNumber : null));
  }
  return readings;
}

/**
 * Reads one page image. Kept separate from loading so a photo and a rasterised
 * PDF page take exactly the same path through the reader.
 */
function analyse(grey, layout, pageNumber = null) {
  const markers = findMarkers(grey, layout);
  const transform = solveProjection(layout.markers, markers);
  const threshold = otsu(grey);

  // Bubble radius in image pixels, from how far apart the markers ended up.
  const radius = layout.bubbleRadius * scaleOf(transform, layout);

  const detectedPage = readPageMark(grey, layout, transform, radius, threshold);

  // A sheet printed on one page has nothing to disambiguate, so the marks
  // along the bottom edge do not have to be readable for it to be scored.
  // They are 7 points across, which is small enough that a hand-held photo
  // can lose them to blur or a cropped edge - and refusing the whole paper
  // over a detail that carries no information was never right.
  const onlyPage = pageCount(layout) === 1 ? 1 : null;
  const page = pageNumber ?? detectedPage ?? onlyPage;

  if (!page) {
    const error = ApiError.badRequest(
      "Could not tell which page of the sheet this is. Make sure the small squares along the " +
        "bottom edge are in frame and not covered."
    );
    // Marked so the caller can work the page out by elimination instead,
    // when it knows what the other pages of the same upload turned out to be.
    error.code = "page-unknown";
    throw error;
  }

  const bubbles = layout.bubbles.filter((b) => (b.page ?? 1) === page);
  if (bubbles.length === 0) {
    throw ApiError.badRequest(`The sheet has no page ${page}.`);
  }

  const readings = new Map();
  for (const bubble of bubbles) {
    const [px, py] = project(transform, bubble.x, bubble.y);
    const fill = darkFraction(grey, px, py, radius * 0.78, threshold);

    if (!readings.has(bubble.questionNumber)) readings.set(bubble.questionNumber, []);
    readings.get(bubble.questionNumber).push({ value: bubble.value, fill });
  }

  const marks = new Map();
  for (const [questionNumber, options] of readings) {
    marks.set(questionNumber, decide(options));
  }

  return {
    marks,
    page,
    crops: cropWriteIns(grey, layout, page, transform),
    diagnostics: {
      imageSize: { width: grey.width, height: grey.height },
      markers,
      detectedPage,
      bubbleRadiusPx: Math.round(radius * 10) / 10,
      threshold,
      bubblesRead: bubbles.length,
    },
  };
}

/** How far above its ruled line a written answer sits, in sheet points. */
const WRITE_IN_ABOVE = 17;
/** ...and a little below, to catch descenders in g, y and p. */
const WRITE_IN_BELOW = 4;
/** Pixels per sheet point in a crop - enough for handwriting to stay legible. */
const CROP_SCALE = 3;

/**
 * Cuts out what the student wrote on each ruled line, straightened.
 *
 * The same transform that finds the bubbles is run backwards here, so every
 * crop comes out rectangular and upright no matter how the photo was taken.
 * Straightening matters twice over: it is what makes the strip readable to a
 * person reviewing the paper, and it is the form any handwriting reader would
 * want if one is added.
 */
function cropWriteIns(grey, layout, page, transform) {
  const lines = (layout.writeIns ?? []).filter((line) => (line.page ?? 1) === page);
  if (lines.length === 0) return [];

  const inverse = invert3x3(transform);
  if (!inverse) return [];

  const threshold = otsu(grey);

  return lines.map((line) => {
    const height = WRITE_IN_ABOVE + WRITE_IN_BELOW;
    const width = Math.round(line.width * CROP_SCALE);
    const canvas = createCanvas(width, Math.round(height * CROP_SCALE));
    const ctx = canvas.getContext("2d");
    const out = ctx.createImageData(canvas.width, canvas.height);

    // The bottom rows hold the printed rule itself; ink there is not an answer.
    const ruleFrom = Math.round((WRITE_IN_ABOVE - 2) * CROP_SCALE);
    let ink = 0;
    let counted = 0;

    for (let y = 0; y < canvas.height; y += 1) {
      // Sheet coordinates of this row of the crop.
      const sheetY = line.y - WRITE_IN_ABOVE + y / CROP_SCALE;
      for (let x = 0; x < canvas.width; x += 1) {
        const sheetX = line.x + x / CROP_SCALE;
        const [px, py] = project(transform, sheetX, sheetY);

        const value = sample(grey, px, py);
        if (y < ruleFrom) {
          counted += 1;
          if (value < threshold) ink += 1;
        }

        const at = (y * canvas.width + x) * 4;
        out.data[at] = value;
        out.data[at + 1] = value;
        out.data[at + 2] = value;
        out.data[at + 3] = 255;
      }
    }

    ctx.putImageData(out, 0, 0);
    return {
      questionNumber: line.questionNumber,
      png: canvas.toBuffer("image/png"),
      // Enough to tell an empty line from a written one before any reading.
      ink: counted === 0 ? 0 : ink / counted,
    };
  });
}

/** Nearest-neighbour read, clamped to the image so edges never wrap. */
function sample(grey, x, y) {
  const px = Math.min(grey.width - 1, Math.max(0, Math.round(x)));
  const py = Math.min(grey.height - 1, Math.max(0, Math.round(y)));
  return grey.data[py * grey.width + px];
}

/** Inverse of the homography, used to check it is well-conditioned. */
function invert3x3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (!det || !Number.isFinite(det)) return null;
  return [
    (e * i - f * h) / det,
    (c * h - b * i) / det,
    (b * f - c * e) / det,
    (f * g - d * i) / det,
    (a * i - c * g) / det,
    (c * d - a * f) / det,
    (d * h - e * g) / det,
    (b * g - a * h) / det,
    (a * e - b * d) / det,
  ];
}

/**
 * Counts the small squares along the bottom edge: one for page 1, two for
 * page 2, and so on. Counting from the left and stopping at the first gap
 * means a smudge further along cannot inflate the number.
 */
function readPageMark(grey, layout, transform, bubbleRadiusPx, threshold) {
  const mark = layout.pageMark;
  if (!mark) return null;

  // Sample well inside each square so a slightly-off transform still lands on it.
  const sampleRadius = Math.max(2, bubbleRadiusPx * 0.35);

  let count = 0;
  for (let i = 0; i < mark.max; i += 1) {
    const [px, py] = project(transform, mark.x + i * mark.spacing + mark.size / 2, mark.y);
    const fill = darkFraction(grey, px, py, sampleRadius, threshold);
    if (fill < 0.5) break;
    count += 1;
  }

  return count > 0 ? count : null;
}

/** Which bubble the student shaded, or why that cannot be said. */
function decide(options) {
  const sorted = [...options].sort((a, b) => b.fill - a.fill);
  const best = sorted[0];
  const runnerUp = sorted[1] ?? { fill: 0 };

  const fills = Object.fromEntries(options.map((o) => [o.value, Math.round(o.fill * 100)]));

  if (best.fill < FILL_THRESHOLD) {
    return { value: null, status: "blank", confidence: 0, fills };
  }
  if (best.fill - runnerUp.fill < FILL_MARGIN) {
    // Two bubbles equally dark: an erasure that did not take, or a double mark.
    return { value: null, status: "ambiguous", confidence: 0, fills };
  }

  // How clear the winner is, expressed as a 0-1 confidence.
  const confidence = Math.min(1, (best.fill - runnerUp.fill) / (1 - FILL_MARGIN));
  return { value: best.value, status: "read", confidence, fills };
}

async function load(key) {
  try {
    return await Jimp.read(resolveKey(key));
  } catch (error) {
    throw ApiError.badRequest(`That image could not be read (${error.message}).`);
  }
}

/**
 * Draws every page of a scanned PDF and returns them as luminance buffers.
 *
 * Scanners and copiers hand back a PDF rather than loose images, so the pages
 * are drawn here at a fixed resolution and then read exactly as a photo is -
 * whether the PDF holds a scanned bitmap or vector content makes no difference
 * once it has been rendered.
 */
async function rasterisePdf(key) {
  const buffer = await fs.readFile(resolveKey(key));
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), verbosity: 0 });

  let doc;
  try {
    doc = await task.promise;
  } catch (error) {
    await task.destroy().catch(() => {});
    throw ApiError.badRequest(`That PDF could not be opened (${error.message}).`);
  }

  const pages = [];
  try {
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
      const page = await doc.getPage(pageNo);
      const viewport = page.getViewport({ scale: PDF_DPI / 72 });

      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext("2d");
      // Paper, not transparency: an unpainted background reads as black ink.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      pages.push(canvasToGrayscale(ctx, canvas.width, canvas.height));
    }
  } finally {
    await task.destroy().catch(() => {});
  }

  if (pages.length === 0) throw ApiError.badRequest("That PDF has no pages.");
  return pages;
}

function canvasToGrayscale(ctx, width, height) {
  const { data } = ctx.getImageData(0, 0, width, height);
  const grey = new Uint8Array(width * height);

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    grey[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  }

  return { width, height, data: grey };
}

/** A plain {width,height,data} luminance buffer - faster than per-pixel Jimp calls. */
function toGrayscale(image) {
  const scale = Math.min(1, WORK_WIDTH / image.bitmap.width);
  const working = scale < 1 ? image.clone().resize({ w: Math.round(image.bitmap.width * scale) }) : image;

  const { width, height, data } = working.bitmap;
  const grey = new Uint8Array(width * height);

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    // Rec. 601 luma: matches how a scanner renders coloured ink as grey.
    grey[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  }

  return { width, height, data: grey };
}

/** Otsu's method: the darkness cut that best separates ink from paper. */
function otsu(grey) {
  const histogram = new Array(256).fill(0);
  for (const value of grey.data) histogram[value] += 1;

  const total = grey.data.length;
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * histogram[i];

  let sumB = 0;
  let weightB = 0;
  let best = 0;
  let bestVariance = -1;

  for (let t = 0; t < 256; t += 1) {
    weightB += histogram[t];
    if (weightB === 0) continue;
    const weightF = total - weightB;
    if (weightF === 0) break;

    sumB += t * histogram[t];
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const variance = weightB * weightF * (meanB - meanF) ** 2;

    if (variance > bestVariance) {
      bestVariance = variance;
      best = t;
    }
  }

  return best;
}

/**
 * Locates the four corner squares.
 *
 * Each is looked for inside the quarter of the page it belongs to, which keeps
 * writing and printed text from being mistaken for a marker, then refined to
 * the centre of mass of the dark pixels in a window around the best candidate.
 */
/**
 * Finds the four corner markers, wherever the sheet happens to sit in frame.
 *
 * The obvious approach - work out where each marker would be if the photo were
 * the page, then look there - only holds for a scan. A phone held over a desk
 * gives a sheet that is smaller than the frame, off centre and a few degrees
 * rotated, and the marker is then nowhere near the assumed spot. So the search
 * does not assume a position at all: every dark blob in the image is measured
 * once, the ones shaped like the marker are kept, and the four that are the
 * same size as each other and furthest apart are taken as the corners.
 *
 * Same size as each other is what makes this reliable. Letters, bubble outlines
 * and shadows are never four identical squares at the extremes of a page-shaped
 * quadrilateral, so the real markers win even on a cluttered desk.
 *
 * Everything downstream already copes with the sheet being askew - solveProjection
 * fits a full projective transform - so this is the only place that ever needed
 * the paper to be square on.
 */
function findMarkers(grey, layout) {
  const threshold = otsu(grey);
  const { width } = grey;

  // What the marker would measure if the sheet filled the frame. Used only as a
  // scale reference now: anything from a distant sheet up to a close one counts.
  const expected = (layout.markerSize / layout.pageSize.width) * width;

  const quad = chooseMarkerQuad(collectDarkBlobs(grey, threshold, expected), layout);
  if (quad) return quad;

  // Nothing page-shaped turned up. Fall back to the old fixed-position search,
  // which still rescues a clean flatbed scan whose markers are faint enough to
  // fail the shape test but are exactly where a scan puts them.
  const search = Math.round(expected * 3);
  const corners = layout.markers.map(([sx, sy]) => [
    (sx / layout.pageSize.width) * width,
    (sy / layout.pageSize.height) * grey.height,
  ]);

  return corners.map(([gx, gy], index) => {
    const found = findDarkBlob(grey, gx, gy, search, threshold, expected);
    if (!found) {
      throw ApiError.badRequest(
        `Could not find the ${cornerName(index)} corner marker on that scan. ` +
          "Hold the whole sheet in frame, flat and evenly lit, with all four black squares visible."
      );
    }
    return found;
  });
}

/** A blob has to be at least this square, and this solid, to pass for a marker. */
const MARKER_SQUARENESS = 0.55;
const MARKER_SOLIDITY = 0.6;
/** How small and how large a marker may be, against a sheet that fills the frame. */
const MARKER_MIN_SCALE = 0.12;
const MARKER_MAX_SCALE = 1.8;
/**
 * How close in size two blobs must be to count as the same printed mark. This
 * is the main thing telling a corner marker from the smaller page-number square
 * beside it, so the window is deliberately tight.
 */
const GROUP_LOW = 0.75;
const GROUP_HIGH = 1.33;

/** How much the four chosen corners may differ in size from one another. */
const MARKER_SIZE_SPREAD = 1.45;

/**
 * Measures every dark connected region in the image once, keeping the ones
 * shaped like a marker.
 *
 * One pass, iterative flood fill over typed arrays: each pixel is visited at
 * most twice however large the dark regions are, so a photo with a dark desk
 * behind the paper costs the same as one on a white table.
 */
function collectDarkBlobs(grey, threshold, expected) {
  const { width, height, data } = grey;
  const seen = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  const minBox = Math.max(3, expected * MARKER_MIN_SCALE);
  const maxBox = expected * MARKER_MAX_SCALE;
  const blobs = [];

  for (let start = 0; start < data.length; start += 1) {
    if (seen[start] || data[start] >= threshold) continue;

    let top = 0;
    stack[top++] = start;
    seen[start] = 1;

    let area = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;

    while (top > 0) {
      const p = stack[--top];
      const x = p % width;
      const y = (p - x) / width;

      area += 1;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      if (x > 0 && !seen[p - 1] && data[p - 1] < threshold) { seen[p - 1] = 1; stack[top++] = p - 1; }
      if (x < width - 1 && !seen[p + 1] && data[p + 1] < threshold) { seen[p + 1] = 1; stack[top++] = p + 1; }
      if (y > 0 && !seen[p - width] && data[p - width] < threshold) { seen[p - width] = 1; stack[top++] = p - width; }
      if (y < height - 1 && !seen[p + width] && data[p + width] < threshold) { seen[p + width] = 1; stack[top++] = p + width; }
    }

    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    const box = Math.max(boxWidth, boxHeight);
    if (box < minBox || box > maxBox) continue;

    const squareness = Math.min(boxWidth, boxHeight) / box;
    if (squareness < MARKER_SQUARENESS) continue;

    const solidity = area / (boxWidth * boxHeight);
    if (solidity < MARKER_SOLIDITY) continue;

    blobs.push({
      x: sumX / area,
      y: sumY / area,
      box,
      score: squareness * solidity,
    });
  }

  return blobs;
}

/**
 * Picks the four candidates that look like the corners of the sheet.
 *
 * Markers are printed the same size, so the candidates are grouped by size and
 * each group judged on its own. Within a group the corners are the extremes
 * along the two diagonals, which is rotation-tolerant in a way that taking the
 * topmost or leftmost blob is not. The group whose quadrilateral is largest and
 * closest to the sheet's own proportions wins.
 */
function chooseMarkerQuad(blobs, layout) {
  if (blobs.length < 4) return null;

  const [mx0, my0] = layout.markers[0];
  const [mx1, my1] = layout.markers[1];
  const [, my3] = layout.markers[3];
  const sheetAspect = Math.abs(mx1 - mx0) / Math.max(1, Math.abs(my3 - my1 || my3 - my0));

  let best = null;
  let bestScore = 0;

  for (const seed of blobs) {
    const group = blobs.filter((b) => b.box >= seed.box * GROUP_LOW && b.box <= seed.box * GROUP_HIGH);
    if (group.length < 4) continue;

    const pick = (fn) => group.reduce((a, b) => (fn(b) < fn(a) ? b : a));
    const tl = pick((b) => b.x + b.y);
    const br = pick((b) => -(b.x + b.y));
    const tr = pick((b) => -(b.x - b.y));
    const bl = pick((b) => b.x - b.y);

    const corners = [tl, tr, br, bl];
    if (new Set(corners).size < 4) continue;

    // The four markers are printed identically, so they must measure alike.
    // Without this the page-number square along the bottom edge can slip into
    // the group and win the bottom-left corner, which throws the whole fit.
    const boxes = corners.map((c) => c.box);
    if (Math.max(...boxes) / Math.min(...boxes) > MARKER_SIZE_SPREAD) continue;

    const spanTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
    const spanLeft = Math.hypot(bl.x - tl.x, bl.y - tl.y);
    if (spanTop < seed.box * 3 || spanLeft < seed.box * 3) continue;

    // Shoelace area of the quad, and how close its shape is to the real sheet.
    let area = 0;
    for (let i = 0; i < 4; i += 1) {
      const p = corners[i];
      const q = corners[(i + 1) % 4];
      area += p.x * q.y - q.x * p.y;
    }
    area = Math.abs(area) / 2;
    if (area <= 0) continue;

    const aspect = spanTop / spanLeft;
    const aspectFit = 1 - Math.min(1, Math.abs(aspect - sheetAspect) / sheetAspect);
    const shape = corners.reduce((sum, c) => sum + c.score, 0) / 4;
    const score = area * aspectFit * shape;

    if (score > bestScore) {
      bestScore = score;
      best = corners.map((c) => [c.x, c.y]);
    }
  }

  return best;
}

function cornerName(index) {
  return ["top-left", "top-right", "bottom-right", "bottom-left"][index] ?? "corner";
}

/**
 * Finds the marker square inside a corner window.
 *
 * Taking the centre of mass of every dark pixel in the window does not work:
 * the title and the first bubbles sit close enough to the corners to drag the
 * centroid off the marker. So the window is split into connected blobs and the
 * one actually shaped like the marker is chosen - large, square and solid,
 * which letters and bubble outlines are not.
 */
function findDarkBlob(grey, cx, cy, radius, threshold, expected) {
  const { width, height, data } = grey;

  const x0 = Math.max(0, Math.round(cx - radius));
  const x1 = Math.min(width - 1, Math.round(cx + radius));
  const y0 = Math.max(0, Math.round(cy - radius));
  const y1 = Math.min(height - 1, Math.round(cy + radius));

  const seen = new Uint8Array((x1 - x0 + 1) * (y1 - y0 + 1));
  const stride = x1 - x0 + 1;
  const at = (x, y) => (y - y0) * stride + (x - x0);

  let best = null;
  let bestScore = 0;

  for (let sy = y0; sy <= y1; sy += 1) {
    for (let sx = x0; sx <= x1; sx += 1) {
      if (seen[at(sx, sy)] || data[sy * width + sx] >= threshold) continue;

      // Flood fill this blob, four-connected.
      const stack = [[sx, sy]];
      seen[at(sx, sy)] = 1;
      let area = 0;
      let sumX = 0;
      let sumY = 0;
      let minX = sx;
      let maxX = sx;
      let minY = sy;
      let maxY = sy;

      while (stack.length > 0) {
        const [x, y] = stack.pop();
        area += 1;
        sumX += x;
        sumY += y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        for (const [nx, ny] of [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ]) {
          if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
          if (seen[at(nx, ny)] || data[ny * width + nx] >= threshold) continue;
          seen[at(nx, ny)] = 1;
          stack.push([nx, ny]);
        }
      }

      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;
      const boxArea = boxWidth * boxHeight;

      // Too small to be the marker, or so large it swallowed half the page.
      if (area < expected * expected * 0.25) continue;
      if (boxWidth > expected * 3 || boxHeight > expected * 3) continue;

      const squareness = Math.min(boxWidth, boxHeight) / Math.max(boxWidth, boxHeight);
      const solidity = area / boxArea;
      const sized = 1 - Math.min(1, Math.abs(boxWidth - expected) / expected);
      const score = squareness * solidity * sized;

      if (score > bestScore) {
        bestScore = score;
        best = [sumX / area, sumY / area];
      }
    }
  }

  // A blurred photo still gives a square-ish blob; anything below this is not one.
  return bestScore > 0.45 ? best : null;
}

/** How many pages the printed sheet runs to. */
export function pageCount(layout) {
  return (layout.bubbles ?? []).reduce((most, b) => Math.max(most, b.page ?? 1), 1);
}

/** Fraction of a disc that is darker than the ink threshold. */
function darkFraction(grey, cx, cy, radius, threshold) {
  const { width, height, data } = grey;
  const r2 = radius * radius;

  let dark = 0;
  let total = 0;

  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(height - 1, Math.ceil(cy + radius));
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(width - 1, Math.ceil(cx + radius));

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      total += 1;
      if (data[y * width + x] < threshold) dark += 1;
    }
  }

  return total === 0 ? 0 : dark / total;
}

/**
 * Solves the 3x3 homography taking sheet points to image points.
 *
 * Four point pairs give eight equations; the ninth coefficient is fixed at 1.
 * A homography rather than an affine fit is what lets a photo taken at an angle
 * be read - parallel lines on the paper need not stay parallel in the image.
 */
function solveProjection(sheetPoints, imagePoints) {
  const A = [];
  const b = [];

  for (let i = 0; i < 4; i += 1) {
    const [x, y] = sheetPoints[i];
    const [u, v] = imagePoints[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }

  const h = solve(A, b);
  if (!h) {
    throw ApiError.badRequest(
      "The corner markers on that scan do not form a readable rectangle. Retake the photo square-on."
    );
  }
  return [...h, 1];
}

/** Gaussian elimination with partial pivoting. */
function solve(A, b) {
  const n = b.length;
  const m = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) < 1e-9) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = m[row][col] / m[col][col];
      for (let k = col; k <= n; k += 1) m[row][k] -= factor * m[col][k];
    }
  }

  // Every off-diagonal entry was eliminated, so each row is one variable.
  return m.map((row, i) => row[n] / row[i]);
}

function project(h, x, y) {
  const w = h[6] * x + h[7] * y + h[8];
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}

/** Image pixels per sheet point, measured across the top edge. */
function scaleOf(transform, layout) {
  const [ax, ay] = project(transform, layout.markers[0][0], layout.markers[0][1]);
  const [bx, by] = project(transform, layout.markers[1][0], layout.markers[1][1]);
  const pixels = Math.hypot(bx - ax, by - ay);
  const points = Math.hypot(
    layout.markers[1][0] - layout.markers[0][0],
    layout.markers[1][1] - layout.markers[0][1]
  );
  return pixels / points;
}

