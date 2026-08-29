import 'dart:io';

import 'package:shared_preferences/shared_preferences.dart';

/// Where the CheckWise API lives, and how that survives a restart.
///
/// A phone has no `localhost` pointing at your PC, so unlike the web client
/// there is no dev-server proxy to hide behind and the address has to be a real
/// one. The default is picked for wherever the app happens to be running;
/// Settings can override it, which is what a physical phone on the LAN needs.
abstract final class ApiConfig {
  static const _key = 'checkwise.apiBaseUrl';

  /// Overridable at build time:
  /// `--dart-define=CHECKWISE_API_URL=http://192.168.1.5:5000`.
  static const _compileTime = String.fromEnvironment('CHECKWISE_API_URL');

  static String _baseUrl = defaultBaseUrl();

  static String get baseUrl => _baseUrl;

  /// The Android emulator reaches the host machine on 10.0.2.2 — 127.0.0.1
  /// there is the emulated device itself, which is the usual reason a freshly
  /// installed build cannot see a server that is plainly running.
  static String defaultBaseUrl() {
    if (_compileTime.isNotEmpty) return _compileTime;
    if (Platform.isAndroid) return 'http://10.0.2.2:5000';
    return 'http://localhost:5000';
  }

  static Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_key);
    if (saved != null && saved.trim().isNotEmpty) _baseUrl = saved.trim();
  }

  static Future<void> save(String value) async {
    _baseUrl = normalise(value);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, _baseUrl);
  }

  static Future<void> reset() async {
    _baseUrl = defaultBaseUrl();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
  }

  /// Trims a trailing slash and a trailing `/api`, so pasting either the site
  /// root or the API root out of a browser produces the same working address.
  static String normalise(String value) {
    var url = value.trim();
    while (url.endsWith('/')) {
      url = url.substring(0, url.length - 1);
    }
    if (url.endsWith('/api')) url = url.substring(0, url.length - 4);
    return url;
  }

  /// Uploaded scans and write-in crops come back as site-relative paths
  /// (`/uploads/...`), which an Image widget cannot fetch on its own.
  static String fileUrl(String? path) {
    if (path == null || path.isEmpty) return '';
    if (path.startsWith('http')) return path;
    return _baseUrl + (path.startsWith('/') ? '' : '/') + path;
  }
}
