/**
 * Just enough sheet-reading to drive the camera.
 *
 * The browser does not grade anything - that stays on the server, where the
 * answer key lives. What it needs to know is only "is a whole sheet in frame,
 * and which page is it?", so the viewfinder can fire by itself instead of
 * making the teacher press a button for every paper.
 *
 * The marker geometry mirrors server/services/omrService.js on purpose: both
 * read the same squares off the same sheet, and a sheet the camera accepts is
 * one the server can go on to read.
 */

/** Frames are analysed at this width - big enough to see a marker, cheap enough for video. */
export const ANALYSIS_WIDTH = 520;

/** Luminance buffer from a canvas, downscaled for speed. */
export function toGrayscale(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const { data } = ctx.getImageData(0, 0, width, height);
  const grey = new Uint8Array(width * height);

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    grey[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  }

  return { width, height, data: grey };
}

/** Otsu's method: the darkness cut that best separates ink from paper. */
export function otsu(grey) {
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
 * The four corner squares, or null when they are not all in frame.
 *
 * Unlike the server, this runs on a live preview where the sheet is often only
 * partly visible, so a miss is expected and cheap - it simply means "not yet".
 *
 * The search does not assume where the sheet sits. A phone or a webcam held
 * over a desk gives a page that is smaller than the frame and a few degrees
 * rotated, so every dark blob is measured once and the four that are the same
 * size as each other and furthest apart are taken as the corners. Being the
 * same size is what separates real markers from letters and bubbles.
 */
export function findMarkers(grey, layout) {
  const threshold = otsu(grey);
  const expected = (layout.markerSize / layout.pageSize.width) * grey.width;

  const markers = chooseMarkerQuad(collectDarkBlobs(grey, threshold, expected), layout);
  return markers ? { markers, threshold } : null;
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
 * Every dark connected region in the frame, keeping the marker-shaped ones.
 *
 * One iterative pass over typed arrays: each pixel is visited at most twice
 * however large the dark areas are, which keeps a dark desk behind the paper
 * from costing any more than a white one. That matters here because this runs
 * on live video rather than on one still.
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

    blobs.push({ x: sumX / area, y: sumY / area, box, score: squareness * solidity });
  }

  return blobs;
}

/**
 * The four candidates that look like the corners of the sheet.
 *
 * Markers are printed the same size, so candidates are grouped by size and each
 * group judged on its own. Within a group the corners are the extremes along
 * the two diagonals, which tolerates rotation in a way that taking the topmost
 * or leftmost blob does not.
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
    const corners = [
      pick((b) => b.x + b.y),
      pick((b) => -(b.x - b.y)),
      pick((b) => -(b.x + b.y)),
      pick((b) => b.x - b.y),
    ];
    if (new Set(corners).size < 4) continue;

    // The four markers are printed identically, so they must measure alike.
    // Without this the page-number square along the bottom edge can slip into
    // the group and win the bottom-left corner, which throws the whole fit.
    const boxes = corners.map((c) => c.box);
    if (Math.max(...boxes) / Math.min(...boxes) > MARKER_SIZE_SPREAD) continue;

    const spanTop = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y);
    const spanLeft = Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y);
    if (spanTop < seed.box * 3 || spanLeft < seed.box * 3) continue;

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

/** The 3x3 homography taking sheet points to image points, or null. */
export function solveProjection(sheetPoints, imagePoints) {
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

  const n = 8;
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

  return [...m.map((row, i) => row[n] / row[i]), 1];
}

export function project(h, x, y) {
  const w = h[6] * x + h[7] * y + h[8];
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}

/** Which page is in frame, counted off the squares along the bottom edge. */
export function readPageNumber(grey, layout, transform, threshold) {
  const mark = layout.pageMark;
  if (!mark) return null;

  const scale = markerSpan(layout, transform);
  const sampleRadius = Math.max(1.5, mark.size * scale * 0.3);

  let count = 0;
  for (let i = 0; i < mark.max; i += 1) {
    const [px, py] = project(transform, mark.x + i * mark.spacing + mark.size / 2, mark.y);
    if (darkFraction(grey, px, py, sampleRadius, threshold) < 0.5) break;
    count += 1;
  }

  return count > 0 ? count : null;
}

/** Image pixels per sheet point, measured across the top edge. */
function markerSpan(layout, transform) {
  const [ax, ay] = project(transform, layout.markers[0][0], layout.markers[0][1]);
  const [bx, by] = project(transform, layout.markers[1][0], layout.markers[1][1]);
  const points = Math.hypot(
    layout.markers[1][0] - layout.markers[0][0],
    layout.markers[1][1] - layout.markers[0][1]
  );
  return Math.hypot(bx - ax, by - ay) / points;
}

function darkFraction(grey, cx, cy, radius, threshold) {
  const { width, height, data } = grey;
  const r2 = radius * radius;

  let dark = 0;
  let total = 0;

  for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(height - 1, Math.ceil(cy + radius)); y += 1) {
    for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(width - 1, Math.ceil(cx + radius)); x += 1) {
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
 * One look at a frame: are all four markers there, and which page is it?
 * Returns null the moment anything is missing, which is the common case while
 * the camera is still being lined up.
 */
export function inspectFrame(canvas, layout) {
  const grey = toGrayscale(canvas);
  const found = findMarkers(grey, layout);
  if (!found) return null;

  const transform = solveProjection(layout.markers, found.markers);
  if (!transform) return null;

  const page = readPageNumber(grey, layout, transform, found.threshold);
  if (!page) return null;

  return { markers: found.markers, page };
}
