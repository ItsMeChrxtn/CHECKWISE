import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/theme.dart';
import '../main.dart' show BrandMark;
import '../state/auth_controller.dart';

/// Sign in, or register a teacher account.
///
/// One screen rather than two: the only difference is a name field and which
/// call is made, and a teacher setting up a phone should not have to hunt for
/// the other form.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();

  bool _registering = false;
  bool _busy = false;
  bool _obscure = true;
  String? _error;
  Map<String, String> _fieldErrors = const {};

  @override
  void initState() {
    super.initState();
    // A session that ended by itself explains why the user is back here.
    final notice = context.read<AuthController>().sessionNotice;
    if (notice != null) {
      _error = notice;
      context.read<AuthController>().consumeNotice();
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _busy = true;
      _error = null;
      _fieldErrors = const {};
    });

    final auth = context.read<AuthController>();

    try {
      if (_registering) {
        await auth.register(
          name: _name.text.trim(),
          email: _email.text.trim(),
          password: _password.text,
        );
      } else {
        await auth.login(
          email: _email.text.trim(),
          password: _password.text,
        );
      }
      // On success the gate in main.dart swaps this screen for the shell, so
      // there is nothing to navigate to here.
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _fieldErrors = error.errors ?? const {};
        _busy = false;
      });
      // Re-run validation so any field the server rejected turns red.
      _formKey.currentState!.validate();
    }
  }

  void _toggleMode() {
    setState(() {
      _registering = !_registering;
      _error = null;
      _fieldErrors = const {};
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 32, 24, 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Center(child: BrandMark(size: 54)),
                    const SizedBox(height: 20),
                    Center(
                      child: Text(
                        'CheckWise',
                        style: Type.heading(size: 26, weight: FontWeight.w700),
                      ),
                    ),
                    const SizedBox(height: 10),
                    // The short rule from the splash, repeated at the front
                    // door so the two entrances match.
                    Center(
                      child: Container(width: 34, height: 2, color: Brand.c500),
                    ),
                    const SizedBox(height: 12),
                    Center(
                      child: Text(
                        _registering
                            ? 'Create your teacher account.'
                            : 'Smart exam checking. Accurate results.',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 14,
                          color: Slate.c500,
                        ),
                      ),
                    ),
                    const SizedBox(height: 30),

                    if (_error != null) ...[
                      _ErrorBanner(message: _error!),
                      const SizedBox(height: 18),
                    ],

                    if (_registering) ...[
                      _Field(
                        controller: _name,
                        label: 'Full name',
                        icon: Icons.badge_outlined,
                        textCapitalization: TextCapitalization.words,
                        serverError: _fieldErrors['name'],
                        validator: (value) {
                          if (value == null || value.trim().length < 2) {
                            return 'Enter your name.';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 14),
                    ],

                    _Field(
                      controller: _email,
                      label: 'Email',
                      icon: Icons.alternate_email_rounded,
                      keyboardType: TextInputType.emailAddress,
                      serverError: _fieldErrors['email'],
                      validator: (value) {
                        final text = value?.trim() ?? '';
                        if (text.isEmpty) return 'Enter your email.';
                        if (!text.contains('@') || !text.contains('.')) {
                          return 'Enter a valid email address.';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 14),

                    _Field(
                      controller: _password,
                      label: 'Password',
                      icon: Icons.lock_outline_rounded,
                      obscure: _obscure,
                      serverError: _fieldErrors['password'],
                      onSubmitted: (_) => _submit(),
                      suffix: IconButton(
                        icon: Icon(
                          _obscure
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                          size: 20,
                          color: Slate.c400,
                        ),
                        onPressed: () => setState(() => _obscure = !_obscure),
                      ),
                      validator: (value) {
                        final text = value ?? '';
                        if (text.isEmpty) return 'Enter your password.';
                        // Matches the server's own minimum, so a doomed
                        // registration never leaves the phone.
                        if (_registering && text.length < 8) {
                          return 'Use at least 8 characters.';
                        }
                        return null;
                      },
                    ),

                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: _busy ? null : _submit,
                      child: _busy
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.2,
                                color: Colors.white,
                              ),
                            )
                          : Text(
                              _registering ? 'Create account' : 'Sign in',
                            ),
                    ),

                    const SizedBox(height: 14),
                    Center(
                      child: TextButton(
                        onPressed: _busy ? null : _toggleMode,
                        child: Text(
                          _registering
                              ? 'Already have an account? Sign in'
                              : 'New to CheckWise? Create an account',
                          style: const TextStyle(fontSize: 13.5),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: Signal.failSoft,
        borderRadius: BorderRadius.circular(11),
        border: Border.all(color: Signal.fail.withValues(alpha: 0.25)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.error_outline_rounded, size: 18, color: Signal.fail),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                fontSize: 13,
                color: Signal.fail,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.controller,
    required this.label,
    required this.icon,
    this.validator,
    this.keyboardType,
    this.obscure = false,
    this.suffix,
    this.serverError,
    this.onSubmitted,
    this.textCapitalization = TextCapitalization.none,
  });

  final TextEditingController controller;
  final String label;
  final IconData icon;
  final String? Function(String?)? validator;
  final TextInputType? keyboardType;
  final bool obscure;
  final Widget? suffix;
  final String? serverError;
  final void Function(String)? onSubmitted;
  final TextCapitalization textCapitalization;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      obscureText: obscure,
      keyboardType: keyboardType,
      textCapitalization: textCapitalization,
      autocorrect: false,
      onFieldSubmitted: onSubmitted,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon, size: 19, color: Slate.c400),
        suffixIcon: suffix,
      ),
      // The server's own complaint wins over the local rule, since it knows
      // things the phone cannot — that an email is already registered, say.
      validator: (value) => serverError ?? validator?.call(value),
    );
  }
}
