import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/api_config.dart';
import '../core/theme.dart';
import '../widgets/common.dart';

/// Where the app points, and a way to prove it before leaving the screen.
///
/// This exists because the phone cannot borrow the web client's dev-server
/// proxy: it needs a real address, and getting it wrong looks exactly like the
/// server being down. Checking `/api/health` from here turns that guess into an
/// answer.
class ServerScreen extends StatefulWidget {
  const ServerScreen({super.key});

  @override
  State<ServerScreen> createState() => _ServerScreenState();
}

class _ServerScreenState extends State<ServerScreen> {
  late final TextEditingController _url = TextEditingController(
    text: ApiConfig.baseUrl,
  );

  bool _testing = false;
  String? _ok;
  String? _error;

  @override
  void dispose() {
    _url.dispose();
    super.dispose();
  }

  Future<void> _test() async {
    FocusScope.of(context).unfocus();

    final candidate = ApiConfig.normalise(_url.text);
    if (candidate.isEmpty) {
      setState(() => _error = 'Enter the address of your CheckWise server.');
      return;
    }

    setState(() {
      _testing = true;
      _ok = null;
      _error = null;
    });

    // Resolved before the first await: the element may be gone by the time the
    // probe returns, and reading from a dead context is a crash waiting to
    // happen.
    final api = context.read<ApiClient>();

    // Saving before the probe is what makes the probe meaningful: the client
    // resolves its base URL per request, so this tests the real setting.
    final previous = ApiConfig.baseUrl;
    await ApiConfig.save(candidate);

    try {
      final body = await api.get('/health');
      final service = (body['service'] ?? 'the server').toString();
      if (!mounted) return;
      setState(() {
        _ok = 'Connected to $service.';
        _testing = false;
      });
    } on ApiException catch (error) {
      // A failed probe must not leave the app pointing somewhere broken.
      await ApiConfig.save(previous);
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _testing = false;
      });
    }
  }

  Future<void> _reset() async {
    await ApiConfig.reset();
    if (!mounted) return;
    setState(() {
      _url.text = ApiConfig.baseUrl;
      _ok = null;
      _error = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('CheckWise server')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Server address',
                  style: TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w600,
                    color: Slate.c900,
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Where the CheckWise API is running. Paste either the site '
                  'address or the API address — both work.',
                  style: TextStyle(
                    fontSize: 13,
                    color: Slate.c500,
                    height: 1.45,
                  ),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _url,
                  keyboardType: TextInputType.url,
                  autocorrect: false,
                  decoration: const InputDecoration(
                    hintText: 'http://10.0.2.2:5000',
                    prefixIcon: Icon(
                      Icons.dns_outlined,
                      size: 19,
                      color: Slate.c400,
                    ),
                  ),
                  onSubmitted: (_) => _test(),
                ),
                const SizedBox(height: 14),
                FilledButton.icon(
                  onPressed: _testing ? null : _test,
                  icon: _testing
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.wifi_tethering_rounded, size: 18),
                  label: Text(_testing ? 'Testing…' : 'Test and save'),
                ),
                if (_ok != null) ...[
                  const SizedBox(height: 12),
                  _Note(
                    message: _ok!,
                    color: Signal.pass,
                    background: Signal.passSoft,
                    icon: Icons.check_circle_rounded,
                  ),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  _Note(
                    message: _error!,
                    color: Signal.fail,
                    background: Signal.failSoft,
                    icon: Icons.error_outline_rounded,
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 14),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Which address do I use?',
                  style: TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w600,
                    color: Slate.c900,
                  ),
                ),
                const SizedBox(height: 12),
                const _Hint(
                  title: 'Android emulator',
                  body: 'http://10.0.2.2:5000',
                  note:
                      'The emulator reaches your PC on 10.0.2.2. Its own '
                      'localhost is the emulated phone, not your computer.',
                ),
                const Divider(height: 24),
                const _Hint(
                  title: 'A real phone on the same Wi-Fi',
                  body: 'http://<your-PC-IP>:5000',
                  note:
                      'Find the IP with ipconfig on Windows. The phone and the '
                      'PC must be on the same network, and the server must be '
                      'allowed through the firewall.',
                ),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: _reset,
                  icon: const Icon(Icons.restart_alt_rounded, size: 18),
                  label: const Text('Reset to default'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Hint extends StatelessWidget {
  const _Hint({required this.title, required this.body, required this.note});

  final String title;
  final String body;
  final String note;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: Slate.c700,
          ),
        ),
        const SizedBox(height: 6),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: Slate.c50,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: Slate.c200),
          ),
          child: Text(
            body,
            style: const TextStyle(
              fontFamily: 'monospace',
              fontSize: 12.5,
              color: Brand.c700,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          note,
          style: const TextStyle(
            fontSize: 12,
            color: Slate.c500,
            height: 1.45,
          ),
        ),
      ],
    );
  }
}

class _Note extends StatelessWidget {
  const _Note({
    required this.message,
    required this.color,
    required this.background,
    required this.icon,
  });

  final String message;
  final Color color;
  final Color background;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 17, color: color),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              message,
              style: TextStyle(fontSize: 12.5, color: color, height: 1.4),
            ),
          ),
        ],
      ),
    );
  }
}
