import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import 'core/api_client.dart';
import 'core/api_config.dart';
import 'core/theme.dart';
import 'screens/home_shell.dart';
import 'screens/login_screen.dart';
import 'services/services.dart';
import 'state/auth_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // The saved server address has to be in hand before the first request goes
  // out, or the app would briefly ask the wrong host.
  await ApiConfig.load();

  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  final api = ApiClient();

  runApp(
    MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: api),
        Provider<ExamService>(create: (_) => ExamService(api)),
        Provider<ResultService>(create: (_) => ResultService(api)),
        Provider<DashboardService>(create: (_) => DashboardService(api)),
        Provider<UserService>(create: (_) => UserService(api)),
        ChangeNotifierProvider<AuthController>(
          create: (_) => AuthController(api, AuthService(api))..restore(),
        ),
      ],
      child: const CheckWiseApp(),
    ),
  );
}

class CheckWiseApp extends StatelessWidget {
  const CheckWiseApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'CheckWise',
      debugShowCheckedModeBanner: false,
      theme: buildCheckWiseTheme(),
      home: const _Gate(),
    );
  }
}

/// Chooses the shell or the sign-in screen from the session, and shows a splash
/// while the stored token is being verified.
class _Gate extends StatelessWidget {
  const _Gate();

  @override
  Widget build(BuildContext context) {
    final status = context.select<AuthController, AuthStatus>(
      (auth) => auth.status,
    );

    return switch (status) {
      AuthStatus.checking => const _Splash(),
      AuthStatus.signedOut => const LoginScreen(),
      AuthStatus.signedIn => const HomeShell(),
    };
  }
}

class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) {
    // White, matching the native launch screen exactly, so the handover from
    // the OS splash to Flutter's first frame is invisible — the mark is already
    // on screen and simply stays there.
    return Scaffold(
      backgroundColor: Colors.white,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const _Mark(size: 56),
            const SizedBox(height: 20),
            Text(
              'CheckWise',
              style: Type.heading(size: 24, weight: FontWeight.w600),
            ),
            const SizedBox(height: 6),
            const Text(
              'Smart exam checking',
              style: TextStyle(fontSize: 13.5, color: Slate.c500),
            ),
            const SizedBox(height: 40),
            const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2.2),
            ),
          ],
        ),
      ),
    );
  }
}

/// The CheckWise mark: an answer bubble with a check struck through it.
///
/// Drawn to the same geometry as the web client's `LogoMark` so the two front
/// doors are the same mark, not two similar ones.
class _Mark extends StatelessWidget {
  const _Mark({this.size = 40});

  final double size;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(painter: _MarkPainter()),
    );
  }
}

class _MarkPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    // The web mark is authored on a 32x32 grid; scale to whatever we are given.
    final k = size.width / 32;

    final bubble = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.6 * k
      ..strokeCap = StrokeCap.round
      ..color = Brand.c600.withValues(alpha: 0.35);

    // An arc left open at the top right, so the check reads as passing through
    // the bubble rather than sitting on top of it.
    canvas.drawArc(
      Rect.fromCircle(center: Offset(16 * k, 16 * k), radius: 9 * k),
      -0.72,
      5.34,
      false,
      bubble,
    );

    final check = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3 * k
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..color = Brand.c600;

    canvas.drawPath(
      Path()
        ..moveTo(11.2 * k, 16.4 * k)
        ..lineTo(15 * k, 20.2 * k)
        ..lineTo(24.4 * k, 10.4 * k),
      check,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Reused by the sign-in screen.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 40});

  final double size;

  @override
  Widget build(BuildContext context) => _Mark(size: size);
}
