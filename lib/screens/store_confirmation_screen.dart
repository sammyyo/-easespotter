import 'package:flutter/material.dart';
import 'package:easespotter/services/bookmark_service.dart';

class StoreConfirmationScreen extends StatefulWidget {
  final Map<String, dynamic> storeData;

  const StoreConfirmationScreen({super.key, required this.storeData});

  @override
  State<StoreConfirmationScreen> createState() => _StoreConfirmationScreenState();
}

class _StoreConfirmationScreenState extends State<StoreConfirmationScreen> {
  final BookmarkService _bookmarkService = BookmarkService();
  late List<Map<String, dynamic>> _allItems;
  final List<Map<String, dynamic>> _selectedItems = [];
  final Set<Map<String, dynamic>> _bookmarkedItems = {};
  final TextEditingController _searchController = TextEditingController();
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();

    final Map<String, dynamic> productsByCategory = widget.storeData['productsByCategory'] ?? {};
    final flattened = productsByCategory.entries.expand((entry) {
      final category = entry.key;
      final List items = entry.value;
      return items.map((item) => {
        'name': item['name'],
        'location': 'Aisle ${item['location']['aisle']} - Shelf ${item['location']['shelf']}',
        'category': category,
        'storeName': widget.storeData['vendorName'] ?? 'Unknown Store',
        'price': item['price'] ?? '',
      });
    }).toList();

    _allItems = List<Map<String, dynamic>>.from(flattened);
  }

  Future<void> _searchAndAdd(String query) async {
    final trimmed = query.trim().toLowerCase();
    if (trimmed.isEmpty) return;

    setState(() => _isLoading = true);

    await Future.delayed(const Duration(milliseconds: 500));

    final match = _allItems.firstWhere(
          (item) => item['name'].toLowerCase().contains(trimmed),
      orElse: () => {},
    );

    setState(() => _isLoading = false);

    if (match.isNotEmpty && !_selectedItems.contains(match)) {
      setState(() {
        _selectedItems.add(match);
        _searchController.clear();
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('“${match['name']}” added'),
          duration: const Duration(seconds: 2),
          backgroundColor: Colors.green[600],
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  void _removeItem(Map<String, dynamic> item) {
    setState(() {
      _selectedItems.remove(item);
      _bookmarkedItems.remove(item);
    });

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('“${item['name']}” removed'),
        duration: const Duration(seconds: 2),
        backgroundColor: Colors.red[600],
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  void _toggleBookmark(Map<String, dynamic> item) async {
    final isBookmarked = _bookmarkedItems.contains(item);

    setState(() {
      if (isBookmarked) {
        _bookmarkedItems.remove(item);
      } else {
        _bookmarkedItems.add(item);
      }
    });

    final enrichedItem = Map<String, dynamic>.from(item);
    enrichedItem['storeName'] = widget.storeData['vendorName'] ?? 'Unknown Store';

    if (isBookmarked) {
      await _bookmarkService.removeBookmark(item);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('“${item['name']}” removed from bookmarks'),
          backgroundColor: Colors.red[600],
          duration: const Duration(seconds: 2),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } else {
      await _bookmarkService.saveBookmark(enrichedItem);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('“${item['name']}” bookmarked'),
          backgroundColor: Colors.blue[700],
          duration: const Duration(seconds: 2),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final storeName = widget.storeData['vendorName'] ?? 'Unknown Store';
    final logoUrl = widget.storeData['vendorLogoUrl'] as String?;

    return Scaffold(
      appBar: AppBar(
        centerTitle: true,
        title: const Text(
          'Store',
          style: TextStyle(color: Colors.white),
        ),
        backgroundColor: Colors.deepPurple,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Card(
              elevation: 6,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              child: Column(
                children: [
                  Container(
                    width: double.infinity,
                    height: 120,
                    decoration: BoxDecoration(
                      color: Colors.deepPurple.shade50,
                      borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
                    ),
                    child: Center(
                      child: logoUrl != null
                          ? ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Image.network(
                          logoUrl,
                          height: 60,
                          fit: BoxFit.contain,
                          errorBuilder: (context, error, stackTrace) => const Icon(
                            Icons.store_mall_directory,
                            size: 50,
                            color: Colors.deepPurple,
                          ),
                        ),
                      )
                          : const Icon(
                        Icons.store_mall_directory,
                        size: 50,
                        color: Colors.deepPurple,
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
                    child: Column(
                      children: [
                        Text(
                          storeName,
                          style: const TextStyle(
                            fontSize: 26,
                            fontWeight: FontWeight.bold,
                          ),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Search for a product by name and add it below.',
                          style: TextStyle(color: Colors.grey[700]),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 30),
            const Divider(thickness: 1, height: 10),
            const SizedBox(height: 20),

            TextField(
              controller: _searchController,
              onSubmitted: _searchAndAdd,
              decoration: InputDecoration(
                hintText: 'Search for a product...',
                prefixIcon: const Icon(Icons.search),
                fillColor: Colors.white,
                filled: true,
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),

            const SizedBox(height: 20),
            if (_isLoading) const Center(child: CircularProgressIndicator()),
            const SizedBox(height: 10),

            ..._selectedItems.map((item) => AnimatedSwitcher(
              duration: const Duration(milliseconds: 300),
              child: Card(
                key: ValueKey(item['name']),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                elevation: 2,
                margin: const EdgeInsets.symmetric(vertical: 6),
                child: ListTile(
                  leading: const Icon(Icons.shopping_bag, color: Colors.deepPurple),
                  title: Text(item['name']),
                  subtitle: Text(item['location']),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        icon: Icon(
                          _bookmarkedItems.contains(item)
                              ? Icons.bookmark
                              : Icons.bookmark_border,
                          color: _bookmarkedItems.contains(item)
                              ? Colors.orange
                              : Colors.grey,
                        ),
                        onPressed: () => _toggleBookmark(item),
                      ),
                      IconButton(
                        icon: const Icon(Icons.delete, color: Colors.red),
                        onPressed: () => _removeItem(item),
                      ),
                    ],
                  ),
                ),
              ),
            )),

            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }
}
