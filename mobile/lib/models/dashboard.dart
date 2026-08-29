import 'exam.dart';
import 'result.dart';
import 'user.dart';

/// One bar of the "answer sheets checked" or "score distribution" charts.
class ChartPoint {
  const ChartPoint({required this.label, required this.value});

  final String label;
  final double value;
}

class DashboardStats {
  const DashboardStats({
    this.totalExams = 0,
    this.totalChecked = 0,
    this.totalStudents = 0,
    this.averageScore = 0,
    this.passRate = 0,
    this.distribution = const [],
    this.checkedOverTime = const [],
    this.examPerformance = const [],
    this.recentExams = const [],
    this.recentResults = const [],
  });

  factory DashboardStats.fromJson(Map<String, dynamic> json) {
    final summary = (json['summary'] as Map<String, dynamic>?) ?? const {};
    final charts = (json['charts'] as Map<String, dynamic>?) ?? const {};

    return DashboardStats(
      totalExams: asInt(summary['totalExams']),
      totalChecked: asInt(summary['totalChecked']),
      totalStudents: asInt(summary['totalStudents']),
      averageScore: asDouble(summary['averageScore']),
      passRate: asDouble(summary['passRate']),
      distribution: _points(charts['distribution'], 'range', 'count'),
      checkedOverTime: _points(charts['checkedOverTime'], 'label', 'count'),
      examPerformance: _points(
        charts['examPerformance'],
        'exam',
        'averagePercentage',
      ),
      recentExams: _list(json['recentExams'], Exam.fromJson),
      recentResults: _list(json['recentResults'], Result.fromJson),
    );
  }

  final int totalExams;
  final int totalChecked;
  final int totalStudents;
  final double averageScore;
  final double passRate;

  final List<ChartPoint> distribution;
  final List<ChartPoint> checkedOverTime;
  final List<ChartPoint> examPerformance;
  final List<Exam> recentExams;
  final List<Result> recentResults;

  /// Charts render an empty state rather than a flat line at zero, which reads
  /// as data when it is really an absence of it.
  bool get hasCheckedAnything => totalChecked > 0;

  static List<ChartPoint> _points(
    dynamic raw,
    String labelKey,
    String valueKey,
  ) {
    if (raw is! List) return const [];
    return raw.whereType<Map<String, dynamic>>().map((row) {
      return ChartPoint(
        label: asString(row[labelKey]),
        value: asDouble(row[valueKey]),
      );
    }).toList();
  }

  static List<T> _list<T>(
    dynamic raw,
    T Function(Map<String, dynamic>) parse,
  ) {
    if (raw is! List) return const [];
    return raw.whereType<Map<String, dynamic>>().map(parse).toList();
  }
}
