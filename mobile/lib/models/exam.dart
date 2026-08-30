import 'user.dart';

/// The six question types CheckWise understands, and their human labels.
/// Kept in step with `server/models/Exam.js`.
const questionTypeLabels = <String, String>{
  'multiple-choice': 'Multiple Choice',
  'true-false': 'True or False',
  'modified-true-false': 'Modified True or False',
  'identification': 'Identification',
  'fill-in-the-blanks': 'Fill in the Blanks',
  'enumeration': 'Enumeration',
};

/// Bubble types are read by the OMR pass; the rest are handwriting, and are the
/// ones a teacher may still have to type in.
const bubbleQuestionTypes = <String>{
  'multiple-choice',
  'true-false',
  'modified-true-false',
};

String questionTypeLabel(String type) => questionTypeLabels[type] ?? type;

class Question {
  const Question({
    required this.questionNumber,
    required this.questionType,
    this.section = '',
    this.sectionNumber,
    this.questionText = '',
    this.correctAnswers = const [],
    this.choices = const [],
    this.truthValue,
    this.correctionAnswers = const [],
    this.enumerationCount,
    this.points = 1,
  });

  factory Question.fromJson(Map<String, dynamic> json) {
    return Question(
      questionNumber: asInt(json['questionNumber']),
      questionType: asString(json['questionType']),
      section: asString(json['section']),
      sectionNumber: json['sectionNumber'] == null
          ? null
          : asInt(json['sectionNumber']),
      questionText: asString(json['questionText']),
      correctAnswers: asStringList(json['correctAnswers']),
      choices: asStringList(json['choices']),
      truthValue: json['truthValue'] == null
          ? null
          : asString(json['truthValue']),
      correctionAnswers: asStringList(json['correctionAnswers']),
      enumerationCount: json['enumerationCount'] == null
          ? null
          : asInt(json['enumerationCount']),
      points: asDouble(json['points'], 1),
    );
  }

  final int questionNumber;
  final String questionType;
  final String section;
  final int? sectionNumber;
  final String questionText;

  /// Acceptable variations for written types; the distinct items for
  /// enumeration.
  final List<String> correctAnswers;
  final List<String> choices;
  final String? truthValue;
  final List<String> correctionAnswers;
  final int? enumerationCount;
  final double points;

  /// What the student sees printed on the paper, which restarts per section.
  int get displayNumber => sectionNumber ?? questionNumber;

  bool get isBubbled => bubbleQuestionTypes.contains(questionType);
}

/// One page of an exam list, matching the API's `pagination` block.
class Pagination {
  const Pagination({
    this.page = 1,
    this.limit = 10,
    this.total = 0,
    this.totalPages = 1,
    this.hasPrev = false,
    this.hasNext = false,
  });

  factory Pagination.fromJson(Map<String, dynamic> json) {
    return Pagination(
      page: asInt(json['page'], 1),
      limit: asInt(json['limit'], 10),
      total: asInt(json['total']),
      totalPages: asInt(json['totalPages'], 1),
      hasPrev: asBool(json['hasPrev']),
      hasNext: asBool(json['hasNext']),
    );
  }

  final int page;
  final int limit;
  final int total;
  final int totalPages;
  final bool hasPrev;
  final bool hasNext;
}

class ExamPage {
  const ExamPage({required this.exams, required this.pagination});

  factory ExamPage.fromJson(Map<String, dynamic> json) {
    final list = json['exams'];
    return ExamPage(
      exams: list is List
          ? list
                .whereType<Map<String, dynamic>>()
                .map(Exam.fromJson)
                .toList()
          : const [],
      pagination: Pagination.fromJson(
        (json['pagination'] as Map<String, dynamic>?) ?? const {},
      ),
    );
  }

  final List<Exam> exams;
  final Pagination pagination;
}

class Exam {
  const Exam({
    required this.id,
    required this.title,
    required this.subject,
    required this.examCode,
    required this.status,
    this.description = '',
    this.passingScore = 75,
    this.totalQuestions = 0,
    this.totalPoints = 0,
    this.answerKeyConfirmed = false,
    this.hasAnswerSheet = false,
    this.hasExamPdf = false,
    this.strictWrittenAnswers = true,
    this.modifiedTrueFalseScoring = 'whole',
    this.questions = const [],
    this.createdAt,
    this.updatedAt,
  });

  factory Exam.fromJson(Map<String, dynamic> json) {
    final grading = (json['gradingConfig'] as Map<String, dynamic>?) ?? const {};
    final questions = json['questions'];

    return Exam(
      id: asId(json),
      title: asString(json['title']),
      subject: asString(json['subject']),
      examCode: asString(json['examCode']),
      status: asString(json['status'], 'draft'),
      description: asString(json['description']),
      passingScore: asInt(json['passingScore'], 75),
      totalQuestions: asInt(json['totalQuestions']),
      totalPoints: asDouble(json['totalPoints']),
      answerKeyConfirmed: asBool(json['answerKeyConfirmed']),
      // The layout is written only when the printable sheet has been built,
      // and the scanner cannot read a paper without it.
      hasAnswerSheet: json['answerSheetLayout'] != null ||
          json['answerSheetPath'] != null,
      hasExamPdf: json['examPdfPath'] != null,
      strictWrittenAnswers: asBool(grading['strictWrittenAnswers'], true),
      modifiedTrueFalseScoring:
          asString(grading['modifiedTrueFalseScoring'], 'whole'),
      // Absent from list rows, which select the questions array away.
      questions: questions is List
          ? questions
                .whereType<Map<String, dynamic>>()
                .map(Question.fromJson)
                .toList()
          : const [],
      createdAt: asDate(json['createdAt']),
      updatedAt: asDate(json['updatedAt']),
    );
  }

  final String id;
  final String title;
  final String subject;
  final String examCode;
  final String status;
  final String description;
  final int passingScore;
  final int totalQuestions;
  final double totalPoints;
  final bool answerKeyConfirmed;
  final bool hasAnswerSheet;
  final bool hasExamPdf;
  final bool strictWrittenAnswers;

  /// "whole" — one point, and both halves must be right.
  /// "split" — the truth value and the correction score independently.
  final String modifiedTrueFalseScoring;
  final List<Question> questions;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  String get statusLabel => switch (status) {
    'ready' => 'Ready',
    'needs-review' => 'Needs review',
    _ => 'Draft',
  };

  /// A paper can only be scored against a confirmed key, and only read with the
  /// geometry the sheet was printed with.
  bool get canScan => status == 'ready' && hasAnswerSheet;

  /// Why scanning is unavailable, phrased for the teacher. Both blockers are
  /// fixable on the phone now, so these name the step rather than send them
  /// somewhere else.
  String? get scanBlockedReason {
    if (status != 'ready') {
      return 'Confirm this exam’s answer key before scanning papers.';
    }
    if (!hasAnswerSheet) {
      return 'Generate this exam’s answer sheet first — the scanner reads its '
          'layout to know where the bubbles are.';
    }
    return null;
  }

  /// Sections in printed order, for grouping the review screen.
  List<String> get sections {
    final seen = <String>[];
    for (final question in questions) {
      if (question.section.isNotEmpty && !seen.contains(question.section)) {
        seen.add(question.section);
      }
    }
    return seen;
  }
}
