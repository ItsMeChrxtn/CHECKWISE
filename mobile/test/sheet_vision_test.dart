import 'dart:math' as math;
import 'dart:typed_data';

import 'package:checkwise_mobile/core/sheet_vision.dart';
import 'package:flutter_test/flutter_test.dart';

/// The sheet the scanner is looking for, at the proportions the server prints.
final layout = SheetLayout.fromJson({
  'pageSize': {'width': 612, 'height': 792},
  'markerSize': 16,
  'markers': [
    [48, 48],
    [564, 48],
    [564, 744],
    [48, 744],
  ],
  'pageMark': {'x': 48, 'y': 770, 'size': 10, 'spacing': 16, 'max': 4},
  'bubbles': [
    {'page': 1},
    {'page': 2},
  ],
})!;

/// Paints a frame the way a phone would see one: the sheet somewhere inside it,
/// at some scale and angle, on a desk that is darker than the paper.
///
/// Rendering is done by inverse mapping - for each pixel, ask where it falls on
/// the sheet - so rotation and scale are exact rather than resampled, and the
/// markers stay square-edged however far the page is turned.
GreyFrame renderFrame({
  required double scale,
  required double rotateDegrees,
  double dx = 0,
  double dy = 0,
  int width = 520,
  int height = 670,
  int pageNumber = 1,
  int desk = 160,
}) {
  final data = Uint8List(width * height)..fillRange(0, width * height, desk);

  final radians = rotateDegrees * math.pi / 180;
  final cos = math.cos(-radians);
  final sin = math.sin(-radians);

  final centreX = width / 2 + dx;
  final centreY = height / 2 + dy;

  for (var y = 0; y < height; y += 1) {
    for (var x = 0; x < width; x += 1) {
      // Undo the placement to find this pixel's position on the page.
      final ox = x - centreX;
      final oy = y - centreY;
      final rx = ox * cos - oy * sin;
      final ry = ox * sin + oy * cos;

      final sx = rx / scale + layout.pageWidth / 2;
      final sy = ry / scale + layout.pageHeight / 2;

      if (sx < 0 || sy < 0 || sx >= layout.pageWidth || sy >= layout.pageHeight) {
        continue;
      }

      var value = 255;

      for (final marker in layout.markers) {
        final half = layout.markerSize / 2;
        if ((sx - marker[0]).abs() <= half && (sy - marker[1]).abs() <= half) {
          value = 0;
        }
      }

      final mark = layout.pageMark!;
      for (var i = 0; i < pageNumber; i += 1) {
        final left = mark.x + i * mark.spacing;
        if (sx >= left &&
            sx <= left + mark.size &&
            (sy - mark.y).abs() <= mark.size / 2) {
          value = 0;
        }
      }

      data[y * width + x] = value;
    }
  }

  return GreyFrame(width, height, data);
}

void main() {
  group('findSheet', () {
    test('reads a sheet that fills the frame square on', () {
      final seen = findSheet(renderFrame(scale: 0.82, rotateDegrees: 0), layout);
      expect(seen, isNotNull);
      expect(seen!.page, 1);
    });

    test('reads a sheet held well back from the lens', () {
      final seen = findSheet(renderFrame(scale: 0.45, rotateDegrees: 0), layout);
      expect(seen, isNotNull);
      expect(seen!.page, 1);
    });

    test('reads a sheet turned a few degrees', () {
      for (final angle in [5.0, -8.0, 12.0, -15.0]) {
        final seen = findSheet(
          renderFrame(scale: 0.6, rotateDegrees: angle),
          layout,
        );
        expect(seen, isNotNull, reason: 'nothing found at $angle degrees');
        expect(seen!.page, 1, reason: 'wrong page at $angle degrees');
      }
    });

    test('reads a sheet off to one side', () {
      final seen = findSheet(
        renderFrame(scale: 0.5, rotateDegrees: -10, dx: -70, dy: 55),
        layout,
      );
      expect(seen, isNotNull);
      expect(seen!.page, 1);
    });

    test('tells page two from page one', () {
      final seen = findSheet(
        renderFrame(scale: 0.62, rotateDegrees: 6, pageNumber: 2),
        layout,
      );
      expect(seen, isNotNull);
      expect(seen!.page, 2);
    });

    test('finds nothing when no sheet is in frame', () {
      final blank = GreyFrame(520, 670, Uint8List(520 * 670)..fillRange(0, 520 * 670, 200));
      expect(findSheet(blank, layout), isNull);
    });
  });

  group('solveProjection', () {
    test('maps the corners it was fitted on back to themselves', () {
      final image = [
        [10.0, 20.0],
        [210.0, 30.0],
        [205.0, 300.0],
        [15.0, 290.0],
      ];
      final h = solveProjection(layout.markers, image)!;

      for (var i = 0; i < 4; i += 1) {
        final got = project(h, layout.markers[i][0], layout.markers[i][1]);
        expect(got[0], closeTo(image[i][0], 1e-6));
        expect(got[1], closeTo(image[i][1], 1e-6));
      }
    });
  });
}
