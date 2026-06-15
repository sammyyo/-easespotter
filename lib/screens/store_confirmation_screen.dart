import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:easespotter/services/bookmark_service.dart';
import 'package:easespotter/screens/product_details_screen.dart';
import 'package:easespotter/services/store_follow_service.dart';
import 'package:easespotter/services/grocery_list_service.dart';
import 'package:easespotter/services/home_inventory_service.dart';
import 'package:easespotter/services/store_api_service.dart';
import 'package:easespotter/services/store_logo_service.dart';
import 'package:easespotter/widgets/product_image_view.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class StoreConfirmationScreen extends StatefulWidget {
  final Map<String, dynamic> storeData;

  const StoreConfirmationScreen({super.key, required this.storeData});

  @override
  State<StoreConfirmationScreen> createState() =>
      _StoreConfirmationScreenState();
}

class _StoreConfirmationScreenState extends State<StoreConfirmationScreen> {
  final BookmarkService _bookmarkService = BookmarkService();
  final GroceryListService _groceryListService = GroceryListService();
  final HomeInventoryService _inventory = HomeInventoryService();

  late List<Map<String, dynamic>> _allItems;
  final List<Map<String, dynamic>> _selectedItems = [];
  final Set<String> _bookmarkedKeys = {};
  final Set<String> _armedDeleteKeys = {};
  final Map<String, double> _deleteDragProgress = {};
  final TextEditingController _searchController = TextEditingController();
  Timer? _searchDebounce;
  String _lastNotFoundQuery = '';
  bool _isLoading = false;
  Future<void>? _productsRefreshFuture;

  bool _isFollowingStore = false;
  bool _checkingFollow = true;

  // ---------------- Grocery List Pref Helpers ----------------

  Future<List<Map<String, dynamic>>> _loadGroceryPrefsList() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('grocery_list');
    if (raw == null || raw.trim().isEmpty) return [];

    final decoded = jsonDecode(raw);
    if (decoded is! List) return [];

    return List<Map<String, dynamic>>.from(
      decoded.map((e) => Map<String, dynamic>.from(e)),
    );
  }

  Future<void> _saveGroceryPrefsList(List<Map<String, dynamic>> list) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('grocery_list', jsonEncode(list));
  }

  int _findGroceryIndex(List<Map<String, dynamic>> list, String title) {
    final t = title.trim().toLowerCase();
    if (t.isEmpty) return -1;

    for (int i = 0; i < list.length; i++) {
      final existingTitle =
          (list[i]['title'] ?? '').toString().trim().toLowerCase();
      if (existingTitle == t) return i;
    }
    return -1;
  }

  Future<bool> _incrementExistingGroceryItem(String title, {int by = 1}) async {
    final list = await _loadGroceryPrefsList();
    final idx = _findGroceryIndex(list, title);
    if (idx == -1) return false;

    final currentQty =
        (list[idx]['quantity'] is num)
            ? (list[idx]['quantity'] as num).toInt()
            : int.tryParse(list[idx]['quantity']?.toString() ?? '') ?? 1;

    final unit =
        (list[idx]['unitPrice'] is num)
            ? (list[idx]['unitPrice'] as num).toDouble()
            : double.tryParse(list[idx]['unitPrice']?.toString() ?? '') ?? 0.0;

    final nextQty = (currentQty + by).clamp(1, 999999);
    final nextPrice = unit * nextQty;

    list[idx]['quantity'] = nextQty;
    list[idx]['price'] = nextPrice;

    await _saveGroceryPrefsList(list);
    return true;
  }

  int _parsePositiveInt(String s, {int fallback = 1, int max = 9999}) {
    final v = int.tryParse(s.trim());
    if (v == null || v <= 0) return fallback;
    return v > max ? max : v;
  }

  Future<int?> _askIncrementAmount(BuildContext context, String title) async {
    int selected = 1;
    final c = TextEditingController(text: '1');

    return showDialog<int>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setLocal) {
            void setAmount(int v) {
              setLocal(() {
                selected = v;
                c.text = v.toString();
              });
            }

            return AlertDialog(
              title: const Text('Already in your Grocery List'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '“$title” is already in your list.\n\nHow many more do you want to add?',
                  ),
                  const SizedBox(height: 14),

                  // Quick picks
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: [
                      _QtyChip(
                        label: '+1',
                        selected: selected == 1,
                        onTap: () => setAmount(1),
                      ),
                      _QtyChip(
                        label: '+2',
                        selected: selected == 2,
                        onTap: () => setAmount(2),
                      ),
                      _QtyChip(
                        label: '+3',
                        selected: selected == 3,
                        onTap: () => setAmount(3),
                      ),
                    ],
                  ),

                  const SizedBox(height: 14),

                  TextField(
                    controller: c,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Or type quantity',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    onChanged: (val) {
                      setLocal(() {
                        selected = _parsePositiveInt(val, fallback: 1);
                      });
                    },
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx, null),
                  child: const Text('Cancel'),
                ),
                TextButton(
                  onPressed: () => Navigator.pop(ctx, 0),
                  child: const Text('Do nothing'),
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.deepPurple,
                  ),
                  onPressed: () {
                    final amount = _parsePositiveInt(
                      c.text,
                      fallback: selected,
                    );
                    Navigator.pop(ctx, amount);
                  },
                  child: const Text(
                    'Update',
                    style: TextStyle(color: Colors.white),
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }

  Future<int?> _askAddToInventoryQty(BuildContext context, String title) async {
    int selected = 1;
    final c = TextEditingController(text: '1');

    return showDialog<int>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setLocal) {
            void setAmount(int v) {
              setLocal(() {
                selected = v;
                c.text = v.toString();
              });
            }

            return AlertDialog(
              title: const Text('Add to Home Inventory'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('“$title”'),
                  const SizedBox(height: 12),
                  const Text('Choose how many you want to add:'),
                  const SizedBox(height: 14),

                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: [
                      _QtyChip(
                        label: '+1',
                        selected: selected == 1,
                        onTap: () => setAmount(1),
                      ),
                      _QtyChip(
                        label: '+2',
                        selected: selected == 2,
                        onTap: () => setAmount(2),
                      ),
                      _QtyChip(
                        label: '+3',
                        selected: selected == 3,
                        onTap: () => setAmount(3),
                      ),
                    ],
                  ),

                  const SizedBox(height: 14),

                  TextField(
                    controller: c,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Or type quantity',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    onChanged: (val) {
                      setLocal(() {
                        selected = _parsePositiveInt(val, fallback: 1);
                      });
                    },
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx, null),
                  child: const Text('Cancel'),
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.deepPurple,
                  ),
                  onPressed: () {
                    final amount = _parsePositiveInt(
                      c.text,
                      fallback: selected,
                    );
                    Navigator.pop(ctx, amount);
                  },
                  child: const Text(
                    'Add',
                    style: TextStyle(color: Colors.white),
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }

  // -----------------------------------------------------------

  String _itemKey(Map<String, dynamic> item) {
    return BookmarkService.bookmarkKey(_bookmarkPayload(item));
  }

  Map<String, dynamic> _bookmarkPayload(Map<String, dynamic> item) {
    final enrichedItem = Map<String, dynamic>.from(item);
    enrichedItem['storeName'] =
        widget.storeData['vendorName'] ??
        widget.storeData['name'] ??
        'Unknown Store';

    final storeLogo = _storeLogoUrl();
    if (storeLogo.isNotEmpty) {
      enrichedItem['logoUrl'] = storeLogo;
    }

    final storeId =
        (widget.storeData['vendorId'] ?? widget.storeData['storeId'] ?? '')
            .toString()
            .trim();
    if (storeId.isNotEmpty) {
      enrichedItem['storeId'] = storeId;
    }

    final imageUrl = _imageUrlFromItem(item);
    if (imageUrl.isNotEmpty) {
      enrichedItem['imageUrl'] = imageUrl;
      enrichedItem['image'] = imageUrl;
      enrichedItem['productImageUrl'] = imageUrl;
      enrichedItem['thumbnailUrl'] = imageUrl;
    }

    return enrichedItem;
  }

  String _imageUrlFromItem(Map<String, dynamic> item) {
    final images = item['images'];
    if (images is List) {
      for (final image in images) {
        final url = _imageUrlFromCandidate(image);
        if (url.isNotEmpty) return url;
      }
    }

    return _absoluteUrl(
      _firstStringValue(item, const [
        'imageUrl',
        'imageURL',
        'image_url',
        'image',
        'photoUrl',
        'photoURL',
        'photo_url',
        'productImageUrl',
        'productImageURL',
        'product_image_url',
        'productImage',
        'product_image',
        'thumbnail',
        'thumbnailUrl',
        'thumbnail_url',
        'url',
      ]),
    );
  }

  String _imageUrlFromCandidate(dynamic candidate) {
    if (candidate is Map) {
      return _absoluteUrl(
        _firstStringValue(candidate, const [
          'url',
          'src',
          'href',
          'imageUrl',
          'imageURL',
          'image_url',
          'productImageUrl',
          'productImageURL',
          'product_image_url',
          'photoUrl',
          'photo_url',
          'thumbnailUrl',
          'thumbnail_url',
        ]),
      );
    }

    return _absoluteUrl(candidate?.toString());
  }

  String _storeLogoUrl() {
    return StoreLogoService.resolveFromData(widget.storeData);
  }

  String _currentStoreId() {
    return (widget.storeData['vendorId'] ??
            widget.storeData['storeId'] ??
            widget.storeData['vendorid'] ??
            '')
        .toString()
        .trim();
  }

  String _currentStoreName() {
    return (widget.storeData['vendorName'] ??
            widget.storeData['name'] ??
            widget.storeData['vendorBusinessName'] ??
            'Unknown Store')
        .toString()
        .trim();
  }

  num? _unitPriceFromItem(Map<String, dynamic> item) {
    final raw = (item['price'] ?? item['unitPrice'] ?? '').toString().trim();
    if (raw.isEmpty) return null;
    final cleaned = raw
        .replaceAll(RegExp(r'[^0-9.,-]'), '')
        .replaceAll(',', '.');
    final value = double.tryParse(cleaned);
    if (value == null || value < 0) return null;
    return value;
  }

  String _firstStringValue(Map<dynamic, dynamic> data, List<String> keys) {
    for (final key in keys) {
      final value = data[key]?.toString().trim();
      if (value != null && value.isNotEmpty) return value;
    }
    return '';
  }

  String _absoluteUrl(String? rawUrl) {
    final value = rawUrl?.trim() ?? '';
    if (value.isEmpty) return '';
    if (_isBrokenPlaceholderImage(value)) return '';

    final uri = Uri.tryParse(value);
    if (uri != null && uri.hasScheme) return _normalizeProductImageUrl(uri);

    if (value.startsWith('//')) return 'https:$value';
    if (value.startsWith('/')) return '${StoreApiService.baseUrl}$value';

    return '${StoreApiService.baseUrl}/$value';
  }

  String _normalizeProductImageUrl(Uri uri) {
    return uri.toString();
  }

  bool _isBrokenPlaceholderImage(String value) {
    final lower = value.toLowerCase();
    return lower.endsWith('/logos/default-vendor.png') ||
        RegExp(r'(^|/)logos/vendor-\d+\.png$').hasMatch(lower) ||
        lower == 'logos/default-vendor.png' ||
        lower == '/logos/default-vendor.png';
  }

  String _locationText(Map<dynamic, dynamic> item) {
    final location = item['location'];
    if (location is Map) {
      final aisle = _locationValue(item, 'aisle');
      final shelf = _locationValue(item, 'shelf');
      if (aisle.isNotEmpty && shelf.isNotEmpty) {
        return 'Aisle $aisle - Shelf $shelf';
      }
      if (aisle.isNotEmpty) return 'Aisle $aisle';
      if (shelf.isNotEmpty) return 'Shelf $shelf';
    }

    return _firstStringValue(item, const [
      'location',
      'locationText',
      'location_text',
      'aisleLocation',
      'aisle_location',
    ]);
  }

  String _locationValue(Map<dynamic, dynamic> item, String key) {
    final location = item['location'];
    if (location is Map) {
      final value = location[key]?.toString().trim();
      if (value != null && value.isNotEmpty) return value;
    }

    final directValue = item[key]?.toString().trim();
    return directValue ?? '';
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

  Widget _deleteBackground(String keyStr) {
    final isArmed = _armedDeleteKeys.contains(keyStr);

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
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

  Future<bool?> _confirmItemDismiss(
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
        content: Text('Swipe “${item['name']}” again to remove'),
        duration: const Duration(seconds: 2),
        behavior: SnackBarBehavior.floating,
      ),
    );
    return false;
  }

  Widget _searchResultCard(Map<String, dynamic> item) {
    final name = (item['name'] ?? '').toString();
    final location = (item['location'] ?? '').toString();
    final price = item['price']?.toString().trim() ?? '';
    final keyStr = _itemKey(item);
    final isBookmarked = _bookmarkedKeys.contains(keyStr);

    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 300),
      child: Dismissible(
        key: ValueKey(keyStr),
        direction: DismissDirection.endToStart,
        dismissThresholds: const {DismissDirection.endToStart: 0.35},
        background: _deleteBackground(keyStr),
        confirmDismiss: (_) => _confirmItemDismiss(keyStr, item),
        onUpdate: (details) {
          final current = _deleteDragProgress[keyStr] ?? 0;
          if (details.progress > current) {
            _deleteDragProgress[keyStr] = details.progress;
          }
        },
        onDismissed: (_) => _removeItem(item),
        child: Card(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          elevation: 2,
          margin: const EdgeInsets.symmetric(vertical: 6),
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () => _openProductDetails(item),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
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
                            if (price.isNotEmpty)
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
                        Row(
                          children: [
                            _itemActionButton(
                              icon: Icons.kitchen,
                              color: Colors.deepPurple,
                              tooltip: 'Brought home (add to inventory)',
                              onPressed: () => _guardedAddToHomeInventory(item),
                            ),
                            const SizedBox(width: 8),
                            _itemActionButton(
                              icon: Icons.playlist_add,
                              color: Colors.teal,
                              tooltip: 'Add to Grocery List',
                              onPressed: () => _guardedAddToGroceryList(item),
                            ),
                            const SizedBox(width: 8),
                            _itemActionButton(
                              icon:
                                  isBookmarked
                                      ? Icons.bookmark
                                      : Icons.bookmark_border,
                              color: isBookmarked ? Colors.orange : Colors.grey,
                              tooltip:
                                  isBookmarked
                                      ? 'Remove from bookmarks'
                                      : 'Add to bookmarks',
                              onPressed: () => _toggleBookmark(item),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _itemActionButton({
    required IconData icon,
    required Color color,
    required String tooltip,
    required VoidCallback onPressed,
  }) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.10),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: color, size: 19),
        ),
      ),
    );
  }

  void _openProductDetails(Map<String, dynamic> item) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ProductDetailsScreen(product: _bookmarkPayload(item)),
      ),
    );
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _cacheStoreData();

    _allItems = _buildSearchItems(widget.storeData);
    _productsRefreshFuture = _refreshStoreProductsFromApi();
    _loadBookmarkedKeys();

    final storeId = widget.storeData['vendorId']?.toString() ?? '';
    if (storeId.isNotEmpty) {
      StoreFollowService.isFollowing(storeId).then((isFollowing) {
        if (!mounted) return;
        setState(() {
          _isFollowingStore = isFollowing;
          _checkingFollow = false;
        });
      });
    } else {
      setState(() {
        _checkingFollow = false;
      });
    }
  }

  List<Map<String, dynamic>> _buildSearchItems(Map<String, dynamic> storeData) {
    final Map<String, dynamic> productsByCategory =
        storeData['productsByCategory'] ?? {};
    final flattened =
        productsByCategory.entries.expand((entry) {
          final category = entry.key;
          final List items = entry.value;
          return items.whereType<Map>().map((item) {
            final product = Map<String, dynamic>.from(item);
            final imageUrl = _imageUrlFromItem(product);

            return {
              ...product,
              'name': product['name'],
              'location': _locationText(product),
              'category': category,
              'storeName': storeData['vendorName'] ?? 'Unknown Store',
              'price': product['price'] ?? '',
              if (imageUrl.isNotEmpty) ...{
                'imageUrl': imageUrl,
                'image': imageUrl,
                'productImageUrl': imageUrl,
                'thumbnailUrl': imageUrl,
              },
              'barcode': product['barcode'],
              'aisle': _locationValue(product, 'aisle'),
              'shelf': _locationValue(product, 'shelf'),
            };
          });
        }).toList();

    return List<Map<String, dynamic>>.from(flattened);
  }

  Future<void> _refreshStoreProductsFromApi() async {
    final storeId =
        (widget.storeData['vendorId'] ??
                widget.storeData['storeId'] ??
                widget.storeData['vendorid'] ??
                '')
            .toString()
            .trim();
    final numericStoreId = int.tryParse(storeId);
    if (numericStoreId == null) return;

    try {
      final apiData = await StoreApiService.fetchStoreById(numericStoreId);
      final refreshedStoreData = <String, dynamic>{
        ...widget.storeData,
        ...apiData,
      };
      final refreshedItems = _buildSearchItems(refreshedStoreData);
      if (!mounted || refreshedItems.isEmpty) return;

      setState(() {
        _allItems = refreshedItems;
        _replaceSelectedItemsWithRefreshedImages(refreshedItems);
      });
      await _cacheStoreDataFrom(refreshedStoreData);
    } catch (e) {
      debugPrint('Store product image refresh failed: $e');
    }
  }

  void _replaceSelectedItemsWithRefreshedImages(
    List<Map<String, dynamic>> refreshedItems,
  ) {
    for (var index = 0; index < _selectedItems.length; index++) {
      final selected = _selectedItems[index];
      final refreshed = _findMatchingSearchItem(selected, refreshedItems);
      if (refreshed != null && _imageUrlFromItem(refreshed).isNotEmpty) {
        _selectedItems[index] = refreshed;
      }
    }
  }

  Map<String, dynamic>? _findMatchingSearchItem(
    Map<String, dynamic> target,
    List<Map<String, dynamic>> candidates,
  ) {
    final targetName = (target['name'] ?? '').toString().trim().toLowerCase();
    if (targetName.isEmpty) return null;

    final targetPrice = (target['price'] ?? '').toString().trim();
    final targetLocation = (target['location'] ?? '').toString().trim();

    for (final item in candidates) {
      if ((item['name'] ?? '').toString().trim().toLowerCase() != targetName) {
        continue;
      }
      final itemPrice = (item['price'] ?? '').toString().trim();
      if (targetPrice.isNotEmpty &&
          itemPrice.isNotEmpty &&
          itemPrice != targetPrice) {
        continue;
      }
      final itemLocation = (item['location'] ?? '').toString().trim();
      if (targetLocation.isNotEmpty &&
          itemLocation.isNotEmpty &&
          itemLocation != targetLocation) {
        continue;
      }
      return item;
    }

    return null;
  }

  Future<void> _cacheStoreData() async {
    await _cacheStoreDataFrom(widget.storeData);
  }

  Future<void> _cacheStoreDataFrom(Map<String, dynamic> storeData) async {
    final storeId =
        (storeData['vendorId'] ?? storeData['storeId'] ?? '').toString().trim();
    if (storeId.isEmpty) return;

    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        'store_cache_$storeId',
        jsonEncode(_safeStoreCacheData(storeData)),
      );
    } catch (e) {
      debugPrint('Store cache save failed: $e');
    }

    try {
      final logoUrl = StoreLogoService.resolveFromData(storeData);
      final storeName =
          (storeData['vendorName'] ?? storeData['name'] ?? '')
              .toString()
              .trim();

      await FirebaseFirestore.instance.collection('stores').doc(storeId).set({
        'storeId': storeId,
        'vendorId': storeId,
        if (storeName.isNotEmpty) 'name': storeName,
        if (storeName.isNotEmpty) 'vendorName': storeName,
        if (logoUrl.isNotEmpty) 'logoUrl': logoUrl,
        if (_safeProductsByCategory(storeData) != null)
          'productsByCategory': _safeProductsByCategory(storeData),
        if (storeData['totalProducts'] != null)
          'totalProducts': storeData['totalProducts'],
        'payload': _safeStoreCacheData(storeData),
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    } catch (e) {
      debugPrint('Store Firestore cache save failed: $e');
    }
  }

  Map<String, dynamic> _safeStoreCacheData(Map<String, dynamic> storeData) {
    final safe = Map<String, dynamic>.from(storeData);
    final safeProducts = _safeProductsByCategory(storeData);
    if (safeProducts != null) {
      safe['productsByCategory'] = safeProducts;
    }
    safe.remove('productsByAisle');
    return safe;
  }

  Map<String, dynamic>? _safeProductsByCategory(
    Map<String, dynamic> storeData,
  ) {
    final productsByCategory = storeData['productsByCategory'];
    if (productsByCategory is! Map) return null;

    final safe = <String, dynamic>{};
    for (final entry in productsByCategory.entries) {
      final rawProducts = entry.value;
      if (rawProducts is! List) continue;

      safe[entry.key.toString()] =
          rawProducts.whereType<Map>().map((product) {
            final safeProduct = Map<String, dynamic>.from(product);
            final imageUrl = _imageUrlFromItem(safeProduct);
            if (imageUrl.isNotEmpty) {
              safeProduct['imageUrl'] = imageUrl;
              safeProduct['image'] = imageUrl;
              safeProduct['productImageUrl'] = imageUrl;
              safeProduct['thumbnailUrl'] = imageUrl;
            }
            return safeProduct;
          }).toList();
    }

    return safe;
  }

  void _onSearchChanged(String value) {
    _searchDebounce?.cancel();

    final trimmed = value.trim();
    if (trimmed.length < 3) return;

    _searchDebounce = Timer(const Duration(milliseconds: 650), () {
      _searchAndAdd(trimmed);
    });
  }

  Future<void> _searchAndAdd(String query) async {
    final trimmed = query.trim().toLowerCase();
    if (trimmed.isEmpty) return;

    setState(() => _isLoading = true);

    try {
      await _productsRefreshFuture;
    } catch (_) {
      // Fall back to whatever products were passed into this screen.
    }
    await Future.delayed(const Duration(milliseconds: 150));

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
    } else if (match.isEmpty) {
      _showProductNotFound(query);
    }
  }

  void _showProductNotFound(String query) {
    final cleanQuery = query.trim();
    if (cleanQuery.isEmpty || _lastNotFoundQuery == cleanQuery.toLowerCase()) {
      return;
    }

    _lastNotFoundQuery = cleanQuery.toLowerCase();
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Item/Product not found: “$cleanQuery”'),
        duration: const Duration(seconds: 2),
        backgroundColor: Colors.orange[700],
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  void _removeItem(Map<String, dynamic> item) {
    final key = _itemKey(item);
    setState(() {
      _selectedItems.remove(item);
      _armedDeleteKeys.remove(key);
      _deleteDragProgress.remove(key);
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
    final key = _itemKey(item);
    final isBookmarked = _bookmarkedKeys.contains(key);
    final enrichedItem = _bookmarkPayload(item);

    if (isBookmarked) {
      _showAlreadyBookmarkedDialog(item);
      return;
    }

    final alreadySaved = await _bookmarkService.isBookmarked(enrichedItem);
    if (alreadySaved) {
      if (!mounted) return;
      setState(() => _bookmarkedKeys.add(key));
      _showAlreadyBookmarkedDialog(item);
      return;
    }

    setState(() => _bookmarkedKeys.add(key));
    await _bookmarkService.saveBookmark(enrichedItem);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('“${item['name']}” bookmarked'),
        backgroundColor: Colors.blue[700],
        duration: const Duration(seconds: 2),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  Future<void> _loadBookmarkedKeys() async {
    final bookmarks = await _bookmarkService.getBookmarks();
    if (!mounted) return;

    setState(() {
      _bookmarkedKeys
        ..clear()
        ..addAll(bookmarks.map(BookmarkService.bookmarkKey));
    });
  }

  void _showAlreadyBookmarkedDialog(Map<String, dynamic> item) {
    if (!mounted) return;

    showDialog<void>(
      context: context,
      builder:
          (context) => AlertDialog(
            title: const Text('Item Already Bookmarked'),
            content: Text('“${item['name']}” is already in your Bookmarks.'),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('OK'),
              ),
            ],
          ),
    );
  }

  Future<void> _addToHomeInventory(Map<String, dynamic> item) async {
    final name = (item['name'] ?? '').toString().trim();
    final barcode = (item['barcode'] ?? '').toString().trim();
    if (name.isEmpty) return;

    if (FirebaseAuth.instance.currentUser == null) {
      await FirebaseAuth.instance.signInAnonymously();
    }

    final amount = await _askAddToInventoryQty(context, name);
    if (amount == null) return; // user cancelled

    try {
      if (barcode.isNotEmpty) {
        await _inventory.increment(
          name: name,
          barcode: barcode,
          by: amount,
          source: 'store',
          storeId: _currentStoreId(),
          storeName: _currentStoreName(),
          aisle: _locationValue(item, 'aisle'),
          shelf: _locationValue(item, 'shelf'),
          location: (item['location'] ?? '').toString(),
          imageUrl: _imageUrlFromItem(item),
          unitPrice: _unitPriceFromItem(item),
        );
      } else {
        // If no barcode, best-effort: just upsert +amount (no stable doc id)
        await _inventory.upsertItem(
          name: name,
          barcode: null,
          quantity: amount,
          source: 'store',
          storeId: _currentStoreId(),
          storeName: _currentStoreName(),
          aisle: _locationValue(item, 'aisle'),
          shelf: _locationValue(item, 'shelf'),
          location: (item['location'] ?? '').toString(),
          imageUrl: _imageUrlFromItem(item),
          unitPrice: _unitPriceFromItem(item),
        );
      }

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Added +$amount “$name” to Home Inventory'),
          behavior: SnackBarBehavior.floating,
          backgroundColor: Colors.teal,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed to add to Home Inventory: $e'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  Future<void> _guardedAddToHomeInventory(Map<String, dynamic> item) async {
    final name = (item['name'] ?? '').toString().trim();
    final barcode = (item['barcode'] ?? '').toString().trim();
    if (name.isEmpty) return;

    if (FirebaseAuth.instance.currentUser == null) {
      await FirebaseAuth.instance.signInAnonymously();
    }

    bool alreadyHave = false;
    try {
      alreadyHave = await _isInHomeInventory(name: name, barcode: barcode);
    } catch (_) {
      alreadyHave = false;
    }

    if (alreadyHave) {
      final proceed = await showDialog<bool>(
        context: context,
        builder:
            (ctx) => AlertDialog(
              title: const Text('Already in Home Inventory'),
              content: Text(
                '“$name” is already in your inventory.\n\nIncrement it anyway?',
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx, false),
                  child: const Text('No'),
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.deepPurple,
                  ),
                  onPressed: () => Navigator.pop(ctx, true),
                  child: const Text(
                    'Increment',
                    style: TextStyle(color: Colors.white),
                  ),
                ),
              ],
            ),
      );

      if (proceed != true) return;
    }

    await _addToHomeInventory(item);
  }

  Future<bool> _isInHomeInventory({
    required String name,
    required String barcode,
  }) async {
    if (FirebaseAuth.instance.currentUser == null) {
      await FirebaseAuth.instance.signInAnonymously();
    }

    final uid = FirebaseAuth.instance.currentUser!.uid;

    if (barcode.trim().isNotEmpty) {
      final doc =
          await FirebaseFirestore.instance
              .collection('users')
              .doc(uid)
              .collection('home_inventory')
              .doc(barcode.trim())
              .get();
      return doc.exists;
    }

    final n = name.trim().toLowerCase();
    if (n.isEmpty) return false;

    final snap =
        await FirebaseFirestore.instance
            .collection('users')
            .doc(uid)
            .collection('home_inventory')
            .where('name', isEqualTo: name.trim())
            .limit(1)
            .get();

    if (snap.docs.isNotEmpty) return true;

    final recent =
        await FirebaseFirestore.instance
            .collection('users')
            .doc(uid)
            .collection('home_inventory')
            .orderBy('updatedAt', descending: true)
            .limit(50)
            .get();

    return recent.docs.any(
      (d) => ((d.data()['name'] ?? '').toString().trim().toLowerCase() == n),
    );
  }

  Future<void> _guardedAddToGroceryList(Map<String, dynamic> item) async {
    final name = (item['name'] ?? '').toString().trim();
    final barcode = (item['barcode'] ?? '').toString().trim();
    if (name.isEmpty) return;

    bool alreadyHaveAtHome = false;
    try {
      alreadyHaveAtHome = await _isInHomeInventory(
        name: name,
        barcode: barcode,
      );
    } catch (_) {
      alreadyHaveAtHome = false;
    }

    if (alreadyHaveAtHome) {
      final proceed = await showDialog<bool>(
        context: context,
        builder:
            (ctx) => AlertDialog(
              title: const Text('Already in Home Inventory'),
              content: Text(
                'You already have “$name” at home.\n\nAdd it to your Grocery List anyway?',
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx, false),
                  child: const Text('No'),
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.deepPurple,
                  ),
                  onPressed: () => Navigator.pop(ctx, true),
                  child: const Text(
                    'Add anyway',
                    style: TextStyle(color: Colors.white),
                  ),
                ),
              ],
            ),
      );

      if (proceed != true) return;
    }

    final current = await _loadGroceryPrefsList();
    final existingIndex = _findGroceryIndex(current, name);

    if (existingIndex != -1) {
      final amount = await _askIncrementAmount(context, name);
      if (amount == null) return; // cancel
      if (amount == 0) return; // do nothing

      final ok = await _incrementExistingGroceryItem(name, by: amount);

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            ok
                ? 'Updated quantity (+$amount) for “$name”'
                : 'Could not update “$name”',
          ),
          behavior: SnackBarBehavior.floating,
          backgroundColor: Colors.teal,
        ),
      );

      return;
    }

    await _promptAddToGroceryList(item);
  }

  Future<void> _promptAddToGroceryList(Map<String, dynamic> item) async {
    final itemName = (item['name'] ?? '').toString().trim();
    if (itemName.isEmpty) return;

    final categories = <String>[
      'General',
      'Snacks',
      'Drinks',
      'Fruits',
      'Vegetables',
    ];

    String selectedCategory = (item['category'] ?? 'General').toString();
    if (!categories.contains(selectedCategory)) selectedCategory = 'General';

    String action = 'current';

    bool saveAsFavoriteFirst = false;
    final favTitleController = TextEditingController(text: 'My List (Backup)');

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setLocal) {
            final GlobalKey categoryFieldKey = GlobalKey();

            Future<void> openCategoryMenu() async {
              final RenderBox box =
                  categoryFieldKey.currentContext!.findRenderObject()
                      as RenderBox;
              final RenderBox overlay =
                  Overlay.of(context).context.findRenderObject() as RenderBox;

              final Offset offset = box.localToGlobal(Offset.zero);
              final Size overlaySize = overlay.size;

              final double popupWidth = box.size.width;

              final double left = offset.dx;
              final double top = offset.dy + box.size.height + 8.0;
              final double right = overlaySize.width - (left + popupWidth);

              final selected = await showMenu<String>(
                context: context,
                color: Colors.white,
                elevation: 8,
                clipBehavior: Clip.antiAlias,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
                constraints: BoxConstraints.tightFor(width: popupWidth),
                position: RelativeRect.fromLTRB(
                  left,
                  top,
                  right,
                  overlaySize.height - top,
                ),
                items:
                    categories.asMap().entries.map((entry) {
                      final i = entry.key;
                      final cat = entry.value;
                      final isFirst = i == 0;
                      final isLast = i == categories.length - 1;
                      final isSelected = cat == selectedCategory;

                      return PopupMenuItem<String>(
                        value: cat,
                        padding: EdgeInsets.zero,
                        child: ClipRRect(
                          borderRadius: BorderRadius.vertical(
                            top:
                                isFirst
                                    ? const Radius.circular(14)
                                    : Radius.zero,
                            bottom:
                                isLast
                                    ? const Radius.circular(14)
                                    : Radius.zero,
                          ),
                          child: Container(
                            width: popupWidth,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 14,
                            ),
                            decoration: BoxDecoration(
                              color:
                                  isSelected
                                      ? const Color(0xFFF3EDFF)
                                      : Colors.transparent,
                              border:
                                  isLast
                                      ? null
                                      : const Border(
                                        bottom: BorderSide(
                                          color: Color(0xFFE6E6E6),
                                          width: 1,
                                        ),
                                      ),
                            ),
                            child: Text(
                              cat,
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                                color:
                                    isSelected
                                        ? Colors.deepPurple
                                        : Colors.black87,
                              ),
                            ),
                          ),
                        ),
                      );
                    }).toList(),
              );

              if (selected != null && selected != selectedCategory) {
                setLocal(() => selectedCategory = selected);
              }
            }

            return AlertDialog(
              title: const Text('Add to Grocery List'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        itemName,
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                    ),
                    const SizedBox(height: 14),

                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: Colors.black.withOpacity(0.12),
                        ),
                      ),
                      child: Column(
                        children: [
                          RadioListTile<String>(
                            contentPadding: EdgeInsets.zero,
                            value: 'current',
                            groupValue: action,
                            onChanged:
                                (v) => setLocal(() => action = v ?? 'current'),
                            title: const Text('Add to current list'),
                            subtitle: const Text('Keeps your existing items'),
                          ),
                          RadioListTile<String>(
                            contentPadding: EdgeInsets.zero,
                            value: 'new',
                            groupValue: action,
                            onChanged:
                                (v) => setLocal(() => action = v ?? 'current'),
                            title: const Text('Create a new list'),
                            subtitle: const Text(
                              'Replaces current list with this item',
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 15),

                    SizedBox(
                      width: double.infinity,
                      child: GestureDetector(
                        key: categoryFieldKey,
                        onTap: openCategoryMenu,
                        child: InputDecorator(
                          decoration: InputDecoration(
                            labelText: 'Select Category',
                            labelStyle: const TextStyle(
                              color: Colors.deepPurple,
                            ),
                            filled: true,
                            fillColor: Colors.white,
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(10),
                            ),
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 15,
                              vertical: 14,
                            ),
                            suffixIcon: const Icon(
                              Icons.keyboard_arrow_down_rounded,
                              color: Colors.deepPurple,
                              size: 28,
                            ),
                          ),
                          child: Text(
                            selectedCategory,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                    ),

                    if (action == 'new') ...[
                      const SizedBox(height: 14),
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: Colors.black.withOpacity(0.12),
                          ),
                        ),
                        child: Column(
                          children: [
                            CheckboxListTile(
                              contentPadding: EdgeInsets.zero,
                              value: saveAsFavoriteFirst,
                              onChanged:
                                  (v) => setLocal(
                                    () => saveAsFavoriteFirst = v ?? false,
                                  ),
                              title: const Text(
                                'Also save current list as a Favorite first',
                              ),
                              subtitle: const Text(
                                'Prevents losing your current list',
                              ),
                              controlAffinity: ListTileControlAffinity.leading,
                            ),
                            if (saveAsFavoriteFirst) ...[
                              const SizedBox(height: 6),
                              TextField(
                                controller: favTitleController,
                                decoration: const InputDecoration(
                                  labelText: 'Favorite title',
                                  border: OutlineInputBorder(),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx, false),
                  child: const Text('Cancel'),
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.deepPurple,
                  ),
                  onPressed: () => Navigator.pop(ctx, true),
                  child: const Text(
                    'Add',
                    style: TextStyle(color: Colors.white),
                  ),
                ),
              ],
            );
          },
        );
      },
    );

    if (confirmed != true) return;

    if (action == 'new') {
      if (saveAsFavoriteFirst) {
        final title =
            favTitleController.text.trim().isEmpty
                ? 'My List (Backup)'
                : favTitleController.text.trim();

        await _groceryListService.saveCurrentListAsFavorite(
          title: title,
          store: '',
        );
      }

      await _groceryListService.createNewListWithSingleItem(
        title: itemName,
        category: selectedCategory,
        source: 'store',
      );

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            saveAsFavoriteFirst
                ? 'New list created (backup saved to Favorites)'
                : 'New list created',
          ),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } else {
      final added = await _groceryListService.addMinimalItemToCurrentList(
        title: itemName,
        category: selectedCategory,
        source: 'store',
      );

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            added ? 'Added to Grocery List' : 'Already in your list',
          ),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final storeName = widget.storeData['vendorName'] ?? 'Unknown Store';
    final logoUrl = _storeLogoUrl();
    final storeId = widget.storeData['vendorId']?.toString() ?? '';

    return Scaffold(
      appBar: AppBar(
        centerTitle: true,
        title: const Text(
          'Store',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
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
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(20),
              ),
              child: Column(
                children: [
                  Container(
                    width: double.infinity,
                    height: 120,
                    decoration: BoxDecoration(
                      color: Colors.deepPurple.shade50,
                      borderRadius: const BorderRadius.vertical(
                        top: Radius.circular(20),
                      ),
                    ),
                    child: Center(
                      child:
                          logoUrl.isNotEmpty
                              ? ClipRRect(
                                borderRadius: BorderRadius.circular(12),
                                child: Image.network(
                                  logoUrl,
                                  height: 60,
                                  fit: BoxFit.contain,
                                  errorBuilder:
                                      (context, error, stackTrace) =>
                                          const Icon(
                                            Icons.store_mall_directory,
                                            size: 50,
                                            color: Colors.deepPurple,
                                          ),
                                ),
                              )
                              : Image.asset(
                                StoreLogoService.fallbackAsset,
                                height: 60,
                                fit: BoxFit.contain,
                                errorBuilder:
                                    (_, __, ___) => const Icon(
                                      Icons.store_mall_directory,
                                      size: 50,
                                      color: Colors.deepPurple,
                                    ),
                              ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 24,
                      vertical: 20,
                    ),
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

            const SizedBox(height: 20),

            ElevatedButton.icon(
              onPressed:
                  (_checkingFollow || storeId.trim().isEmpty)
                      ? null
                      : () async {
                        if (_isFollowingStore) {
                          await StoreFollowService.unfollowStore(storeId);
                        } else {
                          await StoreFollowService.followStore(
                            storeId: storeId,
                            storeName: storeName,
                            logoUrl: logoUrl,
                            storeData: widget.storeData,
                          );
                        }

                        if (!mounted) return;
                        setState(() => _isFollowingStore = !_isFollowingStore);

                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(
                              _isFollowingStore
                                  ? 'Store followed'
                                  : 'Store unfollowed',
                            ),
                          ),
                        );
                      },
              style: ElevatedButton.styleFrom(
                backgroundColor:
                    _isFollowingStore
                        ? Colors.grey.shade300
                        : Colors.deepPurple,
                foregroundColor:
                    _isFollowingStore ? Colors.black : Colors.white,
              ),
              icon: Icon(_isFollowingStore ? Icons.check : Icons.star),
              label: Text(
                _isFollowingStore
                    ? 'Following this store'
                    : 'Follow this store',
              ),
            ),

            const SizedBox(height: 30),
            const Divider(thickness: 1, height: 10),
            const SizedBox(height: 20),

            TextField(
              controller: _searchController,
              onChanged: _onSearchChanged,
              onSubmitted: (value) {
                _searchDebounce?.cancel();
                _searchAndAdd(value);
              },
              decoration: InputDecoration(
                hintText: 'Search for a product...',
                prefixIcon: const Icon(Icons.search),
                fillColor: Colors.white,
                filled: true,
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 14,
                ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),

            const SizedBox(height: 20),
            if (_isLoading) const Center(child: CircularProgressIndicator()),
            const SizedBox(height: 10),

            ..._selectedItems.map(_searchResultCard),

            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }
}

class _QtyChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _QtyChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color:
                selected ? Colors.deepPurple : Colors.black.withOpacity(0.12),
          ),
          color:
              selected
                  ? Colors.deepPurple.withOpacity(0.12)
                  : Colors.transparent,
        ),
        child: Text(
          label,
          style: TextStyle(
            fontWeight: FontWeight.w700,
            color: selected ? Colors.deepPurple : Colors.black87,
          ),
        ),
      ),
    );
  }
}
