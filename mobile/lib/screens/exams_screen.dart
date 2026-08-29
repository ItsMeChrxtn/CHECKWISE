import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/formatters.dart';
import '../core/theme.dart';
import '../models/exam.dart';
import '../services/services.dart';
import '../widgets/common.dart';
import 'exam_detail_screen.dart';

/// The teacher's exams, searchable and filterable, paged as you scroll.
class ExamsScreen extends StatefulWidget {
  const ExamsScreen({super.key});

  @override
  State<ExamsScreen> createState() => _ExamsScreenState();
}

class _ExamsScreenState extends State<ExamsScreen> {
  final _search = TextEditingController();
  final _scroll = ScrollController();

  final List<Exam> _exams = [];
  Pagination _pagination = const Pagination();

  String _status = 'all';
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _onScroll() {
    final atEnd = _scroll.position.pixels >=
        _scroll.position.maxScrollExtent - 320;
    if (atEnd && !_loadingMore && !_loading && _pagination.hasNext) {
      _load(page: _pagination.page + 1, append: true);
    }
  }

  /// Typing filters the list, but not on every keystroke.
  void _onSearchChanged(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), _load);
  }

  Future<void> _load({int page = 1, bool append = false}) async {
    if (!mounted) return;
    setState(() {
      if (append) {
        _loadingMore = true;
      } else {
        _loading = true;
        _error = null;
      }
    });

    try {
      final result = await context.read<ExamService>().list(
        q: _search.text.trim(),
        status: _status,
        page: page,
      );
      if (!mounted) return;
      setState(() {
        if (append) {
          _exams.addAll(result.exams);
        } else {
          _exams
            ..clear()
            ..addAll(result.exams);
        }
        _pagination = result.pagination;
        _loading = false;
        _loadingMore = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _loading = false;
        _loadingMore = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Exams'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(108),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Column(
              children: [
                TextField(
                  controller: _search,
                  onChanged: _onSearchChanged,
                  textInputAction: TextInputAction.search,
                  decoration: InputDecoration(
                    hintText: 'Search title, subject or code',
                    isDense: true,
                    prefixIcon: const Icon(
                      Icons.search_rounded,
                      size: 20,
                      color: Slate.c400,
                    ),
                    suffixIcon: _search.text.isEmpty
                        ? null
                        : IconButton(
                            icon: const Icon(Icons.close_rounded, size: 18),
                            color: Slate.c400,
                            onPressed: () {
                              _search.clear();
                              _load();
                            },
                          ),
                  ),
                ),
                const SizedBox(height: 10),
                SizedBox(
                  height: 32,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: [
                      _filter('all', 'All'),
                      _filter('ready', 'Ready'),
                      _filter('needs-review', 'Needs review'),
                      _filter('draft', 'Draft'),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () => _load(),
        child: _buildBody(),
      ),
    );
  }

  Widget _filter(String value, String label) {
    final selected = _status == value;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(label),
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
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(3),
        ),
        onSelected: (_) {
          if (_status == value) return;
          setState(() => _status = value);
          _load();
        },
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return ListView(
        children: [
          SizedBox(
            height: MediaQuery.sizeOf(context).height * 0.55,
            child: ErrorState(message: _error!, onRetry: () => _load()),
          ),
        ],
      );
    }

    if (_exams.isEmpty) {
      final filtered = _search.text.trim().isNotEmpty || _status != 'all';
      return ListView(
        children: [
          SizedBox(
            height: MediaQuery.sizeOf(context).height * 0.55,
            child: EmptyState(
              icon: filtered
                  ? Icons.search_off_rounded
                  : Icons.assignment_outlined,
              title: filtered ? 'No exams match' : 'No exams yet',
              message: filtered
                  ? 'Try a different search or filter.'
                  : 'Create your exams on the CheckWise web app, then come '
                        'back here to scan the papers.',
            ),
          ),
        ],
      );
    }

    return ListView.separated(
      controller: _scroll,
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      itemCount: _exams.length + (_pagination.hasNext ? 1 : 0),
      separatorBuilder: (_, _) => const SizedBox(height: 10),
      itemBuilder: (context, index) {
        if (index >= _exams.length) {
          return const Padding(
            padding: EdgeInsets.symmetric(vertical: 20),
            child: Center(
              child: SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2.2),
              ),
            ),
          );
        }
        return _ExamCard(
          exam: _exams[index],
          onChanged: () => _load(),
        );
      },
    );
  }
}

class _ExamCard extends StatelessWidget {
  const _ExamCard({required this.exam, required this.onChanged});

  final Exam exam;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      onTap: () async {
        await Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => ExamDetailScreen(examId: exam.id),
          ),
        );
        onChanged();
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  exam.title,
                  style: Type.heading(size: 15.5, height: 1.3),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 10),
              Pill.examStatus(exam.status, exam.statusLabel),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              const Icon(Icons.menu_book_rounded, size: 13, color: Slate.c400),
              const SizedBox(width: 5),
              Flexible(
                child: Text(
                  exam.subject,
                  style: const TextStyle(fontSize: 12.5, color: Slate.c500),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 10),
              const Icon(Icons.tag_rounded, size: 13, color: Slate.c400),
              const SizedBox(width: 3),
              Text(
                exam.examCode,
                style: const TextStyle(
                  fontSize: 12,
                  color: Slate.c500,
                  fontFamily: 'monospace',
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          const Divider(),
          const SizedBox(height: 10),
          Row(
            children: [
              _Meta(
                icon: Icons.help_outline_rounded,
                label:
                    '${exam.totalQuestions} ${plural(exam.totalQuestions, "item")}',
              ),
              const SizedBox(width: 16),
              _Meta(
                icon: Icons.star_outline_rounded,
                label: '${marks(exam.totalPoints)} pts',
              ),
              const Spacer(),
              if (exam.canScan)
                const Row(
                  children: [
                    Icon(
                      Icons.document_scanner_rounded,
                      size: 13,
                      color: Signal.pass,
                    ),
                    SizedBox(width: 4),
                    Text(
                      'Scannable',
                      style: TextStyle(
                        fontSize: 11.5,
                        color: Signal.pass,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                )
              else
                Text(
                  formatDate(exam.createdAt),
                  style: const TextStyle(fontSize: 11.5, color: Slate.c400),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Meta extends StatelessWidget {
  const _Meta({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: Slate.c400),
        const SizedBox(width: 4),
        Text(
          label,
          style: const TextStyle(fontSize: 11.5, color: Slate.c500),
        ),
      ],
    );
  }
}
