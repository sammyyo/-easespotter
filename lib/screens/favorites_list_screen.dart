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
      case 'EUR': return '€';
      case 'GBP': return '£';
      case 'JPY': return '¥';
      case 'NGN': return '₦';
      case 'USD':
      default: return '\$';
    }
  }

  void _deleteFavorite(int index) async {
    setState(() {
      _favoriteLists.removeAt(index);
    });
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('favorite_lists', jsonEncode(_favoriteLists));
  }

  void _loadFavorite(int index) {
    final selectedList = List<Map<String, dynamic>>.from(_favoriteLists[index]['items']);
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
    final filteredLists = _favoriteLists.where((list) {
      final title = (list['title'] ?? '').toString().toLowerCase();
      final store = (list['store'] ?? '').toString().toLowerCase();
      return title.contains(_searchQuery.toLowerCase()) || store.contains(_searchQuery.toLowerCase());
    }).toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Favorite Lists', style: TextStyle(color: Colors.white)),
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
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onChanged: (value) {
                setState(() {
                  _searchQuery = value.trim();
                });
              },
            ),
          ),
          Expanded(
            child: filteredLists.isEmpty
                ? const Center(child: Text('No favorites found.'))
                : ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              itemCount: filteredLists.length,
              itemBuilder: (context, index) {
                final fav = filteredLists[index];
                final title = fav['title'] ?? 'Unnamed';
                final store = fav['store'] ?? 'Unknown Store';
                final items = List<Map<String, dynamic>>.from(fav['items'] ?? []);
                final itemCount = items.length;
                final estimatedTotal = _calculateEstimatedTotal(items);

                return Card(
                  elevation: 4,
                  margin: const EdgeInsets.symmetric(vertical: 8),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                    leading: const Icon(Icons.list_alt, color: Colors.deepPurple),
                    title: Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('$itemCount items  •  $store'),
                        const SizedBox(height: 4),
                        Text('Estimated Total: $_currencySymbol${estimatedTotal.toStringAsFixed(2)}',
                            style: const TextStyle(color: Colors.black87)),
                      ],
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          icon: const Icon(Icons.download, color: Colors.teal),
                          tooltip: 'Load list',
                          onPressed: () => _loadFavorite(index),
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete, color: Colors.red),
                          tooltip: 'Delete list',
                          onPressed: () => _deleteFavorite(index),
                        ),
                      ],
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
