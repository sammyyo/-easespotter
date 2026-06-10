import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:easespotter/services/bookmark_service.dart';
import 'package:easespotter/services/store_api_service.dart';
import 'package:easespotter/services/store_logo_service.dart';
import 'package:easespotter/widgets/product_image_view.dart';

class BookmarksScreen extends StatefulWidget {
  const BookmarksScreen({super.key});

  @override
  State<BookmarksScreen> createState() => _BookmarksScreenState();
}

class _BookmarksScreenState extends State<BookmarksScreen> {
  final BookmarkService _bookmarkService = BookmarkService();
  final ScrollController _scrollController = ScrollController();

  List<Map<String, dynamic>> _bookmarks = [];
  bool _showClearButton = false;

  // Search (keep in AppBar, but NO filter bar below)
  String _query = '';
  bool _searchOpen = false;
  final TextEditingController _searchController = TextEditingController();

  // Track if user tapped UNDO for a given deletion
  bool _didUndoLastDelete = false;
  final Set<String> _armedDeleteKeys = {};
  final Map<String, double> _deleteDragProgress = {};

  @override
  void initState() {
    super.initState();
    _loadBookmarks();
    _scrollController.addListener(_handleScroll);
  }

  void _handleScroll() {
    if (_scrollController.offset > 100 && !_showClearButton) {
      setState(() => _showClearButton = true);
    } else if (_scrollController.offset <= 100 && _showClearButton) {
      setState(() => _showClearButton = false);
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadBookmarks() async {
    final bookmarks = await _bookmarkService.getBookmarks();
    if (!mounted) return;
    setState(() => _bookmarks = bookmarks);
    await _backfillBookmarkLogos(bookmarks);
    if (!mounted) return;
    await _backfillBookmarkImages(_bookmarks);
  }

  List<Map<String, dynamic>> get _filteredBookmarks {
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return _bookmarks;

    return _bookmarks.where((item) {
      final name = (item['name'] ?? '').toString().toLowerCase();
      final location = (item['location'] ?? '').toString().toLowerCase();
      final store =
          (item['storeName'] ?? 'Unknown Store').toString().toLowerCase();
      final price = (item['price'] ?? '').toString().toLowerCase();

      return name.contains(q) ||
          location.contains(q) ||
          store.contains(q) ||
          price.contains(q);
    }).toList();
  }

  Map<String, List<Map<String, dynamic>>> get _groupedByStore {
    final map = <String, List<Map<String, dynamic>>>{};
    for (final item in _filteredBookmarks) {
      final store = (item['storeName'] ?? 'Unknown Store').toString();
      map.putIfAbsent(store, () => []);
      map[store]!.add(item);
    }

    // sort stores; keep Unknown Store last
    final entries =
        map.entries.toList()..sort((a, b) {
          if (a.key == 'Unknown Store' && b.key != 'Unknown Store') return 1;
          if (b.key == 'Unknown Store' && a.key != 'Unknown Store') return -1;
          return a.key.toLowerCase().compareTo(b.key.toLowerCase());
        });

    return Map.fromEntries(entries);
  }

  // ---------- Swipe delete with UNDO ----------

  Future<void> _removeBookmarkWithUndo(Map<String, dynamic> item) async {
    final int originalIndex = _bookmarks.indexOf(item);
    if (originalIndex < 0) return;

    final key = _bookmarkKey(item);
    setState(() => _bookmarks.removeAt(originalIndex));
    _armedDeleteKeys.remove(key);
    _deleteDragProgress.remove(key);
    _didUndoLastDelete = false;

    final snackBarController = ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('“${item['name']}” removed'),
        duration: const Duration(seconds: 4),
        behavior: SnackBarBehavior.floating,
        action: SnackBarAction(
          label: 'UNDO',
          onPressed: () {
            _didUndoLastDelete = true;
            setState(() => _bookmarks.insert(originalIndex, item));
          },
        ),
      ),
    );

    await snackBarController.closed;

    if (!_didUndoLastDelete) {
      await _bookmarkService.removeBookmark(item);
      await _loadBookmarks();
    }
  }

  String _bookmarkKey(Map<String, dynamic> item) {
    return BookmarkService.bookmarkKey(item);
  }

  Widget _deleteBackground(String keyStr) {
    final isArmed = _armedDeleteKeys.contains(keyStr);

    return Container(
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 10),
      decoration: BoxDecoration(
        color: isArmed ? Colors.red.shade700 : Colors.red.shade500,
        borderRadius: BorderRadius.circular(12),
      ),
      alignment: Alignment.centerRight,
      padding: const EdgeInsets.only(right: 16),
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

  Future<bool?> _confirmBookmarkDismiss(
    String keyStr,
    Map<String, dynamic> item,
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
        content: Text('Swipe “${item['name']}” again to delete'),
        duration: const Duration(seconds: 2),
        behavior: SnackBarBehavior.floating,
      ),
    );
    return false;
  }

  Future<void> _clearAllBookmarks() async {
    final shouldClear = await showDialog<bool>(
      context: context,
      builder:
          (context) => AlertDialog(
            title: const Text('Clear All Bookmarks'),
            content: const Text(
              'Are you sure you want to remove all bookmarks?',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Cancel'),
              ),
              ElevatedButton(
                style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
                onPressed: () => Navigator.pop(context, true),
                child: const Text(
                  'Clear All',
                  style: TextStyle(color: Colors.white),
                ),
              ),
            ],
          ),
    );

    if (shouldClear == true) {
      await _bookmarkService.clearAllBookmarks();
      await _loadBookmarks();

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('All bookmarks cleared'),
          backgroundColor: Colors.red[600],
          duration: const Duration(seconds: 2),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  Widget _storeAvatar({
    required String storeName,
    required String logoUrl,
    double size = 22,
  }) {
    final resolvedLogo = StoreLogoService.resolveUrl(logoUrl);
    return CircleAvatar(
      radius: size / 2,
      backgroundColor: Colors.deepPurple.shade50,
      child:
          resolvedLogo.isNotEmpty
              ? ClipOval(
                child: Image.network(
                  resolvedLogo,
                  width: size,
                  height: size,
                  fit: BoxFit.cover,
                  errorBuilder:
                      (_, __, ___) => Icon(
                        Icons.store,
                        color: Colors.deepPurple,
                        size: size * 0.9,
                      ),
                ),
              )
              : Image.asset(
                StoreLogoService.fallbackAsset,
                width: size * 0.85,
                height: size * 0.85,
                fit: BoxFit.contain,
                errorBuilder:
                    (_, __, ___) => Icon(
                      Icons.store,
                      color: Colors.deepPurple,
                      size: size * 0.9,
                    ),
              ),
    );
  }

  String _logoUrlFromItem(Map<String, dynamic> item) {
    return StoreLogoService.resolveFromData(item);
  }

  String _imageUrlFromItem(Map<String, dynamic> item) {
    final value =
        (item['imageUrl'] ??
                item['imageURL'] ??
                item['image'] ??
                item['productImageUrl'] ??
                item['productImageURL'] ??
                item['product_image_url'] ??
                item['productImage'] ??
                item['thumbnailUrl'] ??
                item['thumbnail_url'] ??
                item['photoUrl'] ??
                item['photoURL'] ??
                '')
            .toString()
            .trim();

    return _normalizeProductImageUrl(value);
  }

  String _normalizeProductImageUrl(String value) {
    final uri = Uri.tryParse(value);
    if (uri == null || !uri.hasScheme) return value;

    if (uri.host == 'easespotter.com' &&
        uri.path.startsWith('/uploads/products/')) {
      return uri.replace(host: 'www.easespotter.com').toString();
    }

    return value;
  }

  Widget _productThumbnail(
    Map<String, dynamic> item, {
    double width = 48,
    double height = 48,
  }) {
    final imageUrl = _imageUrlFromItem(item);

    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: Container(
        width: width,
        height: height,
        color: Colors.deepPurple.shade50,
        child: ProductImageView(image: imageUrl),
      ),
    );
  }

  Future<void> _backfillBookmarkLogos(List<Map<String, dynamic>> items) async {
    if (items.isEmpty) return;

    final updatedItems =
        items.map((e) => Map<String, dynamic>.from(e)).toList();
    final storeIdCache = <String, String>{};
    final storeNameCache = <String, String>{};
    bool updated = false;

    for (final item in updatedItems) {
      if (_logoUrlFromItem(item).isNotEmpty) continue;

      final storeId =
          (item['storeId'] ?? item['vendorId'] ?? '').toString().trim();
      final storeName = (item['storeName'] ?? '').toString().trim();

      if (storeId.isEmpty &&
          (storeName.isEmpty || storeName == 'Unknown Store')) {
        continue;
      }

      String logoUrl = '';

      if (storeId.isNotEmpty) {
        if (storeIdCache.containsKey(storeId)) {
          logoUrl = storeIdCache[storeId] ?? '';
        } else {
          final doc =
              await FirebaseFirestore.instance
                  .collection('stores')
                  .doc(storeId)
                  .get();
          final data = doc.data() ?? {};
          logoUrl = StoreLogoService.resolveFromData(data);
          storeIdCache[storeId] = logoUrl;
        }
      } else if (storeName.isNotEmpty) {
        if (storeNameCache.containsKey(storeName)) {
          logoUrl = storeNameCache[storeName] ?? '';
        } else {
          final snap =
              await FirebaseFirestore.instance
                  .collection('stores')
                  .where('name', isEqualTo: storeName)
                  .limit(1)
                  .get();
          final data = snap.docs.isNotEmpty ? snap.docs.first.data() : {};
          logoUrl = StoreLogoService.resolveFromData(data);
          storeNameCache[storeName] = logoUrl;
        }
      }

      if (logoUrl.isNotEmpty) {
        item['logoUrl'] = logoUrl;
        updated = true;
      }
    }

    if (!updated || !mounted) return;
    await _bookmarkService.saveBookmarks(updatedItems);
    if (!mounted) return;
    setState(() => _bookmarks = updatedItems);
  }

  Future<void> _backfillBookmarkImages(List<Map<String, dynamic>> items) async {
    if (items.isEmpty) return;

    final updatedItems =
        items.map((e) => Map<String, dynamic>.from(e)).toList();
    final directoryCache = <String, List<Map<String, dynamic>>>{};
    var updated = false;

    for (final item in updatedItems) {
      if (_imageUrlFromItem(item).isNotEmpty) continue;

      final storeId = await _storeIdForBookmark(item);
      final numericStoreId = int.tryParse(storeId);
      if (numericStoreId == null) continue;

      final products =
          directoryCache[storeId] ??= await _loadDirectoryProducts(
            numericStoreId,
          );

      final product = _findMatchingProduct(item, products);
      if (product == null) continue;

      final imageUrl = _imageUrlFromItem(product);
      if (imageUrl.isEmpty) continue;

      item['imageUrl'] = imageUrl;
      item['image'] = imageUrl;
      item['productImageUrl'] = imageUrl;
      updated = true;
    }

    if (!updated || !mounted) return;
    await _bookmarkService.saveBookmarks(updatedItems);
    if (!mounted) return;
    setState(() => _bookmarks = updatedItems);
  }

  Future<String> _storeIdForBookmark(Map<String, dynamic> item) async {
    final directStoreId =
        (item['storeId'] ?? item['vendorId'] ?? '').toString().trim();
    if (directStoreId.isNotEmpty) return directStoreId;

    final storeName = (item['storeName'] ?? '').toString().trim();
    if (storeName.isEmpty || storeName == 'Unknown Store') return '';

    try {
      final snap =
          await FirebaseFirestore.instance
              .collection('stores')
              .where('name', isEqualTo: storeName)
              .limit(1)
              .get();

      if (snap.docs.isEmpty) return '';
      final data = snap.docs.first.data();
      return (data['storeId'] ?? data['vendorId'] ?? snap.docs.first.id)
          .toString()
          .trim();
    } catch (e) {
      debugPrint('Bookmark store ID lookup failed for $storeName: $e');
      return '';
    }
  }

  Future<List<Map<String, dynamic>>> _loadDirectoryProducts(int storeId) async {
    try {
      final response = await StoreApiService.fetchStoreDirectory(storeId);
      final data = response['data'];
      if (data is! Map) return [];

      final productsByCategory = data['productsByCategory'];
      if (productsByCategory is! Map) return [];

      final products = <Map<String, dynamic>>[];
      for (final entry in productsByCategory.entries) {
        final category = entry.key.toString();
        final rawItems = entry.value;
        if (rawItems is! List) continue;

        for (final rawItem in rawItems) {
          if (rawItem is! Map) continue;
          products.add({
            ...Map<String, dynamic>.from(rawItem),
            'category': category,
          });
        }
      }

      return products;
    } catch (e) {
      debugPrint('Bookmark image backfill failed for store $storeId: $e');
      return [];
    }
  }

  Map<String, dynamic>? _findMatchingProduct(
    Map<String, dynamic> bookmark,
    List<Map<String, dynamic>> products,
  ) {
    final bookmarkName = _clean(bookmark['name']);
    if (bookmarkName.isEmpty) return null;

    final bookmarkPrice = _clean(bookmark['price']);
    final bookmarkLocation = _clean(bookmark['location']);

    for (final product in products) {
      if (_clean(product['name']) != bookmarkName) continue;

      final productPrice = _clean(product['price']);
      if (bookmarkPrice.isNotEmpty &&
          productPrice.isNotEmpty &&
          bookmarkPrice != productPrice) {
        continue;
      }

      final productLocation = _clean(_locationText(product));
      if (bookmarkLocation.isNotEmpty &&
          productLocation.isNotEmpty &&
          bookmarkLocation != productLocation) {
        continue;
      }

      return product;
    }

    return null;
  }

  String _locationText(Map<dynamic, dynamic> item) {
    final location = item['location'];
    if (location is Map) {
      final aisle = location['aisle']?.toString().trim() ?? '';
      final shelf = location['shelf']?.toString().trim() ?? '';
      if (aisle.isNotEmpty && shelf.isNotEmpty) {
        return 'Aisle $aisle - Shelf $shelf';
      }
      if (aisle.isNotEmpty) return 'Aisle $aisle';
      if (shelf.isNotEmpty) return 'Shelf $shelf';
    }

    return (item['location'] ?? '').toString();
  }

  String _clean(dynamic value) {
    return (value ?? '').toString().trim().toLowerCase();
  }

  Widget _bookmarkTile(Map<String, dynamic> item) {
    final name = (item['name'] ?? '').toString();
    final location = (item['location'] ?? '').toString();
    final storeName = (item['storeName'] ?? 'Unknown Store').toString();
    final price = item['price'];
    final logoUrl = _logoUrlFromItem(item);
    final keyStr = _bookmarkKey(item);

    return Dismissible(
      key: ValueKey(keyStr),
      direction: DismissDirection.endToStart,
      dismissThresholds: const {DismissDirection.endToStart: 0.35},
      background: _deleteBackground(keyStr),
      confirmDismiss: (_) => _confirmBookmarkDismiss(keyStr, item),
      onUpdate: (details) {
        final current = _deleteDragProgress[keyStr] ?? 0;
        if (details.progress > current) {
          _deleteDragProgress[keyStr] = details.progress;
        }
      },
      onDismissed: (_) => _removeBookmarkWithUndo(item),
      child: Card(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        margin: const EdgeInsets.fromLTRB(12, 0, 12, 10),
        elevation: 2,
        child: Stack(
          children: [
            Positioned(
              top: 12,
              right: 12,
              child: Container(
                padding: const EdgeInsets.all(2),
                decoration: BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.08),
                      blurRadius: 8,
                      offset: const Offset(0, 3),
                    ),
                  ],
                ),
                child: _storeAvatar(
                  storeName: storeName,
                  logoUrl: logoUrl,
                  size: 30,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 54, 12),
              child: Row(
                children: [
                  _productThumbnail(item, width: 92, height: 92),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            height: 1.15,
                          ),
                        ),
                        const SizedBox(height: 9),
                        Wrap(
                          spacing: 8,
                          runSpacing: 6,
                          children: [
                            if (location.isNotEmpty)
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 9,
                                  vertical: 5,
                                ),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFF3F0FF),
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: Text(
                                  location,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: Colors.deepPurple,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ),
                            if (price != null)
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 9,
                                  vertical: 5,
                                ),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFFFF3E0),
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: Text(
                                  '€$price',
                                  style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w900,
                                    color: Color(0xFFB45F06),
                                  ),
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Text(
                          storeName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            color: Colors.black87,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // Collapsible store header (logo/icon + subtle divider)
  Widget _storeExpansion(String storeName, List<Map<String, dynamic>> items) {
    // ✅ Pull logoUrl from the grouped items (same logic as FollowedStoresScreen)
    // We try a few common keys to be safe.
    String logoUrl = '';
    for (final it in items) {
      final v = _logoUrlFromItem(it);
      if (v.isNotEmpty) {
        logoUrl = v;
        break;
      }
    }

    return Container(
      margin: const EdgeInsets.fromLTRB(12, 10, 12, 0),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.black.withOpacity(0.06)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 10,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Theme(
        // keep ExpansionTile tight + clean
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          childrenPadding: const EdgeInsets.only(bottom: 6),
          initiallyExpanded: storeName != 'Unknown Store', // nice default
          title: Row(
            children: [
              // ✅ Logo first, fallback to icons if no logo / error
              _storeAvatar(storeName: storeName, logoUrl: logoUrl, size: 22),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  storeName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.2,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: const Color(0xFFEFF2FF),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: const Color(0xFFD9E1FF)),
                ),
                child: Text(
                  '${items.length}',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: Colors.grey.shade800,
                  ),
                ),
              ),
            ],
          ),
          children: [
            // subtle divider
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
              child: Divider(
                height: 1,
                thickness: 1,
                color: Colors.black.withOpacity(0.06),
              ),
            ),
            for (final item in items) _bookmarkTile(item),
          ],
        ),
      ),
    );
  }

  void _toggleSearch() {
    setState(() {
      _searchOpen = !_searchOpen;
      if (!_searchOpen) {
        _query = '';
        _searchController.clear();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final isEmpty = _bookmarks.isEmpty;
    final grouped = _groupedByStore;
    final nothingMatches = !isEmpty && _filteredBookmarks.isEmpty;

    return Scaffold(
      backgroundColor: const Color(0xFFF6F7FB),
      appBar: AppBar(
        backgroundColor: Colors.deepPurple,
        elevation: 0,
        centerTitle: true,
        iconTheme: const IconThemeData(color: Colors.white),
        title:
            _searchOpen
                ? TextField(
                  controller: _searchController,
                  autofocus: true,
                  onChanged: (v) => setState(() => _query = v),
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                  ),
                  cursorColor: Colors.white,
                  decoration: InputDecoration(
                    hintText: 'Search bookmarks...',
                    hintStyle: TextStyle(color: Colors.white.withOpacity(0.75)),
                    border: InputBorder.none,
                  ),
                )
                : const Text(
                  'Bookmarks',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                  ),
                ),
        actions: [
          if (!isEmpty)
            IconButton(
              onPressed: _toggleSearch,
              icon: Icon(_searchOpen ? Icons.close : Icons.search),
              color: Colors.white,
              tooltip: _searchOpen ? 'Close search' : 'Search',
            ),
          if (!isEmpty && _showClearButton)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: TextButton.icon(
                onPressed: _clearAllBookmarks,
                icon: const Icon(
                  Icons.delete_forever,
                  color: Colors.red,
                  size: 20,
                ),
                label: const Text(
                  'Clear',
                  style: TextStyle(
                    color: Colors.red,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(20),
                  ),
                ),
              ),
            ),
        ],
      ),
      body:
          isEmpty
              ? const Center(
                child: Text(
                  'No bookmarks yet.',
                  style: TextStyle(fontSize: 16, color: Colors.grey),
                ),
              )
              : nothingMatches
              ? const Center(
                child: Text(
                  'No results. Try a different search.',
                  style: TextStyle(fontSize: 16, color: Colors.grey),
                ),
              )
              : ListView(
                controller: _scrollController,
                children: [
                  const SizedBox(height: 4),
                  for (final entry in grouped.entries)
                    _storeExpansion(entry.key, entry.value),
                  const SizedBox(height: 16),
                ],
              ),
    );
  }
}
