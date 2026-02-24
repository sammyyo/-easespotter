import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class BookmarkService {
  Future<void> saveBookmark(Map<String, dynamic> item) async {
    final prefs = await SharedPreferences.getInstance();
    List<String> bookmarks = prefs.getStringList('bookmarked_items') ?? [];

    if (!bookmarks.contains(jsonEncode(item))) {
      bookmarks.add(jsonEncode(item));
      await prefs.setStringList('bookmarked_items', bookmarks);
    }
  }

  Future<void> clearAllBookmarks() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('bookmarked_items');
  }

  Future<List<Map<String, dynamic>>> getBookmarks() async {
    final prefs = await SharedPreferences.getInstance();
    List<String> bookmarks = prefs.getStringList('bookmarked_items') ?? [];
    return bookmarks.map((e) => jsonDecode(e) as Map<String, dynamic>).toList();
  }

  Future<void> removeBookmark(Map<String, dynamic> item) async {
    final prefs = await SharedPreferences.getInstance();
    List<String> bookmarks = prefs.getStringList('bookmarked_items') ?? [];

    bookmarks.removeWhere((e) => jsonEncode(item) == e);
    await prefs.setStringList('bookmarked_items', bookmarks);
  }

  Future<void> saveBookmarks(List<Map<String, dynamic>> items) async {
    final prefs = await SharedPreferences.getInstance();
    final encoded = items.map((e) => jsonEncode(e)).toList();
    await prefs.setStringList('bookmarked_items', encoded);
  }
}
