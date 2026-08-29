/// Small parsing helpers shared by every model.
///
/// The API is Mongo-backed, so numbers arrive as int or double interchangeably
/// and ids as either `_id` or `id` depending on whether the document went
/// through `toJSON`. Reading defensively here keeps that out of the screens.
library;

String asId(Map<String, dynamic> json) =>
    (json['_id'] ?? json['id'] ?? '').toString();

String asString(dynamic value, [String fallback = '']) =>
    value == null ? fallback : value.toString();

int asInt(dynamic value, [int fallback = 0]) {
  if (value is int) return value;
  if (value is num) return value.round();
  return int.tryParse(value?.toString() ?? '') ?? fallback;
}

double asDouble(dynamic value, [double fallback = 0]) {
  if (value is double) return value;
  if (value is num) return value.toDouble();
  return double.tryParse(value?.toString() ?? '') ?? fallback;
}

bool asBool(dynamic value, [bool fallback = false]) {
  if (value is bool) return value;
  if (value is String) return value == 'true';
  return fallback;
}

DateTime? asDate(dynamic value) {
  if (value == null) return null;
  return DateTime.tryParse(value.toString());
}

List<String> asStringList(dynamic value) {
  if (value is! List) return const [];
  return value.map((item) => item.toString()).toList();
}

class User {
  const User({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    this.isActive = true,
    this.lastLoginAt,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: asId(json),
      name: asString(json['name']),
      email: asString(json['email']),
      role: asString(json['role'], 'teacher'),
      isActive: asBool(json['isActive'], true),
      lastLoginAt: asDate(json['lastLoginAt']),
    );
  }

  final String id;
  final String name;
  final String email;
  final String role;
  final bool isActive;
  final DateTime? lastLoginAt;

  bool get isAdmin => role == 'admin';

  /// Capitalised for display: the API stores the role lowercase.
  String get roleLabel => role.isEmpty
      ? 'Teacher'
      : role[0].toUpperCase() + role.substring(1);

  /// The part of a name a greeting should use.
  String get firstName => name.trim().split(RegExp(r'\s+')).first;
}
