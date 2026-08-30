import 'package:flutter/material.dart';

import 'dashboard_screen.dart';
import 'exams_screen.dart';
import 'results_screen.dart';
import 'settings_screen.dart';

/// The four places a teacher goes on a phone.
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
  final _navigators = List.generate(4, (_) => GlobalKey<NavigatorState>());

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

  @override
  Widget build(BuildContext context) {
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
          index: _index,
          children: [
            _Tab(navigatorKey: _navigators[0], child: const DashboardScreen()),
            _Tab(navigatorKey: _navigators[1], child: const ExamsScreen()),
            _Tab(navigatorKey: _navigators[2], child: const ResultsScreen()),
            _Tab(navigatorKey: _navigators[3], child: const SettingsScreen()),
          ],
        ),
        bottomNavigationBar: Container(
          decoration: const BoxDecoration(
            border: Border(top: BorderSide(color: Color(0xFFE2E8F0))),
          ),
          child: NavigationBar(
            selectedIndex: _index,
            onDestinationSelected: (next) {
              // Tapping the tab you are already on returns to its root.
              if (next == _index) {
                _navigators[next].currentState?.popUntil((r) => r.isFirst);
                return;
              }
              setState(() => _index = next);
            },
            destinations: const [
              NavigationDestination(
                icon: Icon(Icons.dashboard_outlined),
                selectedIcon: Icon(Icons.dashboard_rounded),
                label: 'Dashboard',
              ),
              NavigationDestination(
                icon: Icon(Icons.assignment_outlined),
                selectedIcon: Icon(Icons.assignment_rounded),
                label: 'Exams',
              ),
              NavigationDestination(
                icon: Icon(Icons.fact_check_outlined),
                selectedIcon: Icon(Icons.fact_check_rounded),
                label: 'Results',
              ),
              NavigationDestination(
                icon: Icon(Icons.settings_outlined),
                selectedIcon: Icon(Icons.settings_rounded),
                label: 'Settings',
              ),
            ],
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
