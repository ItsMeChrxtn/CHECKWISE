import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/formatters.dart';
import '../core/theme.dart';
import '../models/result.dart';
import '../services/services.dart';
import '../widgets/common.dart';
import 'exam_detail_screen.dart' show ResultCard;

/// Every paper this teacher has scanned, newest first.
///
/// The flagged filter is the point of the screen: a stack can be scanned
/// quickly and the handful that need a person picked out afterwards.
class ResultsScreen extends StatefulWidget {
  const ResultsScreen({super.key});

  @override
  State<ResultsScreen> createState() => _ResultsScreenState();
}

class _ResultsScreenState extends State<ResultsScreen> {
  List<Result> _results = const [];
  bool _loading = true;
  String? _error;
  bool _onlyAttention = false;

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
      final results = await context.read<ResultService>().listAll();
      if (!mounted) return;
      setState(() {
        _results = results;
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

  @override
  Widget build(BuildContext context) {
    final flagged = _results.where((r) => r.needsAttention).length;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Results'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: _loading ? null : _load,
          ),
        ],
        bottom: flagged == 0
            ? null
            : PreferredSize(
                preferredSize: const Size.fromHeight(52),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: FilterChip(
                      label: Text(
                        '$flagged ${plural(flagged, "paper")} to review',
                        style: const TextStyle(fontSize: 12.5),
                      ),
                      selected: _onlyAttention,
                      showCheckmark: false,
                      avatar: Icon(
                        Icons.priority_high_rounded,
                        size: 15,
                        color: _onlyAttention ? Signal.warn : Slate.c500,
                      ),
                      backgroundColor: Colors.white,
                      selectedColor: Signal.warnSoft,
                      side: BorderSide(
                        color: _onlyAttention ? Signal.warn : Slate.c200,
                      ),
                      onSelected: (value) =>
                          setState(() => _onlyAttention = value),
                    ),
                  ),
                ),
              ),
      ),
      body: RefreshIndicator(onRefresh: _load, child: _buildBody()),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());

    if (_error != null) {
      return ListView(
        children: [
          SizedBox(
            height: MediaQuery.sizeOf(context).height * 0.55,
            child: ErrorState(message: _error!, onRetry: _load),
          ),
        ],
      );
    }

    final shown = _onlyAttention
        ? _results.where((r) => r.needsAttention).toList()
        : _results;

    if (shown.isEmpty) {
      return ListView(
        children: [
          SizedBox(
            height: MediaQuery.sizeOf(context).height * 0.55,
            child: EmptyState(
              icon: _onlyAttention
                  ? Icons.check_circle_outline_rounded
                  : Icons.fact_check_outlined,
              title: _onlyAttention ? 'Nothing to review' : 'No papers yet',
              message: _onlyAttention
                  ? 'Every scanned paper has been settled.'
                  : 'Open an exam and scan a completed answer sheet — the '
                        'scores will collect here.',
            ),
          ),
        ],
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      itemCount: shown.length,
      separatorBuilder: (_, _) => const SizedBox(height: 10),
      itemBuilder: (context, index) => ResultCard(
        result: shown[index],
        onChanged: _load,
        showExam: true,
      ),
    );
  }
}
