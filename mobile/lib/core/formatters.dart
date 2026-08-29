import 'package:intl/intl.dart';

/// Small helpers mirroring the web client's `utils/format.js`, so a date or a
/// percentage reads the same on the phone as it does in the browser.

final _date = DateFormat('MMM d, y');
final _dateTime = DateFormat('MMM d, y  h:mm a');

String formatDate(DateTime? value) =>
    value == null ? '—' : _date.format(value.toLocal());

String formatDateTime(DateTime? value) =>
    value == null ? '—' : _dateTime.format(value.toLocal());

/// Two letters at most, for the avatar chip.
String initials(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
  return parts
      .take(2)
      .map((part) => part[0].toUpperCase())
      .join();
}

/// One decimal place, and no trailing `.0` on a whole number.
String percent(num? value) {
  final rounded = ((value ?? 0) * 10).round() / 10;
  final text = rounded == rounded.roundToDouble()
      ? rounded.round().toString()
      : rounded.toString();
  return '$text%';
}

/// Marks can be fractional with enumeration partial credit.
String marks(num? value) {
  final number = value ?? 0;
  if (number == number.roundToDouble()) return number.round().toString();
  return (number.toDouble()).toStringAsFixed(2).replaceFirst(RegExp(r'0+$'), '');
}

String plural(int count, String one, [String? many]) {
  return count == 1 ? one : (many ?? '${one}s');
}
