import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/formatters.dart';
import '../core/theme.dart';
import '../state/auth_controller.dart';
import '../widgets/common.dart';

/// Who is signed in, where the app points, and an honest account of what this
/// app deliberately does not do.
class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  Future<void> _logout(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text(
          'You will need your email and password to sign back in.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: Signal.fail),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );

    if (confirmed != true || !context.mounted) return;
    await context.read<AuthController>().logout();
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthController>().user;

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: [
          AppCard(
            child: Row(
              children: [
                Container(
                  width: 46,
                  height: 46,
                  decoration: const BoxDecoration(
                    color: Brand.c600,
                    shape: BoxShape.circle,
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    initials(user?.name ?? ''),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user?.name ?? '—',
                        style: Type.heading(size: 16.5, weight: FontWeight.w700),
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        user?.email ?? '',
                        style: const TextStyle(
                          fontSize: 12.5,
                          color: Slate.c500,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                Pill(
                  label: user?.roleLabel ?? 'Teacher',
                  color: Brand.c700,
                  background: Brand.c50,
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),
          const SectionHeader(title: 'How CheckWise works'),
          const SizedBox(height: 10),
          const AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Everything happens here: write the exam, upload its PDF, '
                  'confirm the answer key, print the sheet, then scan the '
                  'finished papers.',
                  style: TextStyle(
                    fontSize: 13,
                    color: Slate.c600,
                    height: 1.55,
                  ),
                ),
                SizedBox(height: 14),
                _Step(
                  number: '1',
                  text: 'Create the exam and upload its PDF.',
                ),
                _Step(
                  number: '2',
                  text: 'Review what was parsed, then confirm the answer key.',
                ),
                _Step(
                  number: '3',
                  text: 'Generate and print the answer sheet.',
                ),
                _Step(
                  number: '4',
                  text: 'Scan the completed papers with the camera.',
                  last: true,
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),
          OutlinedButton.icon(
            onPressed: () => _logout(context),
            icon: const Icon(Icons.logout_rounded, size: 18),
            label: const Text('Sign out'),
            style: OutlinedButton.styleFrom(
              foregroundColor: Signal.fail,
              side: BorderSide(color: Signal.fail.withValues(alpha: 0.35)),
            ),
          ),

          const SizedBox(height: 20),
          const Center(
            child: Text(
              'CheckWise · Smart Exam Checking',
              style: TextStyle(fontSize: 11.5, color: Slate.c400),
            ),
          ),
        ],
      ),
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({
    required this.number,
    required this.text,
    this.last = false,
  });

  final String number;
  final String text;
  final bool last;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: last ? 0 : 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 20,
            height: 20,
            decoration: const BoxDecoration(
              color: Brand.c50,
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Text(
              number,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: Brand.c700,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                fontSize: 12.5,
                color: Slate.c600,
                height: 1.45,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
