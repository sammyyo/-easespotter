import 'dart:convert';
import 'package:flutter/material.dart';
//import 'package:flutter/gestures.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:easespotter/services/share_service.dart';
import 'package:easespotter/screens/favorites_list_screen.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class GroceryListScreen extends StatefulWidget {
  const GroceryListScreen({super.key});

  @override
  State<GroceryListScreen> createState() => _GroceryListScreenState();
}

class _GroceryListScreenState extends State<GroceryListScreen> {
  final ShareService _shareService = ShareService();
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
  bool _showOptions = false;
  bool _showHeader = true;
  late ScrollController _scrollController;



  @override
  void initState() {
    super.initState();
    _loadGroceryList();
    _loadFavoriteLists();
    _loadCurrency();
    _loadCollaborations();
    _signInAnonymously();
    _scrollController = ScrollController();
    _scrollController.addListener(_handleScroll);
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
    final userCredential = await FirebaseAuth.instance.signInAnonymously();
    setState(() {});
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
        'expiresAt': Timestamp.now().toDate().add(Duration(days: 7)),
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
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Invalid code. Collaboration not found.')));
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
        final unitPrice = double.tryParse(item['unitPrice']?.toString() ?? '') ??
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

    final exists = _groceryItems.any((item) =>
    item['title'].toString().toLowerCase() == text.toLowerCase());

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
      });
      _controller.clear();
    });
    _saveGroceryList();
  }

  double _calculateTotal() {
    double total = 0.0;
    for (final item in _groceryItems) {
      final price = (item['price'] ?? 0).toDouble();
      final qty = (item['quantity'] ?? 1).toDouble();
      total += price * qty;
    }
    return total;
  }

  void _toggleCheck(int index) {
    setState(() {
      _groceryItems[index]['checked'] = !_groceryItems[index]['checked'];
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

  void _updatePrice(int index, String value) {
    final parsed = double.tryParse(value);
    if (parsed != null) {
      final qty = (_groceryItems[index]['quantity'] ?? 1).toDouble();
      final unit = parsed / qty;

      setState(() {
        _groceryItems[index]['unitPrice'] = unit;
        _groceryItems[index]['price'] = parsed;
        _priceControllers[index]?.text = parsed.toStringAsFixed(2);
      });
      _saveGroceryList();
    }
  }

  void _editPriceDialog(int index) {
    final controller = TextEditingController(text: _groceryItems[index]['price'].toString());
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Edit Price'),
        content: TextField(
          controller: controller,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: const InputDecoration(labelText: 'Enter price'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () {
              _updatePrice(index, controller.text);
              Navigator.pop(context);
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  void _saveAsFavorite() {
    final titleController = TextEditingController();
    final storeController = TextEditingController();

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Save as Favorite List', style: TextStyle(fontSize: 18),),
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
      MaterialPageRoute(
        builder: (context) => const FavoritesListScreen(),
      ),
    );
    if (selectedItems != null) {
      setState(() {
        _groceryItems = selectedItems;
      });
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
              setState(() {
                _groceryItems[index]['category'] = newCategory;
              });
              _saveGroceryList();
              Navigator.pop(context);
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  void _duplicateItem(int index) {
    setState(() {
      _groceryItems.add({..._groceryItems[index]});
    });
    _saveGroceryList();
  }

  void _onGroupIconPressed() {
    final codeController = TextEditingController();

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text(
          'Collaborate on Grocery List',
          style: TextStyle(fontSize: 18),
        ),
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
                            onPressed: () {
                              _joinCollaboration(collab['code']);
                            },
                            child: const Text('Switch'),
                          ),
                        const SizedBox(width: 8),
                        IconButton(
                          icon: const Icon(Icons.delete, color: Colors.red),
                          tooltip: 'Leave this collaboration',
                          onPressed: () async {
                            setState(() {
                              _collaborations.removeWhere((c) => c['code'] == collab['code']);
                              if (_activeCollabCode == collab['code']) {
                                _activeCollabCode = null;
                              }
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
                style: ElevatedButton.styleFrom(backgroundColor: Colors.deepPurple, foregroundColor: Colors.white),
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
              if (code.isNotEmpty) {
                _joinCollaboration(code);
              }
            },
          ),
        ],
      ),
    );
  }

  int get _uncheckedItemCount {
    return _groceryItems.where((item) => item['checked'] == false).length;
  }


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
              const Text('Share Your Grocery List', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.deepPurple), textAlign: TextAlign.center),
              const SizedBox(height: 10),
              const Text('Send it easily to friends or family!', style: TextStyle(fontSize: 16, color: Colors.black54), textAlign: TextAlign.center),
              const SizedBox(height: 20),
              SelectableText(link, textAlign: TextAlign.center, style: const TextStyle(color: Colors.black87, fontSize: 16)),
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
                style: ElevatedButton.styleFrom(backgroundColor: Colors.deepPurple, foregroundColor: Colors.white),
              ),
              const SizedBox(height: 10),
              ElevatedButton.icon(
                onPressed: () async {
                  final Uri whatsappUrl = Uri.parse('https://wa.me/?text=$link');
                  if (await canLaunchUrl(whatsappUrl)) {
                    await launchUrl(whatsappUrl, mode: LaunchMode.externalApplication);
                  } else {
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not open WhatsApp')));
                  }
                },
                icon: const Icon(Icons.send),
                label: const Text('Send via WhatsApp', style: TextStyle(color: Colors.white)),
                style: ElevatedButton.styleFrom(backgroundColor: Colors.green, foregroundColor: Colors.white),
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

  Map<String, List<Map<String, dynamic>>> _groupItemsByCategory() {
    Map<String, List<Map<String, dynamic>>> grouped = {};
    for (var item in _visibleItems) {
      final category = item['category'] ?? 'General';
      if (grouped[category] == null) {
        grouped[category] = [];
      }
      grouped[category]!.add(item);
    }
    return grouped;
  }

  String _getCategoryIcon(String category) {
    switch (category) {
      case 'Snacks': return '🍪';
      case 'Drinks': return '🥤';
      case 'Fruits': return '🍎';
      case 'Vegetables': return '🥦';
      case 'General':
      default: return '🛒';
    }
  }

  @override
  Widget build(BuildContext context) {
    final groupedItems = _groupItemsByCategory();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Grocery List', style: TextStyle(color: Colors.white)),
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
              duration: const Duration(milliseconds: 300),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  ToggleButtons(
                    isSelected: [!_viewingFromRecipe, _viewingFromRecipe],
                    onPressed: (index) => setState(() => _viewingFromRecipe = index == 1),
                    borderRadius: BorderRadius.circular(8),
                    selectedColor: Colors.white,
                    fillColor: Colors.deepPurple,
                    color: Colors.deepPurple,
                    constraints: const BoxConstraints(minHeight: 40, minWidth: 160),
                    children: const [Text('My List'), Text('From Recipes')],
                  ),
                  IconButton(
                    icon: Icon(_showOptions ? Icons.expand_less : Icons.expand_more),
                    onPressed: () => setState(() => _showOptions = !_showOptions),
                    tooltip: 'Show/Hide Options',
                  ),
                ],
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
                  DropdownButtonFormField<String>(
                    isExpanded: true,
                    value: _selectedCategory,
                    icon: const Icon(Icons.arrow_drop_down, color: Colors.deepPurple),
                    dropdownColor: Colors.white,
                    decoration: InputDecoration(
                      labelText: 'Select Category',
                      labelStyle: const TextStyle(color: Colors.deepPurple),
                      filled: true,
                      fillColor: Colors.white,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 15, vertical: 15),
                    ),
                    selectedItemBuilder: (context) => _categories.map((category) => Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 8.0),
                      child: Text(category, style: const TextStyle(fontWeight: FontWeight.bold)),
                    )).toList(),
                    items: _categories.map((String category) => DropdownMenuItem<String>(
                      value: category,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(category, style: const TextStyle(fontWeight: FontWeight.bold)),
                          const Divider(height: 1),
                        ],
                      ),
                    )).toList(),
                    onChanged: (String? newValue) => setState(() => _selectedCategory = newValue!),
                  ),
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
                      child: const Text('Add', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.black)),
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

            // 🛒 Always Visible Summary Row
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(Icons.shopping_cart_outlined, color: Colors.deepPurple),
                    const SizedBox(width: 6),
                    Text(
                      '$_uncheckedItemCount',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Colors.deepPurple),
                    ),
                  ],
                ),
                Text(
                  'Estimated Total: $_selectedCurrency ${_calculateTotal().toStringAsFixed(2)}',
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Colors.deepPurple),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Expanded(
              child: ListView(
                controller: _scrollController,
                children: groupedItems.entries.map((entry) {
                  final category = entry.key;
                  final items = entry.value;
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SizedBox(height: 20),
                      Text('${_getCategoryIcon(category)} $category', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.deepPurple)),
                      const Divider(thickness: 1.5),
                      ...items.asMap().entries.map((itemEntry) {
                        final index = _groceryItems.indexOf(itemEntry.value);
                        final item = itemEntry.value;
                        return ListTile(
                          key: ValueKey(index),
                          contentPadding: const EdgeInsets.symmetric(vertical: 6.0, horizontal: 12.0),
                          leading: Checkbox(
                            value: item['checked'],
                            onChanged: (value) => _toggleCheck(index),
                          ),
                          title: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                item['title'],
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w500,
                                  decoration: item['checked'] ? TextDecoration.lineThrough : null,
                                ),
                              ),
                              const SizedBox(height: 4),
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
                                onFieldSubmitted: (val) => _updatePrice(index, val),
                              ),
                            ],
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.delete, color: Colors.red, size: 20),
                                onPressed: () => _deleteItem(index),
                              ),
                              PopupMenuButton<String>(
                                onSelected: (value) {
                                  if (value == 'move') _changeCategoryDialog(index);
                                },
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                elevation: 8,
                                color: Colors.white,
                                itemBuilder: (context) => [
                                  PopupMenuItem(
                                    value: 'move',
                                    child: Row(
                                      children: const [
                                        Icon(Icons.swap_horiz, color: Colors.deepPurple),
                                        SizedBox(width: 10),
                                        Text('Change Category'),
                                      ],
                                    ),
                                  ),
                                ],
                                icon: const Icon(Icons.more_vert, color: Colors.grey),
                              ),
                            ],
                          ),
                        );
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
