import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/api_config.dart';
import '../core/formatters.dart';
import '../core/theme.dart';
import '../models/result.dart';
import '../services/services.dart';
import '../widgets/common.dart';

/// One scored paper, question by question, and the place a teacher settles what
/// the scanner would not guess at.
///
/// Every correction is sent to the server, which regrades the whole paper — the
/// score is never recomputed on the phone, so it cannot drift from the answers.
class ResultDetailScreen extends StatefulWidget {
  const ResultDetailScreen({
    super.key,
    required this.resultId,
    this.flash,
  });

  final String resultId;

  /// The server's own summary of a scan just completed, shown once on arrival.
  final String? flash;

  @override
  State<ResultDetailScreen> createState() => _ResultDetailScreenState();
}

class _ResultDetailScreenState extends State<ResultDetailScreen> {
  Result? _result;
  bool _loading = true;
  String? _error;
  bool _onlyAttention = false;

  @override
  void initState() {
    super.initState();
    _load();

    final flash = widget.flash;
    if (flash != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) showToast(context, flash);
      });
    }
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final result = await context.read<ResultService>().get(widget.resultId);
      if (!mounted) return;
      setState(() {
        _result = result;
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

  /// Sends one corrected answer and takes the regraded paper back.
  Future<void> _correct(Answer answer, String value) async {
    final service = context.read<ResultService>();
    try {
      final updated = await service.update(
        widget.resultId,
        answers: {answer.questionNumber: value},
      );
      if (!mounted) return;
      setState(() => _result = updated);
      showToast(context, 'Question ${answer.displayNumber} updated.');
    } on ApiException catch (error) {
      if (!mounted) return;
      showToast(context, error.message, isError: true);
    }
  }

  Future<void> _rename() async {
    final result = _result;
    if (result == null) return;

    final controller = TextEditingController(
      text: result.isUnnamed ? '' : result.studentName,
    );

    final name = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Student name'),
        content: TextField(
          controller: controller,
          autofocus: true,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(hintText: 'Full name'),
          onSubmitted: (value) => Navigator.of(context).pop(value),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(controller.text),
            child: const Text('Save'),
          ),
        ],
      ),
    );

    if (name == null || name.trim().isEmpty || !mounted) return;

    try {
      final updated = await context.read<ResultService>().update(
        widget.resultId,
        studentName: name.trim(),
      );
      if (!mounted) return;
      setState(() => _result = updated);
    } on ApiException catch (error) {
      if (!mounted) return;
      showToast(context, error.message, isError: true);
    }
  }

  Future<void> _delete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete this paper?'),
        content: const Text(
          'The score and everything read from the scan will be removed. This '
          'cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: Signal.fail),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    try {
      await context.read<ResultService>().remove(widget.resultId);
      if (!mounted) return;
      Navigator.of(context).pop();
    } on ApiException catch (error) {
      if (!mounted) return;
      showToast(context, error.message, isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final result = _result;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Paper'),
        actions: [
          if (result != null)
            PopupMenuButton<String>(
              onSelected: (value) {
                if (value == 'rename') _rename();
                if (value == 'delete') _delete();
              },
              itemBuilder: (context) => const [
                PopupMenuItem(value: 'rename', child: Text('Rename student')),
                PopupMenuItem(value: 'delete', child: Text('Delete paper')),
              ],
            ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    final result = _result;
    if (result == null) {
      return const EmptyState(
        icon: Icons.help_outline_rounded,
        title: 'Paper not found',
        message: 'It may have been deleted.',
      );
    }

    final answers = _onlyAttention
        ? result.answers.where((a) => a.needsAttention).toList()
        : result.answers;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: [
          _Header(result: result, onRename: _rename),

          if (result.needsAttention) ...[
            const SizedBox(height: 12),
            _AttentionBanner(result: result),
          ],

          const SizedBox(height: 20),
          Row(
            children: [
              const Expanded(child: SectionHeader(title: 'Answers')),
              if (result.needsAttention)
                FilterChip(
                  label: Text(
                    _onlyAttention ? 'Showing flagged' : 'Flagged only',
                    style: const TextStyle(fontSize: 12),
                  ),
                  selected: _onlyAttention,
                  showCheckmark: false,
                  backgroundColor: Colors.white,
                  selectedColor: Signal.warnSoft,
                  side: BorderSide(
                    color: _onlyAttention ? Signal.warn : Slate.c200,
                  ),
                  onSelected: (value) =>
                      setState(() => _onlyAttention = value),
                ),
            ],
          ),
          const SizedBox(height: 10),

          if (answers.isEmpty)
            AppCard(
              child: EmptyState(
                compact: true,
                icon: Icons.check_circle_outline_rounded,
                title: _onlyAttention ? 'Nothing flagged' : 'No answers',
                message: _onlyAttention
                    ? 'Every question on this paper has been settled.'
                    : 'This paper has no recorded answers.',
              ),
            )
          else
            ...answers.map(
              (answer) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _AnswerRow(
                  answer: answer,
                  onCorrect: (value) => _correct(answer, value),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.result, required this.onRename});

  final Result result;
  final VoidCallback onRename;

  @override
  Widget build(BuildContext context) {
    // The paper's own record: brass rule, and the mark set as a figure.
    return AppCard(
      sealed: true,
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ScoreBlock(
                percentage: result.percentage,
                passed: result.passed,
                size: 34,
                width: 86,
              ),
              const SizedBox(width: 18),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    GestureDetector(
                      onTap: onRename,
                      child: Row(
                        children: [
                          Flexible(
                            child: Text(
                              result.studentName,
                              style: Type.heading(
                                size: 18,
                                weight: FontWeight.w700,
                                color: result.isUnnamed
                                    ? Slate.c500
                                    : Slate.c900,
                              ).copyWith(
                                fontStyle: result.isUnnamed
                                    ? FontStyle.italic
                                    : FontStyle.normal,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(width: 6),
                          const Icon(
                            Icons.edit_outlined,
                            size: 14,
                            color: Slate.c400,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${marks(result.score)} / ${marks(result.totalPoints)} points',
                      style: const TextStyle(
                        fontSize: 13.5,
                        color: Slate.c600,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Pill(
                      label: result.passed ? 'Passed' : 'Did not pass',
                      color: result.passed ? Signal.pass : Signal.fail,
                      background: result.passed
                          ? Signal.passSoft
                          : Signal.failSoft,
                      icon: result.passed
                          ? Icons.check_circle_rounded
                          : Icons.cancel_rounded,
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          const Divider(),
          const SizedBox(height: 12),
          Row(
            children: [
              _Tally(
                label: 'Correct',
                value: result.correctAnswers,
                color: Signal.pass,
              ),
              _Tally(
                label: 'Wrong',
                value: result.wrongAnswers,
                color: Signal.fail,
              ),
              _Tally(
                label: 'Blank',
                value: result.blankAnswers,
                color: Slate.c500,
              ),
              _Tally(
                label: 'To review',
                value: result.pendingReview + result.ambiguousAnswers,
                color: Signal.warn,
                last: true,
              ),
            ],
          ),
          if (result.createdAt != null) ...[
            const SizedBox(height: 12),
            Text(
              'Scanned ${formatDateTime(result.createdAt)}',
              style: const TextStyle(fontSize: 11.5, color: Slate.c400),
            ),
          ],
        ],
      ),
    );
  }
}

class _Tally extends StatelessWidget {
  const _Tally({
    required this.label,
    required this.value,
    required this.color,
    this.last = false,
  });

  final String label;
  final int value;
  final Color color;
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
            Text('$value', style: Type.figure(size: 19, color: color)),
            const SizedBox(height: 5),
            Eyebrow(label),
          ],
        ),
      ),
    );
  }
}

class _AttentionBanner extends StatelessWidget {
  const _AttentionBanner({required this.result});

  final Result result;

  @override
  Widget build(BuildContext context) {
    final parts = <String>[
      if (result.pendingReview > 0)
        '${result.pendingReview} written ${plural(result.pendingReview, "answer")} to type in',
      if (result.ambiguousAnswers > 0)
        '${result.ambiguousAnswers} unclear ${plural(result.ambiguousAnswers, "mark")}',
      if (result.blankAnswers > 0)
        '${result.blankAnswers} blank',
    ];

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
          const Icon(
            Icons.priority_high_rounded,
            size: 19,
            color: Signal.warn,
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'This paper needs a look',
                  style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF92400E),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  // The scanner refuses to guess; nothing here scores until a
                  // person settles it.
                  '${parts.join(', ')}. Nothing flagged earns marks until you '
                  'settle it.',
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

class _AnswerRow extends StatelessWidget {
  const _AnswerRow({required this.answer, required this.onCorrect});

  final Answer answer;
  final void Function(String value) onCorrect;

  bool get _editable => answer.needsAttention || answer.status == 'wrong';

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.all(13),
      onTap: _editable ? () => _edit(context) : null,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              color: answer.statusBackground,
              borderRadius: BorderRadius.circular(8),
            ),
            alignment: Alignment.center,
            child: Text(
              '${answer.displayNumber}',
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
                color: answer.statusColor,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      answer.statusIcon,
                      size: 14,
                      color: answer.statusColor,
                    ),
                    const SizedBox(width: 5),
                    Text(
                      answer.statusLabel,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: answer.statusColor,
                      ),
                    ),
                    const Spacer(),
                    Text(
                      '${marks(answer.pointsEarned)}/${marks(answer.pointsPossible)}',
                      style: const TextStyle(
                        fontSize: 11.5,
                        color: Slate.c500,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                _Line(
                  label: 'Student',
                  value: answer.studentAnswer.isEmpty
                      ? '—'
                      : answer.studentAnswer,
                  emphasis: true,
                ),
                const SizedBox(height: 3),
                _Line(
                  label: 'Key',
                  value: answer.correctAnswer.isEmpty
                      ? '—'
                      : answer.correctAnswer,
                ),

                // The strip of the paper showing what the student actually
                // wrote, so a contested mark can be checked against the source.
                if (answer.writeInCrop != null &&
                    answer.writeInCrop!.isNotEmpty) ...[
                  const SizedBox(height: 9),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: Container(
                      color: Slate.c100,
                      child: Image.network(
                        ApiConfig.fileUrl('/uploads/${answer.writeInCrop}'),
                        height: 40,
                        fit: BoxFit.contain,
                        alignment: Alignment.centerLeft,
                        errorBuilder: (_, _, _) => const SizedBox.shrink(),
                      ),
                    ),
                  ),
                ],

                if (answer.manuallyCorrected) ...[
                  const SizedBox(height: 7),
                  const Row(
                    children: [
                      Icon(
                        Icons.how_to_reg_rounded,
                        size: 12,
                        color: Brand.c600,
                      ),
                      SizedBox(width: 4),
                      Text(
                        'Corrected by you',
                        style: TextStyle(
                          fontSize: 11,
                          color: Brand.c600,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          if (_editable)
            const Padding(
              padding: EdgeInsets.only(left: 6, top: 2),
              child: Icon(Icons.edit_rounded, size: 15, color: Slate.c300),
            ),
        ],
      ),
    );
  }

  Future<void> _edit(BuildContext context) async {
    // A bubbled item is one of a fixed set of choices, so it gets buttons; a
    // written one gets a keyboard. Offering a text field for a multiple-choice
    // answer is how you end up with "b." in the database.
    final value = answer.isBubbleQuestion
        ? await _pickChoice(context)
        : await _typeAnswer(context);

    if (value != null) onCorrect(value);
  }

  Future<String?> _pickChoice(BuildContext context) {
    final options = answer.questionType == 'true-false'
        ? const ['TRUE', 'FALSE']
        : const ['A', 'B', 'C', 'D', 'E'];

    return showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 26),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Question ${answer.displayNumber}',
                style: Type.heading(size: 17, weight: FontWeight.w700),
              ),
              const SizedBox(height: 4),
              const Text(
                'What did the student mark?',
                style: TextStyle(fontSize: 13, color: Slate.c500),
              ),
              const SizedBox(height: 18),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  for (final option in options)
                    SizedBox(
                      width: 68,
                      child: OutlinedButton(
                        onPressed: () =>
                            Navigator.of(context).pop(option),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(68, 48),
                          backgroundColor: answer.studentAnswer == option
                              ? Brand.c50
                              : null,
                        ),
                        child: Text(option),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () => Navigator.of(context).pop(''),
                child: const Text('Leave it blank'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<String?> _typeAnswer(BuildContext context) {
    final controller = TextEditingController(text: answer.studentAnswer);

    return showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Question ${answer.displayNumber}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Type what the student wrote. The key is '
              '"${answer.correctAnswer}".',
              style: const TextStyle(fontSize: 13, color: Slate.c500),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: controller,
              autofocus: true,
              decoration: const InputDecoration(hintText: 'Answer'),
              onSubmitted: (value) => Navigator.of(context).pop(value),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(controller.text),
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({
    required this.label,
    required this.value,
    this.emphasis = false,
  });

  final String label;
  final String value;
  final bool emphasis;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 50,
          child: Text(
            label,
            style: const TextStyle(fontSize: 11.5, color: Slate.c400),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: TextStyle(
              fontSize: 12.5,
              color: emphasis ? Slate.c900 : Slate.c600,
              fontWeight: emphasis ? FontWeight.w600 : FontWeight.w400,
              height: 1.35,
            ),
          ),
        ),
      ],
    );
  }
}
