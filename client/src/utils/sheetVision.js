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
 * Every set of four same-size blobs that could be a page's corners, largest
 * first.
 *
 * Tried four at a time rather than taking the extremes of a size group: the
 * extremes only ever describe one quad, and with two sheets in frame that quad
 * is the outer corners of both. Enumerating combinations finds a single page in
 * the middle of a crowd; which of the results is actually a page is decided by
 * looksLikeAPage, not here.
 */
function chooseMarkerQuads(blobs, layout) {
  if (blobs.length < 4) return [];

  const [mx0, my0] = layout.markers[0];
  const [mx1, my1] = layout.markers[1];
  const [, my3] = layout.markers[3];
  const sheetAspect = Math.abs(mx1 - mx0) / Math.max(1, Math.abs(my3 - my1 || my3 - my0));
  const found = [];
  const seen = new Set();

  /*
   * Rather than every four blobs - which is O(n^4) and took two minutes on a
   * tilted two-sheet frame - each pair is tried as a page's top edge, and the
   * bottom corners are looked for where that edge says they must be. The sheet
   * is a known rectangle: given its top-left and top-right, the bottom two are
   * a fixed distance straight down from each. Perspective bends that a little,
   * so the search allows some slack, and orderAsQuad still checks the result.
   */
  const tallness = 1 / sheetAspect;

  for (const tl of blobs) {
    for (const tr of blobs) {
      if (tr === tl) continue;
      // Same printed size, and tr to the right of tl by more than it is off level.
      if (tr.box > tl.box * GROUP_HIGH || tl.box > tr.box * GROUP_HIGH) continue;
      const dx = tr.x - tl.x;
      const dy = tr.y - tl.y;
      if (dx <= 0 || Math.abs(dy) > dx) continue;

      const span = Math.hypot(dx, dy);
      if (span < tl.box * 3) continue;

      // Down the page, perpendicular to the top edge.
      const px = -dy / span;
      const py = dx / span;
      const drop = span * tallness;
      const blX = tl.x + px * drop;
      const blY = tl.y + py * drop;
      const brX = tr.x + px * drop;
      const brY = tr.y + py * drop;
      const slack = span * CORNER_SLACK;

      const bl = nearest(blobs, blX, blY, slack, tl.box);
      const br = nearest(blobs, brX, brY, slack, tl.box);
      if (!bl || !br || bl === br || bl === tl || bl === tr || br === tl || br === tr) continue;

      const quad = orderAsQuad([tl, tr, br, bl], tl.box, sheetAspect);
      if (!quad) continue;

      const key = quad.corners.map((k) => k.x + "," + k.y).sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(quad);
    }
  }

  found.sort((a, b) => b.area - a.area);
  return found;
}

/** The blob closest to (x, y) within `slack`, of about the given size, or null. */
function nearest(blobs, x, y, slack, box) {
  let best = null;
  let bestD = slack;
  for (const b of blobs) {
    if (b.box > box * GROUP_HIGH || box > b.box * GROUP_HIGH) continue;
    const d = Math.hypot(b.x - x, b.y - y);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/**
 * How far a predicted bottom corner may be from where a blob actually is.
 *
 * Generous, because a phone held off to one side keystones the page into a
 * parallelogram, and a ten-percent lean over the page height moves the bottom
 * corners sideways by more than a tenth of the width. The slack only widens
 * the search; whether the result is a page is still decided by the checks
 * that follow, so the cost of being generous is time, not mistakes.
 */
const CORNER_SLACK = 0.22;

/** Four blobs as a page, or null when they do not make one. */
function orderAsQuad(four, box, sheetAspect) {
  const pick = (fn) => four.reduce((p, q) => (fn(q) < fn(p) ? q : p));
  const tl = pick((k) => k.x + k.y);
  const br = pick((k) => -(k.x + k.y));
  const tr = pick((k) => -(k.x - k.y));
  const bl = pick((k) => k.x - k.y);
  const corners = [tl, tr, br, bl];
  if (new Set(corners).size < 4) return null;

  const boxes = corners.map((k) => k.box);
  if (Math.max(...boxes) / Math.min(...boxes) > MARKER_SIZE_SPREAD) return null;

  const spanTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const spanLeft = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const spanBottom = Math.hypot(br.x - bl.x, br.y - bl.y);
  const spanRight = Math.hypot(br.x - tr.x, br.y - tr.y);
  if (spanTop < box * 3 || spanLeft < box * 3) return null;
  if (spanTop / spanBottom > 1.25 || spanBottom / spanTop > 1.25) return null;
  if (spanLeft / spanRight > 1.25 || spanRight / spanLeft > 1.25) return null;

  let area = 0;
  for (let i = 0; i < 4; i += 1) {
    const p = corners[i];
    const q = corners[(i + 1) % 4];
    area += p.x * q.y - q.x * p.y;
  }
  area = Math.abs(area) / 2;
  if (area <= 0) return null;

  const aspect = spanTop / spanLeft;
  if (aspect > sheetAspect * ASPECT_TOLERANCE || aspect < sheetAspect / ASPECT_TOLERANCE) return null;

  return { corners, area };
}

/** How far a quad may depart from the sheet proportions and still be a page. */
const ASPECT_TOLERANCE = 1.15;
/** Coarse sanity check on marker size; the bubble fit is what decides. */
const MARKER_SCALE_TOLERANCE = 1.3;
/** Ink an unshaded bubble's ring leaves in a disc just wider than itself. */
const RING_INK = 0.08;
/** Below this share of bubbles found, the quad is not this page. */
const MIN_BUBBLE_FIT = 0.75;

/**
 * Whether a quad is really a page, and which one.
 *
 * Two things only a page has. Its page-number row is a run of filled squares
 * followed by empty ones on blank paper - dark, dark, then light to the end -
 * and its bubbles are where the layout says. An impostor - four shaded answer
 * bubbles, or the corners of two sheets - projects both onto whatever happens
 * to be there, and it is never that.
 */
function looksLikeAPage(grey, layout, quad, threshold) {
  const points = quad.corners.map((k) => [k.x, k.y]);
  const transform = solveProjection(layout.markers, points);
  if (!transform) return null;

  const scale = markerSpan(layout, transform);
  const implied = layout.markerSize * scale;
  const actual = quad.corners.reduce((sum, k) => sum + k.box, 0) / 4;
  const ratio = implied / actual;
  if (ratio > MARKER_SCALE_TOLERANCE || ratio < 1 / MARKER_SCALE_TOLERANCE) return null;

  const mark = layout.pageMark;
  if (!mark) return null;

  const sampleRadius = Math.max(1.5, mark.size * scale * 0.3);
  let page = 0;
  let ended = false;
  for (let i = 0; i < mark.max; i += 1) {
    const [px, py] = project(transform, mark.x + i * mark.spacing + mark.size / 2, mark.y);
    const dark = darkFraction(grey, px, py, sampleRadius, threshold) >= 0.5;
    if (!ended && dark) page += 1;
    else if (!ended && !dark) ended = true;
    else if (ended && dark) return null;
  }
  if (page === 0) return null;

  const bubbles = layout.bubbles.filter((b) => (b.page ?? 1) === page);
  if (bubbles.length > 0) {
    const step = Math.max(1, Math.floor(bubbles.length / 40));
    const radius = layout.bubbleRadius * scale * 1.15;
    let hit = 0;
    let tried = 0;
    for (let i = 0; i < bubbles.length; i += step) {
      const [px, py] = project(transform, bubbles[i].x, bubbles[i].y);
      tried += 1;
      if (darkFraction(grey, px, py, radius, threshold) >= RING_INK) hit += 1;
    }
    if (tried > 0 && hit / tried < MIN_BUBBLE_FIT) return null;
    return { page, corners: points, fit: hit / tried };
  }

  return { page, corners: points, fit: 1 };
}

function insideQuad(x, y, quad) {
  let inside = false;
  for (let i = 0, j = 3; i < 4; j = i, i += 1) {
    const [xi, yi] = quad[i];
    const [xj, yj] = quad[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

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
  const threshold = otsu(grey);
  const expected = (layout.markerSize / layout.pageSize.width) * grey.width;

  const candidates = chooseMarkerQuads(collectDarkBlobs(grey, threshold, expected), layout);

  const verified = [];
  for (const candidate of candidates) {
    const verdict = looksLikeAPage(grey, layout, candidate, threshold);
    if (verdict) verified.push(verdict);
  }
  verified.sort((a, b) => b.fit - a.fit);

  // One per page number, best fit first, and nothing sitting inside a page
  // already taken - that is the page's contents, not another page.
  const pages = [];
  for (const v of verified) {
    if (pages.some((p) => p.page === v.page)) continue;
    const cx = v.corners.reduce((sum, p) => sum + p[0], 0) / 4;
    const cy = v.corners.reduce((sum, p) => sum + p[1], 0) / 4;
    if (pages.some((p) => insideQuad(cx, cy, p.corners))) continue;
    pages.push({ page: v.page, corners: v.corners });
  }

  return pages.length > 0 ? pages : null;
}
