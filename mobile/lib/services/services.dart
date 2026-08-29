import 'dart:io';

import 'package:dio/dio.dart';
import 'package:http_parser/http_parser.dart';

import '../core/api_client.dart';
import '../models/dashboard.dart';
import '../models/exam.dart';
import '../models/result.dart';
import '../models/user.dart';

/// Thin wrappers over the API, one per resource, mirroring the web client's
/// `src/services/*.js` so the two clients stay recognisably the same shape.
///
/// Every route answers `{ success, data: { ... } }`; unwrapping that here keeps
/// the envelope out of the screens.
Map<String, dynamic> _data(Map<String, dynamic> body) =>
    (body['data'] as Map<String, dynamic>?) ?? const {};

class AuthService {
  AuthService(this._api);

  final ApiClient _api;

  /// Returns the signed-in user; the token is stored as a side effect so the
  /// next launch can skip the sign-in screen.
  Future<User> register({
    required String name,
    required String email,
    required String password,
  }) async {
    final body = await _api.post(
      '/auth/register',
      body: {'name': name, 'email': email, 'password': password},
    );
    return _acceptSession(_data(body));
  }

  Future<User> login({
    required String email,
    required String password,
  }) async {
    final body = await _api.post(
      '/auth/login',
      body: {'email': email, 'password': password},
    );
    return _acceptSession(_data(body));
  }

  Future<User> me() async {
    final body = await _api.get('/auth/me');
    return User.fromJson((_data(body)['user'] as Map<String, dynamic>?) ?? {});
  }

  Future<void> logout() async {
    try {
      await _api.post('/auth/logout');
    } on ApiException {
      // The token is discarded locally regardless of the network result.
    }
    await _api.clearToken();
  }

  Future<User> _acceptSession(Map<String, dynamic> data) async {
    final token = data['token'];
    if (token is String && token.isNotEmpty) {
      await _api.storeToken(token);
    }
    return User.fromJson((data['user'] as Map<String, dynamic>?) ?? {});
  }
}

class DashboardService {
  DashboardService(this._api);

  final ApiClient _api;

  Future<DashboardStats> stats() async {
    final body = await _api.get('/dashboard/stats');
    return DashboardStats.fromJson(_data(body));
  }
}

class ExamService {
  ExamService(this._api);

  final ApiClient _api;

  Future<ExamPage> list({
    String? q,
    String status = 'all',
    String sort = 'newest',
    int page = 1,
    int limit = 10,
  }) async {
    final body = await _api.get(
      '/exams',
      query: {
        'q': q,
        'status': status,
        'sort': sort,
        'page': page,
        'limit': limit,
      },
    );
    return ExamPage.fromJson(_data(body));
  }

  Future<Exam> get(String id) async {
    final body = await _api.get('/exams/$id');
    final data = _data(body);
    return Exam.fromJson((data['exam'] as Map<String, dynamic>?) ?? data);
  }
}

/// What one scan produced: the graded paper, plus the sentence the server wrote
/// to summarise it.
class ScanOutcome {
  const ScanOutcome({required this.result, required this.message});

  final Result result;
  final String message;
}

class ResultService {
  ResultService(this._api);

  final ApiClient _api;

  /// Sends one student's paper.
  ///
  /// Several images are one paper — a sheet that runs to two pages is still a
  /// single score — so they go in one request.
  Future<ScanOutcome> scan(
    String examId, {
    required List<File> files,
    String studentName = '',
    String studentId = '',
    void Function(int percent)? onProgress,
  }) async {
    final form = FormData();

    for (final file in files) {
      final name = file.path.split(Platform.pathSeparator).last;
      form.files.add(
        MapEntry(
          'images',
          await MultipartFile.fromFile(
            file.path,
            filename: name,
            // Multer filters on MIME type, and Dio would otherwise send
            // application/octet-stream for a camera capture.
            contentType: _mediaType(name),
          ),
        ),
      );
    }

    // A name is not required: pointing a camera at a stack of papers should not
    // stop for typing. Unnamed papers are numbered and renamed from the list.
    form.fields.add(MapEntry('studentName', studentName.trim()));
    if (studentId.trim().isNotEmpty) {
      form.fields.add(MapEntry('studentId', studentId.trim()));
    }

    final body = await _api.upload(
      '/exams/$examId/scan',
      form,
      onProgress: onProgress,
    );

    return ScanOutcome(
      result: Result.fromJson(
        (_data(body)['result'] as Map<String, dynamic>?) ?? {},
      ),
      message: (body['message'] ?? 'Paper scored.').toString(),
    );
  }

  Future<List<Result>> listForExam(String examId) async {
    final body = await _api.get('/exams/$examId/results');
    return _results(_data(body));
  }

  Future<List<Result>> listAll({int limit = 50}) async {
    final body = await _api.get('/results', query: {'limit': limit});
    return _results(_data(body));
  }

  Future<Result> get(String id) async {
    final body = await _api.get('/results/$id');
    final data = _data(body);
    return Result.fromJson((data['result'] as Map<String, dynamic>?) ?? data);
  }

  /// `answers` is a questionNumber -> answer map; the server regrades the whole
  /// paper, so a correction can never leave the score disagreeing with it.
  Future<Result> update(
    String id, {
    Map<int, String>? answers,
    String? studentName,
    String? studentId,
  }) async {
    final payload = <String, dynamic>{};
    if (answers != null && answers.isNotEmpty) {
      payload['answers'] = answers.map(
        (question, answer) => MapEntry(question.toString(), answer),
      );
    }
    if (studentName != null) payload['studentName'] = studentName;
    if (studentId != null) payload['studentId'] = studentId;

    final body = await _api.patch('/results/$id', body: payload);
    final data = _data(body);
    return Result.fromJson((data['result'] as Map<String, dynamic>?) ?? data);
  }

  Future<void> remove(String id) => _api.delete('/results/$id');

  List<Result> _results(Map<String, dynamic> data) {
    final raw = data['results'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map<String, dynamic>>()
        .map(Result.fromJson)
        .toList();
  }

  MediaType _mediaType(String filename) {
    final lower = filename.toLowerCase();
    if (lower.endsWith('.png')) return MediaType('image', 'png');
    if (lower.endsWith('.pdf')) return MediaType('application', 'pdf');
    return MediaType('image', 'jpeg');
  }
}
