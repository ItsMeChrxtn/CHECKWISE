import 'package:flutter/foundation.dart';

import '../core/api_client.dart';
import '../models/user.dart';
import '../services/services.dart';

enum AuthStatus { checking, signedOut, signedIn }

/// Owns the session: who is signed in, and whether the app has finished asking.
///
/// A stored token is not trusted on its own — it is verified against `/auth/me`
/// at launch, so a token the server has since stopped accepting lands the user
/// on the sign-in screen rather than inside a broken shell.
class AuthController extends ChangeNotifier {
  AuthController(this._api, this._auth) {
    _api.onUnauthorised = _onSessionRejected;
  }

  final ApiClient _api;
  final AuthService _auth;

  AuthStatus _status = AuthStatus.checking;
  User? _user;
  String? _sessionNotice;

  AuthStatus get status => _status;
  User? get user => _user;

  /// Set when the session ended by itself, so login can explain why.
  String? get sessionNotice => _sessionNotice;

  Future<void> restore() async {
    final token = await _api.readToken();
    if (token == null) {
      _set(AuthStatus.signedOut, null);
      return;
    }

    try {
      final user = await _auth.me();
      _set(AuthStatus.signedIn, user);
    } on ApiException catch (error) {
      // A rejected token is already cleared by the client's interceptor. A
      // server that is merely unreachable must not silently sign anyone out,
      // but there is nothing to show them either, so they land on login.
      _sessionNotice = error.isUnauthorised ? null : error.message;
      _set(AuthStatus.signedOut, null);
    }
  }

  Future<void> login({required String email, required String password}) async {
    final user = await _auth.login(email: email, password: password);
    _sessionNotice = null;
    _set(AuthStatus.signedIn, user);
  }

  Future<void> register({
    required String name,
    required String email,
    required String password,
  }) async {
    final user = await _auth.register(
      name: name,
      email: email,
      password: password,
    );
    _sessionNotice = null;
    _set(AuthStatus.signedIn, user);
  }

  Future<void> logout() async {
    await _auth.logout();
    _set(AuthStatus.signedOut, null);
  }

  void consumeNotice() {
    _sessionNotice = null;
  }

  /// The API client calls this from its 401 handler, which can fire from any
  /// screen at any time.
  void _onSessionRejected() {
    if (_status != AuthStatus.signedIn) return;
    _sessionNotice = 'Your session has expired. Please sign in again.';
    _set(AuthStatus.signedOut, null);
  }

  void _set(AuthStatus status, User? user) {
    _status = status;
    _user = user;
    notifyListeners();
  }
}
