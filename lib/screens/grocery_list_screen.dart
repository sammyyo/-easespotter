import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:easespotter/services/share_service.dart';
import 'package:easespotter/screens/favorites_list_screen.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:easespotter/services/home_inventory_service.dart';

class GroceryListScreenController {
  static void Function({required int tabIndex, int? addedCount, String? recipeTitle})?
  switchTabAndRefresh;
}

class GroceryListScreen extends StatefulWidget {
  final int initialViewIndex; // 0 = My List, 1 = From Recipes

  const GroceryListScreen({
    super.key,
    this.initialViewIndex = 0,
  });

  @override
  State<GroceryListScreen> createState() => _GroceryListScreenState();
}

class _GroceryListScreenState extends State<GroceryListScreen> {
  final ShareService _shareService = ShareService();
  final HomeInventoryService _inventory = HomeInventoryService();
  final TextEditingController _controller = TextEditingController();
  final Map<int, TextEditingController> _priceControllers = {};

  final List<String> _categories = ['General', 'Snacks', 'Drinks', 'Fruits', 'Vegetables'];
  String _selectedCategory = 'General';

  List<Map<String, dynamic>> _groceryItems = [];
  List<Map<String, dynamic>> _favoriteLists = [];
  String _selectedCurrency = 'USD';

  List<Map<String, dynamic>> _collaborations = [];
  String? _activeCollabCode;

  bool _viewingFromRecipe = false;
  bool _showOptions = true;
  bool _showHeader = true;
  late ScrollController _scrollController;

  final GlobalKey _categoryFieldKey = GlobalKey();
  int _selectedViewIndex = 0; 

  @override
  void initState() {
    super.initState();

    // Apply initial tab
    _selectedViewIndex = widget.initialViewIndex;
    _viewingFromRecipe = _selectedViewIndex == 1;

    // Controller hook so other screens can force tab switch + refresh
    GroceryListScreenController.switchTabAndRefresh =
        ({required int tabIndex, int? addedCount, String? recipeTitle}) async {
      if (!mounted) return;

      setState(() {
        _selectedViewIndex = tabIndex;
        _viewingFromRecipe = tabIndex == 1;
      });

      await _loadGroceryList();

      if (!mounted) return;

      // Optional: show a nice confirmation snack when coming from RecipeDetail
      if (addedCount != null) {
        final msg = addedCount == 0
            ? "Nothing new was added."
            : "Added $addedCount item${addedCount == 1 ? '' : 's'}${recipeTitle != null && recipeTitle.trim().isNotEmpty ? " from “$recipeTitle”" : ''}.";
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(msg),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    };

    _loadGroceryList();
    _loadFavoriteLists();
    _loadCurrency();
    _loadCollaborations();
    _signInAnonymously();
    _scrollController = ScrollController();
    _scrollController.addListener(_handleScroll);
  }

  @override
  void dispose() {
    if (GroceryListScreenController.switchTabAndRefresh != null) {
      GroceryListScreenController.switchTabAndRefresh = null;
    }
    _controller.dispose();
    for (final c in _priceControllers.values) {
      c.dispose();
    }
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _loadCollaborations() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString('collaborations');
    if (saved != null) {
      final List<dynamic> decoded = jsonDecode(saved);
      setState(() {
        _collaborations = List<Map<String, dynamic>>.from(decoded);
      });
    }
  }

  Future<void> _signInAnonymously() async {
    if (FirebaseAuth.instance.currentUser == null) {
      await FirebaseAuth.instance.signInAnonymously();
      if (mounted) setState(() {});
    }
  }

  Future<void> _startNewCollaboration() async {
    try {
      if (FirebaseAuth.instance.currentUser == null) {
        await FirebaseAuth.instance.signInAnonymously();
      }

      final code = await _shareService.shareGroceryList(_groceryItems);
      final docRef = FirebaseFirestore.instance.collection('grocery_shares').doc();
      await docRef.set({
        'code': code,
        'creatorUid': FirebaseAuth.instance.currentUser!.uid,
        'createdAt': FieldValue.serverTimestamp(),
        'expiresAt': Timestamp.now().toDate().add(const Duration(days: 7)),
        'list': _groceryItems,
      });

      final newCollab = {'code': code, 'docId': docRef.id};

      setState(() {
        _collaborations.add(newCollab);
        _activeCollabCode = code;
      });

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('collaborations', jsonEncode(_collaborations));

      _listenToCollaboration(code);

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('New collaboration started with code: $code')),
      );
    } catch (e) {
      debugPrint('Error starting collaboration: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Failed to start collaboration.')),
      );
    }
  }

  void _handleScroll() {
    final direction = _scrollController.position.userScrollDirection;
    if (direction == AxisDirection.down) {
      if (_showHeader) setState(() => _showHeader = false);
    } else if (direction == AxisDirection.up) {
      if (!_showHeader) setState(() => _showHeader = true);
    }
  }

  void _listenToCollaboration(String code) {
    FirebaseFirestore.instance
        .collection('grocery_shares')
        .where('code', isEqualTo: code)
        .limit(1)
        .snapshots()
        .listen((snapshot) {
      if (snapshot.docs.isEmpty) return;

      final doc = snapshot.docs.first;
      final updatedBy = doc['updatedBy'];
      final currentUser = FirebaseAuth.instance.currentUser?.uid;

      if (updatedBy != null && updatedBy != currentUser) {
        final list = List<Map<String, dynamic>>.from(doc['list']);
        setState(() {
          _groceryItems = list;
        });

        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('List updated by a collaborator'),
            backgroundColor: Colors.teal,
          ),
        );
      }
    });
  }

  Future<void> _joinCollaboration(String code) async {
    final query = await FirebaseFirestore.instance
        .collection('grocery_shares')
        .where('code', isEqualTo: code)
        .limit(1)
        .get();

    if (query.docs.isNotEmpty) {
      final doc = query.docs.first;
      final list = List<Map<String, dynamic>>.from(doc['list']);

      setState(() {
        _groceryItems = list;
        _activeCollabCode = code;
        if (!_collaborations.any((c) => c['code'] == code)) {
          _collaborations.add({'code': code, 'docId': doc.id});
        }
      });

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('collaborations', jsonEncode(_collaborations));

      _listenToCollaboration(code);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Invalid code. Collaboration not found.')),
      );
    }
  }

  Future<void> _updateCollaboration() async {
    if (_activeCollabCode == null) return;

    final query = await FirebaseFirestore.instance
        .collection('grocery_shares')
        .where('code', isEqualTo: _activeCollabCode)
        .limit(1)
        .get();

    if (query.docs.isNotEmpty) {
      final doc = query.docs.first;
      final collaborators = List<String>.from(doc['collaborators'] ?? []);
      final uid = FirebaseAuth.instance.currentUser!.uid;
      if (!collaborators.contains(uid)) {
        collaborators.add(uid);
      }
      await doc.reference.update({
        'list': _groceryItems,
        'updatedAt': FieldValue.serverTimestamp(),
        'updatedBy': FirebaseAuth.instance.currentUser!.uid,
        'collaborators': collaborators,
      });
    }
  }

  Future<void> _loadCurrency() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString('selected_currency');
    if (saved != null) {
      setState(() {
        _selectedCurrency = saved;
      });
    }
  }

  Future<void> _loadGroceryList() async {
    final prefs = await SharedPreferences.getInstance();
    final String? listJson = prefs.getString('grocery_list');
    if (listJson != null) {
      final decoded = List<Map<String, dynamic>>.from(jsonDecode(listJson));

      _groceryItems = [];
      _priceControllers.clear();

      for (int i = 0; i < decoded.length; i++) {
        final item = decoded[i];
        final quantity = int.tryParse(item['quantity']?.toString() ?? '') ?? 1;
        final unitPrice =
            double.tryParse(item['unitPrice']?.toString() ?? '') ??
                double.tryParse(item['price']?.toString() ?? '') ??
                0.0;

        final totalPrice = unitPrice * quantity;

        final updatedItem = {
          ...item,
          'quantity': quantity,
          'unitPrice': unitPrice,
          'price': totalPrice,
        };

        _groceryItems.add(updatedItem);
        _priceControllers[i] = TextEditingController(text: totalPrice.toStringAsFixed(2));
      }

      setState(() {});
    }
  }

  Future<void> _saveGroceryList() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('grocery_list', jsonEncode(_groceryItems));
    await _updateCollaboration();
  }

  double? _parseMoney(dynamic value) {
    if (value == null) return null;
    final raw = value.toString().trim();
    if (raw.isEmpty) return null;
    final cleaned = raw.replaceAll(RegExp(r'[^0-9.,-]'), '').replaceAll(',', '');
    if (cleaned.isEmpty || cleaned == '-' || cleaned == '.') return null;
    return double.tryParse(cleaned);
  }

  Future<void> _loadFavoriteLists() async {
    final prefs = await SharedPreferences.getInstance();
    final String? favJson = prefs.getString('favorite_lists');
    if (favJson != null) {
      setState(() {
        _favoriteLists = List<Map<String, dynamic>>.from(jsonDecode(favJson));
      });
    }
  }

  void _addItem() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;

    final exists = _groceryItems.any(
          (item) => item['title'].toString().toLowerCase() == text.toLowerCase(),
    );

    if (exists) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('This item is already in your list.'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    setState(() {
      _groceryItems.add({
        'title': text,
        'checked': false,
        'category': _selectedCategory,
        'quantity': 1,
        'unitPrice': 0.0,
        'price': 0.0,
        'source': 'manual',
      });
      _controller.clear();
    });
    _saveGroceryList();
  }

  double _calculateTotal() {
    double total = 0.0;
    for (final item in _groceryItems) {
      final lineTotal = (item['price'] ?? 0);
      total += (lineTotal is num)
          ? lineTotal.toDouble()
          : double.tryParse(lineTotal.toString()) ?? 0.0;
    }
    return total;
  }

  double _calculateVisibleTotal() {
    double total = 0.0;
    for (int i = 0; i < _groceryItems.length; i++) {
      final item = _groceryItems[i];
      final source = item['source'] ?? 'manual';
      final include = _viewingFromRecipe ? source == 'recipe' : source != 'recipe';
      if (!include) continue;

      final liveInputValue = _parseMoney(_priceControllers[i]?.text);
      if (liveInputValue != null) {
        total += liveInputValue;
        continue;
      }

      final lineTotal = (item['price'] ?? 0);
      total += (lineTotal is num)
          ? lineTotal.toDouble()
          : double.tryParse(lineTotal.toString()) ?? 0.0;
    }
    return total;
  }

  Future<Map<String, dynamic>?> _findInventoryItemForListItem({
    required String name,
    required String barcode,
  }) async {
    if (FirebaseAuth.instance.currentUser == null) {
      await FirebaseAuth.instance.signInAnonymously();
    }

    final uid = FirebaseAuth.instance.currentUser!.uid;
    final col = FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .collection('home_inventory');

    if (barcode.trim().isNotEmpty) {
      final doc = await col.doc(barcode.trim()).get();
      if (!doc.exists) return null;
      return {'id': doc.id, ...doc.data()!};
    }

    final snap = await col
        .where('name', isEqualTo: name.trim())
        .limit(1)
        .get();

    if (snap.docs.isEmpty) return null;
    final d = snap.docs.first;
    return {'id': d.id, ...d.data()};
  }

  int _parsePositiveInt(String s, {int fallback = 1, int max = 9999}) {
    final v = int.tryParse(s.trim());
    if (v == null || v <= 0) return fallback;
    return v > max ? max : v;
  }

  Future<int?> _askInventoryAddAmount({
    required BuildContext context,
    required String itemName,
    num? existingQty,
  }) async {
    int selected = 1;
    final c = TextEditingController(text: '1');

    final subtitle = existingQty == null
        ? 'How many do you want to add to Home Inventory?'
        : 'Already in Home Inventory (Qty: ${existingQty.toString()}).\n\nHow many more do you want to add?';

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
              title: const Text('Brought Home'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('“$itemName”'),
                  const SizedBox(height: 10),
                  Text(subtitle),
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

  Future<void> _markBroughtHomeSmart(int index) async {
    final item = _groceryItems[index];

    final name = (item['title'] ?? '').toString().trim();
    if (name.isEmpty) return;

    final barcode = (item['barcode'] ?? '').toString().trim();

    if (FirebaseAuth.instance.currentUser == null) {
      await FirebaseAuth.instance.signInAnonymously();
    }

    try {
      final existing = await _findInventoryItemForListItem(
        name: name,
        barcode: barcode,
      );

      final existingQty = (existing?['quantity'] as num?);

      final amount = await _askInventoryAddAmount(
        context: context,
        itemName: name,
        existingQty: existingQty,
      );

      if (amount == null) return; // user cancelled

      if (barcode.isNotEmpty) {
        await _inventory.increment(
          name: name,
          barcode: barcode,
          by: amount,
          source: 'list',
        );
      } else {
        final currentQty = (existing?['quantity'] as num?) ?? 0;
        await _inventory.upsertItem(
          name: name,
          barcode: null,
          quantity: currentQty + amount,
          source: 'list',
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
          content: Text('Failed to update inventory: $e'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  void _toggleCheck(int index) async {
    setState(() {
      _groceryItems[index]['checked'] = !(_groceryItems[index]['checked'] == true);
    });

    _saveGroceryList();
  }

  void _deleteItem(int index) {
    setState(() {
      _groceryItems.removeAt(index);
    });
    _saveGroceryList();
  }

  void _increaseQuantity(int index) {
    setState(() {
      _groceryItems[index]['quantity'] += 1;
      final unit = (_groceryItems[index]['unitPrice'] ?? 0.0).toDouble();
      final newPrice = unit * _groceryItems[index]['quantity'];
      _groceryItems[index]['price'] = newPrice;
      _priceControllers[index]?.text = newPrice.toStringAsFixed(2);
    });
    _saveGroceryList();
  }

  void _decreaseQuantity(int index) {
    setState(() {
      if (_groceryItems[index]['quantity'] > 1) {
        _groceryItems[index]['quantity'] -= 1;
        final unit = (_groceryItems[index]['unitPrice'] ?? 0.0).toDouble();
        final newPrice = unit * _groceryItems[index]['quantity'];
        _groceryItems[index]['price'] = newPrice;
        _priceControllers[index]?.text = newPrice.toStringAsFixed(2);
      }
    });
    _saveGroceryList();
  }

  void _updatePrice(int index, String value, {bool normalizeText = true}) {
    final parsed = _parseMoney(value) ?? 0.0;
    final qty = (_groceryItems[index]['quantity'] ?? 1).toDouble();
    final unit = qty == 0 ? 0.0 : parsed / qty;

    setState(() {
      _groceryItems[index]['unitPrice'] = unit;
      _groceryItems[index]['price'] = parsed;
      if (normalizeText) {
        _priceControllers[index]?.text = parsed == 0 ? '' : parsed.toStringAsFixed(2);
      }
    });
    _saveGroceryList();
  }

  void _saveAsFavorite() {
    final titleController = TextEditingController();
    final storeController = TextEditingController();

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Save as Favorite List', style: TextStyle(fontSize: 18)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: titleController,
              decoration: const InputDecoration(hintText: 'Enter list title'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: storeController,
              decoration: const InputDecoration(hintText: 'Enter store name (optional)'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              final title = titleController.text.trim();
              final store = storeController.text.trim();

              if (title.isNotEmpty) {
                final prefs = await SharedPreferences.getInstance();
                final String? favJson = prefs.getString('favorite_lists');
                List<Map<String, dynamic>> currentFavorites = [];

                if (favJson != null) {
                  currentFavorites = List<Map<String, dynamic>>.from(jsonDecode(favJson));
                }

                currentFavorites.add({
                  'title': title,
                  'store': store,
                  'items': List<Map<String, dynamic>>.from(_groceryItems),
                });

                await prefs.setString('favorite_lists', jsonEncode(currentFavorites));

                setState(() {
                  _favoriteLists = currentFavorites;
                });

                Navigator.pop(context);
              }
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  void _openFavoritesScreen() async {
    final selectedItems = await Navigator.push<List<Map<String, dynamic>>>(
      context,
      MaterialPageRoute(builder: (context) => const FavoritesListScreen()),
    );
    if (selectedItems != null) {
      setState(() => _groceryItems = selectedItems);
      _saveGroceryList();
    }
  }

  void _changeCategoryDialog(int index) {
    String newCategory = _groceryItems[index]['category'];
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Change Category'),
        content: DropdownButtonFormField<String>(
          value: newCategory,
          items: _categories.map((cat) => DropdownMenuItem(value: cat, child: Text(cat))).toList(),
          onChanged: (value) => newCategory = value!,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () {
              setState(() => _groceryItems[index]['category'] = newCategory);
              _saveGroceryList();
              Navigator.pop(context);
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  void _onGroupIconPressed() {
    final codeController = TextEditingController();

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Collaborate on Grocery List', style: TextStyle(fontSize: 18)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (_collaborations.isNotEmpty) ...[
                const Text('Your Collaborations:', style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 10),
                ..._collaborations.map((collab) {
                  final isActive = _activeCollabCode == collab['code'];
                  return ListTile(
                    dense: true,
                    title: Text(
                      isActive ? 'Code: ${collab['code']} (Active)' : 'Code: ${collab['code']}',
                      style: const TextStyle(fontSize: 14),
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (!isActive)
                          ElevatedButton(
                            onPressed: () => _joinCollaboration(collab['code']),
                            child: const Text('Switch'),
                          ),
                        const SizedBox(width: 8),
                        IconButton(
                          icon: const Icon(Icons.delete, color: Colors.red),
                          tooltip: 'Leave this collaboration',
                          onPressed: () async {
                            setState(() {
                              _collaborations.removeWhere((c) => c['code'] == collab['code']);
                              if (_activeCollabCode == collab['code']) _activeCollabCode = null;
                            });

                            final prefs = await SharedPreferences.getInstance();
                            await prefs.setString('collaborations', jsonEncode(_collaborations));

                            Navigator.of(context).pop();
                            _onGroupIconPressed();

                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Left the collaboration')),
                            );
                          },
                        ),
                      ],
                    ),
                  );
                }),
                const Divider(thickness: 1),
              ],
              ElevatedButton.icon(
                icon: const Icon(Icons.add),
                label: const Text('Start New Collaboration'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.deepPurple,
                  foregroundColor: Colors.white,
                ),
                onPressed: () {
                  Navigator.pop(context);
                  _startNewCollaboration();
                },
              ),
              const SizedBox(height: 20),
              const Text('Or enter a code to join:'),
              const SizedBox(height: 10),
              TextField(
                controller: codeController,
                decoration: const InputDecoration(hintText: 'Enter Code'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          ElevatedButton(
            child: const Text('Join'),
            onPressed: () {
              final code = codeController.text.trim();
              Navigator.pop(context);
              if (code.isNotEmpty) _joinCollaboration(code);
            },
          ),
        ],
      ),
    );
  }

  int get _uncheckedItemCount =>
      _groceryItems.where((item) => item['checked'] == false).length;

  void _shareGroceryList() async {
    if (_groceryItems.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Your grocery list is empty!')),
      );
      return;
    }

    final String code = await _shareService.shareGroceryList(_groceryItems);
    final String link = 'https://easespotter.com/share/$code';

    showDialog(
      context: context,
      builder: (context) => Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'Share Your Grocery List',
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                  color: Colors.deepPurple,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 10),
              const Text(
                'Send it easily to friends or family!',
                style: TextStyle(fontSize: 16, color: Colors.black54),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              SelectableText(
                link,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.black87, fontSize: 16),
              ),
              const SizedBox(height: 20),
              ElevatedButton.icon(
                onPressed: () {
                  Clipboard.setData(ClipboardData(text: link));
                  Navigator.pop(context);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      backgroundColor: Colors.teal,
                      behavior: SnackBarBehavior.floating,
                      content: Row(
                        children: const [
                          Icon(Icons.check_circle, color: Colors.white),
                          SizedBox(width: 10),
                          Expanded(child: Text('Link copied to clipboard!')),
                        ],
                      ),
                    ),
                  );
                },
                icon: const Icon(Icons.copy),
                label: const Text('Copy Link', style: TextStyle(color: Colors.white)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.deepPurple,
                  foregroundColor: Colors.white,
                ),
              ),
              const SizedBox(height: 10),
              ElevatedButton.icon(
                onPressed: () async {
                  final Uri whatsappUrl = Uri.parse('https://wa.me/?text=$link');
                  if (await canLaunchUrl(whatsappUrl)) {
                    await launchUrl(whatsappUrl, mode: LaunchMode.externalApplication);
                  } else {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Could not open WhatsApp')),
                    );
                  }
                },
                icon: const Icon(Icons.send),
                label: const Text('Send via WhatsApp', style: TextStyle(color: Colors.white)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.green,
                  foregroundColor: Colors.white,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<Map<String, dynamic>> get _visibleItems {
    return _groceryItems.where((item) {
      final source = item['source'] ?? 'manual';
      return _viewingFromRecipe ? source == 'recipe' : source != 'recipe';
    }).toList();
  }

  String _recipeGroupLabel(Map<String, dynamic> item) {
    final t = (item['recipeTitle'] ?? '').toString().trim();
    if (t.isNotEmpty) return t;

    final id = (item['recipeId'] ?? '').toString().trim();
    if (id.isNotEmpty) return 'Recipe · ${id.substring(0, id.length >= 6 ? 6 : id.length)}';

    return 'Recipe (Unknown)';
  }

  Map<String, Map<String, List<Map<String, dynamic>>>> _groupRecipeItemsByRecipeThenCategory() {
    final Map<String, Map<String, List<Map<String, dynamic>>>> grouped = {};

    for (final item in _visibleItems) {
      final recipeKey = (item['recipeId'] ?? '').toString().trim();
      final groupKey = recipeKey.isNotEmpty ? recipeKey : 'unknown_recipe';

      final category = (item['category'] ?? 'General').toString();

      grouped.putIfAbsent(groupKey, () => {});
      grouped[groupKey]!.putIfAbsent(category, () => []);
      grouped[groupKey]![category]!.add(item);
    }

    return grouped;
  }

  Map<String, List<Map<String, dynamic>>> _groupItemsByCategory() {
    Map<String, List<Map<String, dynamic>>> grouped = {};
    for (var item in _visibleItems) {
      final category = item['category'] ?? 'General';
      grouped.putIfAbsent(category, () => []);
      grouped[category]!.add(item);
    }
    return grouped;
  }

  String _getCategoryIcon(String category) {
    switch (category) {
      case 'Snacks':
        return '🍪';
      case 'Drinks':
        return '🥤';
      case 'Fruits':
        return '🍎';
      case 'Vegetables':
        return '🥦';
      case 'General':
      default:
        return '🛒';
    }
  }

  Future<void> _openCategoryMenu() async {
    final RenderBox box = _categoryFieldKey.currentContext!.findRenderObject() as RenderBox;
    final RenderBox overlay = Overlay.of(context).context.findRenderObject() as RenderBox;

    final Offset offset = box.localToGlobal(Offset.zero);
    final Size overlaySize = overlay.size;

    final double popupWidth = overlaySize.width - (12.0 * 2);
    final double left = 12.0;
    final double top = offset.dy + box.size.height + 8.0;
    final double right = 12.0;

    final selected = await showMenu<String>(
      context: context,
      color: Colors.white,
      elevation: 8,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      constraints: BoxConstraints.tightFor(width: popupWidth),
      position: RelativeRect.fromLTRB(left, top, right, overlaySize.height - top),
      items: _categories.asMap().entries.map((entry) {
        final i = entry.key;
        final cat = entry.value;
        final isLast = i == _categories.length - 1;
        final isSelected = cat == _selectedCategory;

        return PopupMenuItem<String>(
          value: cat,
          padding: EdgeInsets.zero,
          child: Container(
            width: popupWidth,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            decoration: BoxDecoration(
              color: isSelected ? const Color(0xFFF3EDFF) : Colors.transparent,
              border: isLast
                  ? null
                  : const Border(
                bottom: BorderSide(color: Color(0xFFE6E6E6), width: 1),
              ),
            ),
            child: Text(
              cat,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: isSelected ? Colors.deepPurple : Colors.black87,
              ),
            ),
          ),
        );
      }).toList(),
    );

    if (selected != null && selected != _selectedCategory) {
      setState(() => _selectedCategory = selected);
    }
  }

  Widget _buildCategoryDropdown() {
    return SizedBox(
      width: double.infinity,
      child: GestureDetector(
        key: _categoryFieldKey,
        onTap: _openCategoryMenu,
        child: InputDecorator(
          decoration: InputDecoration(
            labelText: 'Select Category',
            labelStyle: const TextStyle(color: Colors.deepPurple),
            filled: true,
            fillColor: Colors.white,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            contentPadding: const EdgeInsets.symmetric(horizontal: 15, vertical: 14),
            suffixIcon: const Icon(Icons.keyboard_arrow_down_rounded, color: Colors.deepPurple, size: 28),
          ),
          child: Text(
            _selectedCategory,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          ),
        ),
      ),
    );
  }

  Widget _buildCategorySection(String category, List<Map<String, dynamic>> items) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 18),
        Text(
          '${_getCategoryIcon(category)} $category',
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            color: Colors.deepPurple,
          ),
        ),
        const Divider(thickness: 1.2),
        ...items.asMap().entries.map((itemEntry) {
          final index = _groceryItems.indexOf(itemEntry.value);
          final item = itemEntry.value;

          final source = item['source'] ?? 'manual';
          final loc = (item['location'] ?? '').toString().trim();

          return ListTile(
            key: ValueKey(index),
            contentPadding: const EdgeInsets.symmetric(vertical: 6.0, horizontal: 12.0),
            leading: Checkbox(
              value: item['checked'],
              onChanged: (_) => _toggleCheck(index),
            ),
            title: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item['title'],
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    decoration: item['checked'] ? TextDecoration.lineThrough : null,
                  ),
                ),
                if (source == 'store' && loc.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    loc,
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey.shade700,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
                const SizedBox(height: 6),
                Row(
                  children: [
                    Text('Qty: ${item['quantity'].toInt()}', style: const TextStyle(fontSize: 14)),
                    const SizedBox(width: 8),
                    IconButton(
                      icon: const Icon(Icons.remove_circle_outline, size: 18),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                      onPressed: () => _decreaseQuantity(index),
                    ),
                    IconButton(
                      icon: const Icon(Icons.add_circle_outline, size: 18),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                      onPressed: () => _increaseQuantity(index),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                TextFormField(
                  controller: _priceControllers[index],
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(
                    labelText: 'Price',
                    isDense: true,
                  ),
                  onChanged: (val) => _updatePrice(index, val, normalizeText: false),
                  onFieldSubmitted: (val) => _updatePrice(index, val),
                ),
              ],
            ),
            trailing: PopupMenuButton<String>(
              padding: EdgeInsets.zero,
              onSelected: (value) {
                if (value == 'brought') _markBroughtHomeSmart(index);
                if (value == 'move') _changeCategoryDialog(index);
                if (value == 'delete') _deleteItem(index);
              },
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              elevation: 8,
              color: Colors.white,
              itemBuilder: (context) => const [
                PopupMenuItem(
                  value: 'brought',
                  child: Row(
                    children: [
                      Icon(Icons.kitchen, color: Colors.deepPurple),
                      SizedBox(width: 10),
                      Text('Brought home'),
                    ],
                  ),
                ),
                PopupMenuItem(
                  value: 'move',
                  child: Row(
                    children: [
                      Icon(Icons.swap_horiz, color: Colors.deepPurple),
                      SizedBox(width: 10),
                      Text('Change Category'),
                    ],
                  ),
                ),
                PopupMenuDivider(),
                PopupMenuItem(
                  value: 'delete',
                  child: Row(
                    children: [
                      Icon(Icons.delete, color: Colors.red),
                      SizedBox(width: 10),
                      Text('Delete'),
                    ],
                  ),
                ),
              ],
              icon: const Icon(Icons.more_vert, color: Colors.grey),
            ),
          );
        }),
      ],
    );
  }

  Widget _buildPillToggle() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final border = isDark ? Colors.white10 : Colors.black.withOpacity(0.06);

    return Container(
      height: 42,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: isDark ? Colors.black12 : Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: border),
      ),
      child: Row(
        children: [
          Expanded(
            child: _PillButton(
              label: 'My List',
              selected: _selectedViewIndex == 0,
              onTap: () {
                setState(() {
                  _selectedViewIndex = 0;
                  _viewingFromRecipe = false;
                });
              },
            ),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: _PillButton(
              label: 'From Recipes',
              selected: _selectedViewIndex == 1,
              onTap: () {
                setState(() {
                  _selectedViewIndex = 1;
                  _viewingFromRecipe = true;
                });
              },
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final groupedItems = _groupItemsByCategory();
    final groupedRecipeItems = _groupRecipeItemsByRecipeThenCategory();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Grocery List',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
        ),
        backgroundColor: Colors.deepPurple,
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          IconButton(icon: const Icon(Icons.favorite_border), onPressed: _saveAsFavorite),
          IconButton(icon: const Icon(Icons.list), onPressed: _openFavoritesScreen),
          IconButton(icon: const Icon(Icons.group), onPressed: _onGroupIconPressed),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            AnimatedOpacity(
              opacity: _showHeader ? 1.0 : 0.0,
              duration: const Duration(milliseconds: 250),
              child: AnimatedSlide(
                duration: const Duration(milliseconds: 250),
                offset: _showHeader ? Offset.zero : const Offset(0, -0.06),
                child: Row(
                  children: [
                    Expanded(child: _buildPillToggle()),
                    const SizedBox(width: 10),
                    _HeaderIconButton(
                      icon: _showOptions ? Icons.expand_less : Icons.expand_more,
                      tooltip: 'Show/Hide Options',
                      onPressed: () => setState(() => _showOptions = !_showOptions),
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 10),

            if (_showOptions)
              Column(
                children: [
                  TextField(
                    controller: _controller,
                    decoration: InputDecoration(
                      hintText: 'Enter item name...',
                      filled: true,
                      fillColor: Colors.white,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 15, vertical: 10),
                    ),
                  ),
                  const SizedBox(height: 15),

                  _buildCategoryDropdown(),

                  const SizedBox(height: 15),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _addItem,
                      style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
                        backgroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        side: const BorderSide(color: Colors.teal),
                      ),
                      child: const Text(
                        'Add',
                        style: TextStyle(fontWeight: FontWeight.bold, color: Colors.black),
                      ),
                    ),
                  ),
                  const SizedBox(height: 15),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: _shareGroceryList,
                      icon: const Icon(Icons.share),
                      label: const Text('Share List', style: TextStyle(fontWeight: FontWeight.bold)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.white,
                        foregroundColor: Colors.teal,
                        side: const BorderSide(color: Colors.teal),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                    ),
                  ),
                  const SizedBox(height: 15),
                ],
              ),

            Row(
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.shopping_cart_outlined, color: Colors.deepPurple),
                    const SizedBox(width: 6),
                    Text(
                      '$_uncheckedItemCount',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                        color: Colors.deepPurple,
                      ),
                    ),
                  ],
                ),

                const SizedBox(width: 10),

                Expanded(
                  child: Text(
                    'Estimated Total: $_selectedCurrency ${_calculateVisibleTotal().toStringAsFixed(2)}',
                    textAlign: TextAlign.right,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                      color: Colors.deepPurple,
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 10),

            Expanded(
              child: ListView(
                controller: _scrollController,
                children: !_viewingFromRecipe
                    ? groupedItems.entries.map((entry) {
                  final category = entry.key;
                  final items = entry.value;

                  return _buildCategorySection(category, items);
                }).toList()
                    : groupedRecipeItems.entries.map((recipeEntry) {
                  final recipeKey = recipeEntry.key;
                  final byCategory = recipeEntry.value;

                  final firstItem = byCategory.values.isNotEmpty && byCategory.values.first.isNotEmpty
                      ? byCategory.values.first.first
                      : <String, dynamic>{};

                  final recipeLabel = _recipeGroupLabel(firstItem);

                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SizedBox(height: 18),

                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF3EDFF),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: Colors.deepPurple.withOpacity(0.12)),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.restaurant_menu, color: Colors.deepPurple, size: 18),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                recipeLabel,
                                style: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.deepPurple,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ),

                      ...byCategory.entries.map((catEntry) {
                        final category = catEntry.key;
                        final items = catEntry.value;
                        return _buildCategorySection(category, items);
                      }),
                    ],
                  );
                }).toList(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HeaderIconButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback onPressed;

  const _HeaderIconButton({
    required this.icon,
    required this.tooltip,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final border = isDark ? Colors.white10 : Colors.black.withOpacity(0.08);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onPressed,
        child: Ink(
          height: 42,
          width: 46,
          decoration: BoxDecoration(
            color: isDark ? Colors.black12 : Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: border),
          ),
          child: Icon(icon, color: Colors.deepPurple),
        ),
      ),
    );
  }
}

class _PillButton extends StatefulWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _PillButton({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  State<_PillButton> createState() => _PillButtonState();
}

class _PillButtonState extends State<_PillButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final selectedBg = Colors.deepPurple.withOpacity(isDark ? 0.35 : 0.12);
    final selectedText = isDark ? Colors.white : Colors.deepPurple;
    final unselectedText = isDark ? Colors.white70 : Colors.grey.shade700;

    return GestureDetector(
      onTapDown: (_) => setState(() => _pressed = true),
      onTapCancel: () => setState(() => _pressed = false),
      onTapUp: (_) => setState(() => _pressed = false),
      onTap: widget.onTap,
      child: AnimatedScale(
        scale: _pressed ? 0.98 : 1,
        duration: const Duration(milliseconds: 110),
        curve: Curves.easeOut,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            color: widget.selected ? selectedBg : Colors.transparent,
          ),
          child: Text(
            widget.label,
            style: TextStyle(
              fontWeight: FontWeight.w700,
              color: widget.selected ? selectedText : unselectedText,
            ),
          ),
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
