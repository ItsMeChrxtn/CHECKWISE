import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/theme.dart';
import '../models/analysis.dart';
import '../models/exam.dart';
import '../services/services.dart';
import '../widgets/common.dart';

/// How the class did on every item, rather than how each student did overall.
///
/// A gradebook answers "who passed". This answers "was the paper any good" -
/// which item nobody got, which one the strong students got wrong more often
/// than the weak ones, and which wrong answer is pulling people in. Those are
/// the figures a study has to report, so they appear under their usual names.
///
/// The same numbers as the web panel, from the same endpoint: the arithmetic is
/// done once on the server so the two can never disagree.
class AnalysisScreen extends StatefulWidget {
  const AnalysisScreen({super.key, required this.exam});

  final Exam exam;

  @override
  State<AnalysisScreen> createState() => _AnalysisScreenState();
}

class _AnalysisScreenState extends State<AnalysisScreen> {
  ExamAnalysis? _analysis;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final analysis = await context.read<ExamService>().analysis(widget.exam.id);
      if (!mounted) return;
      setState(() {
        _analysis = analysis;
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Item analysis'),
        actions: [
          IconButton(
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());

    final error = _error;
    if (error != null) {
      return ErrorState(message: error, onRetry: _load);
    }

    final analysis = _analysis;
    if (analysis == null || analysis.summary.papers == 0) {
      return const EmptyState(
        icon: Icons.insights_outlined,
        title: 'No papers scanned yet',
        message: 'Scan a few answer sheets and the per-item figures appear here.',
      );
    }

    final summary = analysis.summary;
    final flagged = analysis.flagged;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          AppCard(
            sealed: true,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SectionHeader(
                  title: widget.exam.title,
                  subtitle: '${summary.papers} '
                      '${summary.papers == 1 ? "paper" : "papers"} checked',
                ),
                const SizedBox(height: 14),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    _Figure(
                      label: 'Mean',
                      value: '${_trim(summary.mean)} / ${_trim(summary.totalPoints)}',
                    ),
                    _Figure(label: 'Median', value: _trim(summary.median)),
                    _Figure(label: 'Std. dev.', value: _trim(summary.stdDev)),
                    _Figure(
                      label: "Cronbach's α",
                      value: summary.alpha == null ? '—' : _trim(summary.alpha!),
                      hint: summary.alphaLabel,
                    ),
                    _Figure(
                      label: 'Passed',
                      value: '${summary.passed} of ${summary.papers}',
                    ),
                  ],
                ),
              ],
            ),
          ),

          if (flagged.isNotEmpty) ...[
            const SizedBox(height: 12),
            _Notice(
              tone: Signal.warn,
              background: Signal.warnSoft,
              border: Signal.warnLine,
              icon: Icons.warning_amber_rounded,
              text: '${flagged.length == 1 ? "Item" : "Items"} '
                  '${flagged.map((i) => i.questionNumber).join(", ")} '
                  '${flagged.length == 1 ? "was" : "were"} answered correctly more '
                  'often by the students who scored lowest overall. That usually '
                  'means the wording or the key needs a look.',
            ),
          ],

          if (summary.pendingReview > 0) ...[
            const SizedBox(height: 12),
            _Notice(
              tone: Slate.c600,
              background: Slate.c100,
              border: Slate.c200,
              icon: Icons.edit_note_rounded,
              text: '${summary.pendingReview} written '
                  '${summary.pendingReview == 1 ? "answer" : "answers"} still need '
                  'typing in. Those are left out of the rates below rather than '
                  'counted as wrong.',
            ),
          ],

          const SizedBox(height: 20),
          const Eyebrow('Every item'),
          const SizedBox(height: 10),

          for (final item in analysis.items) ...[
            _ItemCard(item: item),
            const SizedBox(height: 10),
          ],

          const SizedBox(height: 8),
          Text(
            'p is the share of papers that earned the mark. D is the top 27% minus '
            'the bottom 27% by total score; below 0.20 the item is not separating '
            'students, and below zero it is working against you.',
            style: TextStyle(fontSize: 12, height: 1.5, color: Slate.c500),
          ),
        ],
      ),
    );
  }
}

class _ItemCard extends StatelessWidget {
  const _ItemCard({required this.item});

  final ItemAnalysis item;

  @override
  Widget build(BuildContext context) {
    final given = item.mostGiven;
    final difficulty = item.difficulty;

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '#${item.questionNumber}',
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        fontFeatures: Type.tabular,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      questionTypeLabels[item.questionType] ?? item.questionType,
                      style: TextStyle(fontSize: 12, color: Slate.c500),
                    ),
                  ],
                ),
              ),
              _DiscriminationTag(item: item),
            ],
          ),

          const SizedBox(height: 12),

          Row(
            children: [
              Text(
                '${item.correct}',
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                  fontFeatures: Type.tabular,
                ),
              ),
              Text(
                ' / ${item.graded > 0 ? item.graded : item.attempts} correct',
                style: TextStyle(fontSize: 13, color: Slate.c500),
              ),
              const Spacer(),
              if (item.correctAnswer.isNotEmpty)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                  decoration: BoxDecoration(
                    color: Slate.c100,
                    borderRadius: BorderRadius.circular(5),
                  ),
                  child: Text(
                    'Key ${item.correctAnswer}',
                    style: TextStyle(
                      fontSize: 12,
                      color: Slate.c700,
                      fontFeatures: Type.tabular,
                    ),
                  ),
                ),
            ],
          ),

          if (difficulty != null) ...[
            const SizedBox(height: 10),
            _Meter(value: difficulty),
            const SizedBox(height: 6),
            Text(
              'p = ${_trim(difficulty)} · ${item.difficultyLabel}',
              style: TextStyle(fontSize: 12, color: Slate.c500),
            ),
          ],

          if (given != null) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                Text(
                  'Most given',
                  style: TextStyle(fontSize: 12, color: Slate.c500),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                  decoration: BoxDecoration(
                    color: given.correct ? Signal.passSoft : Signal.failSoft,
                    borderRadius: BorderRadius.circular(5),
                    border: Border.all(
                      color: given.correct ? Signal.passLine : Signal.failLine,
                    ),
                  ),
                  child: Text(
                    given.answer,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: given.correct ? Signal.pass : Signal.fail,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  '${given.count} of ${item.attempts}',
                  style: TextStyle(fontSize: 12, color: Slate.c500),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// A bar for the difficulty index.
///
/// Both ends are a problem - an item everybody gets and one nobody gets tell
/// you equally little - so the middle band is the calm colour and the extremes
/// are the ones that stand out.
class _Meter extends StatelessWidget {
  const _Meter({required this.value});

  final double value;

  @override
  Widget build(BuildContext context) {
    final colour = value >= 0.85 || value < 0.15
        ? Signal.warn
        : value >= 0.7 || value < 0.3
            ? Brand.c300
            : Brand.c600;

    return ClipRRect(
      borderRadius: BorderRadius.circular(999),
      child: LinearProgressIndicator(
        value: value.clamp(0.0, 1.0),
        minHeight: 6,
        backgroundColor: Slate.c200,
        valueColor: AlwaysStoppedAnimation<Color>(colour),
      ),
    );
  }
}

class _DiscriminationTag extends StatelessWidget {
  const _DiscriminationTag({required this.item});

  final ItemAnalysis item;

  @override
  Widget build(BuildContext context) {
    final d = item.discrimination;
    if (d == null) {
      return Text(
        'not yet graded',
        style: TextStyle(fontSize: 12, color: Slate.c400),
      );
    }

    final (Color text, Color fill, Color line) = d < 0
        ? (Signal.fail, Signal.failSoft, Signal.failLine)
        : d >= 0.3
            ? (Signal.pass, Signal.passSoft, Signal.passLine)
            : d >= 0.2
                ? (Slate.c600, Slate.c100, Slate.c200)
                : (Signal.warn, Signal.warnSoft, Signal.warnLine);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: fill,
            borderRadius: BorderRadius.circular(6),
            border: Border.all(color: line),
          ),
          child: Text(
            'D ${d > 0 ? "+" : ""}${_trim(d)}',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: text,
              fontFeatures: Type.tabular,
            ),
          ),
        ),
        const SizedBox(height: 3),
        Text(
          item.discriminationLabel,
          style: TextStyle(fontSize: 11, color: Slate.c500),
        ),
      ],
    );
  }
}

class _Figure extends StatelessWidget {
  const _Figure({required this.label, required this.value, this.hint});

  final String label;
  final String value;
  final String? hint;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: Slate.c50,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Slate.c200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: TextStyle(fontSize: 11, color: Slate.c500)),
          const SizedBox(height: 2),
          Text(
            value,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              fontFeatures: Type.tabular,
            ),
          ),
          if (hint != null)
            Text(hint!, style: TextStyle(fontSize: 11, color: Slate.c400)),
        ],
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({
    required this.tone,
    required this.background,
    required this.border,
    required this.icon,
    required this.text,
  });

  final Color tone;
  final Color background;
  final Color border;
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: tone),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: TextStyle(fontSize: 12.5, height: 1.45, color: tone),
            ),
          ),
        ],
      ),
    );
  }
}

/// Drops the trailing zeros a rate picks up on its way through JSON.
String _trim(double value) {
  if (value == value.roundToDouble()) return value.toStringAsFixed(0);
  final text = value.toStringAsFixed(3);
  return text.replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '');
}
