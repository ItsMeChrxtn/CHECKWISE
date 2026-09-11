import 'dart:math' as math;
import 'dart:typed_data';

/// Finding an answer sheet in a camera frame, on the phone.
///
/// This is the same reader the web scanner runs, ported so the two behave
/// alike: the shutter fires by itself the moment a page is recognised, rather
/// than asking the teacher to line the paper up against a guide.
///
/// It answers one question - "is a sheet in front of me, and which page is it"
/// - and nothing more. The marks themselves are still read on the server from
/// the full-resolution photo; a preview frame is far too coarse for bubbles.
///
/// The search never assumes where the paper sits. Every dark blob is measured
/// once, and the four that are the same size as each other and furthest apart
/// are taken as the corner markers. Being the same size is what separates real
/// markers from letters and bubbles, and it is why a page held at an angle,
/// off centre or well back from the lens is still found.
class SheetLayout {
  const SheetLayout({
    required this.pageWidth,
    required this.pageHeight,
    required this.markerSize,
    required this.markers,
    required this.pageMark,
    required this.pages,
    required this.bubbles,
    required this.bubbleRadius,
  });

  /// Reads the layout the server stores on the exam. Returns null when the
  /// printable sheet has not been generated, in which case there is nothing to
  /// look for and the scanner falls back to a manual shutter.
  static SheetLayout? fromJson(Map<String, dynamic>? json) {
    if (json == null) return null;

    final size = json['pageSize'];
    final markers = json['markers'];
    if (size is! Map || markers is! List || markers.length < 4) return null;

    final corners = <List<double>>[];
    for (final corner in markers) {
      if (corner is! List || corner.length < 2) return null;
      corners.add([_num(corner[0]), _num(corner[1])]);
    }

    final raw = json['bubbles'];
    var pages = 1;
    final bubbles = <BubbleSpot>[];
    if (raw is List) {
      for (final bubble in raw) {
        if (bubble is! Map) continue;
        final page = _num(bubble['page'] ?? 1).round();
        pages = math.max(pages, page);
        bubbles.add(BubbleSpot(_num(bubble['x']), _num(bubble['y']), page));
      }
    }

    return SheetLayout(
      pageWidth: _num(size['width']),
      pageHeight: _num(size['height']),
      markerSize: _num(json['markerSize']),
      markers: corners,
      pageMark: PageMark.fromJson(json['pageMark']),
      pages: pages,
      bubbles: bubbles,
      bubbleRadius: _num(json['bubbleRadius']),
    );
  }

  final double pageWidth;
  final double pageHeight;
  final double markerSize;

  /// Marker centres in sheet points, clockwise from the top left.
  final List<List<double>> markers;
  final PageMark? pageMark;

  /// How many pages the printed sheet runs to.
  final int pages;

  /// Where every bubble was printed, in sheet points. Used to tell a real
  /// page from four blobs that merely look like one: on a page, these land on
  /// bubbles.
  final List<BubbleSpot> bubbles;
  final double bubbleRadius;

  bool get usable => pageWidth > 0 && markerSize > 0 && markers.length >= 4;
}

/// One printed bubble: where it is, and which page it is on.
class BubbleSpot {
  const BubbleSpot(this.x, this.y, this.page);
  final double x;
  final double y;
  final int page;
}

/// The run of squares along the bottom edge that says which page this is.
class PageMark {
  const PageMark({
    required this.x,
    required this.y,
    required this.size,
    required this.spacing,
    required this.max,
  });

  static PageMark? fromJson(Object? json) {
    if (json is! Map) return null;
    return PageMark(
      x: _num(json['x']),
      y: _num(json['y']),
      size: _num(json['size']),
      spacing: _num(json['spacing']),
      max: _num(json['max'] ?? 1).round(),
    );
  }

  final double x;
  final double y;
  final double size;
  final double spacing;
  final int max;
}

/// A single-channel image. The camera's luminance plane arrives in this shape
/// already, so no colour conversion is needed on the hot path.
class GreyFrame {
  const GreyFrame(this.width, this.height, this.data);

  final int width;
  final int height;
  final Uint8List data;
}

/// What one frame showed: nothing, or a sheet and which page of it.
class SheetSighting {
  const SheetSighting(this.page, this.corners);

  final int page;
  final List<List<double>> corners;
}

/// A blob has to be at least this square, and this solid, to pass for a marker.
const double _markerSquareness = 0.55;
const double _markerSolidity = 0.6;

/// How small and how large a marker may be, against a sheet filling the frame.
const double _markerMinScale = 0.12;
const double _markerMaxScale = 1.8;

/// How close in size two blobs must be to be treated as the same printed mark.
/// This is the main thing telling a corner marker from the smaller page-number
/// square beside it, so the window is deliberately tight.
const double _groupHigh = 1.33;

/// How much the four chosen corners may differ in size from one another.
/// Perspective shrinks the far corners of a tilted page, but never this much.
const double _markerSizeSpread = 1.45;

/// Every page in the frame, or an empty list.
///
/// A two-page sheet laid open on the desk is one frame with two pages in it,
/// and the server reads both out of one photo - so the phone has to know it
/// is looking at two, and take one picture rather than wait for a second page
/// that is already in view.
List<SheetSighting> findSheets(GreyFrame grey, SheetLayout layout) {
  if (!layout.usable) return const [];

  final threshold = otsu(grey);
  final expected = (layout.markerSize / layout.pageWidth) * grey.width;

  final candidates = _candidateQuads(_collectDarkBlobs(grey, threshold, expected), layout);

  // Every candidate that is really a page, with which page and how well it fits.
  final verified = <_Verdict>[];
  for (final c in candidates) {
    final v = _looksLikeAPage(grey, layout, c, threshold);
    if (v != null) verified.add(v);
  }
  verified.sort((a, b) => b.fit.compareTo(a.fit));

  // One per page number, best fit first, and nothing sitting inside a page
  // already taken - that is the page's contents, not another page.
  final pages = <SheetSighting>[];
  for (final v in verified) {
    if (pages.any((p) => p.page == v.page)) continue;
    final cx = v.corners.fold<double>(0, (sum, p) => sum + p[0]) / 4;
    final cy = v.corners.fold<double>(0, (sum, p) => sum + p[1]) / 4;
    if (pages.any((p) => _insideQuad(cx, cy, p.corners))) continue;
    pages.add(SheetSighting(v.page, v.corners));
  }
  return pages;
}

/// The first page in the frame, for callers that only want one.
SheetSighting? findSheet(GreyFrame grey, SheetLayout layout) {
  final all = findSheets(grey, layout);
  return all.isEmpty ? null : all.first;
}

class _Verdict {
  const _Verdict(this.page, this.corners, this.fit);
  final int page;
  final List<List<double>> corners;
  final double fit;
}

/// How far a quad may depart from the sheet proportions and still be a page.
const double _aspectTolerance = 1.15;
/// Coarse sanity check on marker size; the bubble fit is what decides.
const double _markerScaleTolerance = 1.3;
/// Ink an unshaded bubble's ring leaves in a disc just wider than itself.
const double _ringInk = 0.08;
/// Below this share of bubbles found, the quad is not this page.
const double _minBubbleFit = 0.75;
/// How far a predicted bottom corner may be from where a blob actually is.
const double _cornerSlack = 0.22;

/// Whether a quad is really a page, and which one.
///
/// Two things only a page has: a page-number row that is filled squares then
/// empty ones on blank paper, and bubbles where the layout says. An impostor -
/// four shaded bubbles, or the corners of two sheets - projects both onto
/// whatever happens to be there, and it is never that.
_Verdict? _looksLikeAPage(GreyFrame grey, SheetLayout layout, _Quad quad, int threshold) {
  final points = quad.corners.map((k) => [k.x, k.y]).toList();
  final transform = solveProjection(layout.markers, points);
  if (transform == null) return null;

  final scale = _markerScale(layout, transform);
  final implied = layout.markerSize * scale;
  final actual = quad.corners.fold<double>(0, (sum, k) => sum + k.box) / 4;
  final ratio = implied / actual;
  if (ratio > _markerScaleTolerance || ratio < 1 / _markerScaleTolerance) return null;

  final mark = layout.pageMark;
  if (mark == null) return null;

  final sampleRadius = math.max(1.5, mark.size * scale * 0.3);
  var page = 0;
  var ended = false;
  for (var i = 0; i < mark.max; i += 1) {
    final p = project(transform, mark.x + i * mark.spacing + mark.size / 2, mark.y);
    final dark = _darkFraction(grey, p[0], p[1], sampleRadius, threshold) >= 0.5;
    if (!ended && dark) {
      page += 1;
    } else if (!ended && !dark) {
      ended = true;
    } else if (ended && dark) {
      return null;
    }
  }
  if (page == 0) return null;

  final bubbles = layout.bubbles.where((b) => b.page == page).toList();
  if (bubbles.isEmpty) return _Verdict(page, points, 1);

  final step = math.max(1, bubbles.length ~/ 40);
  final radius = layout.bubbleRadius * scale * 1.15;
  var hit = 0;
  var tried = 0;
  for (var i = 0; i < bubbles.length; i += step) {
    final p = project(transform, bubbles[i].x, bubbles[i].y);
    tried += 1;
    if (_darkFraction(grey, p[0], p[1], radius, threshold) >= _ringInk) hit += 1;
  }
  final fit = tried == 0 ? 1.0 : hit / tried;
  if (fit < _minBubbleFit) return null;
  return _Verdict(page, points, fit);
}

bool _insideQuad(double x, double y, List<List<double>> quad) {
  var inside = false;
  for (var i = 0, j = 3; i < 4; j = i, i += 1) {
    final xi = quad[i][0], yi = quad[i][1];
    final xj = quad[j][0], yj = quad[j][1];
    if ((yi > y) != (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/// Otsu's threshold: the grey level that best separates ink from paper.
int otsu(GreyFrame grey) {
  final histogram = List<int>.filled(256, 0);
  for (final value in grey.data) {
    histogram[value] += 1;
  }

  final total = grey.data.length;
  var sum = 0.0;
  for (var i = 0; i < 256; i += 1) {
    sum += i * histogram[i];
  }

  var sumB = 0.0;
  var weightB = 0;
  var best = 0;
  var bestVariance = -1.0;

  for (var t = 0; t < 256; t += 1) {
    weightB += histogram[t];
    if (weightB == 0) continue;

    final weightF = total - weightB;
    if (weightF == 0) break;

    sumB += t * histogram[t];
    final meanB = sumB / weightB;
    final meanF = (sum - sumB) / weightF;
    final variance = weightB * weightF * (meanB - meanF) * (meanB - meanF);

    if (variance > bestVariance) {
      bestVariance = variance;
      best = t;
    }
  }

  return best;
}

class _Blob {
  _Blob(this.x, this.y, this.box, this.score);

  final double x;
  final double y;
  final double box;
  final double score;
}

/// Measures every dark connected region once, keeping the marker-shaped ones.
///
/// Iterative flood fill over typed arrays: each pixel is visited at most twice
/// however large the dark areas are, so a dark desk behind the paper costs no
/// more than a white one. That matters here, where this runs on live video.
List<_Blob> _collectDarkBlobs(GreyFrame grey, int threshold, double expected) {
  final width = grey.width;
  final height = grey.height;
  final data = grey.data;

  final seen = Uint8List(width * height);
  final stack = Int32List(width * height);
  final minBox = math.max(3.0, expected * _markerMinScale);
  final maxBox = expected * _markerMaxScale;
  final blobs = <_Blob>[];

  for (var start = 0; start < data.length; start += 1) {
    if (seen[start] != 0 || data[start] >= threshold) continue;

    var top = 0;
    stack[top++] = start;
    seen[start] = 1;

    var area = 0;
    var sumX = 0;
    var sumY = 0;
    var minX = width;
    var maxX = -1;
    var minY = height;
    var maxY = -1;

    while (top > 0) {
      final p = stack[--top];
      final x = p % width;
      final y = p ~/ width;

      area += 1;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      if (x > 0 && seen[p - 1] == 0 && data[p - 1] < threshold) {
        seen[p - 1] = 1;
        stack[top++] = p - 1;
      }
      if (x < width - 1 && seen[p + 1] == 0 && data[p + 1] < threshold) {
        seen[p + 1] = 1;
        stack[top++] = p + 1;
      }
      if (y > 0 && seen[p - width] == 0 && data[p - width] < threshold) {
        seen[p - width] = 1;
        stack[top++] = p - width;
      }
      if (y < height - 1 && seen[p + width] == 0 && data[p + width] < threshold) {
        seen[p + width] = 1;
        stack[top++] = p + width;
      }
    }

    final boxWidth = (maxX - minX + 1).toDouble();
    final boxHeight = (maxY - minY + 1).toDouble();
    final box = math.max(boxWidth, boxHeight);
    if (box < minBox || box > maxBox) continue;

    final squareness = math.min(boxWidth, boxHeight) / box;
    if (squareness < _markerSquareness) continue;

    final solidity = area / (boxWidth * boxHeight);
    if (solidity < _markerSolidity) continue;

    blobs.add(_Blob(sumX / area, sumY / area, box, squareness * solidity));
  }

  return blobs;
}

class _Quad {
  const _Quad(this.corners, this.area);
  final List<_Blob> corners;
  final double area;
}

/// Every set of four blobs that could be a page's corners, largest first.
///
/// Each pair of same-size blobs is tried as a page's top edge, and the bottom
/// corners are looked for where that edge says they must be - the sheet is a
/// known rectangle, so given its top-left and top-right the other two are a
/// fixed drop straight down. O(n^2) with a short search inside, where trying
/// every four blobs was O(n^4) and took minutes on a two-sheet frame.
List<_Quad> _candidateQuads(List<_Blob> blobs, SheetLayout layout) {
  if (blobs.length < 4) return const [];

  final wide = (layout.markers[1][0] - layout.markers[0][0]).abs();
  var tall = (layout.markers[3][1] - layout.markers[1][1]).abs();
  if (tall == 0) tall = (layout.markers[3][1] - layout.markers[0][1]).abs();
  final sheetAspect = wide / math.max(1.0, tall);
  final tallness = 1 / sheetAspect;

  final found = <_Quad>[];
  final seen = <String>{};

  for (final tl in blobs) {
    for (final tr in blobs) {
      if (identical(tr, tl)) continue;
      if (tr.box > tl.box * _groupHigh || tl.box > tr.box * _groupHigh) continue;
      final dx = tr.x - tl.x;
      final dy = tr.y - tl.y;
      if (dx <= 0 || dy.abs() > dx) continue;

      final span = math.sqrt(dx * dx + dy * dy);
      if (span < tl.box * 3) continue;

      final px = -dy / span;
      final py = dx / span;
      final drop = span * tallness;
      final slack = span * _cornerSlack;

      final bl = _nearest(blobs, tl.x + px * drop, tl.y + py * drop, slack, tl.box);
      final br = _nearest(blobs, tr.x + px * drop, tr.y + py * drop, slack, tl.box);
      if (bl == null || br == null) continue;
      if (identical(bl, br) || identical(bl, tl) || identical(bl, tr)) continue;
      if (identical(br, tl) || identical(br, tr)) continue;

      final quad = _orderAsQuad([tl, tr, br, bl], tl.box, sheetAspect);
      if (quad == null) continue;

      final key = (quad.corners.map((k) => '${k.x},${k.y}').toList()..sort()).join('|');
      if (!seen.add(key)) continue;
      found.add(quad);
    }
  }

  found.sort((a, b) => b.area.compareTo(a.area));
  return found;
}

_Blob? _nearest(List<_Blob> blobs, double x, double y, double slack, double box) {
  _Blob? best;
  var bestD = slack;
  for (final b in blobs) {
    if (b.box > box * _groupHigh || box > b.box * _groupHigh) continue;
    final d = math.sqrt((b.x - x) * (b.x - x) + (b.y - y) * (b.y - y));
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/// Four blobs as a page, or null when they do not make one.
_Quad? _orderAsQuad(List<_Blob> four, double box, double sheetAspect) {
  _Blob pick(double Function(_Blob) of) => four.reduce((p, q) => of(q) < of(p) ? q : p);
  final tl = pick((k) => k.x + k.y);
  final br = pick((k) => -(k.x + k.y));
  final tr = pick((k) => -(k.x - k.y));
  final bl = pick((k) => k.x - k.y);
  final corners = [tl, tr, br, bl];
  if (corners.toSet().length < 4) return null;

  final boxes = corners.map((k) => k.box).toList();
  if (boxes.reduce(math.max) / boxes.reduce(math.min) > _markerSizeSpread) return null;

  final spanTop = _distance(tl, tr);
  final spanLeft = _distance(tl, bl);
  final spanBottom = _distance(bl, br);
  final spanRight = _distance(tr, br);
  if (spanTop < box * 3 || spanLeft < box * 3) return null;
  if (spanTop / spanBottom > 1.25 || spanBottom / spanTop > 1.25) return null;
  if (spanLeft / spanRight > 1.25 || spanRight / spanLeft > 1.25) return null;

  var area = 0.0;
  for (var i = 0; i < 4; i += 1) {
    final p = corners[i];
    final q = corners[(i + 1) % 4];
    area += p.x * q.y - q.x * p.y;
  }
  area = area.abs() / 2;
  if (area <= 0) return null;

  final aspect = spanTop / spanLeft;
  if (aspect > sheetAspect * _aspectTolerance || aspect < sheetAspect / _aspectTolerance) {
    return null;
  }

  return _Quad(corners, area);
}

double _distance(_Blob a, _Blob b) => math.sqrt(
      (b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y),
    );

double _markerScale(SheetLayout layout, List<double> transform) {
  final a = project(transform, layout.markers[0][0], layout.markers[0][1]);
  final b = project(transform, layout.markers[1][0], layout.markers[1][1]);
  final dx = layout.markers[1][0] - layout.markers[0][0];
  final dy = layout.markers[1][1] - layout.markers[0][1];
  final points = math.sqrt(dx * dx + dy * dy);
  final pixels = math.sqrt(
    (b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]),
  );
  return points == 0 ? 1 : pixels / points;
}

double _darkFraction(
  GreyFrame grey,
  double cx,
  double cy,
  double radius,
  int threshold,
) {
  final x0 = math.max(0, (cx - radius).round());
  final x1 = math.min(grey.width - 1, (cx + radius).round());
  final y0 = math.max(0, (cy - radius).round());
  final y1 = math.min(grey.height - 1, (cy + radius).round());

  var dark = 0;
  var total = 0;
  final rr = radius * radius;

  for (var y = y0; y <= y1; y += 1) {
    for (var x = x0; x <= x1; x += 1) {
      final dx = x - cx;
      final dy = y - cy;
      if (dx * dx + dy * dy > rr) continue;
      total += 1;
      if (grey.data[y * grey.width + x] < threshold) dark += 1;
    }
  }

  return total == 0 ? 0 : dark / total;
}

/// Fits the projective transform that takes sheet points to image pixels.
///
/// Four point pairs give eight equations for the eight unknowns of a homography
/// (the ninth is fixed at 1), so this is an exact solve rather than a fit.
List<double>? solveProjection(
  List<List<double>> sheetPoints,
  List<List<double>> imagePoints,
) {
  final a = <List<double>>[];
  final b = <double>[];

  for (var i = 0; i < 4; i += 1) {
    final sx = sheetPoints[i][0];
    final sy = sheetPoints[i][1];
    final ix = imagePoints[i][0];
    final iy = imagePoints[i][1];

    a.add([sx, sy, 1, 0, 0, 0, -sx * ix, -sy * ix]);
    b.add(ix);
    a.add([0, 0, 0, sx, sy, 1, -sx * iy, -sy * iy]);
    b.add(iy);
  }

  final solved = _solve(a, b);
  if (solved == null) return null;
  return [...solved, 1.0];
}

/// Gauss-Jordan with partial pivoting.
List<double>? _solve(List<List<double>> a, List<double> b) {
  final n = b.length;
  final m = List<List<double>>.generate(n, (i) => [...a[i], b[i]]);

  for (var col = 0; col < n; col += 1) {
    var pivot = col;
    for (var row = col + 1; row < n; row += 1) {
      if (m[row][col].abs() > m[pivot][col].abs()) pivot = row;
    }
    if (m[pivot][col].abs() < 1e-9) return null;

    final swap = m[col];
    m[col] = m[pivot];
    m[pivot] = swap;

    final lead = m[col][col];
    for (var k = col; k <= n; k += 1) {
      m[col][k] /= lead;
    }

    for (var row = 0; row < n; row += 1) {
      if (row == col) continue;
      final factor = m[row][col];
      if (factor == 0) continue;
      for (var k = col; k <= n; k += 1) {
        m[row][k] -= factor * m[col][k];
      }
    }
  }

  return List<double>.generate(n, (i) => m[i][n]);
}

/// Maps one sheet point through the transform to image pixels.
List<double> project(List<double> h, double x, double y) {
  final w = h[6] * x + h[7] * y + h[8];
  return [
    (h[0] * x + h[1] * y + h[2]) / w,
    (h[3] * x + h[4] * y + h[5]) / w,
  ];
}

double _num(Object? value) {
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value) ?? 0;
  return 0;
}

