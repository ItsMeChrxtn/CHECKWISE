import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/formatters.dart';
import '../core/theme.dart';
import '../models/dashboard.dart';
import '../models/result.dart';
import '../services/services.dart';
import '../state/auth_controller.dart';
import '../widgets/common.dart';
import 'result_detail_screen.dart';

/// What is happening across the teacher's exams, at a glance.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  late Future<DashboardStats> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<DashboardService>().stats();
  }

  Future<void> _refresh() async {
    final future = context.read<DashboardService>().stats();
    setState(() => _future = future);
    await future.catchError((_) => const DashboardStats());
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthController>().user;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 14),
            child: Center(
              child: Container(
                width: 34,
                height: 34,
                decoration: const BoxDecoration(
                  color: Brand.c600,
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: Text(
                  initials(user?.name ?? ''),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<DashboardStats>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }

            if (snapshot.hasError) {
              return ListView(
                children: [
                  SizedBox(
                    height: MediaQuery.sizeOf(context).height * 0.6,
                    child: ErrorState(
                      message: snapshot.error is ApiException
                          ? (snapshot.error as ApiException).message
                          : 'Could not load your dashboard.',
                      onRetry: _refresh,
                    ),
                  ),
                ],
              );
            }

            final stats = snapshot.data ?? const DashboardStats();
            return _Body(stats: stats, greeting: user?.firstName ?? 'there');
          },
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.stats, required this.greeting});

  final DashboardStats stats;
  final String greeting;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
      children: [
        const Eyebrow('Teacher workspace'),
        const SizedBox(height: 7),
        Text(
          'Welcome back, $greeting',
          style: Type.heading(size: 23, weight: FontWeight.w700),
        ),
        const SizedBox(height: 4),
        const Text(
          'Here is what is happening across your exams.',
          style: TextStyle(fontSize: 13.5, color: Slate.c500),
        ),
        const SizedBox(height: 20),

        // The four headline figures stay ink: colour on this row would rank
        // them against each other, and they are not comparable.
        Row(
          children: [
            Expanded(
              child: StatCard(
                label: 'Total exams',
                value: '${stats.totalExams}',
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: StatCard(
                label: 'Sheets checked',
                value: '${stats.totalChecked}',
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: StatCard(
                label: 'Students',
                value: '${stats.totalStudents}',
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: StatCard(
                label: 'Average score',
                value: percent(stats.averageScore),
              ),
            ),
          ],
        ),

        const SizedBox(height: 10),
        // The one figure on the dashboard that is a verdict rather than a
        // count, so it takes the brass rule and the larger serif.
        AppCard(
          sealed: true,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SectionHeader(
                title: 'Pass rate',
                subtitle: 'Papers at or above the passing score',
              ),
              const SizedBox(height: 14),
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    percent(stats.passRate),
                    style: Type.figure(size: 32, color: Signal.pass),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(2),
                        child: LinearProgressIndicator(
                          value: (stats.passRate / 100).clamp(0, 1).toDouble(),
                          minHeight: 4,
                          backgroundColor: Slate.c200,
                          valueColor: const AlwaysStoppedAnimation(Signal.pass),
                        ),
                      ),
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
              const SectionHeader(
                title: 'Answer sheets checked',
                subtitle: 'Papers processed over the last 7 days',
              ),
              const SizedBox(height: 18),
              // The fixed height belongs to the chart, not to the placeholder:
              // an EmptyState is taller than 150px and would overflow it.
              if (stats.hasCheckedAnything)
                SizedBox(
                  height: 150,
                  child: _CheckedChart(points: stats.checkedOverTime),
                )
              else
                const EmptyState(
                  compact: true,
                  icon: Icons.show_chart_rounded,
                  title: 'Nothing checked yet',
                  message:
                      'Scan your first answer sheet and it will show up here.',
                ),
            ],
          ),
        ),

        const SizedBox(height: 12),
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SectionHeader(
                title: 'Score distribution',
                subtitle: 'How results are spread across bands',
              ),
              const SizedBox(height: 18),
              if (stats.hasCheckedAnything)
                SizedBox(
                  height: 160,
                  child: _DistributionChart(points: stats.distribution),
                )
              else
                const EmptyState(
                  compact: true,
                  icon: Icons.bar_chart_rounded,
                  title: 'No results yet',
                  message:
                      'Scan your first answer sheet and the distribution will '
                      'appear here.',
                ),
            ],
          ),
        ),

        const SizedBox(height: 12),
        AppCard(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SectionHeader(title: 'Recent results'),
              const SizedBox(height: 8),
              if (stats.recentResults.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(bottom: 8),
                  child: EmptyState(
                    compact: true,
                    icon: Icons.fact_check_outlined,
                    title: 'No results yet',
                    message: 'Checked answer sheets will be listed here.',
                  ),
                )
              else
                ...stats.recentResults
                    .take(5)
                    .map((result) => _RecentResultRow(result: result)),
            ],
          ),
        ),
      ],
    );
  }
}

class _RecentResultRow extends StatelessWidget {
  const _RecentResultRow({required this.result});

  final Result result;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ResultDetailScreen(resultId: result.id),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 11),
        child: Row(
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: result.scoreColor,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    result.studentName,
                    style: const TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                      color: Slate.c800,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 1),
                  Text(
                    formatDateTime(result.createdAt),
                    style: const TextStyle(fontSize: 11.5, color: Slate.c400),
                  ),
                ],
              ),
            ),
            Text(
              percent(result.percentage),
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: result.scoreColor,
              ),
            ),
            const Icon(Icons.chevron_right_rounded, color: Slate.c300),
          ],
        ),
      ),
    );
  }
}

/// A line of papers-per-day. The API already returns exactly seven points,
/// labelled in the server's own timezone.
class _CheckedChart extends StatelessWidget {
  const _CheckedChart({required this.points});

  final List<ChartPoint> points;

  @override
  Widget build(BuildContext context) {
    if (points.isEmpty) return const SizedBox.shrink();

    final maxValue = points
        .map((p) => p.value)
        .fold<double>(0, (a, b) => a > b ? a : b);

    return LineChart(
      LineChartData(
        minY: 0,
        // A flat run of zeroes would otherwise collapse the axis to a point.
        maxY: maxValue <= 0 ? 4 : maxValue * 1.25,
        gridData: FlGridData(
          show: true,
          drawVerticalLine: false,
          getDrawingHorizontalLine: (_) =>
              const FlLine(color: Slate.c100, strokeWidth: 1),
        ),
        borderData: FlBorderData(show: false),
        titlesData: FlTitlesData(
          topTitles: const AxisTitles(),
          rightTitles: const AxisTitles(),
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 28,
              getTitlesWidget: (value, meta) {
                if (value != value.roundToDouble()) {
                  return const SizedBox.shrink();
                }
                return Text(
                  value.round().toString(),
                  style: const TextStyle(fontSize: 10, color: Slate.c400),
                );
              },
            ),
          ),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 24,
              interval: 1,
              getTitlesWidget: (value, meta) {
                final index = value.round();
                if (index < 0 || index >= points.length) {
                  return const SizedBox.shrink();
                }
                return Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    points[index].label,
                    style: const TextStyle(fontSize: 10.5, color: Slate.c400),
                  ),
                );
              },
            ),
          ),
        ),
        lineBarsData: [
          LineChartBarData(
            spots: [
              for (var i = 0; i < points.length; i++)
                FlSpot(i.toDouble(), points[i].value),
            ],
            isCurved: true,
            curveSmoothness: 0.28,
            color: Brand.c600,
            barWidth: 2.6,
            dotData: FlDotData(
              show: true,
              getDotPainter: (spot, _, _, _) => FlDotCirclePainter(
                radius: 3.2,
                color: Colors.white,
                strokeWidth: 2,
                strokeColor: Brand.c600,
              ),
            ),
            belowBarData: BarAreaData(
              show: true,
              color: Brand.c600.withValues(alpha: 0.10),
            ),
          ),
        ],
      ),
    );
  }
}

/// Papers per score band, coloured from fail to pass so the shape reads at a
/// glance rather than needing the axis.
class _DistributionChart extends StatelessWidget {
  const _DistributionChart({required this.points});

  final List<ChartPoint> points;

  /// A muted fail → pass ramp. The band already carries its meaning in the
  /// axis label, so these only need to read as a progression, not shout.
  static const _colors = [
    Signal.fail,
    Color(0xFFB4623A),
    Signal.warn,
    Color(0xFF5C7A44),
    Signal.pass,
  ];

  @override
  Widget build(BuildContext context) {
    if (points.isEmpty) return const SizedBox.shrink();

    final maxValue = points
        .map((p) => p.value)
        .fold<double>(0, (a, b) => a > b ? a : b);

    return BarChart(
      BarChartData(
        minY: 0,
        maxY: maxValue <= 0 ? 4 : maxValue * 1.25,
        gridData: FlGridData(
          show: true,
          drawVerticalLine: false,
          getDrawingHorizontalLine: (_) =>
              const FlLine(color: Slate.c100, strokeWidth: 1),
        ),
        borderData: FlBorderData(show: false),
        titlesData: FlTitlesData(
          topTitles: const AxisTitles(),
          rightTitles: const AxisTitles(),
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 28,
              getTitlesWidget: (value, meta) {
                if (value != value.roundToDouble()) {
                  return const SizedBox.shrink();
                }
                return Text(
                  value.round().toString(),
                  style: const TextStyle(fontSize: 10, color: Slate.c400),
                );
              },
            ),
          ),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 30,
              getTitlesWidget: (value, meta) {
                final index = value.round();
                if (index < 0 || index >= points.length) {
                  return const SizedBox.shrink();
                }
                return Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    points[index].label,
                    style: const TextStyle(fontSize: 9.5, color: Slate.c400),
                  ),
                );
              },
            ),
          ),
        ),
        barGroups: [
          for (var i = 0; i < points.length; i++)
            BarChartGroupData(
              x: i,
              barRods: [
                BarChartRodData(
                  toY: points[i].value,
                  color: _colors[i % _colors.length],
                  width: 20,
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(5),
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }
}
