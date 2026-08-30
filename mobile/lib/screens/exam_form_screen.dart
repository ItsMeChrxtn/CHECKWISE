import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/theme.dart';
import '../models/exam.dart';
import '../services/services.dart';
import '../widgets/common.dart';

/// Create an exam, or edit the details of one that exists.
///
/// Only the exam's own description lives here. Its questions come from the
/// uploaded PDF and are settled on the answer-key screen — typing a hundred
/// items into a phone is not a workflow anybody wants.
class ExamFormScreen extends StatefulWidget {
  const ExamFormScreen({super.key, this.exam});

  /// Null when creating.
  final Exam? exam;

  bool get isEditing => exam != null;

  @override
  State<ExamFormScreen> createState() => _ExamFormScreenState();
}

class _ExamFormScreenState extends State<ExamFormScreen> {
  final _formKey = GlobalKey<FormState>();
  late final _title = TextEditingController(text: widget.exam?.title ?? '');
  late final _subject = TextEditingController(text: widget.exam?.subject ?? '');
  late final _description = TextEditingController(text: widget.exam?.description ?? '');
  late final _passing = TextEditingController(
    text: (widget.exam?.passingScore ?? 75).toString(),
  );

  late String _mtfScoring = widget.exam?.modifiedTrueFalseScoring ?? 'whole';
  bool _busy = false;
  Map<String, String> _fieldErrors = const {};

  @override
  void dispose() {
    _title.dispose();
    _subject.dispose();
    _description.dispose();
    _passing.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _busy = true;
      _fieldErrors = const {};
    });

    final service = context.read<ExamService>();
    try {
      final exam = widget.isEditing
          ? await service.update(widget.exam!.id, {
              'title': _title.text.trim(),
              'subject': _subject.text.trim(),
              'description': _description.text.trim(),
              'passingScore': int.parse(_passing.text),
              'modifiedTrueFalseScoring': _mtfScoring,
            })
          : await service.create(
              title: _title.text.trim(),
              subject: _subject.text.trim(),
              description: _description.text.trim(),
              passingScore: int.parse(_passing.text),
              modifiedTrueFalseScoring: _mtfScoring,
            );

      if (!mounted) return;
      Navigator.of(context).pop(exam);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _fieldErrors = error.errors ?? const {};
      });
      _formKey.currentState!.validate();
      if (_fieldErrors.isEmpty) showToast(context, error.message, isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.isEditing ? 'Edit exam' : 'New exam')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
          children: [
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Eyebrow('The exam'),
                  const SizedBox(height: 14),
                  _Field(
                    controller: _title,
                    label: 'Title',
                    hint: 'Midterm Examination',
                    serverError: _fieldErrors['title'],
                    validator: (v) => (v ?? '').trim().length < 3
                        ? 'Give the exam a title of at least 3 characters.'
                        : null,
                  ),
                  const SizedBox(height: 14),
                  _Field(
                    controller: _subject,
                    label: 'Subject',
                    hint: 'Web Development',
                    serverError: _fieldErrors['subject'],
                    validator: (v) =>
                        (v ?? '').trim().length < 2 ? 'Name the subject.' : null,
                  ),
                  const SizedBox(height: 14),
                  _Field(
                    controller: _description,
                    label: 'Description (optional)',
                    hint: 'What this paper covers',
                    maxLines: 3,
                    serverError: _fieldErrors['description'],
                  ),
                ],
              ),
            ),

            const SizedBox(height: 12),
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Eyebrow('Marking'),
                  const SizedBox(height: 14),
                  _Field(
                    controller: _passing,
                    label: 'Passing score (%)',
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    serverError: _fieldErrors['passingScore'],
                    validator: (v) {
                      final n = int.tryParse(v ?? '');
                      if (n == null || n < 1 || n > 100) {
                        return 'Enter a number between 1 and 100.';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 18),

                  const Text(
                    'Modified True or False',
                    style: TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                      color: Slate.c800,
                    ),
                  ),
                  const SizedBox(height: 2),
                  const Text(
                    'How an item worth both a truth value and a correction is scored.',
                    style: TextStyle(fontSize: 12.5, color: Slate.c500, height: 1.4),
                  ),
                  const SizedBox(height: 10),
                  _ScoringChoice(
                    value: 'whole',
                    groupValue: _mtfScoring,
                    title: 'All or nothing',
                    subtitle: '1 point, and both the truth value and the correction must be right.',
                    onChanged: (v) => setState(() => _mtfScoring = v),
                  ),
                  const SizedBox(height: 8),
                  _ScoringChoice(
                    value: 'split',
                    groupValue: _mtfScoring,
                    title: 'Scored separately',
                    subtitle: '1 point for the truth value, 1 for the correction.',
                    onChanged: (v) => setState(() => _mtfScoring = v),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 20),
            FilledButton(
              onPressed: _busy ? null : _submit,
              child: _busy
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white),
                    )
                  : Text(widget.isEditing ? 'Save changes' : 'Create exam'),
            ),

            if (!widget.isEditing) ...[
              const SizedBox(height: 12),
              const Text(
                'Next you will upload the exam PDF, and CheckWise will read the '
                'questions and answer key out of it.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12.5, color: Slate.c500, height: 1.45),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ScoringChoice extends StatelessWidget {
  const _ScoringChoice({
    required this.value,
    required this.groupValue,
    required this.title,
    required this.subtitle,
    required this.onChanged,
  });

  final String value;
  final String groupValue;
  final String title;
  final String subtitle;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final selected = value == groupValue;

    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: () => onChanged(value),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: selected ? Brand.c50 : Colors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: selected ? Brand.c300 : Slate.c200),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              selected ? Icons.radio_button_checked : Icons.radio_button_unchecked,
              size: 18,
              color: selected ? Brand.c600 : Slate.c400,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                      color: selected ? Brand.c700 : Slate.c800,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: const TextStyle(fontSize: 12, color: Slate.c500, height: 1.4),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.controller,
    required this.label,
    this.hint,
    this.validator,
    this.keyboardType,
    this.inputFormatters,
    this.maxLines = 1,
    this.serverError,
  });

  final TextEditingController controller;
  final String label;
  final String? hint;
  final String? Function(String?)? validator;
  final TextInputType? keyboardType;
  final List<TextInputFormatter>? inputFormatters;
  final int maxLines;
  final String? serverError;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      inputFormatters: inputFormatters,
      maxLines: maxLines,
      textCapitalization: TextCapitalization.sentences,
      decoration: InputDecoration(labelText: label, hintText: hint),
      // The server's complaint wins: it knows things the phone cannot.
      validator: (value) => serverError ?? validator?.call(value),
    );
  }
}
