import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/formatters.dart';
import '../core/theme.dart';
import '../models/exam.dart';
import '../models/result.dart';
import '../services/services.dart';
import 'analysis_screen.dart';
import '../widgets/common.dart';
import 'package:open_filex/open_filex.dart';

import 'answer_key_screen.dart';
import 'exam_form_screen.dart';
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
  bool _working = false;
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

  Future<void> _openAnswerKey() async {
    final exam = _exam;
    if (exam == null) return;
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => AnswerKeyScreen(exam: exam)),
    );
    if (changed == true) await _load();
  }

  Future<void> _edit() async {
    final exam = _exam;
    if (exam == null) return;
    final updated = await Navigator.of(context).push<Exam>(
      MaterialPageRoute(builder: (_) => ExamFormScreen(exam: exam)),
    );
    if (updated != null) await _load();
  }

  /// Builds the printable sheet, then offers to open it straight away.
  Future<void> _generateSheet() async {
    final exam = _exam;
    if (exam == null || _working) return;

    setState(() => _working = true);
    try {
      final result = await context.read<ExamService>().generateAnswerSheet(exam.id);
      if (!mounted) return;
      setState(() => _working = false);
      showToast(context, result.message);
      await _load();
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _working = false);
      showToast(context, error.message, isError: true);
    }
  }

  /// The sheet is behind the session, so it is fetched with the token attached
  /// and handed to whatever app the phone uses for PDFs.
  Future<void> _openSheet() async {
    final exam = _exam;
    if (exam == null || _working) return;

    setState(() => _working = true);
    try {
      final file = await context
          .read<ExamService>()
          .downloadAnswerSheet(exam.id, exam.examCode);
      if (!mounted) return;
      setState(() => _working = false);

      final opened = await OpenFilex.open(file.path);
      if (opened.type != ResultType.done && mounted) {
        showToast(context, 'Saved to ${file.path}, but no app could open it.', isError: true);
      }
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _working = false);
      showToast(context, error.message, isError: true);
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
          if (exam != null)
            IconButton(
              icon: const Icon(Icons.edit_outlined),
              tooltip: 'Edit exam',
              onPressed: _loading ? null : _edit,
            ),
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Refresh',
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

          // The road from draft to scannable, with the next step actionable
          // rather than described. All three steps happen on the phone now.
          const SizedBox(height: 12),
          _Workflow(
            exam: exam,
            busy: _working,
            onAnswerKey: _openAnswerKey,
            onGenerate: _generateSheet,
            onOpenSheet: _openSheet,
          ),

          const SizedBox(height: 20),
          SectionHeader(
            title: 'Papers',
            subtitle: _results.isEmpty
                ? null
                : '${_results.length} ${plural(_results.length, "paper")} scored',
            trailing: _results.isEmpty
                ? null
                : TextButton.icon(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => AnalysisScreen(exam: exam),
                      ),
                    ),
                    icon: const Icon(Icons.insights_outlined, size: 18),
                    label: const Text('Analysis'),
                  ),
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

/// The three steps between a new exam and a scannable one.
///
/// Each row states where the exam actually stands and, when it is the step in
/// hand, carries the button that advances it. The old version of this only
/// explained that the work had to happen on the web app.
class _Workflow extends StatelessWidget {
  const _Workflow({
    required this.exam,
    required this.busy,
    required this.onAnswerKey,
    required this.onGenerate,
    required this.onOpenSheet,
  });

  final Exam exam;
  final bool busy;
  final VoidCallback onAnswerKey;
  final VoidCallback onGenerate;
  final VoidCallback onOpenSheet;

  @override
  Widget build(BuildContext context) {
    final hasQuestions = exam.totalQuestions > 0;
    final confirmed = exam.answerKeyConfirmed;
    final hasSheet = exam.hasAnswerSheet;

    return AppCard(
      sealed: !exam.canScan,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Eyebrow(exam.canScan ? 'Ready to scan' : 'To start scanning'),
          const SizedBox(height: 14),

          _Step(
            done: hasQuestions,
            title: 'Upload the exam PDF',
            detail: hasQuestions
                ? '${exam.totalQuestions} ${plural(exam.totalQuestions, "item")} read from the paper'
                : 'CheckWise reads the questions and the key out of it',
            action: hasQuestions ? null : ('Upload', onAnswerKey),
          ),
          _Step(
            done: confirmed,
            enabled: hasQuestions,
            title: 'Confirm the answer key',
            detail: confirmed
                ? 'Signed off — nothing is graded against an unconfirmed key'
                : 'Check what was read, then sign it off',
            action: hasQuestions && !confirmed ? ('Review', onAnswerKey) : null,
          ),
          _Step(
            done: hasSheet,
            enabled: confirmed,
            last: true,
            title: 'Generate the answer sheet',
            detail: hasSheet
                ? 'Print it, hand it out, then scan the completed papers'
                : 'Bubbles, writing lines and the corner markers the scanner needs',
            action: !confirmed
                ? null
                : hasSheet
                    ? ('Open PDF', onOpenSheet)
                    : ('Generate', onGenerate),
            busy: busy,
          ),

          if (hasQuestions && confirmed) ...[
            const SizedBox(height: 4),
            TextButton.icon(
              onPressed: onAnswerKey,
              icon: const Icon(Icons.tune_rounded, size: 16),
              label: const Text('Edit the answer key'),
            ),
          ],
        ],
      ),
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({
    required this.done,
    required this.title,
    required this.detail,
    this.action,
    this.enabled = true,
    this.last = false,
    this.busy = false,
  });

  final bool done;
  final bool enabled;
  final bool last;
  final bool busy;
  final String title;
  final String detail;

  /// Label and callback for the button that advances this step, when it is the
  /// one in hand.
  final (String, VoidCallback)? action;

  @override
  Widget build(BuildContext context) {
    final muted = !enabled && !done;

    return Padding(
      padding: EdgeInsets.only(bottom: last ? 0 : 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 22,
            height: 22,
            decoration: BoxDecoration(
              color: done ? Signal.passSoft : (muted ? Slate.c50 : Brand.c50),
              shape: BoxShape.circle,
              border: Border.all(
                color: done ? Signal.passLine : (muted ? Slate.c200 : Brand.c200),
              ),
            ),
            child: done
                ? const Icon(Icons.check_rounded, size: 13, color: Signal.pass)
                : null,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: muted ? Slate.c400 : Slate.c800,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  detail,
                  style: TextStyle(
                    fontSize: 12.5,
                    height: 1.4,
                    color: muted ? Slate.c400 : Slate.c500,
                  ),
                ),
              ],
            ),
          ),
          if (action != null) ...[
            const SizedBox(width: 10),
            busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2.2),
                  )
                : FilledButton(
                    onPressed: action!.$2,
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(0, 34),
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      textStyle: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    child: Text(action!.$1),
                  ),
          ],
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
