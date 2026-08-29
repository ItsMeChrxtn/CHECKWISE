import 'package:flutter/material.dart';

import '../core/theme.dart';

/// The surface everything sits on: one hairline rule, softly rounded, no
/// shadow. The phone equivalent of the web client's `.card`.
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.onTap,
    this.sealed = false,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;

  /// Marks the primary panel on a screen. Only slightly stronger than a plain
  /// card — a louder treatment is what made the old design shout.
  final bool sealed;

  @override
  Widget build(BuildContext context) {
    final body = Padding(padding: padding, child: child);

    // `sealed` used to add a brass rule along the top. The accent is gone, so
    // it now only means "this is the primary panel" and reads through spacing
    // and placement instead of a stripe.
    final content = body;

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: sealed ? Slate.c300 : Slate.c200),
      ),
      clipBehavior: Clip.antiAlias,
      child: onTap == null
          ? content
          : Material(
              color: Colors.transparent,
              child: InkWell(onTap: onTap, child: content),
            ),
    );
  }
}

/// A quiet label above a section.
class Eyebrow extends StatelessWidget {
  const Eyebrow(this.text, {super.key, this.onNavy = false});

  final String text;
  final bool onNavy;

  @override
  Widget build(BuildContext context) {
    return Text(text, style: onNavy ? Type.eyebrowOnNavy : Type.eyebrow);
  }
}

/// A labelled figure: quiet label, large number. The number stays ink unless
/// a colour would actually mean something.
class StatCard extends StatelessWidget {
  const StatCard({
    super.key,
    required this.label,
    required this.value,
    this.note,
    this.tint,
  });

  final String label;
  final String value;
  final String? note;

  /// Colours the figure. Left null the figure stays ink, which is the right
  /// default — colour here should mean something.
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.fromLTRB(14, 13, 14, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Eyebrow(label),
          const SizedBox(height: 10),
          Text(
            value,
            style: Type.figure(size: 27, color: tint ?? Slate.c900),
          ),
          if (note != null) ...[
            const SizedBox(height: 3),
            Text(
              note!,
              style: const TextStyle(fontSize: 11.5, color: Slate.c500),
            ),
          ],
        ],
      ),
    );
  }
}

/// A small status marker.
class Pill extends StatelessWidget {
  const Pill({
    super.key,
    required this.label,
    this.color = Slate.c600,
    this.background = Slate.c100,
    this.border,
    this.icon,
  });

  /// The exam workflow statuses, coloured the way the web client colours them.
  factory Pill.examStatus(String status, String label) {
    return switch (status) {
      'ready' => Pill(
        label: label,
        color: Signal.pass,
        background: Signal.passSoft,
        border: Signal.passLine,
        icon: Icons.check_rounded,
      ),
      'needs-review' => Pill(
        label: label,
        color: Signal.warn,
        background: Signal.warnSoft,
        border: Signal.warnLine,
        icon: Icons.priority_high_rounded,
      ),
      _ => Pill(
        label: label,
        color: Slate.c600,
        background: Slate.c100,
        border: Slate.c200,
      ),
    };
  }

  final String label;
  final Color color;
  final Color background;
  final Color? border;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: border ?? background),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 11, color: color),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

/// The "nothing here yet" panel, with an optional way forward.
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    this.action,
    this.compact = false,
  });

  final IconData icon;
  final String title;
  final String message;
  final Widget? action;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: EdgeInsets.symmetric(
          horizontal: 28,
          vertical: compact ? 26 : 46,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // A soft ruled tile rather than a filled circle.
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                color: Slate.c50,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Slate.c200),
              ),
              child: Icon(icon, color: Slate.c400, size: 21),
            ),
            const SizedBox(height: 16),
            Text(
              title,
              textAlign: TextAlign.center,
              style: Type.heading(size: 15.5, color: Slate.c800),
            ),
            const SizedBox(height: 5),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 13,
                color: Slate.c500,
                height: 1.5,
              ),
            ),
            if (action != null) ...[const SizedBox(height: 18), action!],
          ],
        ),
      ),
    );
  }
}

/// A failed load, with the server's own sentence and a way to try again.
class ErrorState extends StatelessWidget {
  const ErrorState({super.key, required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                color: Signal.failSoft,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Signal.failLine),
              ),
              child: const Icon(
                Icons.cloud_off_rounded,
                color: Signal.fail,
                size: 21,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Something went wrong',
              style: Type.heading(size: 15.5, color: Slate.c800),
            ),
            const SizedBox(height: 5),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 13,
                color: Slate.c500,
                height: 1.5,
              ),
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 18),
              SizedBox(
                width: 150,
                child: OutlinedButton.icon(
                  onPressed: onRetry,
                  icon: const Icon(Icons.refresh_rounded, size: 17),
                  label: const Text('Try again'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// A section heading: eyebrow, optional sub-line, optional trailing action.
class SectionHeader extends StatelessWidget {
  const SectionHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
  });

  final String title;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Eyebrow(title),
              if (subtitle != null) ...[
                const SizedBox(height: 4),
                Text(
                  subtitle!,
                  style: const TextStyle(fontSize: 12.5, color: Slate.c500),
                ),
              ],
            ],
          ),
        ),
        ?trailing,
      ],
    );
  }
}

/// A percentage read as a figure, over a thin determinate rule.
///
/// Replaces the ring: a circular gauge is a dashboard idiom, and a mark on a
/// record is a number with a rule under it.
class ScoreBlock extends StatelessWidget {
  const ScoreBlock({
    super.key,
    required this.percentage,
    required this.passed,
    this.size = 30,
    this.width = 74,
  });

  final double percentage;
  final bool passed;
  final double size;
  final double width;

  @override
  Widget build(BuildContext context) {
    final color = passed ? Signal.pass : Signal.fail;

    return SizedBox(
      width: width,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '${percentage.round()}%',
            style: Type.figure(size: size, color: color),
          ),
          const SizedBox(height: 7),
          ClipRRect(
            borderRadius: BorderRadius.circular(2),
            child: LinearProgressIndicator(
              value: (percentage / 100).clamp(0, 1).toDouble(),
              minHeight: 3,
              backgroundColor: Slate.c200,
              valueColor: AlwaysStoppedAnimation(color),
            ),
          ),
        ],
      ),
    );
  }
}

/// Shows a message at the bottom of the screen in the app's own styling.
void showToast(BuildContext context, String message, {bool isError = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Signal.fail : Brand.c800,
        duration: Duration(seconds: isError ? 5 : 3),
      ),
    );
}
