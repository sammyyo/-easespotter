import 'package:shared_preferences/shared_preferences.dart';

class SearchHistoryService {
  static const _key = 'recent_searches';
  static const _maxItems = 5;

  Future<void> addSearch(String query) async {
    final prefs = await SharedPreferences.getInstance();
    List<String> current = prefs.getStringList(_key) ?? [];

    // Remove duplicates & insert the new search at the front
    current.remove(query);
    current.insert(0, query);

    // Keep only the last 5
    if (current.length > _maxItems) {
      current = current.sublist(0, _maxItems);
    }

    await prefs.setStringList(_key, current);
  }

  Future<List<String>> getRecentSearches() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getStringList(_key) ?? [];
  }

  Future<void> clearSearchHistory() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
  }
}
