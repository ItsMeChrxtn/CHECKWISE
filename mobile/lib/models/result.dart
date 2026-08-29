import 'package:flutter/material.dart';

import '../core/theme.dart';
import 'exam.dart';
import 'user.dart';

/// How one question was answered on one paper.
///
/// `status` separates the three things a teacher needs to tell apart: the
/// scanner read a mark and it was right or wrong; it read nothing it trusts, so
/// a person must look; or the item is not machine-readable at all and is
/// waiting to be typed in.
class Answer {
  const Answer({
    required this.questionNumber,
    required this.status,
    this.section = '',
    this.sectionNumber,
    this.questionType = '',
    this.studentAnswer = '',
    this.correctAnswer = '',
    this.pointsPossible = 1,
    this.pointsEarned = 0,
    this.confidence = 0,
    this.writeInCrop,
    this.manuallyCorrected = false,
  });

  factory Answer.fromJson(Map<String, dynamic> json) {
    return Answer(
      questionNumber: asInt(json['questionNumber']),
      status: asString(json['status']),
      section: asString(json['section']),
      sectionNumber: json['sectionNumber'] == null
          ? null
          : asInt(json['sectionNumber']),
      questionType: asString(json['questionType']),
      studentAnswer: asString(json['studentAnswer']),
      correctAnswer: asString(json['correctAnswer']),
      pointsPossible: asDouble(json['pointsPossible'], 1),
      pointsEarned: asDouble(json['pointsEarned']),
      confidence: asDouble(json['confidence']),
      writeInCrop: json['writeInCrop'] == null
          ? null
          : asString(json['writeInCrop']),
      manuallyCorrected: asBool(json['manuallyCorrected']),
    );
  }

  final int questionNumber;
  final String status;
  final String section;
  final int? sectionNumber;
  final String questionType;
  final String studentAnswer;
  final String correctAnswer;
  final double pointsPossible;
  final double pointsEarned;

  /// 0–1, from how much darker the chosen bubble was than the runner-up.
  final double confidence;

  /// The strip of the scan showing what the student wrote, when there is one.
  final String? writeInCrop;
  final bool manuallyCorrected;

  int get displayNumber => sectionNumber ?? questionNumber;

  /// Bubbled items are corrected by picking from their fixed set of choices;
  /// written ones need a keyboard.
  bool get isBubbleQuestion => bubbleQuestionTypes.contains(questionType);

  /// The three states that need a person: an unread mark, two equally dark
  /// marks, or a written answer still to be typed in.
  bool get needsAttention =>
      status == 'blank' || status == 'ambiguous' || status == 'needs-review';

  String get statusLabel => switch (status) {
    'correct' => 'Correct',
    'partial' => 'Partial',
    'wrong' => 'Wrong',
    'blank' => 'Blank',
    'ambiguous' => 'Unclear',
    'needs-review' => 'Needs review',
    _ => status,
  };

  Color get statusColor => switch (status) {
    'correct' => Signal.pass,
    'partial' => Signal.warn,
    'wrong' => Signal.fail,
    'blank' || 'ambiguous' || 'needs-review' => Signal.warn,
    _ => Slate.c500,
  };

  Color get statusBackground => switch (status) {
    'correct' => Signal.passSoft,
    'wrong' => Signal.failSoft,
    _ => Signal.warnSoft,
  };

  IconData get statusIcon => switch (status) {
    'correct' => Icons.check_circle_rounded,
    'partial' => Icons.adjust_rounded,
    'wrong' => Icons.cancel_rounded,
    'blank' => Icons.radio_button_unchecked_rounded,
    'ambiguous' => Icons.help_rounded,
    'needs-review' => Icons.edit_note_rounded,
    _ => Icons.circle_outlined,
  };
}

class Result {
  const Result({
    required this.id,
    required this.examId,
    required this.studentName,
    this.studentId = '',
    this.answers = const [],
    this.totalQuestions = 0,
    this.correctAnswers = 0,
    this.wrongAnswers = 0,
    this.blankAnswers = 0,
    this.ambiguousAnswers = 0,
    this.pendingReview = 0,
    this.score = 0,
    this.totalPoints = 0,
    this.percentage = 0,
    this.passed = false,
    this.scannedPages = const [],
    this.examTitle = '',
    this.createdAt,
  });

  factory Result.fromJson(Map<String, dynamic> json) {
    final answers = json['answers'];
    final exam = json['examId'];

    return Result(
      id: asId(json),
      // Populated on some list routes, a bare id on others.
      examId: exam is Map<String, dynamic> ? asId(exam) : asString(exam),
      examTitle: exam is Map<String, dynamic> ? asString(exam['title']) : '',
      studentName: asString(json['studentName']),
      studentId: asString(json['studentId']),
      answers: answers is List
          ? answers
                .whereType<Map<String, dynamic>>()
                .map(Answer.fromJson)
                .toList()
          : const [],
      totalQuestions: asInt(json['totalQuestions']),
      correctAnswers: asInt(json['correctAnswers']),
      wrongAnswers: asInt(json['wrongAnswers']),
      blankAnswers: asInt(json['blankAnswers']),
      ambiguousAnswers: asInt(json['ambiguousAnswers']),
      pendingReview: asInt(json['pendingReview']),
      score: asDouble(json['score']),
      totalPoints: asDouble(json['totalPoints']),
      percentage: asDouble(json['percentage']),
      passed: asBool(json['passed']),
      scannedPages: asStringList(json['scannedPages']),
      createdAt: asDate(json['createdAt']),
    );
  }

  final String id;
  final String examId;
  final String examTitle;
  final String studentName;
  final String studentId;
  final List<Answer> answers;
  final int totalQuestions;
  final int correctAnswers;
  final int wrongAnswers;
  final int blankAnswers;
  final int ambiguousAnswers;

  /// Written items still waiting to be typed in by the teacher.
  final int pendingReview;
  final double score;
  final double totalPoints;
  final double percentage;
  final bool passed;
  final List<String> scannedPages;
  final DateTime? createdAt;

  /// Anything the scanner refused to decide: unread marks, unclear marks, and
  /// written answers it could not read.
  int get needsAttentionCount =>
      pendingReview + ambiguousAnswers + blankAnswers;

  bool get needsAttention => needsAttentionCount > 0;

  /// A paper scanned without a name is numbered `Paper 3` by the server.
  bool get isUnnamed => RegExp(r'^Paper \d+$').hasMatch(studentName);

  Color get scoreColor => passed ? Signal.pass : Signal.fail;
}
