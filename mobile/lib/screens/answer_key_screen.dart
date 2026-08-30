import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/formatters.dart';
import '../core/theme.dart';
import '../models/exam.dart';
import '../services/services.dart';
import '../widgets/common.dart';
import 'format_guide.dart';
import 'question_editor_screen.dart';

/// Upload the exam PDF, check what was read out of it, and sign off the key.
///
/// The parser is an assistant, never the authority — an exam cannot be graded
/// until a person has confirmed the key here. That is the whole reason this
/// screen exists rather than the upload simply marking the exam ready.
class AnswerKeyScreen extends StatefulWidget {
  const AnswerKeyScreen({super.key, required this.exam});

  final Exam exam;

  @override
  State<AnswerKeyScreen> createState() => _AnswerKeyScreenState();
}

class _AnswerKeyScreenState extends State<AnswerKeyScreen> {
  late Exam _exam = widget.exam;
  late List<Question> _questions = List.of(widget.exam.questions);

  ParsedDocument? _report;
  bool _uploading = false;
  int _progress = 0;
  bool _saving = false;
  bool _dirty = false;

  /// True once the screen has changed anything the caller should reload for.
  bool _changed = false;

  Future<void> _pickAndUpload() async {
    // file_picker 12 exposes these as statics on FilePicker itself, and
    // pickFile returns the one selection rather than a list to unwrap.
    final picked = await FilePicker.pickFile(
      dialogTitle: 'Choose the exam PDF',
      type: FileType.custom,
      allowedExtensions: const ['pdf'],
    );
    final path = picked?.path;
    if (path == null || !mounted) return;

    if (_questions.isNotEmpty) {
      final replace = await _confirmReplace();
      if (replace != true || !mounted) return;
    }

    setState(() {
      _uploading = true;
      _progress = 0;
    });

    try {
      final report = await context.read<ExamService>().uploadDocument(
        _exam.id,
        File(path),
        onProgress: (p) => mounted ? setState(() => _progress = p) : null,
      );
      if (!mounted) return;
      setState(() {
        _exam = report.exam;
        _questions = List.of(report.exam.questions);
        _report = report;
        _uploading = false;
        _dirty = false;
        _changed = true;
      });
      showToast(context, report.message);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _uploading = false);
      showToast(context, error.message, isError: true);
    }
  }

  Future<bool?> _confirmReplace() {
    return showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Replace the questions?'),
        content: Text(
          'Uploading a new PDF discards the ${_questions.length} question'
          '${_questions.length == 1 ? '' : 's'} already read from this exam, '
          'along with any edits, and un-confirms the key.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: Signal.fail),
            child: const Text('Replace'),
          ),
        ],
      ),
    );
  }

  Future<void> _saveQuestions() async {
    setState(() => _saving = true);
    try {
      final exam = await context.read<ExamService>().saveQuestions(
        _exam.id,
        _questions.map(_toJson).toList(),
      );
      if (!mounted) return;
      setState(() {
        _exam = exam;
        _saving = false;
        _dirty = false;
        _changed = true;
      });
      showToast(context, 'Answer key saved.');
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _saving = false);
      showToast(context, error.message, isError: true);
    }
  }

  Future<void> _confirm() async {
    if (_dirty) await _saveQuestions();
    if (!mounted || _dirty) return;

    setState(() => _saving = true);
    try {
      final exam = await context.read<ExamService>().confirmKey(_exam.id);
      if (!mounted) return;
      setState(() {
        _exam = exam;
        _saving = false;
        _changed = true;
      });
      showToast(context, '"${exam.title}" is ready. You can generate its answer sheet.');
      Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _saving = false);
      showToast(context, error.message, isError: true);
    }
  }

  Map<String, dynamic> _toJson(Question q) => {
    'questionNumber': q.questionNumber,
    'section': q.section,
    'sectionNumber': q.sectionNumber,
    'questionType': q.questionType,
    'questionText': q.questionText,
    'correctAnswers': q.correctAnswers,
    'choices': q.choices,
    'truthValue': q.truthValue,
    'correctionAnswers': q.correctionAnswers,
    'enumerationCount': q.enumerationCount,
    'points': q.points,
  };

  /// Numbers are derived, never typed: `questionNumber` is the position in the
  /// whole exam, `sectionNumber` the position within its section — which is
  /// what gets printed on the paper and what a section restarting at 1 means.
  List<Question> _renumbered(List<Question> source) {
    final perSection = <String, int>{};
    return List.generate(source.length, (i) {
      final q = source[i];
      final n = (perSection[q.section] ?? 0) + 1;
      perSection[q.section] = n;
      return Question(
        questionNumber: i + 1,
        questionType: q.questionType,
        section: q.section,
        sectionNumber: n,
        questionText: q.questionText,
        correctAnswers: q.correctAnswers,
        choices: q.choices,
        truthValue: q.truthValue,
        correctionAnswers: q.correctionAnswers,
        enumerationCount: q.enumerationCount,
        points: q.points,
      );
    });
  }

  Future<void> _addQuestion() async {
    // Carry the last question's section and type forward — writing twenty
    // multiple-choice items should not mean setting both twenty times.
    final previous = _questions.isEmpty ? null : _questions.last;
    final made = await Navigator.of(context).push<Question>(
      MaterialPageRoute(
        builder: (_) => QuestionEditorScreen(
          defaultSection: previous?.section ?? '',
          defaultType: previous?.questionType ?? 'multiple-choice',
        ),
      ),
    );
    if (made == null || !mounted) return;
    setState(() {
      _questions = _renumbered([..._questions, made]);
      _dirty = true;
    });
  }

  Future<void> _editQuestion(int index) async {
    final made = await Navigator.of(context).push<Question>(
      MaterialPageRoute(
        builder: (_) => QuestionEditorScreen(question: _questions[index]),
      ),
    );
    if (made == null || !mounted) return;
    setState(() {
      final next = List.of(_questions)..[index] = made;
      _questions = _renumbered(next);
      _dirty = true;
    });
  }

  Future<void> _deleteQuestion(int index) async {
    final q = _questions[index];
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Delete item ${q.displayNumber}?'),
        content: const Text('The question and its answer are removed from this exam.'),
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
    setState(() {
      final next = List.of(_questions)..removeAt(index);
      _questions = _renumbered(next);
      _dirty = true;
    });
  }

  void _replace(int index, Question updated) {
    setState(() {
      _questions[index] = updated;
      _dirty = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    final unanswered = _questions.where((q) => q.correctAnswers.isEmpty).length;

    return PopScope(
      canPop: !_dirty,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        _confirmDiscard();
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Answer key'),
          actions: [
            if (_dirty)
              TextButton(
                onPressed: _saving ? null : _saveQuestions,
                child: const Text('Save'),
              ),
            IconButton(
              icon: const Icon(Icons.help_outline_rounded),
              tooltip: 'PDF format',
              onPressed: () => showFormatGuide(context),
            ),
          ],
        ),
        body: _uploading ? _buildUploading() : _buildBody(unanswered),
        bottomNavigationBar: _questions.isEmpty || _uploading
            ? null
            : _buildFooter(unanswered),
      ),
    );
  }

  Future<void> _confirmDiscard() async {
    final leave = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Leave without saving?'),
        content: const Text('Your edits to the answer key have not been saved.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Keep editing'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: Signal.fail),
            child: const Text('Discard'),
          ),
        ],
      ),
    );
    if (leave == true && mounted) Navigator.of(context).pop(_changed);
  }

  Widget _buildUploading() {
    final sending = _progress < 100;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 56,
              height: 56,
              child: CircularProgressIndicator(
                value: sending ? _progress / 100 : null,
                strokeWidth: 3.5,
              ),
            ),
            const SizedBox(height: 24),
            Text(
              sending ? 'Uploading… $_progress%' : 'Reading the exam…',
              style: Type.heading(size: 16),
            ),
            const SizedBox(height: 6),
            Text(
              sending
                  ? 'Sending the PDF to CheckWise.'
                  : 'Finding the numbered items and the marked answers. A long '
                        'paper takes a moment.',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13, color: Slate.c500, height: 1.5),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(int unanswered) {
    if (_questions.isEmpty) {
      return ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: [
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 4),
                Text(
                  'How do you want to build it?',
                  textAlign: TextAlign.center,
                  style: Type.heading(size: 17),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Either way ends up in the same place — a short quiz or a long '
                  'final, it makes no difference.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, color: Slate.c500, height: 1.5),
                ),
                const SizedBox(height: 20),

                FilledButton.icon(
                  onPressed: _addQuestion,
                  icon: const Icon(Icons.edit_note_rounded, size: 19),
                  label: const Text('Write the questions here'),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Pick a type per item — multiple choice, true or false, '
                  'identification, enumeration and the rest.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12, color: Slate.c400, height: 1.45),
                ),

                const SizedBox(height: 20),
                Row(
                  children: [
                    const Expanded(child: Divider()),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Text('or', style: TextStyle(fontSize: 12, color: Slate.c400)),
                    ),
                    const Expanded(child: Divider()),
                  ],
                ),
                const SizedBox(height: 20),

                OutlinedButton.icon(
                  onPressed: _pickAndUpload,
                  icon: const Icon(Icons.picture_as_pdf_rounded, size: 18),
                  label: const Text('Upload a finished PDF'),
                ),
                const SizedBox(height: 6),
                const Text(
                  'CheckWise reads the items and the answer key out of it.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12, color: Slate.c400, height: 1.45),
                ),
                const SizedBox(height: 4),
              ],
            ),
          ),

          const SizedBox(height: 12),
          // Read this before picking a file, not after the upload disappoints.
          AppCard(
            sealed: true,
            onTap: () => showFormatGuide(context),
            child: Row(
              children: [
                const Icon(Icons.rule_rounded, size: 20, color: Brand.c600),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Check the format first', style: Type.heading(size: 14.5)),
                      const SizedBox(height: 3),
                      const Text(
                        'Seven rules your PDF has to follow — numbering, section '
                        'headings, and how to mark the correct answer.',
                        style: TextStyle(fontSize: 12.5, color: Slate.c500, height: 1.45),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right_rounded, color: Slate.c400),
              ],
            ),
          ),
        ],
      );
    }

    final sections = _exam.sections;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        _Summary(
          exam: _exam,
          questions: _questions,
          report: _report,
          unanswered: unanswered,
          onReupload: _pickAndUpload,
        ),
        const SizedBox(height: 20),

        if (sections.isEmpty)
          ..._questionCards(_questions)
        else
          ...sections.expand((section) {
            final inSection = _questions.where((q) => q.section == section).toList();
            return [
              Padding(
                padding: const EdgeInsets.only(bottom: 10, top: 4),
                child: Eyebrow(section),
              ),
              ..._questionCards(inSection),
              const SizedBox(height: 10),
            ];
          }),
      ],
    );
  }

  List<Widget> _questionCards(List<Question> items) {
    return items.map((q) {
      final index = _questions.indexOf(q);
      return Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: _QuestionCard(
          question: q,
          onEdited: (updated) => _replace(index, updated),
          onOpen: () => _editQuestion(index),
          onDelete: () => _deleteQuestion(index),
        ),
      );
    }).toList();
  }

  Widget _buildFooter(int unanswered) {
    final blocked = unanswered > 0;

    return Container(
      padding: EdgeInsets.fromLTRB(16, 12, 16, 12 + MediaQuery.paddingOf(context).bottom),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: Slate.c200)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (blocked)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                children: [
                  const Icon(Icons.error_outline_rounded, size: 16, color: Signal.warn),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '$unanswered ${plural(unanswered, "item")} still ${unanswered == 1 ? "has" : "have"} no correct answer.',
                      style: const TextStyle(fontSize: 12.5, color: Signal.warn),
                    ),
                  ),
                ],
              ),
            ),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _saving ? null : _addQuestion,
                  icon: const Icon(Icons.add_rounded, size: 18),
                  label: const Text('Add question'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          FilledButton(
            onPressed: _saving || blocked ? null : _confirm,
            child: _saving
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white),
                  )
                : Text(_exam.answerKeyConfirmed ? 'Key confirmed' : 'Confirm answer key'),
          ),
        ],
      ),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({
    required this.exam,
    required this.questions,
    required this.report,
    required this.unanswered,
    required this.onReupload,
  });

  final Exam exam;
  final List<Question> questions;
  final ParsedDocument? report;
  final int unanswered;
  final VoidCallback onReupload;

  @override
  Widget build(BuildContext context) {
    final points = questions.fold<double>(0, (sum, q) => sum + q.points);

    return AppCard(
      sealed: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Eyebrow('What was read')),
              TextButton.icon(
                onPressed: onReupload,
                icon: const Icon(Icons.refresh_rounded, size: 16),
                label: const Text('Replace PDF'),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              _Fact(label: 'Items', value: '${questions.length}'),
              _Fact(label: 'Points', value: marks(points)),
              _Fact(
                label: 'No answer',
                value: '$unanswered',
                tint: unanswered > 0 ? Signal.warn : null,
                last: true,
              ),
            ],
          ),

          if (report != null && report!.warnings.isNotEmpty) ...[
            const SizedBox(height: 14),
            const Divider(),
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.error_outline_rounded, size: 15, color: Signal.warn),
                const SizedBox(width: 7),
                Text(
                  '${report!.warnings.length} ${plural(report!.warnings.length, "item")} to check',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: Signal.warn,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            ...report!.warnings.take(6).map(
              (w) => Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text(
                  '· $w',
                  style: const TextStyle(fontSize: 12.5, color: Slate.c600, height: 1.4),
                ),
              ),
            ),
            if (report!.warnings.length > 6)
              Text(
                '… and ${report!.warnings.length - 6} more',
                style: const TextStyle(fontSize: 12, color: Slate.c400),
              ),
            const SizedBox(height: 6),
            TextButton.icon(
              onPressed: () => showFormatGuide(context),
              icon: const Icon(Icons.rule_rounded, size: 16),
              label: const Text('Why did this happen?'),
            ),
          ],
        ],
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.label, required this.value, this.tint, this.last = false});

  final String label;
  final String value;
  final Color? tint;
  final bool last;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        decoration: last
            ? null
            : const BoxDecoration(border: Border(right: BorderSide(color: Slate.c200))),
        child: Column(
          children: [
            Text(value, style: Type.figure(size: 19, color: tint ?? Slate.c900)),
            const SizedBox(height: 5),
            Eyebrow(label),
          ],
        ),
      ),
    );
  }
}

/// One question, with its answer editable in place.
class _QuestionCard extends StatelessWidget {
  const _QuestionCard({
    required this.question,
    required this.onEdited,
    required this.onOpen,
    required this.onDelete,
  });

  final Question question;

  /// Quick answer-only change, from tapping the row.
  final ValueChanged<Question> onEdited;

  /// The full editor — type, text, choices, points.
  final VoidCallback onOpen;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final missing = question.correctAnswers.isEmpty;

    return AppCard(
      padding: const EdgeInsets.all(13),
      onTap: () => _edit(context),
      onLongPress: () => _actions(context),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              color: missing ? Signal.warnSoft : Slate.c100,
              borderRadius: BorderRadius.circular(6),
            ),
            alignment: Alignment.center,
            child: Text(
              '${question.displayNumber}',
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
                color: missing ? Signal.warn : Slate.c600,
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
                    Expanded(
                      child: Text(
                        questionTypeLabel(question.questionType),
                        style: const TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w600,
                          color: Slate.c500,
                        ),
                      ),
                    ),
                    Text(
                      '${marks(question.points)} pt${question.points == 1 ? '' : 's'}',
                      style: const TextStyle(fontSize: 11.5, color: Slate.c500),
                    ),
                  ],
                ),
                if (question.questionText.isNotEmpty) ...[
                  const SizedBox(height: 5),
                  Text(
                    question.questionText,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 13, color: Slate.c700, height: 1.4),
                  ),
                ],
                const SizedBox(height: 8),
                Row(
                  children: [
                    Text(
                      'Answer:',
                      style: const TextStyle(fontSize: 12, color: Slate.c400),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        missing ? 'not set' : question.correctAnswers.join(', '),
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: missing ? Signal.warn : Slate.c900,
                          fontStyle: missing ? FontStyle.italic : FontStyle.normal,
                        ),
                      ),
                    ),
                    const Icon(Icons.edit_rounded, size: 14, color: Slate.c300),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Long-press menu. Tapping the row edits the answer, which is the common
  /// case; the whole question and deleting it live one level down so an
  /// eighty-item list is not covered in buttons.
  Future<void> _actions(BuildContext context) async {
    await showModalBottomSheet<void>(
      context: context,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            ListTile(
              leading: const Icon(Icons.edit_outlined, color: Slate.c600),
              title: Text('Edit item ${question.displayNumber}'),
              subtitle: const Text('Type, question text, choices and points'),
              onTap: () {
                Navigator.of(sheet).pop();
                onOpen();
              },
            ),
            ListTile(
              leading: const Icon(Icons.delete_outline_rounded, color: Signal.fail),
              title: const Text('Delete this question'),
              textColor: Signal.fail,
              onTap: () {
                Navigator.of(sheet).pop();
                onDelete();
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  Future<void> _edit(BuildContext context) async {
    // A bubbled item has a fixed set of options; a written one needs a keyboard.
    final value = question.isBubbled
        ? await _pickChoice(context)
        : await _typeAnswers(context);
    if (value == null) return;
    onEdited(_copyWithAnswers(question, value));
  }

  Future<List<String>?> _pickChoice(BuildContext context) async {
    final options = switch (question.questionType) {
      'true-false' || 'modified-true-false' => const ['TRUE', 'FALSE'],
      _ => question.choices.isNotEmpty
          ? List<String>.generate(
              question.choices.length,
              (i) => String.fromCharCode(65 + i),
            )
          : const ['A', 'B', 'C', 'D', 'E'],
    };

    return showModalBottomSheet<List<String>>(
      context: context,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 26),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Item ${question.displayNumber}', style: Type.heading(size: 17)),
              const SizedBox(height: 4),
              const Text(
                'Which answer is correct?',
                style: TextStyle(fontSize: 13, color: Slate.c500),
              ),
              const SizedBox(height: 18),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  for (final option in options)
                    SizedBox(
                      width: 76,
                      child: OutlinedButton(
                        onPressed: () => Navigator.of(context).pop([option]),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(76, 48),
                          backgroundColor:
                              question.correctAnswers.contains(option) ? Brand.c50 : null,
                        ),
                        child: Text(option),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<List<String>?> _typeAnswers(BuildContext context) {
    final controller = TextEditingController(text: question.correctAnswers.join(', '));
    final isEnumeration = question.questionType == 'enumeration';

    return showDialog<List<String>>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Item ${question.displayNumber}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              isEnumeration
                  ? 'List every item the student must give, separated by commas.'
                  : 'Separate acceptable spellings with commas — any one of them '
                        'earns the mark.',
              style: const TextStyle(fontSize: 13, color: Slate.c500, height: 1.45),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: controller,
              autofocus: true,
              decoration: const InputDecoration(hintText: 'ReactJS, React, React.js'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              final parts = controller.text
                  .split(',')
                  .map((p) => p.trim())
                  .where((p) => p.isNotEmpty)
                  .toList();
              Navigator.of(context).pop(parts);
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  Question _copyWithAnswers(Question q, List<String> answers) {
    return Question(
      questionNumber: q.questionNumber,
      questionType: q.questionType,
      section: q.section,
      sectionNumber: q.sectionNumber,
      questionText: q.questionText,
      correctAnswers: answers,
      choices: q.choices,
      // For Modified True or False the truth value and the correct answer are
      // the same field on the paper, so they move together.
      truthValue: q.questionType == 'modified-true-false'
          ? (answers.isEmpty ? null : answers.first)
          : q.truthValue,
      correctionAnswers: q.correctionAnswers,
      enumerationCount: q.questionType == 'enumeration' ? answers.length : q.enumerationCount,
      points: q.points,
    );
  }
}
