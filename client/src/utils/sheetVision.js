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
 */
export function findMarkers(grey, layout) {
  const threshold = otsu(grey);
  const expected = (layout.markerSize / layout.pageSize.width) * grey.width;
  const search = Math.round(expected * 3.5);

  const corners = layout.markers.map(([sx, sy]) => [
    (sx / layout.pageSize.width) * grey.width,
    (sy / layout.pageSize.height) * grey.height,
  ]);

  const found = [];
  for (const [gx, gy] of corners) {
    const blob = findSquareBlob(grey, gx, gy, search, threshold, expected);
    if (!blob) return null;
    found.push(blob);
  }

  return { markers: found, threshold };
}

/** The most marker-shaped blob in a window: large, square and solid. */
function findSquareBlob(grey, cx, cy, radius, threshold, expected) {
  const { width, height, data } = grey;

  const x0 = Math.max(0, Math.round(cx - radius));
  const x1 = Math.min(width - 1, Math.round(cx + radius));
  const y0 = Math.max(0, Math.round(cy - radius));
  const y1 = Math.min(height - 1, Math.round(cy + radius));

  const stride = x1 - x0 + 1;
  const seen = new Uint8Array(stride * (y1 - y0 + 1));
  const at = (x, y) => (y - y0) * stride + (x - x0);

  let best = null;
  let bestScore = 0;

  for (let sy = y0; sy <= y1; sy += 1) {
    for (let sx = x0; sx <= x1; sx += 1) {
      if (seen[at(sx, sy)] || data[sy * width + sx] >= threshold) continue;

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
      if (area < expected * expected * 0.2) continue;
      if (boxWidth > expected * 3.5 || boxHeight > expected * 3.5) continue;

      const squareness = Math.min(boxWidth, boxHeight) / Math.max(boxWidth, boxHeight);
      const solidity = area / (boxWidth * boxHeight);
      const sized = 1 - Math.min(1, Math.abs(boxWidth - expected) / expected);
      const score = squareness * solidity * sized;

      if (score > bestScore) {
        bestScore = score;
        best = [sumX / area, sumY / area];
      }
    }
  }

  return bestScore > 0.4 ? best : null;
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
