import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class GroceryListService {
  static const _key = 'grocery_list';

  Future<List<Map<String, dynamic>>> getList() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null) return [];
    return List<Map<String, dynamic>>.from(jsonDecode(raw));
  }

  Future<void> saveList(List<Map<String, dynamic>> items) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(items));
  }

  Future<void> saveCurrentListAsFavorite({
    required String title,
    String store = '',
  }) async {
    final prefs = await SharedPreferences.getInstance();

    final current = await getList();

    final favRaw = prefs.getString('favorite_lists');
    List<Map<String, dynamic>> favorites = [];
    if (favRaw != null) {
      favorites = List<Map<String, dynamic>>.from(jsonDecode(favRaw));
    }

    favorites.add({
      'title': title.trim(),
      'store': store.trim(),
      'items': List<Map<String, dynamic>>.from(current),
    });

    await prefs.setString('favorite_lists', jsonEncode(favorites));
  }

  Future<bool> addMinimalItemToCurrentList({
    required String title,
    required String category,
    String source = 'store',
  }) async {
    final items = await getList();
    final normalized = title.trim().toLowerCase();

    final exists = items.any((item) =>
        (item['title'] ?? '').toString().trim().toLowerCase() == normalized);

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
      }
    ];

    await saveList(items);
  }

  Future<bool> addStoreItem({
    required String name,
    String category = 'General',
    String? storeId,
    String? storeName,
    String? barcode,
    String? aisle,
    String? shelf,
    String? location,
  }) async {
    final items = await getList();

    final exists = items.any((item) =>
    (item['title'] ?? '').toString().trim().toLowerCase() ==
        name.trim().toLowerCase());

    if (exists) return false;

    items.add({
      'title': name.trim(),
      'checked': false,
      'category': category,
      'quantity': 1,
      'unitPrice': 0.0,
      'price': 0.0,
      'source': 'store',
      'storeId': storeId,
      'storeName': storeName,
      'barcode': barcode,
      'aisle': aisle,
      'shelf': shelf,
      'location': location ?? _formatLocation(aisle, shelf),
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
    final existing = items
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

  static String? _formatLocation(String? aisle, String? shelf) {
    final a = (aisle ?? '').trim();
    final s = (shelf ?? '').trim();
    if (a.isEmpty && s.isEmpty) return null;
    if (a.isEmpty) return s;
    if (s.isEmpty) return a;
    return '$a · $s';
  }
}
