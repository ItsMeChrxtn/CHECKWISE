import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/formatters.dart';
import '../core/theme.dart';
import '../models/exam.dart';
import '../models/result.dart';
import '../services/services.dart';
import '../widgets/common.dart';
import 'result_detail_screen.dart';
import 'scan_screen.dart';

/// One exam: what it is, whether it can be scanned, and every paper scored
/// against it.
class ExamDetailScreen extends StatefulWidget {
  const ExamDetailScreen({super.key, required this.examId});

  final String examId;

  @override
  State<ExamDetailScreen> createState() => _ExamDetailScreenState();
}

class _ExamDetailScreenState extends State<ExamDetailScreen> {
  Exam? _exam;
  List<Result> _results = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      // The exam and its papers are independent reads; waiting for them in
      // series would show a half-built screen for no reason.
      final exam = context.read<ExamService>().get(widget.examId);
      final results = context.read<ResultService>().listForExam(widget.examId);
      final loaded = await (exam, results).wait;

      if (!mounted) return;
      setState(() {
        _exam = loaded.$1;
        _results = loaded.$2;
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

  Future<void> _scan() async {
    final exam = _exam;
    if (exam == null) return;

    // On the root navigator, not this tab's: a viewfinder that leaves the
    // shell's bottom bar sitting over it is not a full-screen camera.
    final outcome = await Navigator.of(context, rootNavigator: true)
        .push<ScanOutcome>(
          MaterialPageRoute(
            fullscreenDialog: true,
            builder: (_) => ScanScreen(exam: exam),
          ),
        );

    if (outcome == null || !mounted) return;

    await _load();
    if (!mounted) return;

    // The score opens inside the shell, so backing out of it lands on the exam.
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ResultDetailScreen(
          resultId: outcome.result.id,
          flash: outcome.message,
        ),
      ),
    );
    if (mounted) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final exam = _exam;

    return Scaffold(
      appBar: AppBar(
        title: Text(exam?.examCode ?? 'Exam'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: _loading ? null : _load,
          ),
        ],
      ),
      floatingActionButton: exam != null && exam.canScan
          ? FloatingActionButton.extended(
              onPressed: _scan,
              backgroundColor: Brand.c700,
              foregroundColor: Colors.white,
              elevation: 2,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(4),
              ),
              icon: const Icon(Icons.document_scanner_rounded, size: 20),
              label: const Text(
                'Scan paper',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14.5),
              ),
            )
          : null,
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());

    if (_error != null) {
      return ErrorState(message: _error!, onRetry: _load);
    }

    final exam = _exam;
    if (exam == null) {
      return const EmptyState(
        icon: Icons.help_outline_rounded,
        title: 'Exam not found',
        message: 'It may have been deleted.',
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
        children: [
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        exam.title,
                        style: Type.heading(
                          size: 19,
                          weight: FontWeight.w700,
                          height: 1.28,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Pill.examStatus(exam.status, exam.statusLabel),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  exam.subject,
                  style: const TextStyle(fontSize: 13.5, color: Slate.c500),
                ),
                if (exam.description.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Text(
                    exam.description,
                    style: const TextStyle(
                      fontSize: 13,
                      color: Slate.c600,
                      height: 1.5,
                    ),
                  ),
                ],
                const SizedBox(height: 14),
                const Divider(),
                const SizedBox(height: 12),
                Row(
                  children: [
                    _Fact(
                      label: 'Items',
                      value: '${exam.totalQuestions}',
                    ),
                    _Fact(
                      label: 'Points',
                      value: marks(exam.totalPoints),
                    ),
                    _Fact(
                      label: 'Passing',
                      value: '${exam.passingScore}%',
                    ),
                    _Fact(
                      label: 'Scanned',
                      value: '${_results.length}',
                      last: true,
                    ),
                  ],
                ),
              ],
            ),
          ),

          // The two reasons a paper cannot be read, each with the fix. Both
          // live on the web app, so the phone explains rather than pretends.
          if (!exam.canScan) ...[
            const SizedBox(height: 12),
            _Blocked(reason: exam.scanBlockedReason!),
          ],

          const SizedBox(height: 20),
          SectionHeader(
            title: 'Papers',
            subtitle: _results.isEmpty
                ? null
                : '${_results.length} ${plural(_results.length, "paper")} scored',
          ),
          const SizedBox(height: 10),

          if (_results.isEmpty)
            AppCard(
              child: EmptyState(
                compact: true,
                icon: Icons.document_scanner_outlined,
                title: 'No papers yet',
                message: exam.canScan
                    ? 'Tap Scan paper and hold a completed answer sheet up to '
                          'the camera.'
                    : 'Once this exam is ready, scanned papers will appear '
                          'here.',
              ),
            )
          else
            ...List.generate(_results.length, (index) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: ResultCard(
                  result: _results[index],
                  onChanged: _load,
                ),
              );
            }),
        ],
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.label, required this.value, this.last = false});

  final String label;
  final String value;
  final bool last;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        decoration: last
            ? null
            : const BoxDecoration(
                border: Border(right: BorderSide(color: Slate.c200)),
              ),
        child: Column(
          children: [
            Text(value, style: Type.figure(size: 19)),
            const SizedBox(height: 5),
            Eyebrow(label),
          ],
        ),
      ),
    );
  }
}

class _Blocked extends StatelessWidget {
  const _Blocked({required this.reason});

  final String reason;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Signal.warnSoft,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Signal.warn.withValues(alpha: 0.25)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.info_outline_rounded, size: 19, color: Signal.warn),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Not ready to scan',
                  style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF92400E),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  reason,
                  style: const TextStyle(
                    fontSize: 12.5,
                    color: Color(0xFF92400E),
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// One scored paper, shared by the exam screen and the results tab.
class ResultCard extends StatelessWidget {
  const ResultCard({
    super.key,
    required this.result,
    required this.onChanged,
    this.showExam = false,
  });

  final Result result;
  final VoidCallback onChanged;
  final bool showExam;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      onTap: () async {
        await Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => ResultDetailScreen(resultId: result.id),
          ),
        );
        onChanged();
      },
      child: Row(
        children: [
          ScoreBlock(
            percentage: result.percentage,
            passed: result.passed,
            size: 24,
            width: 62,
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        result.studentName,
                        style: TextStyle(
                          fontSize: 14.5,
                          fontWeight: FontWeight.w600,
                          // An unnamed paper reads as a placeholder, because
                          // that is what it is until someone renames it.
                          color: result.isUnnamed ? Slate.c500 : Slate.c900,
                          fontStyle: result.isUnnamed
                              ? FontStyle.italic
                              : FontStyle.normal,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  showExam && result.examTitle.isNotEmpty
                      ? result.examTitle
                      : '${marks(result.score)} / ${marks(result.totalPoints)} points',
                  style: const TextStyle(fontSize: 12.5, color: Slate.c500),
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 7),
                Row(
                  children: [
                    Pill(
                      label: result.passed ? 'Passed' : 'Did not pass',
                      color: result.passed ? Signal.pass : Signal.fail,
                      background: result.passed
                          ? Signal.passSoft
                          : Signal.failSoft,
                    ),
                    if (result.needsAttention) ...[
                      const SizedBox(width: 6),
                      Pill(
                        label: '${result.needsAttentionCount} to review',
                        color: Signal.warn,
                        background: Signal.warnSoft,
                        icon: Icons.priority_high_rounded,
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right_rounded, color: Slate.c300),
        ],
      ),
    );
  }
}
