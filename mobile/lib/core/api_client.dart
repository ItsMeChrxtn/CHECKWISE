import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_config.dart';

/// A failure carrying a sentence that is safe to put in front of a teacher.
///
/// Mirrors the web client's response interceptor: every transport, timeout and
/// HTTP failure is flattened into one type, so screens never branch on Dio.
class ApiException implements Exception {
  ApiException(this.message, {this.status = 0, this.errors});

  final String message;

  /// 0 when the request never reached the server.
  final int status;

  /// field -> message, for highlighting the offending input on a form.
  final Map<String, String>? errors;

  bool get isUnauthorised => status == 401;

  @override
  String toString() => message;
}

class ApiClient {
  ApiClient() {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          // Resolved per request rather than cached, so Settings can repoint
          // the app at another server without a restart.
          options.baseUrl = '${ApiConfig.baseUrl}/api';
          final token = await readToken();
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          // An expired or invalid session: drop it so the app returns to login.
          if (error.response?.statusCode == 401) {
            await clearToken();
            onUnauthorised?.call();
          }
          handler.next(error);
        },
      ),
    );
  }

  static const tokenKey = 'checkwise.token';

  final Dio _dio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      contentType: Headers.jsonContentType,
    ),
  );

  /// Called when the server rejects the stored session.
  void Function()? onUnauthorised;

  // ---- token storage -------------------------------------------------------

  Future<String?> readToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(tokenKey);
  }

  Future<void> storeToken(String token) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(tokenKey, token);
  }

  Future<void> clearToken() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(tokenKey);
  }

  // ---- verbs ---------------------------------------------------------------

  Future<Map<String, dynamic>> get(String path, {Map<String, dynamic>? query}) {
    return _send(() => _dio.get(path, queryParameters: _clean(query)));
  }

  Future<Map<String, dynamic>> post(
    String path, {
    Object? body,
    Duration? timeout,
  }) {
    return _send(
      () => _dio.post(
        path,
        // An empty object, not null: express.json() runs in strict mode and
        // rejects a top-level null body before the route is ever reached.
        data: body ?? const <String, dynamic>{},
        options: _withTimeout(timeout),
      ),
    );
  }

  Future<Map<String, dynamic>> patch(String path, {Object? body}) {
    return _send(() => _dio.patch(path, data: body));
  }

  Future<Map<String, dynamic>> put(String path, {Object? body}) {
    return _send(() => _dio.put(path, data: body));
  }

  Future<Map<String, dynamic>> delete(String path) {
    return _send(() => _dio.delete(path));
  }

  /// Multipart, used by the scanner. Reading a stack of pages runs well past
  /// any sane default, so the caller sets its own ceiling.
  Future<Map<String, dynamic>> upload(
    String path,
    FormData form, {
    Duration timeout = const Duration(minutes: 3),
    void Function(int percent)? onProgress,
  }) {
    return _send(
      () => _dio.post(
        path,
        data: form,
        options: Options(
          contentType: 'multipart/form-data',
          sendTimeout: timeout,
          receiveTimeout: timeout,
        ),
        onSendProgress: (sent, total) {
          if (onProgress != null && total > 0) {
            onProgress((sent / total * 100).round());
          }
        },
      ),
    );
  }

  Options? _withTimeout(Duration? timeout) {
    if (timeout == null) return null;
    return Options(sendTimeout: timeout, receiveTimeout: timeout);
  }

  /// Blank query values are dropped rather than sent as empty strings, which
  /// the exam list would otherwise treat as a real filter.
  Map<String, dynamic>? _clean(Map<String, dynamic>? query) {
    if (query == null) return null;
    final cleaned = <String, dynamic>{};
    query.forEach((key, value) {
      if (value == null) return;
      if (value is String && value.trim().isEmpty) return;
      cleaned[key] = value;
    });
    return cleaned;
  }

  Future<Map<String, dynamic>> _send(
    Future<Response<dynamic>> Function() request,
  ) async {
    try {
      final response = await request();
      final data = response.data;
      if (data is Map<String, dynamic>) return data;
      return <String, dynamic>{'success': true, 'data': data};
    } on DioException catch (error) {
      throw _translate(error);
    }
  }

  ApiException _translate(DioException error) {
    final status = error.response?.statusCode ?? 0;
    final data = error.response?.data;

    String? serverMessage;
    Map<String, String>? fieldErrors;

    if (data is Map<String, dynamic>) {
      final message = data['message'];
      if (message is String && message.isNotEmpty) serverMessage = message;

      final errors = data['errors'];
      if (errors is Map) {
        fieldErrors = errors.map(
          (key, value) => MapEntry(key.toString(), value.toString()),
        );
      }
    }

    final unreachable =
        'Cannot reach the CheckWise server at ${ApiConfig.baseUrl}. Check that '
        'it is running, and that the address in Settings is right.';

    final message = switch (error.type) {
      DioExceptionType.connectionTimeout ||
      DioExceptionType.sendTimeout ||
      DioExceptionType.receiveTimeout =>
        serverMessage ?? 'The request timed out. Please try again.',
      DioExceptionType.connectionError ||
      DioExceptionType.unknown =>
        serverMessage ?? unreachable,
      _ => serverMessage ?? 'Something went wrong. Please try again.',
    };

    return ApiException(message, status: status, errors: fieldErrors);
  }
}
