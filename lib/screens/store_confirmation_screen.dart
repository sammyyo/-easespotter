import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:easespotter/services/bookmark_service.dart';
import 'package:easespotter/services/store_follow_service.dart';
import 'package:easespotter/services/grocery_list_service.dart';
import 'package:easespotter/services/home_inventory_service.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class StoreConfirmationScreen extends StatefulWidget {
  final Map<String, dynamic> storeData;

  const StoreConfirmationScreen({super.key, required this.storeData});

  @override
  State<StoreConfirmationScreen> createState() => _StoreConfirmationScreenState();
}

class _StoreConfirmationScreenState extends State<StoreConfirmationScreen> {
  final BookmarkService _bookmarkService = BookmarkService();
  final GroceryListService _groceryListService = GroceryListService();
  final HomeInventoryService _inventory = HomeInventoryService();

  late List<Map<String, dynamic>> _allItems;
  final List<Map<String, dynamic>> _selectedItems = [];
  final Set<String> _bookmarkedKeys = {};
  final TextEditingController _searchController = TextEditingController();
  bool _isLoading = false;

  bool _isFollowingStore = false;
  bool _checkingFollow = true;

  // ---------------- Grocery List Pref Helpers ----------------

  Future<List<Map<String, dynamic>>> _loadGroceryPrefsList() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('grocery_list');
    if (raw == null || raw.trim().isEmpty) return [];

    final decoded = jsonDecode(raw);
    if (decoded is! List) return [];

    return List<Map<String, dynamic>>.from(decoded.map((e) => Map<String, dynamic>.from(e)));
  }

  Future<void> _saveGroceryPrefsList(List<Map<String, dynamic>> list) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('grocery_list', jsonEncode(list));
  }

  int _findGroceryIndex(List<Map<String, dynamic>> list, String title) {
    final t = title.trim().toLowerCase();
    if (t.isEmpty) return -1;

    for (int i = 0; i < list.length; i++) {
      final existingTitle = (list[i]['title'] ?? '').toString().trim().toLowerCase();
      if (existingTitle == t) return i;
    }
    return -1;
  }

  Future<bool> _incrementExistingGroceryItem(String title, {int by = 1}) async {
    final list = await _loadGroceryPrefsList();
    final idx = _findGroceryIndex(list, title);
    if (idx == -1) return false;

    final currentQty = (list[idx]['quantity'] is num)
        ? (list[idx]['quantity'] as num).toInt()
        : int.tryParse(list[idx]['quantity']?.toString() ?? '') ?? 1;

    final unit = (list[idx]['unitPrice'] is num)
        ? (list[idx]['unitPrice'] as num).toDouble()
        : double.tryParse(list[idx]['unitPrice']?.toString() ?? '') ?? 0.0;

    final nextQty = (currentQty + by).clamp(1, 999999);
    final nextPrice = unit * nextQty;

    list[idx]['quantity'] = nextQty;
    list[idx]['price'] = nextPrice;

    await _saveGroceryPrefsList(list);
    return true;
  }

  Future<void> _forceAppendGroceryItem({
    required String title,
    required String category,
    String source = 'store',
    Map<String, dynamic>? storeItem,
  }) async {
    final list = await _loadGroceryPrefsList();

    final newItem = <String, dynamic>{
      'title': title.trim(),
      'checked': false,
      'category': category,
      'quantity': 1,
      'unitPrice': 0.0,
      'price': 0.0,
      'source': source,
    };

    if (storeItem != null) {
      final loc = (storeItem['location'] ?? '').toString().trim();
      if (loc.isNotEmpty) newItem['location'] = loc;
    }

    list.add(newItem);
    await _saveGroceryPrefsList(list);
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
                  Text('“$title” is already in your list.\n\nHow many more do you want to add?'),
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
                  style: ElevatedButton.styleFrom(backgroundColor: Colors.deepPurple),
                  onPressed: () {
                    final amount = _parsePositiveInt(c.text, fallback: selected);
                    Navigator.pop(ctx, amount);
                  },
                  child: const Text('Update', style: TextStyle(color: Colors.white)),
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
                      _QtyChip(label: '+1', selected: selected == 1, onTap: () => setAmount(1)),
                      _QtyChip(label: '+2', selected: selected == 2, onTap: () => setAmount(2)),
                      _QtyChip(label: '+3', selected: selected == 3, onTap: () => setAmount(3)),
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
                  style: ElevatedButton.styleFrom(backgroundColor: Colors.deepPurple),
                  onPressed: () {
                    final amount = _parsePositiveInt(c.text, fallback: selected);
                    Navigator.pop(ctx, amount);
                  },
                  child: const Text('Add', style: TextStyle(color: Colors.white)),
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
    final storeId = (widget.storeData['vendorId'] ?? '').toString();
    final barcode = (item['barcode'] ?? '').toString().trim();
    final name = (item['name'] ?? '').toString().trim().toLowerCase();

    if (barcode.isNotEmpty) return '$storeId|$barcode';
    return '$storeId|$name';
  }

  String _imageUrlFromItem(Map<String, dynamic> item) {
    return (item['imageUrl'] ??
            item['imageURL'] ??
            item['image'] ??
            item['photoUrl'] ??
            item['photoURL'] ??
            '')
        .toString()
        .trim();
  }

  Widget _productThumbnail(Map<String, dynamic> item) {
    final imageUrl = _imageUrlFromItem(item);

    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: Container(
        width: 48,
        height: 48,
        color: Colors.deepPurple.shade50,
        child: imageUrl.isNotEmpty
            ? Image.network(
                imageUrl,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => const Icon(
                  Icons.shopping_bag,
                  color: Colors.deepPurple,
                ),
              )
            : const Icon(Icons.shopping_bag, color: Colors.deepPurple),
      ),
    );
  }

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
        'imageUrl': item['imageUrl'] ?? item['image'],
        'image': item['image'] ?? item['imageUrl'],
        'barcode': item['barcode'],
        'aisle': item['location']['aisle'],
        'shelf': item['location']['shelf'],
      });
    }).toList();

    _allItems = List<Map<String, dynamic>>.from(flattened);

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
      _bookmarkedKeys.remove(_itemKey(item));
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

    setState(() {
      if (isBookmarked) {
        _bookmarkedKeys.remove(key);
      } else {
        _bookmarkedKeys.add(key);
      }
    });

    final enrichedItem = Map<String, dynamic>.from(item);
    enrichedItem['storeName'] = widget.storeData['vendorName'] ?? 'Unknown Store';
    final storeLogo =
        (widget.storeData['logoUrl'] ?? widget.storeData['vendorLogoUrl'] ?? '')
            .toString()
            .trim();
    if (storeLogo.isNotEmpty) {
      enrichedItem['logoUrl'] = storeLogo;
    }
    final storeId = (widget.storeData['vendorId'] ??
            widget.storeData['storeId'] ??
            '')
        .toString()
        .trim();
    if (storeId.isNotEmpty) {
      enrichedItem['storeId'] = storeId;
    }

    if (isBookmarked) {
      await _bookmarkService.removeBookmark(enrichedItem);
      if (!mounted) return;
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
        );
      } else {
        // If no barcode, best-effort: just upsert +amount (no stable doc id)
        await _inventory.upsertItem(
          name: name,
          barcode: null,
          quantity: amount,
          source: 'store',
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
        builder: (ctx) => AlertDialog(
          title: const Text('Already in Home Inventory'),
          content: Text('“$name” is already in your inventory.\n\nIncrement it anyway?'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('No'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: Colors.deepPurple),
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Increment', style: TextStyle(color: Colors.white)),
            ),
          ],
        ),
      );

      if (proceed != true) return;
    }

    await _addToHomeInventory(item);
  }

  Future<bool> _isInHomeInventory({required String name, required String barcode}) async {
    if (FirebaseAuth.instance.currentUser == null) {
      await FirebaseAuth.instance.signInAnonymously();
    }

    final uid = FirebaseAuth.instance.currentUser!.uid;

    if (barcode.trim().isNotEmpty) {
      final doc = await FirebaseFirestore.instance
          .collection('users')
          .doc(uid)
          .collection('home_inventory')
          .doc(barcode.trim())
          .get();
      return doc.exists;
    }

    final n = name.trim().toLowerCase();
    if (n.isEmpty) return false;

    final snap = await FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .collection('home_inventory')
        .where('name', isEqualTo: name.trim())
        .limit(1)
        .get();

    if (snap.docs.isNotEmpty) return true;

    final recent = await FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .collection('home_inventory')
        .orderBy('updatedAt', descending: true)
        .limit(50)
        .get();

    return recent.docs.any((d) =>
    ((d.data()['name'] ?? '').toString().trim().toLowerCase() == n));
  }

  Future<void> _guardedAddToGroceryList(Map<String, dynamic> item) async {
    final name = (item['name'] ?? '').toString().trim();
    final barcode = (item['barcode'] ?? '').toString().trim();
    if (name.isEmpty) return;

    bool alreadyHaveAtHome = false;
    try {
      alreadyHaveAtHome = await _isInHomeInventory(name: name, barcode: barcode);
    } catch (_) {
      alreadyHaveAtHome = false;
    }

    if (alreadyHaveAtHome) {
      final proceed = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Already in Home Inventory'),
          content: Text('You already have “$name” at home.\n\nAdd it to your Grocery List anyway?'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('No'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: Colors.deepPurple),
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Add anyway', style: TextStyle(color: Colors.white)),
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
      if (amount == 0) return;    // do nothing

      final ok = await _incrementExistingGroceryItem(name, by: amount);

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(ok ? 'Updated quantity (+$amount) for “$name”' : 'Could not update “$name”'),
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
    final favTitleController = TextEditingController(
      text: 'My List (Backup)',
    );

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setLocal) {
            final GlobalKey categoryFieldKey = GlobalKey();

            Future<void> openCategoryMenu() async {
              final RenderBox box =
              categoryFieldKey.currentContext!.findRenderObject() as RenderBox;
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
                items: categories.asMap().entries.map((entry) {
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
                        top: isFirst ? const Radius.circular(14) : Radius.zero,
                        bottom: isLast ? const Radius.circular(14) : Radius.zero,
                      ),
                      child: Container(
                        width: popupWidth,
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                        decoration: BoxDecoration(
                          color: isSelected
                              ? const Color(0xFFF3EDFF)
                              : Colors.transparent,
                          border: isLast
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
                            isSelected ? Colors.deepPurple : Colors.black87,
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
                        border: Border.all(color: Colors.black.withOpacity(0.12)),
                      ),
                      child: Column(
                        children: [
                          RadioListTile<String>(
                            contentPadding: EdgeInsets.zero,
                            value: 'current',
                            groupValue: action,
                            onChanged: (v) => setLocal(() => action = v ?? 'current'),
                            title: const Text('Add to current list'),
                            subtitle: const Text('Keeps your existing items'),
                          ),
                          RadioListTile<String>(
                            contentPadding: EdgeInsets.zero,
                            value: 'new',
                            groupValue: action,
                            onChanged: (v) => setLocal(() => action = v ?? 'current'),
                            title: const Text('Create a new list'),
                            subtitle: const Text('Replaces current list with this item'),
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
                            labelStyle: const TextStyle(color: Colors.deepPurple),
                            filled: true,
                            fillColor: Colors.white,
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 15, vertical: 14),
                            suffixIcon: const Icon(
                              Icons.keyboard_arrow_down_rounded,
                              color: Colors.deepPurple,
                              size: 28,
                            ),
                          ),
                          child: Text(
                            selectedCategory,
                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
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
                          border: Border.all(color: Colors.black.withOpacity(0.12)),
                        ),
                        child: Column(
                          children: [
                            CheckboxListTile(
                              contentPadding: EdgeInsets.zero,
                              value: saveAsFavoriteFirst,
                              onChanged: (v) => setLocal(() => saveAsFavoriteFirst = v ?? false),
                              title: const Text('Also save current list as a Favorite first'),
                              subtitle: const Text('Prevents losing your current list'),
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
                  style: ElevatedButton.styleFrom(backgroundColor: Colors.deepPurple),
                  onPressed: () => Navigator.pop(ctx, true),
                  child: const Text('Add', style: TextStyle(color: Colors.white)),
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
        final title = favTitleController.text.trim().isEmpty
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
          content: Text(added ? 'Added to Grocery List' : 'Already in your list'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final storeName = widget.storeData['vendorName'] ?? 'Unknown Store';
    final logoUrl = widget.storeData['logoUrl'] as String?;
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

            const SizedBox(height: 20),

            ElevatedButton.icon(
              onPressed: (_checkingFollow || storeId.trim().isEmpty)
                  ? null
                  : () async {
                if (_isFollowingStore) {
                  await StoreFollowService.unfollowStore(storeId);
                } else {
                  await StoreFollowService.followStore(
                    storeId: storeId,
                    storeName: storeName,
                    logoUrl: logoUrl,
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
                _isFollowingStore ? Colors.grey.shade300 : Colors.deepPurple,
                foregroundColor:
                _isFollowingStore ? Colors.black : Colors.white,
              ),
              icon: Icon(
                _isFollowingStore ? Icons.check : Icons.star,
              ),
              label: Text(
                _isFollowingStore ? 'Following this store' : 'Follow this store',
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
                  leading: _productThumbnail(item),
                  title: Text(item['name']),
                  subtitle: Text(item['location']),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        icon: const Icon(Icons.kitchen, color: Colors.deepPurple),
                        tooltip: 'Brought home (add to inventory)',
                        onPressed: () => _guardedAddToHomeInventory(item),
                      ),
                      IconButton(
                        icon: const Icon(Icons.playlist_add, color: Colors.teal),
                        tooltip: 'Add to Grocery List',
                        onPressed: () => _guardedAddToGroceryList(item),
                      ),
                      IconButton(
                        icon: Icon(
                          _bookmarkedKeys.contains(_itemKey(item))
                              ? Icons.bookmark
                              : Icons.bookmark_border,
                          color: _bookmarkedKeys.contains(_itemKey(item))
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
            color: selected ? Colors.deepPurple : Colors.black.withOpacity(0.12),
          ),
          color: selected ? Colors.deepPurple.withOpacity(0.12) : Colors.transparent,
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
