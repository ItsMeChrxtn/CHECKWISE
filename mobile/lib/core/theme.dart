import 'package:flutter/material.dart';

/// CheckWise design tokens.
///
/// Carried over value-for-value from the web client's `index.css`, so the phone
/// and the browser read as one system: paper-white surfaces, hairline rules, and
/// a single calm blue that appears only where something is interactive.
///
/// The previous palette filled whole surfaces with a deep navy and put a brass
/// accent on top. Large dark masses beside a metallic accent are tiring over a
/// marking session, so the weight is gone.

/// The one accent. Desaturated on purpose: legible on white without glare.
abstract final class Brand {
  static const c50 = Color(0xFFF2F6FD);
  static const c100 = Color(0xFFE3ECFA);
  static const c200 = Color(0xFFC8D9F4);
  static const c300 = Color(0xFF9DB9E9);
  static const c400 = Color(0xFF6D92DA);
  static const c500 = Color(0xFF4A72C9);
  static const c600 = Color(0xFF3A5BB0);
  static const c700 = Color(0xFF31498D);
  static const c800 = Color(0xFF2B3E73);
  static const c900 = Color(0xFF26355E);
}

/// Kept as an alias of the brand scale so nothing breaks; the brass is gone.
abstract final class Accent {
  static const c50 = Color(0xFFF2F6FD);
  static const c100 = Color(0xFFE3ECFA);
  static const c200 = Color(0xFFC8D9F4);
  static const c300 = Color(0xFF9DB9E9);
  static const c400 = Color(0xFF6D92DA);
  static const c500 = Color(0xFF4A72C9);
  static const c600 = Color(0xFF3A5BB0);
  static const c700 = Color(0xFF31498D);
}

/// Ink on paper. Never pure black — #000 on #fff is the harshest pairing on a
/// screen.
abstract final class Slate {
  static const c50 = Color(0xFFFAFAFB);
  static const c100 = Color(0xFFF4F4F6);
  static const c200 = Color(0xFFE8E9EC);
  static const c300 = Color(0xFFD6D8DD);
  static const c400 = Color(0xFFA1A5AE);
  static const c500 = Color(0xFF767B86);
  static const c600 = Color(0xFF565B66);
  static const c700 = Color(0xFF3F434C);
  static const c800 = Color(0xFF2A2D34);
  static const c900 = Color(0xFF1A1C21);
}

/// The grader's verdict. Muted, so a page of results reads calmly.
abstract final class Signal {
  static const pass = Color(0xFF2F7D54);
  static const passSoft = Color(0xFFEEF7F1);
  static const passLine = Color(0xFFD6EBDE);

  static const fail = Color(0xFFB4444A);
  static const failSoft = Color(0xFFFDF0F0);
  static const failLine = Color(0xFFF8DADA);

  static const warn = Color(0xFF9C7420);
  static const warnSoft = Color(0xFFFDF6E9);
  static const warnLine = Color(0xFFF8E8C6);
}

/// One face. The serif headings were part of the heaviness, so `serif` is now
/// an alias of the sans and nothing in the interface sets a second family.
abstract final class Type {
  static const serif = 'Inter';
  static const sans = 'Inter';

  /// Lining tabular figures. A column of scores that reflows as it updates is
  /// the fastest way to make a grading tool feel unreliable.
  static const tabular = <FontFeature>[
    FontFeature.tabularFigures(),
    FontFeature.liningFigures(),
  ];

  /// A heading.
  static TextStyle heading({
    required double size,
    FontWeight weight = FontWeight.w600,
    Color color = Slate.c900,
    double? height,
  }) {
    return TextStyle(
      fontFamily: serif,
      fontSize: size,
      fontWeight: weight,
      color: color,
      height: height,
      letterSpacing: -0.2,
      fontFeatures: const [FontFeature.liningFigures()],
    );
  }

  /// A figure meant to be read and compared — scores, totals, percentages.
  static TextStyle figure({
    required double size,
    Color color = Slate.c900,
    FontWeight weight = FontWeight.w600,
  }) {
    return TextStyle(
      fontFamily: serif,
      fontSize: size,
      fontWeight: weight,
      color: color,
      height: 1.1,
      letterSpacing: -0.4,
      fontFeatures: tabular,
    );
  }

  /// A quiet section label. Sentence case in mid-grey rather than letterspaced
  /// capitals: the shouty version put noise above every panel.
  static const TextStyle eyebrow = TextStyle(
    fontFamily: sans,
    fontSize: 13,
    fontWeight: FontWeight.w500,
    color: Slate.c500,
  );

  static const TextStyle eyebrowOnNavy = TextStyle(
    fontFamily: sans,
    fontSize: 13,
    fontWeight: FontWeight.w500,
    color: Slate.c500,
  );
}

ThemeData buildCheckWiseTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: Brand.c600,
    primary: Brand.c600,
    secondary: Accent.c500,
    surface: Colors.white,
    error: Signal.fail,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    fontFamily: Type.sans,
    scaffoldBackgroundColor: Slate.c50,

    // Hairline rules, not shadows. Depth on a printed form comes from the rule
    // and the whitespace.
    appBarTheme: AppBarTheme(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      foregroundColor: Slate.c900,
      elevation: 0,
      scrolledUnderElevation: 0,
      shape: const Border(bottom: BorderSide(color: Slate.c200)),
      titleTextStyle: Type.heading(size: 18),
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: const BorderSide(color: Slate.c200),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 13, vertical: 14),
      border: _fieldBorder(Slate.c300),
      enabledBorder: _fieldBorder(Slate.c300),
      focusedBorder: _fieldBorder(Brand.c600, width: 1.6),
      errorBorder: _fieldBorder(Signal.failLine),
      focusedErrorBorder: _fieldBorder(Signal.fail, width: 1.6),
      labelStyle: const TextStyle(color: Slate.c600, fontSize: 14),
      hintStyle: const TextStyle(color: Slate.c400, fontSize: 14),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: Brand.c600,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(48),
        textStyle: const TextStyle(
          fontFamily: Type.sans,
          fontSize: 15,
          fontWeight: FontWeight.w600,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: Slate.c700,
        minimumSize: const Size.fromHeight(48),
        side: const BorderSide(color: Slate.c300),
        textStyle: const TextStyle(
          fontFamily: Type.sans,
          fontSize: 15,
          fontWeight: FontWeight.w600,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: Brand.c600,
        textStyle: const TextStyle(
          fontFamily: Type.sans,
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      // A square wash rather than a pill: the tab is a section of a register,
      // not a chip.
      indicatorShape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(6)),
      ),
      indicatorColor: Brand.c50,
      elevation: 0,
      height: 64,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(
          fontFamily: Type.sans,
          fontSize: 11.5,
          fontWeight: states.contains(WidgetState.selected)
              ? FontWeight.w600
              : FontWeight.w500,
          letterSpacing: 0.1,
          color: states.contains(WidgetState.selected) ? Brand.c700 : Slate.c500,
        ),
      ),
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(
          size: 21,
          color: states.contains(WidgetState.selected) ? Brand.c700 : Slate.c500,
        ),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
      titleTextStyle: Type.heading(size: 17),
      contentTextStyle: const TextStyle(
        fontFamily: Type.sans,
        fontSize: 13.5,
        color: Slate.c600,
        height: 1.5,
      ),
    ),
    chipTheme: ChipThemeData(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
      side: const BorderSide(color: Slate.c200),
      backgroundColor: Colors.white,
      labelStyle: const TextStyle(fontFamily: Type.sans, fontSize: 12.5),
    ),
    dividerTheme: const DividerThemeData(
      color: Slate.c200,
      thickness: 1,
      space: 1,
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: Brand.c800,
      contentTextStyle: const TextStyle(
        fontFamily: Type.sans,
        color: Colors.white,
        fontSize: 13.5,
      ),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: Brand.c600,
      linearMinHeight: 6,
    ),
  );
}

OutlineInputBorder _fieldBorder(Color color, {double width = 1}) {
  return OutlineInputBorder(
    borderRadius: BorderRadius.circular(8),
    borderSide: BorderSide(color: color, width: width),
  );
}
