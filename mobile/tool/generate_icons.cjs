/**
 * Renders the CheckWise app icon at every density Android asks for.
 *
 * Run from the repo root:
 *   node mobile/tool/generate_icons.cjs
 *
 * Why a script rather than exported PNGs: the mark is defined once here, as
 * geometry, so changing the brand colour or the stroke weight is a one-line
 * edit followed by a re-run — not a trip through a design tool and twelve
 * manual exports that drift out of sync.
 *
 * It writes three things into every mipmap density folder:
 *   ic_launcher.png             legacy square icon, pre-Android 8
 *   ic_launcher_round.png       legacy round icon
 *   ic_launcher_foreground.png  adaptive foreground, Android 8+
 *
 * The adaptive background is a flat colour in XML, so it needs no bitmap.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("node:zlib");
const { createCanvas } = require("../../server/node_modules/@napi-rs/canvas");

const BRAND = "#3A5BB0";
const RES = path.join(__dirname, "..", "android", "app", "src", "main", "res");

/** Legacy icons are the full artwork. Adaptive foregrounds are glyph-only. */
const LEGACY = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const ADAPTIVE = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

/**
 * The mark: an answer bubble with a check struck through it.
 *
 * `scale` is the diameter the glyph should occupy. Everything is derived from
 * it so the drawing is resolution-independent — at 48px and at 432px the
 * proportions are identical.
 *
 * The ring is deliberately left open at the top right. A closed ring with a
 * check inside reads as a generic "success" tick; the break makes the check
 * look like it is passing through the bubble, which is the actual idea.
 */
function drawMark(ctx, cx, cy, scale, color) {
  const r = scale * 0.34;

  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  /*
   * The bubble, with a wide gap at the upper right.
   *
   * The gap has to be genuinely wider than the check that crosses it. A narrow
   * one puts the ring's rounded end cap right against the check's cap and the
   * two merge into a blob — which is exactly what the first attempt did.
   */
  ctx.beginPath();
  ctx.lineWidth = scale * 0.095;
  ctx.arc(cx, cy, r, -0.35, 5.13);
  ctx.stroke();

  /*
   * The check, ending well outside the ring.
   *
   * Its tip sits at ~0.48 of the scale from centre against the ring's 0.34, so
   * it clearly passes through the gap instead of stopping politely at the edge.
   * That overshoot is what stops the silhouette reading as a plain circle.
   */
  ctx.beginPath();
  ctx.lineWidth = scale * 0.125;
  ctx.moveTo(cx - scale * 0.22, cy + scale * 0.0);
  ctx.lineTo(cx - scale * 0.07, cy + scale * 0.16);
  ctx.lineTo(cx + scale * 0.36, cy - scale * 0.32);
  ctx.stroke();
}

/** A squircle — closer to what Android and iOS mask to than a plain rect. */
function squircle(ctx, size, radius) {
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(size - radius, 0);
  ctx.quadraticCurveTo(size, 0, size, radius);
  ctx.lineTo(size, size - radius);
  ctx.quadraticCurveTo(size, size, size - radius, size);
  ctx.lineTo(radius, size);
  ctx.quadraticCurveTo(0, size, 0, size - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
}

function renderLegacy(size, round) {
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");

  ctx.fillStyle = BRAND;
  if (round) {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    squircle(ctx, size, size * 0.22);
    ctx.fill();
  }

  drawMark(ctx, size / 2, size / 2, size * 0.62, "#FFFFFF");
  return c.toBuffer("image/png");
}

/**
 * Adaptive foreground: glyph only, on transparent.
 *
 * Android crops the outer ring of a 108dp foreground and masks the rest to
 * whatever shape the launcher uses, so anything outside the middle 72dp can be
 * cut. The glyph is kept well inside that safe zone.
 */
function renderAdaptiveForeground(size) {
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  drawMark(ctx, size / 2, size / 2, size * 0.42, "#FFFFFF");
  return c.toBuffer("image/png");
}

/** The 512px icon Play Console asks for, if this ever gets published. */
function renderStoreIcon() {
  const size = 512;
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  ctx.fillStyle = BRAND;
  ctx.fillRect(0, 0, size, size);
  drawMark(ctx, size / 2, size / 2, size * 0.62, "#FFFFFF");
  return c.toBuffer("image/png");
}

/**
 * iOS icon, at whatever pixel size the asset catalogue asks for.
 *
 * Two rules Android does not have: the image must be fully opaque, because an
 * alpha channel is rejected at submission, and it must be a plain square,
 * because iOS applies its own rounded mask. Drawing our own corners here would
 * show up as a dark ring inside the one Apple draws.
 */
function renderIosIcon(size) {
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");
  ctx.fillStyle = BRAND;
  ctx.fillRect(0, 0, size, size);
  drawMark(ctx, size / 2, size / 2, size * 0.62, "#FFFFFF");
  return opaquePng(ctx, size);
}

/**
 * Encodes the canvas as a PNG with no alpha channel.
 *
 * The canvas library always writes RGBA, and App Store submission rejects an
 * icon that carries transparency even when every pixel in it is opaque. So the
 * pixels are re-encoded here as PNG colour type 2 - twenty lines against a
 * dependency, and it removes a rejection that would only be discovered at
 * upload time.
 */
function opaquePng(ctx, size) {
  const { data } = ctx.getImageData(0, 0, size, size);

  // Each scanline is a filter byte (0, none) followed by RGB triples.
  const raw = Buffer.alloc(size * (1 + size * 3));
  let at = 0;
  for (let y = 0; y < size; y += 1) {
    raw[at++] = 0;
    for (let x = 0; x < size; x += 1) {
      const p = (y * size + x) * 4;
      raw[at++] = data[p];
      raw[at++] = data[p + 1];
      raw[at++] = data[p + 2];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2: truecolour, no alpha

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type, body) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);

  const typed = Buffer.concat([Buffer.from(type, "ascii"), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(typed), 0);

  return Buffer.concat([length, typed, crc]);
}

let written = 0;

// The asset catalogue already lists every size Xcode wants, so it is read here
// rather than kept as a second list that could drift out of step with it.
const ICONSET = path.join(
  __dirname,
  "..",
  "ios",
  "Runner",
  "Assets.xcassets",
  "AppIcon.appiconset"
);
if (fs.existsSync(path.join(ICONSET, "Contents.json"))) {
  const catalogue = JSON.parse(fs.readFileSync(path.join(ICONSET, "Contents.json"), "utf8"));
  const seen = new Set();
  for (const image of catalogue.images) {
    if (!image.filename || seen.has(image.filename)) continue;
    seen.add(image.filename);
    const px = Math.round(parseFloat(image.size) * parseInt(image.scale, 10));
    fs.writeFileSync(path.join(ICONSET, image.filename), renderIosIcon(px));
    written += 1;
  }
}
for (const [density, size] of Object.entries(LEGACY)) {
  const dir = path.join(RES, `mipmap-${density}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "ic_launcher.png"), renderLegacy(size, false));
  fs.writeFileSync(path.join(dir, "ic_launcher_round.png"), renderLegacy(size, true));
  written += 2;
}

for (const [density, size] of Object.entries(ADAPTIVE)) {
  const dir = path.join(RES, `mipmap-${density}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "ic_launcher_foreground.png"),
    renderAdaptiveForeground(size)
  );
  written += 1;
}

const storeDir = path.join(__dirname, "..", "..", "docs");
fs.mkdirSync(storeDir, { recursive: true });
fs.writeFileSync(path.join(storeDir, "app-icon-512.png"), renderStoreIcon());
written += 1;

console.log(`wrote ${written} icon files`);
