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

    final bubbles = json['bubbles'];
    var pages = 1;
    if (bubbles is List) {
      for (final bubble in bubbles) {
        if (bubble is Map) pages = math.max(pages, _num(bubble['page'] ?? 1).round());
      }
    }

    return SheetLayout(
      pageWidth: _num(size['width']),
      pageHeight: _num(size['height']),
      markerSize: _num(json['markerSize']),
      markers: corners,
      pageMark: PageMark.fromJson(json['pageMark']),
      pages: pages,
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

  bool get usable => pageWidth > 0 && markerSize > 0 && markers.length >= 4;
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
const double _groupLow = 0.75;
const double _groupHigh = 1.33;

/// How much the four chosen corners may differ in size from one another.
/// Perspective shrinks the far corners of a tilted page, but never this much.
const double _markerSizeSpread = 1.45;

/// Looks for the sheet in one frame.
SheetSighting? findSheet(GreyFrame grey, SheetLayout layout) {
  if (!layout.usable) return null;

  final threshold = otsu(grey);
  final expected = (layout.markerSize / layout.pageWidth) * grey.width;

  final corners = _chooseMarkerQuad(_collectDarkBlobs(grey, threshold, expected), layout);
  if (corners == null) return null;

  final transform = solveProjection(layout.markers, corners);
  if (transform == null) return null;

  final page = _readPageNumber(grey, layout, transform, threshold);
  if (page == null) return null;

  return SheetSighting(page, corners);
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

/// The four candidates that look like the corners of the sheet.
///
/// Markers are printed the same size, so candidates are grouped by size and
/// each group judged on its own. Within a group the corners are the extremes
/// along the two diagonals, which tolerates rotation in a way that taking the
/// topmost or leftmost blob does not.
List<List<double>>? _chooseMarkerQuad(List<_Blob> blobs, SheetLayout layout) {
  if (blobs.length < 4) return null;

  final wide = (layout.markers[1][0] - layout.markers[0][0]).abs();
  var tall = (layout.markers[3][1] - layout.markers[1][1]).abs();
  if (tall == 0) tall = (layout.markers[3][1] - layout.markers[0][1]).abs();
  final sheetAspect = wide / math.max(1.0, tall);

  List<List<double>>? best;
  var bestScore = 0.0;

  for (final seed in blobs) {
    final group = blobs
        .where((b) => b.box >= seed.box * _groupLow && b.box <= seed.box * _groupHigh)
        .toList();
    if (group.length < 4) continue;

    _Blob pick(double Function(_Blob) of) =>
        group.reduce((a, b) => of(b) < of(a) ? b : a);

    final corners = <_Blob>[
      pick((b) => b.x + b.y),
      pick((b) => -(b.x - b.y)),
      pick((b) => -(b.x + b.y)),
      pick((b) => b.x - b.y),
    ];
    if (corners.toSet().length < 4) continue;

    // The four markers are printed identically, so they must measure alike.
    // Without this the page-number square along the bottom edge can slip into
    // the group and win the bottom-left corner, which throws the whole fit.
    final boxes = corners.map((c) => c.box).toList();
    final spread = boxes.reduce(math.max) / boxes.reduce(math.min);
    if (spread > _markerSizeSpread) continue;

    final spanTop = _distance(corners[0], corners[1]);
    final spanLeft = _distance(corners[0], corners[3]);
    if (spanTop < seed.box * 3 || spanLeft < seed.box * 3) continue;

    var area = 0.0;
    for (var i = 0; i < 4; i += 1) {
      final p = corners[i];
      final q = corners[(i + 1) % 4];
      area += p.x * q.y - q.x * p.y;
    }
    area = area.abs() / 2;
    if (area <= 0) continue;

    final aspect = spanTop / spanLeft;
    final aspectFit = 1 - math.min(1.0, (aspect - sheetAspect).abs() / sheetAspect);
    final shape = corners.fold<double>(0, (sum, c) => sum + c.score) / 4;
    final score = area * aspectFit * shape;

    if (score > bestScore) {
      bestScore = score;
      best = corners.map((c) => [c.x, c.y]).toList();
    }
  }

  return best;
}

double _distance(_Blob a, _Blob b) => math.sqrt(
      (b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y),
    );

/// Counts the filled squares along the bottom edge, which say which page it is.
int? _readPageNumber(
  GreyFrame grey,
  SheetLayout layout,
  List<double> transform,
  int threshold,
) {
  final mark = layout.pageMark;
  if (mark == null || mark.max <= 0) return null;

  final scale = _markerScale(layout, transform);
  final sampleRadius = math.max(1.5, mark.size * scale * 0.3);

  var count = 0;
  for (var i = 0; i < mark.max; i += 1) {
    final point = project(
      transform,
      mark.x + i * mark.spacing + mark.size / 2,
      mark.y,
    );
    if (_darkFraction(grey, point[0], point[1], sampleRadius, threshold) < 0.5) {
      break;
    }
    count += 1;
  }

  return count > 0 ? count : null;
}

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

