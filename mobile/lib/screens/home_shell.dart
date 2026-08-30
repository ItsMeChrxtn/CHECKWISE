import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme.dart';
import '../state/auth_controller.dart';
import 'dashboard_screen.dart';
import 'exams_screen.dart';
import 'results_screen.dart';
import 'settings_screen.dart';
import 'users_screen.dart';

/// The places a teacher goes on a phone — four, or five for an admin.
///
/// The app carries the whole workflow now — writing an exam, uploading its PDF,
/// confirming the key, generating the sheet and scanning the papers all happen
/// here rather than being split with the web client.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  /// Each tab keeps its own navigation stack and scroll position, so drilling
  /// into an exam and switching away does not throw the place away.
  final _navigators = List.generate(5, (_) => GlobalKey<NavigatorState>());

  /// Returns true when back should leave the app. Kept synchronous so no
  /// BuildContext is carried across an await.
  bool _handleBack() {
    final navigator = _navigators[_index].currentState!;
    if (navigator.canPop()) {
      navigator.pop();
      return false;
    }
    // Back on a nested tab returns to the dashboard before leaving the app.
    if (_index != 0) {
      setState(() => _index = 0);
      return false;
    }
    return true;
  }

  /// One tab: its screen, its icons and its label.
  ///
  /// Building the list from the role rather than hiding an entry keeps the
  /// index honest. An `if` inside the children list shortens it, so the last
  /// tab's index stops matching its slot and the stack reads past the end.
  List<_Destination> _destinationsFor({required bool isAdmin}) {
    return [
      const _Destination(
        screen: DashboardScreen(),
        icon: Icons.dashboard_outlined,
        selected: Icons.dashboard_rounded,
        label: 'Dashboard',
      ),
      const _Destination(
        screen: ExamsScreen(),
        icon: Icons.assignment_outlined,
        selected: Icons.assignment_rounded,
        label: 'Exams',
      ),
      const _Destination(
        screen: ResultsScreen(),
        icon: Icons.fact_check_outlined,
        selected: Icons.fact_check_rounded,
        label: 'Results',
      ),
      if (isAdmin)
        const _Destination(
          screen: UsersScreen(),
          icon: Icons.people_outline_rounded,
          selected: Icons.people_rounded,
          label: 'Accounts',
        ),
      const _Destination(
        screen: SettingsScreen(),
        icon: Icons.settings_outlined,
        selected: Icons.settings_rounded,
        label: 'Settings',
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final isAdmin = context.watch<AuthController>().user?.isAdmin ?? false;
    final destinations = _destinationsFor(isAdmin: isAdmin);

    // Losing admin mid-session would otherwise leave _index past the end.
    final index = _index.clamp(0, destinations.length - 1);

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        if (_handleBack()) {
          Navigator.of(context).maybePop();
        }
      },
      child: Scaffold(
        body: IndexedStack(
          index: index,
          children: List.generate(
            destinations.length,
            (i) => _Tab(navigatorKey: _navigators[i], child: destinations[i].screen),
          ),
        ),
        bottomNavigationBar: Container(
          decoration: const BoxDecoration(
            border: Border(top: BorderSide(color: Slate.c200)),
          ),
          child: NavigationBar(
            selectedIndex: index,
            onDestinationSelected: (next) {
              // Tapping the tab you are already on returns to its root.
              if (next == index) {
                _navigators[next].currentState?.popUntil((r) => r.isFirst);
                return;
              }
              setState(() => _index = next);
            },
            destinations: destinations
                .map(
                  (d) => NavigationDestination(
                    icon: Icon(d.icon),
                    selectedIcon: Icon(d.selected),
                    label: d.label,
                  ),
                )
                .toList(),
          ),
        ),
      ),
    );
  }
}

class _Tab extends StatelessWidget {
  const _Tab({required this.navigatorKey, required this.child});

  final GlobalKey<NavigatorState> navigatorKey;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Navigator(
      key: navigatorKey,
      onGenerateRoute: (settings) =>
          MaterialPageRoute(builder: (_) => child, settings: settings),
    );
  }
}

/// A tab's screen and how it appears in the bar.
class _Destination {
  const _Destination({
    required this.screen,
    required this.icon,
    required this.selected,
    required this.label,
  });

  final Widget screen;
  final IconData icon;
  final IconData selected;
  final String label;
}
