import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'user_scoped_prefs.dart';

class BookmarkService {
  static String get _bookmarksKey => UserScopedPrefs.key('bookmarked_items');

  static String bookmarkKey(Map<dynamic, dynamic> item) {
    String clean(dynamic value) =>
        (value ?? '').toString().trim().toLowerCase();

    final store =
        clean(item['storeName']).isNotEmpty
            ? clean(item['storeName'])
            : clean(item['vendorName']).isNotEmpty
            ? clean(item['vendorName'])
            : clean(item['storeId']);
    final barcode = clean(item['barcode']);
    final name = clean(item['name']);
    final location = clean(item['location']);
    final price = clean(item['price']);

    if (barcode.isNotEmpty) return '$store|barcode:$barcode';
    return '$store|$name|$location|$price';
  }

  Future<bool> isBookmarked(Map<String, dynamic> item) async {
    final prefs = await SharedPreferences.getInstance();
    final bookmarks = prefs.getStringList(_bookmarksKey) ?? [];
    final key = bookmarkKey(item);

    return bookmarks.any((encoded) {
      try {
        final existing = jsonDecode(encoded);
        return existing is Map && bookmarkKey(existing) == key;
      } catch (_) {
        return false;
      }
    });
  }

  Future<void> saveBookmark(Map<String, dynamic> item) async {
    final prefs = await SharedPreferences.getInstance();
    List<String> bookmarks = prefs.getStringList(_bookmarksKey) ?? [];
    final key = bookmarkKey(item);

    final alreadySaved = bookmarks.any((encoded) {
      try {
        final existing = jsonDecode(encoded);
        return existing is Map && bookmarkKey(existing) == key;
      } catch (_) {
        return false;
      }
    });

    if (!alreadySaved) {
      bookmarks.add(jsonEncode(item));
      await prefs.setStringList(_bookmarksKey, bookmarks);
    }
  }

  Future<void> clearAllBookmarks() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_bookmarksKey);
  }

  Future<List<Map<String, dynamic>>> getBookmarks() async {
    final prefs = await SharedPreferences.getInstance();
    List<String> bookmarks = prefs.getStringList(_bookmarksKey) ?? [];
    final seen = <String>{};
    final decoded = <Map<String, dynamic>>[];
    var changed = false;

    for (final encoded in bookmarks) {
      final item = jsonDecode(encoded) as Map<String, dynamic>;
      final key = bookmarkKey(item);
      if (seen.add(key)) {
        decoded.add(item);
      } else {
        changed = true;
      }
    }

    if (changed) {
      await saveBookmarks(decoded);
    }

    return decoded;
  }

  Future<void> removeBookmark(Map<String, dynamic> item) async {
    final prefs = await SharedPreferences.getInstance();
    List<String> bookmarks = prefs.getStringList(_bookmarksKey) ?? [];
    final key = bookmarkKey(item);

    bookmarks.removeWhere((encoded) {
      try {
        final existing = jsonDecode(encoded);
        return existing is Map && bookmarkKey(existing) == key;
      } catch (_) {
        return false;
      }
    });
    await prefs.setStringList(_bookmarksKey, bookmarks);
  }

  Future<void> saveBookmarks(List<Map<String, dynamic>> items) async {
    final prefs = await SharedPreferences.getInstance();
    final seen = <String>{};
    final encoded = <String>[];

    for (final item in items) {
      if (seen.add(bookmarkKey(item))) {
        encoded.add(jsonEncode(item));
      }
    }

    await prefs.setStringList(_bookmarksKey, encoded);
  }
}
