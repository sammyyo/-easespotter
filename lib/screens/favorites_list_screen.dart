import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';

class FavoritesListScreen extends StatefulWidget {
  final Function(List<Map<String, dynamic>>)? onListSelected;

  const FavoritesListScreen({super.key, this.onListSelected});

  @override
  State<FavoritesListScreen> createState() => _FavoritesListScreenState();
}

class _FavoritesListScreenState extends State<FavoritesListScreen> {
  List<Map<String, dynamic>> _favoriteLists = [];
  String _searchQuery = '';
  String _currencySymbol = '\$';
  bool _didUndoLastDelete = false;
  final Set<String> _armedDeleteKeys = {};
  final Map<String, double> _deleteDragProgress = {};

  @override
  void initState() {
    super.initState();
    _loadFavorites();
    _loadCurrencySymbol();
  }

  Future<void> _loadFavorites() async {
    final prefs = await SharedPreferences.getInstance();
    final String? favJson = prefs.getString('favorite_lists');
    if (favJson != null) {
      setState(() {
        _favoriteLists = List<Map<String, dynamic>>.from(jsonDecode(favJson));
      });
    }
  }

  Future<void> _loadCurrencySymbol() async {
    final prefs = await SharedPreferences.getInstance();
    final currency = prefs.getString('selected_currency') ?? 'USD';
    setState(() {
      _currencySymbol = _getCurrencySymbol(currency);
    });
  }

  String _getCurrencySymbol(String currencyCode) {
    switch (currencyCode) {
      case 'EUR':
        return '€';
      case 'GBP':
        return '£';
      case 'JPY':
        return '¥';
      case 'NGN':
        return '₦';
      case 'USD':
      default:
        return '\$';
    }
  }

  Future<void> _saveFavorites() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('favorite_lists', jsonEncode(_favoriteLists));
  }

  String _favoriteKey(Map<String, dynamic> favorite) {
    final title = (favorite['title'] ?? '').toString();
    final store = (favorite['store'] ?? '').toString();
    final items = jsonEncode(favorite['items'] ?? const []);
    return '$title|$store|$items';
  }

  Widget _deleteBackground(String keyStr) {
    final isArmed = _armedDeleteKeys.contains(keyStr);

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        color: isArmed ? Colors.red.shade700 : Colors.red.shade500,
        borderRadius: BorderRadius.circular(16),
      ),
      alignment: Alignment.centerRight,
      padding: const EdgeInsets.only(right: 18),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.end,
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            isArmed ? Icons.delete_forever : Icons.delete_outline,
            color: Colors.white,
          ),
          const SizedBox(width: 8),
          Text(
            isArmed ? 'Release to delete' : 'Swipe again',
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }

  Future<bool?> _confirmFavoriteDismiss(
    String keyStr,
    Map<String, dynamic> favorite,
  ) async {
    final isArmed = _armedDeleteKeys.contains(keyStr);
    final progress = _deleteDragProgress[keyStr] ?? 0;
    final isFullSwipe = progress >= 0.85;

    _deleteDragProgress.remove(keyStr);

    if (isArmed || isFullSwipe) {
      _armedDeleteKeys.remove(keyStr);
      return true;
    }

    setState(() => _armedDeleteKeys.add(keyStr));
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Swipe "${favorite['title'] ?? 'favorite list'}" again to delete',
        ),
        duration: const Duration(seconds: 2),
        behavior: SnackBarBehavior.floating,
      ),
    );
    return false;
  }

  Future<void> _removeFavoriteWithUndo(Map<String, dynamic> favorite) async {
    final originalIndex = _favoriteLists.indexOf(favorite);
    if (originalIndex < 0) return;

    final keyStr = _favoriteKey(favorite);
    setState(() => _favoriteLists.removeAt(originalIndex));
    _armedDeleteKeys.remove(keyStr);
    _deleteDragProgress.remove(keyStr);
    _didUndoLastDelete = false;

    final snackBarController = ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('"${favorite['title'] ?? 'Favorite list'}" removed'),
        duration: const Duration(seconds: 4),
        behavior: SnackBarBehavior.floating,
        action: SnackBarAction(
          label: 'UNDO',
          onPressed: () {
            _didUndoLastDelete = true;
            setState(() => _favoriteLists.insert(originalIndex, favorite));
          },
        ),
      ),
    );

    await snackBarController.closed;

    if (!_didUndoLastDelete) {
      await _saveFavorites();
    }
  }

  void _loadFavorite(Map<String, dynamic> favorite) {
    final selectedList = List<Map<String, dynamic>>.from(favorite['items']);
    if (widget.onListSelected != null) {
      widget.onListSelected!(selectedList);
    }
    Navigator.pop(context, selectedList);
  }

  double _calculateEstimatedTotal(List<Map<String, dynamic>> items) {
    return items.fold(0.0, (total, item) {
      final price = double.tryParse(item['price']?.toString() ?? '0') ?? 0;
      final quantity = item['quantity'] ?? 1;
      return total + (price * quantity);
    });
  }

  @override
  Widget build(BuildContext context) {
    final filteredLists =
        _favoriteLists.where((list) {
          final title = (list['title'] ?? '').toString().toLowerCase();
          final store = (list['store'] ?? '').toString().toLowerCase();
          return title.contains(_searchQuery.toLowerCase()) ||
              store.contains(_searchQuery.toLowerCase());
        }).toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Favorite Lists',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
        ),
        iconTheme: const IconThemeData(color: Colors.white),
        backgroundColor: Colors.deepPurple,
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: TextField(
              decoration: InputDecoration(
                hintText: 'Search by list title or store...',
                filled: true,
                fillColor: Colors.white,
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              onChanged: (value) {
                setState(() {
                  _searchQuery = value.trim();
                });
              },
            ),
          ),
          Expanded(
            child:
                filteredLists.isEmpty
                    ? const Center(child: Text('No favorites found.'))
                    : ListView.builder(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 8,
                      ),
                      itemCount: filteredLists.length,
                      itemBuilder: (context, index) {
                        final fav = filteredLists[index];
                        final title = fav['title'] ?? 'Unnamed';
                        final store = fav['store'] ?? 'Unknown Store';
                        final items = List<Map<String, dynamic>>.from(
                          fav['items'] ?? [],
                        );
                        final itemCount = items.length;
                        final estimatedTotal = _calculateEstimatedTotal(items);
                        final keyStr = _favoriteKey(fav);

                        return Dismissible(
                          key: ValueKey(keyStr),
                          direction: DismissDirection.endToStart,
                          dismissThresholds: const {
                            DismissDirection.endToStart: 0.35,
                          },
                          background: _deleteBackground(keyStr),
                          confirmDismiss:
                              (_) => _confirmFavoriteDismiss(keyStr, fav),
                          onUpdate: (details) {
                            final current = _deleteDragProgress[keyStr] ?? 0;
                            if (details.progress > current) {
                              _deleteDragProgress[keyStr] = details.progress;
                            }
                          },
                          onDismissed: (_) => _removeFavoriteWithUndo(fav),
                          child: Card(
                            elevation: 4,
                            margin: const EdgeInsets.symmetric(vertical: 8),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: ListTile(
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 20,
                                vertical: 10,
                              ),
                              leading: const Icon(
                                Icons.list_alt,
                                color: Colors.deepPurple,
                              ),
                              title: Text(
                                title,
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              subtitle: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('$itemCount items  •  $store'),
                                  const SizedBox(height: 4),
                                  Text(
                                    'Estimated Total: $_currencySymbol${estimatedTotal.toStringAsFixed(2)}',
                                    style: const TextStyle(
                                      color: Colors.black87,
                                    ),
                                  ),
                                ],
                              ),
                              trailing: IconButton(
                                icon: const Icon(
                                  Icons.download,
                                  color: Colors.teal,
                                ),
                                tooltip: 'Load list',
                                onPressed: () => _loadFavorite(fav),
                              ),
                            ),
                          ),
                        );
                      },
                    ),
          ),
        ],
      ),
    );
  }
}
