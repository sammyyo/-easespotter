import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

class UserScopedPrefs {
  static String key(String baseKey) {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null || uid.isEmpty) {
      return 'guest_$baseKey';
    }
    return 'user_${uid}_$baseKey';
  }

  static Future<void> migrateLocalDataForCurrentUser() async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null || uid.isEmpty) return;

    final prefs = await SharedPreferences.getInstance();
    final migratedKey = 'user_${uid}_local_data_migrated_v1';
    if (prefs.getBool(migratedKey) == true) return;

    await _migrateStringList(prefs, baseKey: 'bookmarked_items', uid: uid);

    for (final baseKey in const [
      'grocery_list',
      'favorite_lists',
      'collaborations',
    ]) {
      await _migrateJsonListString(prefs, baseKey: baseKey, uid: uid);
    }

    for (final baseKey in const [
      'bookmarked_items',
      'grocery_list',
      'favorite_lists',
      'collaborations',
    ]) {
      await prefs.remove('guest_$baseKey');
    }

    await prefs.setBool(migratedKey, true);
  }

  static Future<void> _migrateStringList(
    SharedPreferences prefs, {
    required String baseKey,
    required String uid,
  }) async {
    final targetKey = 'user_${uid}_$baseKey';
    final target = prefs.getStringList(targetKey) ?? <String>[];
    final merged = <String>[...target];
    final seen = target.toSet();

    for (final sourceKey in [baseKey, 'guest_$baseKey']) {
      final source = prefs.getStringList(sourceKey) ?? const <String>[];
      for (final item in source) {
        if (seen.add(item)) merged.add(item);
      }
    }

    if (merged.length != target.length) {
      await prefs.setStringList(targetKey, merged);
    }
  }

  static Future<void> _migrateJsonListString(
    SharedPreferences prefs, {
    required String baseKey,
    required String uid,
  }) async {
    final targetKey = 'user_${uid}_$baseKey';
    final target = prefs.getString(targetKey);
    final targetItems = _decodeListItems(target);
    final merged = <String>[...targetItems];
    final seen = targetItems.toSet();

    for (final sourceKey in [baseKey, 'guest_$baseKey']) {
      final sourceItems = _decodeListItems(prefs.getString(sourceKey));
      for (final item in sourceItems) {
        if (seen.add(item)) merged.add(item);
      }
    }

    if (merged.length != targetItems.length) {
      await prefs.setString(
        targetKey,
        jsonEncode(merged.map(jsonDecode).toList()),
      );
    }
  }

  static List<String> _decodeListItems(String? raw) {
    if (raw == null || raw.trim().isEmpty) {
      return const [];
    }

    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return const [];
      return decoded.map(jsonEncode).toList();
    } catch (_) {
      return const [];
    }
  }
}
