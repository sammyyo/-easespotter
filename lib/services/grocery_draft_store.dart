import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// Keeps an unsent shared edit across process termination, using the account
/// captured when editing began rather than whichever account is signed in later.
class GroceryDraftStore {
  GroceryDraftStore(this.uid);
  final String uid;
  String get _draftKey => 'user_${uid}_pending_grocery_edit';
  String get _favoritesKey => 'user_${uid}_favorite_lists';

  Future<void> save(List<Map<String, dynamic>> items) async {
    final encoded = jsonEncode(items);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_draftKey, encoded);
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_draftKey);
  }

  Future<bool> recover() async {
    final prefs = await SharedPreferences.getInstance();
    final encoded = prefs.getString(_draftKey);
    if (encoded == null) return false;
    final favorites =
        jsonDecode(prefs.getString(_favoritesKey) ?? '[]') as List;
    favorites.add({
      'title': 'Recovered edits ${DateTime.now()}',
      'store': '',
      'items': jsonDecode(encoded),
    });
    await prefs.setString(_favoritesKey, jsonEncode(favorites));
    await prefs.remove(_draftKey);
    return true;
  }
}
