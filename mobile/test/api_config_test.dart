import 'package:checkwise_mobile/core/api_config.dart';
import 'package:flutter_test/flutter_test.dart';

/// Guards on the address a published build talks to.
///
/// Two releases went out unable to reach anything: the build passed
/// `--dart-define=API_BASE_URL=...` while the app read `CHECKWISE_API_URL`, so
/// the value was silently empty and the app fell back to the emulator's address
/// for the host machine - which means nothing on a real phone. Nothing failed
/// at build time, and the APK installed and ran perfectly well while being
/// unable to see a server.
///
/// The default is tied to the build mode now rather than to a flag someone has
/// to remember, so that particular mistake cannot recur. These check the shape
/// of what is left, because both ways of getting it wrong are silent too.
void main() {
  group('productionBaseUrl', () {
    test('is an absolute https origin', () {
      final uri = Uri.parse(ApiConfig.productionBaseUrl);
      expect(uri.hasScheme, isTrue, reason: 'a phone cannot resolve a relative URL');
      expect(uri.scheme, 'https');
      expect(uri.host, isNotEmpty);
    });

    test('is the origin only, without the /api path', () {
      // ApiClient appends "/api" itself. A value ending in /api would ask for
      // /api/api, and every request would come back 404 - which reads on screen
      // as the server being broken rather than the address being wrong.
      expect(ApiConfig.productionBaseUrl, isNot(endsWith('/api')));
      expect(ApiConfig.productionBaseUrl, isNot(endsWith('/')));
      expect(Uri.parse(ApiConfig.productionBaseUrl).path, isEmpty);
    });

    test('is not a loopback or private address', () {
      // 10.0.2.2 is the emulator's route to the host machine; localhost is the
      // device itself. Either one shipped in a release is the bug above.
      final host = Uri.parse(ApiConfig.productionBaseUrl).host;
      expect(host, isNot('localhost'));
      expect(host, isNot('127.0.0.1'));
      expect(host, isNot('10.0.2.2'));
      expect(host, contains('.'), reason: 'a published build needs a real hostname');
    });
  });

  group('normalise', () {
    test('trims a trailing slash and a trailing /api', () {
      expect(ApiConfig.normalise('https://example.com/'), 'https://example.com');
      expect(ApiConfig.normalise('https://example.com/api'), 'https://example.com');
      expect(ApiConfig.normalise('  https://example.com/api/  '), 'https://example.com');
    });
  });
}
