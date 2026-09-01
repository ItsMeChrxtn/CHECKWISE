import 'user.dart';

/// How a class did on every item, rather than how each student did overall.
///
/// The figures are computed on the server so the phone and the browser can
/// never disagree about them; this only carries them. Kept in step with
/// `server/services/analysisService.js` and `client/src/components/ExamAnalysisPanel.jsx`.
class ExamAnalysis {
  const ExamAnalysis({required this.summary, required this.items});

  factory ExamAnalysis.fromJson(Map<String, dynamic> json) {
    final items = json['items'];

    return ExamAnalysis(
      summary: AnalysisSummary.fromJson(
        (json['summary'] as Map<String, dynamic>?) ?? const {},
      ),
      items: items is List
          ? items
                .whereType<Map<String, dynamic>>()
                .map(ItemAnalysis.fromJson)
                .toList()
          : const [],
    );
  }

  final AnalysisSummary summary;
  final List<ItemAnalysis> items;

  /// Items the strong students got wrong more often than the weak ones, which
  /// almost always means the wording or the key needs another look.
  List<ItemAnalysis> get flagged =>
      items.where((i) => i.discrimination != null && i.discrimination! < 0).toList();
}

class AnalysisSummary {
  const AnalysisSummary({
    required this.papers,
    required this.passed,
    required this.failed,
    required this.mean,
    required this.meanPercentage,
    required this.median,
    required this.stdDev,
    required this.highest,
    required this.lowest,
    required this.totalPoints,
    required this.pendingReview,
    required this.alpha,
  });

  factory AnalysisSummary.fromJson(Map<String, dynamic> json) => AnalysisSummary(
        papers: asInt(json['papers']),
        passed: asInt(json['passed']),
        failed: asInt(json['failed']),
        mean: asDouble(json['mean']),
        meanPercentage: asDouble(json['meanPercentage']),
        median: asDouble(json['median']),
        stdDev: asDouble(json['stdDev']),
        highest: asDouble(json['highest']),
        lowest: asDouble(json['lowest']),
        totalPoints: asDouble(json['totalPoints']),
        pendingReview: asInt(json['pendingReview']),
        // Null until there are two papers and two items to correlate.
        alpha: json['alpha'] == null ? null : asDouble(json['alpha']),
      );

  final int papers;
  final int passed;
  final int failed;
  final double mean;
  final double meanPercentage;
  final double median;
  final double stdDev;
  final double highest;
  final double lowest;
  final double totalPoints;
  final int pendingReview;

  /// Cronbach's alpha over the item marks.
  final double? alpha;

  String get alphaLabel {
    final value = alpha;
    if (value == null) return 'needs 2+ papers';
    if (value >= 0.9) return 'excellent';
    if (value >= 0.8) return 'good';
    if (value >= 0.7) return 'acceptable';
    if (value >= 0.6) return 'questionable';
    return 'low';
  }
}

class ItemAnalysis {
  const ItemAnalysis({
    required this.questionNumber,
    required this.section,
    required this.questionType,
    required this.correctAnswer,
    required this.pointsPossible,
    required this.attempts,
    required this.graded,
    required this.correct,
    required this.wrong,
    required this.blank,
    required this.pending,
    required this.difficulty,
    required this.difficultyLabel,
    required this.discrimination,
    required this.discriminationLabel,
    required this.choices,
  });

  factory ItemAnalysis.fromJson(Map<String, dynamic> json) {
    final choices = json['choices'];

    return ItemAnalysis(
      questionNumber: asInt(json['questionNumber']),
      section: asString(json['section']),
      questionType: asString(json['questionType']),
      correctAnswer: asString(json['correctAnswer']),
      pointsPossible: asDouble(json['pointsPossible'], 1),
      attempts: asInt(json['attempts']),
      graded: asInt(json['graded']),
      correct: asInt(json['correct']),
      wrong: asInt(json['wrong']),
      blank: asInt(json['blank']),
      pending: asInt(json['pending']),
      // Null while every answer to this item is still waiting on a person.
      difficulty: json['difficulty'] == null ? null : asDouble(json['difficulty']),
      difficultyLabel: asString(json['difficultyLabel']),
      discrimination:
          json['discrimination'] == null ? null : asDouble(json['discrimination']),
      discriminationLabel: asString(json['discriminationLabel']),
      choices: choices is List
          ? choices
                .whereType<Map<String, dynamic>>()
                .map(GivenAnswer.fromJson)
                .toList()
          : const [],
    );
  }

  final int questionNumber;
  final String section;
  final String questionType;
  final String correctAnswer;
  final double pointsPossible;

  final int attempts;
  final int graded;
  final int correct;
  final int wrong;
  final int blank;
  final int pending;

  /// Share of papers that earned the mark, 0 to 1.
  final double? difficulty;
  final String difficultyLabel;

  /// Top 27% minus bottom 27% by total score.
  final double? discrimination;
  final String discriminationLabel;

  /// What was put down, most given first.
  final List<GivenAnswer> choices;

  GivenAnswer? get mostGiven => choices.isEmpty ? null : choices.first;
}

/// One answer people actually gave, and how many gave it.
class GivenAnswer {
  const GivenAnswer({
    required this.answer,
    required this.count,
    required this.correct,
  });

  factory GivenAnswer.fromJson(Map<String, dynamic> json) => GivenAnswer(
        answer: asString(json['answer']),
        count: asInt(json['count']),
        correct: asBool(json['correct']),
      );

  final String answer;
  final int count;
  final bool correct;
}
