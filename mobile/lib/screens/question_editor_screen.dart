import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/formatters.dart';
import '../core/theme.dart';
import '../models/exam.dart';
import '../widgets/common.dart';

/// Write or edit one question by hand.
///
/// The six types the grader understands each need different things, so the form
/// swaps its middle section rather than showing every field and hoping the
/// teacher knows which ones apply. Choosing "True or False" should not leave a
/// choices editor on screen.
///
/// Nothing is sent from here. The caller collects the questions and saves them
/// in one `PUT /exams/:id/questions`, which is also what the PDF path produces —
/// so an exam built by hand and one read from a paper are the same thing by the
/// time they reach the server.
class QuestionEditorScreen extends StatefulWidget {
  const QuestionEditorScreen({
    super.key,
    this.question,
    this.defaultSection = '',
    this.defaultType = 'multiple-choice',
  });

  /// Null when adding.
  final Question? question;
  final String defaultSection;
  final String defaultType;

  bool get isEditing => question != null;

  @override
  State<QuestionEditorScreen> createState() => _QuestionEditorScreenState();
}

class _QuestionEditorScreenState extends State<QuestionEditorScreen> {
  final _formKey = GlobalKey<FormState>();

  late String _type = widget.question?.questionType ?? widget.defaultType;
  late final _section = TextEditingController(
    text: widget.question?.section ?? widget.defaultSection,
  );
  late final _text = TextEditingController(text: widget.question?.questionText ?? '');
  late final _points = TextEditingController(
    text: marks(widget.question?.points ?? 1),
  );

  /// Multiple choice: the option texts, in A–H order.
  late final List<TextEditingController> _choices = _initialChoices();
  late int _correctIndex = _initialCorrectIndex();

  /// True or False, and the truth half of Modified True or False.
  late String _truth = _initialTruth();

  /// Identification, fill in the blanks, and the correction half of Modified.
  late final _answers = TextEditingController(text: _initialAnswers());

  /// Enumeration: one item per row.
  late final List<TextEditingController> _items = _initialItems();

  List<TextEditingController> _initialChoices() {
    final existing = widget.question?.choices ?? const [];
    final seed = existing.isNotEmpty ? existing : const ['', '', '', ''];
    return seed.map((c) => TextEditingController(text: c)).toList();
  }

  int _initialCorrectIndex() {
    final answers = widget.question?.correctAnswers ?? const [];
    if (answers.isEmpty) return 0;
    final letter = answers.first.trim().toUpperCase();
    if (letter.length == 1) {
      final index = letter.codeUnitAt(0) - 65;
      if (index >= 0 && index < 8) return index;
    }
    return 0;
  }

  String _initialTruth() {
    final q = widget.question;
    if (q == null) return 'TRUE';
    if (q.questionType == 'modified-true-false') return q.truthValue ?? 'TRUE';
    final first = q.correctAnswers.isEmpty ? 'TRUE' : q.correctAnswers.first.toUpperCase();
    return first == 'FALSE' ? 'FALSE' : 'TRUE';
  }

  String _initialAnswers() {
    final q = widget.question;
    if (q == null) return '';
    if (q.questionType == 'modified-true-false') return q.correctionAnswers.join(', ');
    if (q.questionType == 'enumeration') return '';
    return q.correctAnswers.join(', ');
  }

  List<TextEditingController> _initialItems() {
    final q = widget.question;
    final seed = (q != null && q.questionType == 'enumeration' && q.correctAnswers.isNotEmpty)
        ? q.correctAnswers
        : const ['', ''];
    return seed.map((c) => TextEditingController(text: c)).toList();
  }

  @override
  void dispose() {
    _section.dispose();
    _text.dispose();
    _points.dispose();
    _answers.dispose();
    for (final c in _choices) {
      c.dispose();
    }
    for (final c in _items) {
      c.dispose();
    }
    super.dispose();
  }

  bool get _isChoice => _type == 'multiple-choice';
  bool get _isTrueFalse => _type == 'true-false';
  bool get _isModified => _type == 'modified-true-false';
  bool get _isEnumeration => _type == 'enumeration';

  void _save() {
    FocusScope.of(context).unfocus();
    if (!_formKey.currentState!.validate()) return;

    final points = double.tryParse(_points.text.trim()) ?? 1;
    final section = _section.text.trim();
    final text = _text.text.trim();

    late final Question built;

    if (_isChoice) {
      final choices = _choices.map((c) => c.text.trim()).where((c) => c.isNotEmpty).toList();
      built = Question(
        questionNumber: widget.question?.questionNumber ?? 0,
        questionType: _type,
        section: section,
        sectionNumber: widget.question?.sectionNumber,
        questionText: text,
        choices: choices,
        correctAnswers: [String.fromCharCode(65 + _correctIndex)],
        points: points,
      );
    } else if (_isTrueFalse) {
      built = Question(
        questionNumber: widget.question?.questionNumber ?? 0,
        questionType: _type,
        section: section,
        sectionNumber: widget.question?.sectionNumber,
        questionText: text,
        choices: const ['TRUE', 'FALSE'],
        correctAnswers: [_truth],
        points: points,
      );
    } else if (_isModified) {
      built = Question(
        questionNumber: widget.question?.questionNumber ?? 0,
        questionType: _type,
        section: section,
        sectionNumber: widget.question?.sectionNumber,
        questionText: text,
        choices: const ['TRUE', 'FALSE'],
        correctAnswers: [_truth],
        truthValue: _truth,
        correctionAnswers: _splitAnswers(_answers.text),
        points: points,
      );
    } else if (_isEnumeration) {
      final items = _items.map((c) => c.text.trim()).where((c) => c.isNotEmpty).toList();
      built = Question(
        questionNumber: widget.question?.questionNumber ?? 0,
        questionType: _type,
        section: section,
        sectionNumber: widget.question?.sectionNumber,
        questionText: text,
        correctAnswers: items,
        enumerationCount: items.length,
        points: points,
      );
    } else {
      built = Question(
        questionNumber: widget.question?.questionNumber ?? 0,
        questionType: _type,
        section: section,
        sectionNumber: widget.question?.sectionNumber,
        questionText: text,
        correctAnswers: _splitAnswers(_answers.text),
        points: points,
      );
    }

    Navigator.of(context).pop(built);
  }

  List<String> _splitAnswers(String raw) => raw
      .split(',')
      .map((p) => p.trim())
      .where((p) => p.isNotEmpty)
      .toList();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.isEditing ? 'Edit question' : 'New question'),
        actions: [
          TextButton(onPressed: _save, child: const Text('Save')),
        ],
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          children: [
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Eyebrow('Question type'),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: questionTypeLabels.entries.map((entry) {
                      final selected = _type == entry.key;
                      return ChoiceChip(
                        label: Text(entry.value),
                        selected: selected,
                        showCheckmark: false,
                        labelStyle: TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                          color: selected ? Brand.c700 : Slate.c600,
                        ),
                        backgroundColor: Colors.white,
                        selectedColor: Brand.c50,
                        side: BorderSide(color: selected ? Brand.c300 : Slate.c200),
                        onSelected: (_) => setState(() => _type = entry.key),
                      );
                    }).toList(),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 12),
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Eyebrow('The question'),
                  const SizedBox(height: 14),
                  TextFormField(
                    controller: _text,
                    maxLines: 3,
                    minLines: 2,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: const InputDecoration(
                      labelText: 'Question text',
                      hintText: 'What does the useState hook return?',
                    ),
                    validator: (v) =>
                        (v ?? '').trim().isEmpty ? 'Write the question.' : null,
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        flex: 2,
                        child: TextFormField(
                          controller: _section,
                          textCapitalization: TextCapitalization.characters,
                          decoration: const InputDecoration(
                            labelText: 'Section (optional)',
                            hintText: 'TEST I: MULTIPLE CHOICE',
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: TextFormField(
                          controller: _points,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          inputFormatters: [
                            FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
                          ],
                          decoration: const InputDecoration(labelText: 'Points'),
                          validator: (v) {
                            final n = double.tryParse((v ?? '').trim());
                            if (n == null || n <= 0 || n > 100) return '1–100';
                            return null;
                          },
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(height: 12),
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Eyebrow('The answer'),
                  const SizedBox(height: 14),
                  ..._answerFields(),
                ],
              ),
            ),

            const SizedBox(height: 20),
            FilledButton(
              onPressed: _save,
              child: Text(widget.isEditing ? 'Save question' : 'Add question'),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _answerFields() {
    if (_isChoice) return _choiceFields();
    if (_isTrueFalse) return _truthFields(label: 'The correct answer');
    if (_isModified) return [..._truthFields(label: 'Is the statement true?'), ..._correctionFields()];
    if (_isEnumeration) return _enumerationFields();
    return _writtenFields();
  }

  List<Widget> _choiceFields() {
    return [
      const Text(
        'Write the options, then tap the one that is correct.',
        style: TextStyle(fontSize: 12.5, color: Slate.c500, height: 1.45),
      ),
      const SizedBox(height: 12),
      ...List.generate(_choices.length, (i) {
        final letter = String.fromCharCode(65 + i);
        final selected = _correctIndex == i;
        return Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Row(
            children: [
              InkWell(
                borderRadius: BorderRadius.circular(999),
                onTap: () => setState(() => _correctIndex = i),
                child: Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: selected ? Signal.passSoft : Colors.white,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: selected ? Signal.pass : Slate.c300,
                      width: selected ? 1.8 : 1,
                    ),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    letter,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: selected ? Signal.pass : Slate.c500,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TextFormField(
                  controller: _choices[i],
                  decoration: InputDecoration(hintText: 'Option $letter'),
                  validator: (v) {
                    // Only the marked answer is required to have text; a blank
                    // trailing option simply means fewer choices.
                    if (i == _correctIndex && (v ?? '').trim().isEmpty) {
                      return 'The correct option needs text.';
                    }
                    return null;
                  },
                ),
              ),
              if (_choices.length > 2)
                IconButton(
                  icon: const Icon(Icons.close_rounded, size: 18),
                  color: Slate.c400,
                  onPressed: () => setState(() {
                    _choices.removeAt(i).dispose();
                    if (_correctIndex >= _choices.length) _correctIndex = _choices.length - 1;
                  }),
                ),
            ],
          ),
        );
      }),
      if (_choices.length < 8)
        TextButton.icon(
          onPressed: () => setState(() => _choices.add(TextEditingController())),
          icon: const Icon(Icons.add_rounded, size: 17),
          label: const Text('Add option'),
        ),
    ];
  }

  List<Widget> _truthFields({required String label}) {
    return [
      Text(label, style: const TextStyle(fontSize: 12.5, color: Slate.c500)),
      const SizedBox(height: 10),
      Row(
        children: ['TRUE', 'FALSE'].map((value) {
          final selected = _truth == value;
          return Expanded(
            child: Padding(
              padding: EdgeInsets.only(right: value == 'TRUE' ? 10 : 0),
              child: InkWell(
                borderRadius: BorderRadius.circular(8),
                onTap: () => setState(() => _truth = value),
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  decoration: BoxDecoration(
                    color: selected ? Brand.c50 : Colors.white,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: selected ? Brand.c400 : Slate.c300),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    value,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: selected ? Brand.c700 : Slate.c500,
                    ),
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    ];
  }

  List<Widget> _correctionFields() {
    return [
      const SizedBox(height: 18),
      const Text(
        'If the statement is false, what word makes it true? Separate any '
        'spellings you will accept with commas.',
        style: TextStyle(fontSize: 12.5, color: Slate.c500, height: 1.45),
      ),
      const SizedBox(height: 10),
      TextFormField(
        controller: _answers,
        decoration: const InputDecoration(hintText: 'JavaScript, JS'),
        validator: (v) {
          if (_truth == 'FALSE' && (v ?? '').trim().isEmpty) {
            return 'A false statement needs its correction.';
          }
          return null;
        },
      ),
    ];
  }

  List<Widget> _writtenFields() {
    return [
      const Text(
        'Every spelling you will accept, separated by commas. Any one of them '
        'earns the mark.',
        style: TextStyle(fontSize: 12.5, color: Slate.c500, height: 1.45),
      ),
      const SizedBox(height: 10),
      TextFormField(
        controller: _answers,
        decoration: const InputDecoration(hintText: 'ReactJS, React, React.js'),
        validator: (v) =>
            (v ?? '').trim().isEmpty ? 'Give at least one accepted answer.' : null,
      ),
    ];
  }

  List<Widget> _enumerationFields() {
    return [
      const Text(
        'Every item the student must list. One per row — each correct item earns '
        'a share of the marks.',
        style: TextStyle(fontSize: 12.5, color: Slate.c500, height: 1.45),
      ),
      const SizedBox(height: 12),
      ...List.generate(_items.length, (i) {
        return Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Row(
            children: [
              SizedBox(
                width: 26,
                child: Text(
                  '${i + 1}.',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: Slate.c400,
                  ),
                ),
              ),
              Expanded(
                child: TextFormField(
                  controller: _items[i],
                  decoration: const InputDecoration(hintText: 'HTML'),
                  validator: (v) =>
                      i == 0 && (v ?? '').trim().isEmpty ? 'List at least one item.' : null,
                ),
              ),
              if (_items.length > 1)
                IconButton(
                  icon: const Icon(Icons.close_rounded, size: 18),
                  color: Slate.c400,
                  onPressed: () => setState(() => _items.removeAt(i).dispose()),
                ),
            ],
          ),
        );
      }),
      TextButton.icon(
        onPressed: () => setState(() => _items.add(TextEditingController())),
        icon: const Icon(Icons.add_rounded, size: 17),
        label: const Text('Add item'),
      ),
    ];
  }
}
