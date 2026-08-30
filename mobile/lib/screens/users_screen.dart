import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/formatters.dart';
import '../core/theme.dart';
import '../services/services.dart';
import '../state/auth_controller.dart';
import '../widgets/common.dart';

/// The account roster.
///
/// Admin-only, and the server enforces that — this screen never decides who may
/// see it. What it does decide is how much damage is reachable by accident:
/// suspending is offered before deleting, and deleting is refused while an
/// account still owns work, so tidying a list cannot orphan a class's marks.
class UsersScreen extends StatefulWidget {
  const UsersScreen({super.key});

  @override
  State<UsersScreen> createState() => _UsersScreenState();
}

class _UsersScreenState extends State<UsersScreen> {
  final _search = TextEditingController();

  List<AdminUser> _users = const [];
  int _all = 0;
  int _admins = 0;
  int _teachers = 0;

  String _role = 'all';
  bool _loading = true;
  String? _error;
  String? _busyId;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _onSearchChanged(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), _load);
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final result = await context.read<UserService>().list(
        q: _search.text.trim(),
        role: _role,
      );
      if (!mounted) return;
      setState(() {
        _users = result.users;
        _all = result.all;
        _admins = result.admins;
        _teachers = result.teachers;
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

  Future<void> _change(AdminUser user, Map<String, dynamic> changes, String success) async {
    setState(() => _busyId = user.id);
    try {
      await context.read<UserService>().update(user.id, changes);
      if (!mounted) return;
      showToast(context, success);
      await _load();
    } on ApiException catch (error) {
      if (!mounted) return;
      showToast(context, error.message, isError: true);
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _delete(AdminUser user) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Delete ${user.name}?'),
        content: const Text(
          'The account is removed permanently. This cannot be undone.',
        ),
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

    setState(() => _busyId = user.id);
    try {
      final message = await context.read<UserService>().remove(user.id);
      if (!mounted) return;
      showToast(context, message);
      await _load();
    } on ApiException catch (error) {
      if (!mounted) return;
      showToast(context, error.message, isError: true);
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Accounts'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: _loading ? null : _load,
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(104),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Column(
              children: [
                TextField(
                  controller: _search,
                  onChanged: _onSearchChanged,
                  decoration: const InputDecoration(
                    hintText: 'Search name or email',
                    isDense: true,
                    prefixIcon: Icon(Icons.search_rounded, size: 20, color: Slate.c400),
                  ),
                ),
                const SizedBox(height: 10),
                SizedBox(
                  height: 32,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: [
                      _filter('all', 'All roles'),
                      _filter('teacher', 'Teachers'),
                      _filter('admin', 'Administrators'),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
      body: RefreshIndicator(onRefresh: _load, child: _buildBody()),
    );
  }

  Widget _filter(String value, String label) {
    final selected = _role == value;
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
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
        onSelected: (_) {
          if (_role == value) return;
          setState(() => _role = value);
          _load();
        },
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return ListView(
        children: [
          SizedBox(
            height: MediaQuery.sizeOf(context).height * 0.5,
            child: ErrorState(message: _error!, onRetry: _load),
          ),
        ],
      );
    }

    final me = context.read<AuthController>().user;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      children: [
        Row(
          children: [
            Expanded(child: StatCard(label: 'All accounts', value: '$_all')),
            const SizedBox(width: 10),
            Expanded(child: StatCard(label: 'Teachers', value: '$_teachers')),
            const SizedBox(width: 10),
            Expanded(child: StatCard(label: 'Admins', value: '$_admins')),
          ],
        ),
        const SizedBox(height: 16),

        if (_users.isEmpty)
          AppCard(
            child: const EmptyState(
              compact: true,
              icon: Icons.person_outline_rounded,
              title: 'No accounts match',
              message: 'Try a different search or role filter.',
            ),
          )
        else
          ..._users.map(
            (user) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _UserCard(
                user: user,
                isMe: user.id == me?.id,
                busy: _busyId == user.id,
                onChange: _change,
                onDelete: () => _delete(user),
              ),
            ),
          ),
      ],
    );
  }
}

class _UserCard extends StatelessWidget {
  const _UserCard({
    required this.user,
    required this.isMe,
    required this.busy,
    required this.onChange,
    required this.onDelete,
  });

  final AdminUser user;
  final bool isMe;
  final bool busy;
  final Future<void> Function(AdminUser, Map<String, dynamic>, String) onChange;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: user.isAdmin ? Brand.c600 : Slate.c100,
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: Text(
                  initials(user.name),
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: user.isAdmin ? Colors.white : Slate.c600,
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
                        Flexible(
                          child: Text(
                            user.name,
                            style: Type.heading(size: 15),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (isMe) ...[
                          const SizedBox(width: 6),
                          const Pill(
                            label: 'You',
                            color: Brand.c700,
                            background: Brand.c50,
                          ),
                        ],
                        if (!user.isActive) ...[
                          const SizedBox(width: 6),
                          Pill(
                            label: 'Suspended',
                            color: Signal.fail,
                            background: Signal.failSoft,
                            border: Signal.failLine,
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      user.email,
                      style: const TextStyle(fontSize: 12.5, color: Slate.c500),
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 3),
                    Text(
                      '${user.examCount} ${plural(user.examCount, "exam")} · '
                      '${user.resultCount} ${plural(user.resultCount, "paper")} · '
                      'joined ${formatDate(user.createdAt)}',
                      style: const TextStyle(fontSize: 11.5, color: Slate.c400),
                    ),
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: 12),
          const Divider(),
          const SizedBox(height: 10),

          if (busy)
            const Center(
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 6),
                child: SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2.2),
                ),
              ),
            )
          else
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => onChange(
                      user,
                      {'role': user.isAdmin ? 'teacher' : 'admin'},
                      user.isAdmin
                          ? '${user.name} is now a teacher.'
                          : '${user.name} is now an administrator.',
                    ),
                    style: OutlinedButton.styleFrom(minimumSize: const Size(0, 38)),
                    child: Text(user.isAdmin ? 'Make teacher' : 'Make admin'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton(
                    // Locking yourself out is the one mistake with no way back.
                    onPressed: isMe
                        ? null
                        : () => onChange(
                            user,
                            {'isActive': !user.isActive},
                            user.isActive
                                ? '${user.name} was suspended.'
                                : '${user.name} was restored.',
                          ),
                    style: OutlinedButton.styleFrom(minimumSize: const Size(0, 38)),
                    child: Text(user.isActive ? 'Suspend' : 'Restore'),
                  ),
                ),
                const SizedBox(width: 4),
                IconButton(
                  // Refused server-side too; disabling it here just explains why.
                  onPressed: isMe || user.ownsWork ? null : onDelete,
                  tooltip: isMe
                      ? 'You cannot delete your own account'
                      : user.ownsWork
                          ? 'This account still owns exams or papers'
                          : 'Delete account',
                  icon: const Icon(Icons.delete_outline_rounded, size: 20),
                  color: Signal.fail,
                ),
              ],
            ),
        ],
      ),
    );
  }
}
