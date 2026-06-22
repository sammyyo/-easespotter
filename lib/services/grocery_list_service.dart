import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'user_scoped_prefs.dart';

class GroceryListService {
  static const _key = 'grocery_list';
  static const _favoriteListsKey = 'favorite_lists';

  String get _groceryListKey => UserScopedPrefs.key(_key);
  String get _favoritesKey => UserScopedPrefs.key(_favoriteListsKey);

  Future<List<Map<String, dynamic>>> getList() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_groceryListKey);
    if (raw == null) return [];
    return List<Map<String, dynamic>>.from(jsonDecode(raw));
  }

  Future<void> saveList(List<Map<String, dynamic>> items) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_groceryListKey, jsonEncode(items));
  }

  Future<void> saveCurrentListAsFavorite({
    required String title,
    String store = '',
  }) async {
    final prefs = await SharedPreferences.getInstance();

    final current = await getList();

    final favRaw = prefs.getString(_favoritesKey);
    List<Map<String, dynamic>> favorites = [];
    if (favRaw != null) {
      favorites = List<Map<String, dynamic>>.from(jsonDecode(favRaw));
    }

    favorites.add({
      'title': title.trim(),
      'store': store.trim(),
      'items': List<Map<String, dynamic>>.from(current),
    });

    await prefs.setString(_favoritesKey, jsonEncode(favorites));
  }

  Future<bool> addMinimalItemToCurrentList({
    required String title,
    required String category,
    String source = 'store',
  }) async {
    final items = await getList();
    final normalized = title.trim().toLowerCase();

    final exists = items.any(
      (item) =>
          (item['title'] ?? '').toString().trim().toLowerCase() == normalized,
    );

    if (exists) return false;

    items.add({
      'title': title.trim(),
      'checked': false,
      'category': category,
      'quantity': 1,
      'unitPrice': 0.0,
      'price': 0.0,
      'source': source,
    });

    await saveList(items);
    return true;
  }

  Future<void> createNewListWithSingleItem({
    required String title,
    required String category,
    String source = 'store',
  }) async {
    final items = <Map<String, dynamic>>[
      {
        'title': title.trim(),
        'checked': false,
        'category': category,
        'quantity': 1,
        'unitPrice': 0.0,
        'price': 0.0,
        'source': source,
      },
    ];

    await saveList(items);
  }

  Future<bool> addStoreItem({
    required String name,
    String category = 'General',
  }) async {
    final items = await getList();

    final exists = items.any(
      (item) =>
          (item['title'] ?? '').toString().trim().toLowerCase() ==
          name.trim().toLowerCase(),
    );

    if (exists) return false;

    items.add({
      'title': name.trim(),
      'checked': false,
      'category': category,
      'quantity': 1,
      'unitPrice': 0.0,
      'price': 0.0,
      'source': 'store',
    });

    await saveList(items);
    return true;
  }

  /// Adds recipe ingredients while preserving your list structure.
  /// - source: 'recipe' so it appears under the "From Recipes" pill
  /// - no store fields / location
  /// - dedupes by title (case-insensitive)
  /// - optionally tags with recipeId (so you can group “From Recipes”)
  Future<int> addRecipeItems({
    required List<String> ingredientNames,
    String category = 'General',
    String? recipeId,
    String? recipeTitle,
  }) async {
    final items = await getList();

    // Build a fast lookup set once (instead of scanning items repeatedly)
    final existing =
        items
            .map((i) => (i['title'] ?? '').toString().trim().toLowerCase())
            .where((s) => s.isNotEmpty)
            .toSet();

    int addedCount = 0;

    for (final raw in ingredientNames) {
      final name = raw.trim();
      if (name.isEmpty) continue;

      final key = name.toLowerCase();
      if (existing.contains(key)) continue;

      items.add({
        'title': name,
        'checked': false,
        'category': category,
        'quantity': 1,
        'unitPrice': 0.0,
        'price': 0.0,
        'source': 'recipe',
        if (recipeId != null) 'recipeId': recipeId,
        if (recipeTitle != null) 'recipeTitle': recipeTitle,
      });

      existing.add(key);
      addedCount++;
    }

    if (addedCount > 0) {
      await saveList(items);
    }

    return addedCount;
  }
}
