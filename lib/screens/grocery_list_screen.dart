import 'dart:convert';
import 'dart:async';

import '../services/grocery_draft_store.dart';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:easespotter/services/share_service.dart';
import 'package:easespotter/screens/favorites_list_screen.dart';
import 'package:easespotter/screens/qr_scanner_screen.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:easespotter/services/home_inventory_service.dart';
import 'package:easespotter/services/user_scoped_prefs.dart';

class GroceryListScreenController {
  static void Function({
    required int tabIndex,
    int? addedCount,
    String? recipeTitle,
  })?
  switchTabAndRefresh;
}

class GroceryListScreen extends StatefulWidget {
  final int initialViewIndex; // 0 = My List, 1 = From Recipes
  final bool showBackButton;
  final int? initialAddedCount;
  final String? initialRecipeTitle;
  final String? initialShareCode;

  const GroceryListScreen({
    super.key,
    this.initialViewIndex = 0,
    this.showBackButton = false,
    this.initialAddedCount,
    this.initialRecipeTitle,
    this.initialShareCode,
  });

  @override
  State<GroceryListScreen> createState() => _GroceryListScreenState();
}

class _GroceryListScreenState extends State<GroceryListScreen> {
  final ShareService _shareService = ShareService();
  final HomeInventoryService _inventory = HomeInventoryService();
  final TextEditingController _controller = TextEditingController();
  final Map<int, TextEditingController> _priceControllers = {};

  final List<String> _categories = [
    'General',
    'Snacks',
    'Drinks',
    'Fruits',
    'Vegetables',
  ];
  String _selectedCategory = 'General';

  List<Map<String, dynamic>> _groceryItems = [];
  List<Map<String, dynamic>> _favoriteLists = [];
  String _selectedCurrency = 'USD';

  List<Map<String, dynamic>> _collaborations = [];
  String? _activeCollabCode;
  String? _activeCollabId;
  int _revision = 0;
  bool _collabBusy = true;
  bool _savingCollaboration = false;
  List<Map<String, dynamic>>? _pendingSave;
  StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>?
  _collabSubscription;
  StreamSubscription<User?>? _authSubscription;
  late final String? _sessionUid;

  bool _viewingFromRecipe = false;
  bool _showOptions = true;
  bool _showHeader = true;
  bool _handledInitialShareCode = false;
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
              SnackBar(content: Text(msg), behavior: SnackBarBehavior.floating),
            );
          }
        };

    _sessionUid = FirebaseAuth.instance.currentUser?.uid;
    _authSubscription = FirebaseAuth.instance.authStateChanges().listen((user) {
      if (user?.uid != _sessionUid) {
        _collabSubscription?.cancel();
        _activeCollabId = null;
        _activeCollabCode = null;
        _pendingSave = null;
        if (mounted) {
          setState(() {
            _groceryItems = [];
            _collaborations = [];
          });
        }
      }
    });
    _initializeLists();
    _scrollController = ScrollController();
    _scrollController.addListener(_handleScroll);

    WidgetsBinding.instance.addPostFrameCallback((_) {
      _showInitialRecipeSnack();
    });
  }

  void _setCollabBusy(bool value) {
    if (mounted) setState(() => _collabBusy = value);
  }

  Future<void> _initializeLists() async {
    try {
      if (_sessionUid != null &&
          await GroceryDraftStore(_sessionUid).recover()) {
        _message('Interrupted edits were recovered in Favorite Lists.');
      }
      await _loadGroceryList();
      await _loadFavoriteLists();
      await _loadCurrency();
      await _loadCollaborations();
    } catch (e) {
      _message(
        'Some saved lists could not be loaded. Please reopen this screen.',
      );
    } finally {
      _setCollabBusy(false);
    }
    if (!_sameSession) return;
    if (widget.initialShareCode != null) {
      _joinInitialShareCodeIfNeeded();
    } else {
      final prefs = await SharedPreferences.getInstance();
      if (!_sameSession) return;
      final id = prefs.getString(
        UserScopedPrefs.key('active_grocery_collaboration'),
      );
      if (id != null) await _joinCollaboration('', shareId: id);
    }
  }

  bool get _sameSession =>
      mounted && FirebaseAuth.instance.currentUser?.uid == _sessionUid;

  void _message(String message) {
    if (mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));
    }
  }

  void _showInitialRecipeSnack() {
    final addedCount = widget.initialAddedCount;
    if (!mounted || addedCount == null) return;

    final recipeTitle = widget.initialRecipeTitle;
    final msg = addedCount == 0
        ? "Nothing new was added."
        : "Added $addedCount item${addedCount == 1 ? '' : 's'}${recipeTitle != null && recipeTitle.trim().isNotEmpty ? " from “$recipeTitle”" : ''}.";

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), behavior: SnackBarBehavior.floating),
    );
  }

  @override
  void dispose() {
    if (GroceryListScreenController.switchTabAndRefresh != null) {
      GroceryListScreenController.switchTabAndRefresh = null;
    }
    _collabSubscription?.cancel();
    _authSubscription?.cancel();
    _controller.dispose();
    for (final c in _priceControllers.values) {
      c.dispose();
    }
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _loadCollaborations() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(UserScopedPrefs.key('collaborations'));
    if (saved != null && mounted) {
      final List<dynamic> decoded = jsonDecode(saved);
      setState(() {
        _collaborations = List<Map<String, dynamic>>.from(decoded);
      });
    }
  }

  String? _currentSignedInUid({bool showMessage = false}) {
    final user = FirebaseAuth.instance.currentUser;
    if (user != null && !user.isAnonymous) return user.uid;
    if (showMessage && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please sign in to use this feature.')),
      );
    }
    return null;
  }

  String _shareLinkForCode(String code) =>
      'https://www.easespotter.com/share/$code';

  String _collaborationCodeFromInput(String input) =>
      ShareService.parseCode(input);

  void _joinInitialShareCodeIfNeeded() {
    final code = widget.initialShareCode?.trim();
    if (code == null || code.isEmpty || _handledInitialShareCode) return;

    _handledInitialShareCode = true;
    _joinCollaborationFromInput(code);
  }

  Future<void> _startNewCollaboration() async {
    if (_collabBusy ||
        _savingCollaboration ||
        _currentSignedInUid(showMessage: true) == null) {
      return;
    }
    _setCollabBusy(true);
    try {
      final data = await _shareService.call('create', {'list': _groceryItems});
      if (!_sameSession) return;
      await _activateCollaboration(data);
      if (mounted) _showCollaborationInviteDialog(data['code'] as String);
    } catch (e) {
      _message(_errorMessage(e));
    } finally {
      _setCollabBusy(false);
    }
  }

  String _errorMessage(Object e) => e is FirebaseFunctionsException
      ? (e.message ?? 'Collaboration is unavailable. Please try again.')
      : 'Could not connect. Please try again.';

  void _showCollaborationInviteDialog(String code) {
    final link = _shareLinkForCode(code);

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
                'Invite Collaborators',
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF006677),
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 10),
              const Text(
                'Invites expire after seven days. Friends need EaseSpotter installed; they can open this link or paste it into the collaboration screen after signing in.',
                style: TextStyle(fontSize: 16, color: Colors.black54),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              SelectableText(
                link,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.black87, fontSize: 16),
              ),
              const SizedBox(height: 8),
              Text(
                'Code: $code',
                style: const TextStyle(
                  color: Colors.black54,
                  fontWeight: FontWeight.w600,
                ),
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
                          Expanded(
                            child: Text('Invite link copied to clipboard!'),
                          ),
                        ],
                      ),
                    ),
                  );
                },
                icon: const Icon(Icons.copy),
                label: const Text(
                  'Copy Invite Link',
                  style: TextStyle(color: Colors.white),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF006677),
                  foregroundColor: Colors.white,
                ),
              ),
              const SizedBox(height: 10),
              ElevatedButton.icon(
                onPressed: () async {
                  await SharePlus.instance.share(
                    ShareParams(
                      text: 'Join my EaseSpotter grocery list:\n$link',
                      subject: 'EaseSpotter Grocery List Collaboration',
                    ),
                  );
                },
                icon: const Icon(Icons.ios_share),
                label: const Text(
                  'Share Invite Link',
                  style: TextStyle(color: Colors.white),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.teal,
                  foregroundColor: Colors.white,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _joinCollaborationFromInput(String input) async {
    final code = _collaborationCodeFromInput(input);
    if (code.isEmpty) {
      _message('Enter a valid invitation code or EaseSpotter link.');
      return;
    }

    await _joinCollaboration(code);
  }

  void _handleScroll() {
    final direction = _scrollController.position.userScrollDirection;
    if (direction == AxisDirection.down) {
      if (_showHeader) setState(() => _showHeader = false);
    } else if (direction == AxisDirection.up) {
      if (!_showHeader) setState(() => _showHeader = true);
    }
  }

  List<Map<String, dynamic>> _items(dynamic list) =>
      (list as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();

  Future<void> _persistCollaborations() async {
    final key = UserScopedPrefs.key('collaborations');
    final prefs = await SharedPreferences.getInstance();
    if (_sameSession) {
      await prefs.setString(key, jsonEncode(_collaborations));
      final activeKey = UserScopedPrefs.key('active_grocery_collaboration');
      if (_activeCollabId == null) {
        await prefs.remove(activeKey);
      } else {
        await prefs.setString(activeKey, _activeCollabId!);
      }
    }
  }

  Future<void> _applyList(List<Map<String, dynamic>> list) async {
    if (!_sameSession) return;
    for (final controller in _priceControllers.values) {
      controller.dispose();
    }
    _priceControllers.clear();
    setState(() {
      _groceryItems = list;
      for (var i = 0; i < list.length; i++) {
        _priceControllers[i] = TextEditingController(
          text: (_parseMoney(list[i]['price']) ?? 0).toStringAsFixed(2),
        );
      }
    });
    final key = UserScopedPrefs.key('grocery_list');
    final encoded = jsonEncode(list);
    final prefs = await SharedPreferences.getInstance();
    if (_sameSession) await prefs.setString(key, encoded);
  }

  Future<void> _activateCollaboration(Map<String, dynamic> data) async {
    await _collabSubscription?.cancel();
    if (!_sameSession) return;
    _activeCollabId = data['docId'] as String;
    _activeCollabCode = data['code'] as String;
    _revision = (data['revision'] as num).toInt();
    _collaborations.removeWhere((c) => c['docId'] == _activeCollabId);
    _collaborations.add({
      'docId': _activeCollabId,
      'code': _activeCollabCode,
      'ownerUid': data['ownerUid'],
    });
    await _applyList(_items(data['list']));
    await _persistCollaborations();
    if (_sameSession) _listenToCollaboration(_activeCollabId!);
  }

  void _listenToCollaboration(String id) {
    _collabSubscription?.cancel();
    _collabSubscription = FirebaseFirestore.instance
        .collection('grocery_shares')
        .doc(id)
        .snapshots()
        .listen(
          (snapshot) {
            if (!_sameSession ||
                _activeCollabId != id ||
                _savingCollaboration ||
                _pendingSave != null) {
              return;
            }
            final data = snapshot.data();
            if (data == null) {
              _disconnectCollaboration('This collaboration has ended.');
              return;
            }
            final revision = (data['revision'] as num?)?.toInt() ?? 0;
            if (revision > _revision) {
              _revision = revision;
              _applyList(_items(data['list'] ?? []));
            }
            _activeCollabCode = data['code'] as String? ?? id;
            for (final c in _collaborations) {
              if (c['docId'] == id) c['code'] = _activeCollabCode;
            }
          },
          onError: (Object error) {
            if (_sameSession && _activeCollabId == id) {
              _disconnectCollaboration(
                'Access to this collaboration is unavailable. Your local list is kept.',
              );
            }
          },
        );
  }

  void _disconnectCollaboration(String message) {
    _collabSubscription?.cancel();
    if (mounted) {
      setState(() {
        _activeCollabId = null;
        _activeCollabCode = null;
      });
    }
    _persistCollaborations();
    _message(message);
  }

  Future<void> _joinCollaboration(String code, {String? shareId}) async {
    if (_collabBusy || _savingCollaboration) {
      _message('Please wait for the current changes to finish.');
      return;
    }
    if (_currentSignedInUid() == null) {
      await ShareService.rememberInvite(code);
      if (mounted) Navigator.of(context).pushNamed('/login');
      return;
    }
    _setCollabBusy(true);
    try {
      final data = await _shareService.call(
        shareId == null ? 'join' : 'open',
        shareId == null ? {'code': code} : {'shareId': shareId},
      );
      if (_sameSession) await _activateCollaboration(data);
    } catch (e) {
      if (e is FirebaseFunctionsException &&
          e.code == 'not-found' &&
          shareId != null &&
          _sameSession) {
        setState(
          () => _collaborations.removeWhere((c) => c['docId'] == shareId),
        );
        if (_activeCollabId == shareId) {
          _activeCollabId = null;
          _activeCollabCode = null;
          await _collabSubscription?.cancel();
        }
        await _persistCollaborations();
      }
      _message(_errorMessage(e));
    } finally {
      _setCollabBusy(false);
    }
  }

  Future<void> _leaveCollaboration(Map<String, dynamic> collab) async {
    if (_collabBusy || _savingCollaboration) {
      _message('Please wait for saving to finish.');
      return;
    }
    _setCollabBusy(true);
    try {
      final owner = collab['ownerUid'] == _sessionUid;
      final unknownOwner = collab['ownerUid'] == null;
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(
            owner ? 'End collaboration for everyone?' : 'Leave collaboration?',
          ),
          content: Text(
            (owner || unknownOwner)
                ? 'If you own this list, everyone will lose access. Local copies already saved on devices remain.'
                : 'You will lose access to the shared list. Your local copy will remain.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(owner ? 'End collaboration' : 'Leave'),
            ),
          ],
        ),
      );
      if (confirmed != true || !_sameSession) return;
      await _shareService.call('leave', {'shareId': collab['docId']});
      if (!_sameSession) return;
      if (_activeCollabId == collab['docId']) {
        _disconnectCollaboration('Collaboration left.');
      }
      setState(
        () => _collaborations.removeWhere((c) => c['docId'] == collab['docId']),
      );
      await _persistCollaborations();
    } catch (e) {
      _message(_errorMessage(e));
    } finally {
      _setCollabBusy(false);
    }
  }

  Future<void> _showSavedInvite(Map<String, dynamic> collab) async {
    if (_collabBusy || _savingCollaboration) return;
    _setCollabBusy(true);
    try {
      final data = await _shareService.call('open', {
        'shareId': collab['docId'],
      });
      if (!_sameSession) return;
      setState(() {
        collab['code'] = data['code'];
        collab['ownerUid'] = data['ownerUid'];
      });
      await _persistCollaborations();
      if (mounted) _showCollaborationInviteDialog(data['code'] as String);
    } catch (e) {
      _message(_errorMessage(e));
    } finally {
      _setCollabBusy(false);
    }
  }

  Future<void> _renewInvite(Map<String, dynamic> collab) async {
    if (_collabBusy || _savingCollaboration) return;
    _setCollabBusy(true);
    try {
      final data = await _shareService.call('renew', {
        'shareId': collab['docId'],
      });
      if (!_sameSession) return;
      setState(() {
        collab['code'] = data['code'];
        if (_activeCollabId == collab['docId']) {
          _activeCollabCode = data['code'] as String;
        }
      });
      await _persistCollaborations();
      if (mounted) _showCollaborationInviteDialog(data['code'] as String);
    } catch (e) {
      _message(_errorMessage(e));
    } finally {
      _setCollabBusy(false);
    }
  }

  Future<void> _updateCollaboration() async {
    final id = _activeCollabId;
    final uid = _sessionUid;
    if (id == null || uid == null || !_sameSession) return;
    _pendingSave = _items(jsonDecode(jsonEncode(_groceryItems)));
    if (_savingCollaboration) return;
    setState(() => _savingCollaboration = true);
    final drafts = GroceryDraftStore(uid);
    bool sameAccount() => FirebaseAuth.instance.currentUser?.uid == uid;
    try {
      while (_pendingSave != null && sameAccount() && _activeCollabId == id) {
        final list = _pendingSave!;
        _pendingSave = null;
        await drafts.save(list);
        try {
          final data = await _shareService.call('update', {
            'shareId': id,
            'revision': _revision,
            'list': list,
          });
          if (!sameAccount()) return;
          _revision = (data['revision'] as num).toInt();
          if (_pendingSave == null) await drafts.clear();
        } catch (e) {
          // Capture the latest keyboard edit as well as the failed request.
          await drafts.save(_pendingSave ?? list);
          _pendingSave = null;
          await drafts.recover();
          if (_sameSession) {
            await _loadFavoriteLists();
            _disconnectCollaboration(
              'Could not sync your edits. They are preserved in Favorite Lists. Reopen the collaboration to get its latest version.',
            );
          }
          return;
        }
      }
    } catch (e) {
      // A local storage failure must not silently discard the on-screen list.
      if (_sameSession) {
        _disconnectCollaboration(
          'Saving failed. Keep this screen open and save your list again.',
        );
      }
    } finally {
      if (mounted) {
        setState(() => _savingCollaboration = false);
      } else {
        _savingCollaboration = false;
      }
      if (_sameSession && _activeCollabId == id) _listenToCollaboration(id);
    }
  }

  Future<void> _loadCurrency() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString('selected_currency');
    if (saved != null && mounted) {
      setState(() {
        _selectedCurrency = saved;
      });
    }
  }

  Future<void> _loadGroceryList() async {
    final prefs = await SharedPreferences.getInstance();
    final String? listJson = prefs.getString(
      UserScopedPrefs.key('grocery_list'),
    );
    if (listJson != null && mounted) {
      final decoded = List<Map<String, dynamic>>.from(jsonDecode(listJson));

      _groceryItems = [];
      for (final controller in _priceControllers.values) {
        controller.dispose();
      }
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
        _priceControllers[i] = TextEditingController(
          text: totalPrice.toStringAsFixed(2),
        );
      }

      setState(() {});
    }
  }

  Future<void> _saveGroceryList() async {
    final saving = _updateCollaboration();
    final encoded = jsonEncode(_groceryItems);
    final key = UserScopedPrefs.key('grocery_list');
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(key, encoded);
    await saving;
  }

  double? _parseMoney(dynamic value) {
    if (value == null) return null;
    final raw = value.toString().trim();
    if (raw.isEmpty) return null;
    final cleaned = raw
        .replaceAll(RegExp(r'[^0-9.,-]'), '')
        .replaceAll(',', '');
    if (cleaned.isEmpty || cleaned == '-' || cleaned == '.') return null;
    return double.tryParse(cleaned);
  }

  Future<void> _loadFavoriteLists() async {
    final prefs = await SharedPreferences.getInstance();
    final String? favJson = prefs.getString(
      UserScopedPrefs.key('favorite_lists'),
    );
    if (favJson != null && mounted) {
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

  Future<void> _openReceiptScanner() async {
    final added = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => const QRScannerScreen(
          initialMode: ScanMode.receipt,
          returnAfterReceiptAdd: true,
        ),
      ),
    );

    if (added == true) {
      await _loadGroceryList();
    }
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
      final include = _viewingFromRecipe
          ? source == 'recipe'
          : source != 'recipe';
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
    final uid = _currentSignedInUid();
    if (uid == null) return null;
    final col = FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .collection('home_inventory');

    if (barcode.trim().isNotEmpty) {
      final doc = await col.doc(barcode.trim()).get();
      if (!doc.exists) return null;
      return {'id': doc.id, ...doc.data()!};
    }

    final snap = await col.where('name', isEqualTo: name.trim()).limit(1).get();

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
                    backgroundColor: const Color(0xFF006677),
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

  Future<void> _markBroughtHomeSmart(int index) async {
    final item = _groceryItems[index];

    final name = (item['title'] ?? '').toString().trim();
    if (name.isEmpty) return;

    final barcode = (item['barcode'] ?? '').toString().trim();

    if (_currentSignedInUid(showMessage: true) == null) return;

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
      _groceryItems[index]['checked'] =
          !(_groceryItems[index]['checked'] == true);
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
        _priceControllers[index]?.text = parsed == 0
            ? ''
            : parsed.toStringAsFixed(2);
      }
    });
    _saveGroceryList();
  }

  void _saveAsFavorite() {
    final titleController = TextEditingController();
    final storeController = TextEditingController(
      text: _suggestFavoriteStoreName(),
    );

    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text(
          'Save as Favorite List',
          style: TextStyle(fontSize: 18),
        ),
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
              decoration: const InputDecoration(
                hintText: 'Enter store name (optional)',
              ),
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
                final String? favJson = prefs.getString(
                  UserScopedPrefs.key('favorite_lists'),
                );
                List<Map<String, dynamic>> currentFavorites = [];

                if (favJson != null && mounted) {
                  currentFavorites = List<Map<String, dynamic>>.from(
                    jsonDecode(favJson),
                  );
                }

                currentFavorites.add({
                  'title': title,
                  'store': store,
                  'items': List<Map<String, dynamic>>.from(_groceryItems),
                });

                await prefs.setString(
                  UserScopedPrefs.key('favorite_lists'),
                  jsonEncode(currentFavorites),
                );

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

  String _suggestFavoriteStoreName() {
    final receiptStores = _groceryItems
        .map((item) => item['storeName']?.toString().trim() ?? '')
        .where((store) => store.isNotEmpty)
        .toSet();

    if (receiptStores.length == 1) return receiptStores.first;
    return '';
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
      builder: (dialogContext) => AlertDialog(
        title: const Text('Change Category'),
        content: DropdownButtonFormField<String>(
          value: newCategory,
          items: _categories
              .map((cat) => DropdownMenuItem(value: cat, child: Text(cat)))
              .toList(),
          onChanged: (value) => newCategory = value!,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
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
      builder: (dialogContext) => AlertDialog(
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
                const Text(
                  'Your Collaborations:',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 10),
                ..._collaborations.map((collab) {
                  final isActive = _activeCollabId == collab['docId'];
                  final code = collab['code'].toString();

                  return Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          isActive ? 'Code: $code (Active)' : 'Code: $code',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Wrap(
                          spacing: 8,
                          runSpacing: 4,
                          children: [
                            if (!isActive)
                              ElevatedButton(
                                onPressed: () {
                                  Navigator.pop(dialogContext);
                                  _joinCollaboration(
                                    code,
                                    shareId: collab['docId'] as String,
                                  );
                                },
                                child: const Text('Switch'),
                              ),
                            IconButton(
                              icon: const Icon(
                                Icons.ios_share,
                                color: Colors.teal,
                              ),
                              tooltip: 'Share invite link',
                              onPressed: () {
                                Navigator.pop(dialogContext);
                                _showSavedInvite(collab);
                              },
                            ),
                            if (collab['ownerUid'] == _sessionUid ||
                                collab['ownerUid'] == null)
                              IconButton(
                                icon: const Icon(Icons.refresh),
                                tooltip: 'Replace invite (owner only)',
                                onPressed: () {
                                  Navigator.pop(dialogContext);
                                  _renewInvite(collab);
                                },
                              ),
                            IconButton(
                              icon: const Icon(Icons.delete, color: Colors.red),
                              tooltip: 'Leave this collaboration',
                              onPressed: () {
                                Navigator.pop(dialogContext);
                                _leaveCollaboration(collab);
                              },
                            ),
                          ],
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
                  backgroundColor: const Color(0xFF006677),
                  foregroundColor: Colors.white,
                ),
                onPressed: () {
                  Navigator.pop(dialogContext);
                  _startNewCollaboration();
                },
              ),
              const SizedBox(height: 20),
              const Text('Or enter a code or invite link to join:'),
              const SizedBox(height: 10),
              TextField(
                controller: codeController,
                decoration: const InputDecoration(
                  hintText: 'Code or https://www.easespotter.com/share/ABC123',
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            child: const Text('Join'),
            onPressed: () {
              final invite = codeController.text.trim();
              Navigator.pop(dialogContext);
              if (invite.isNotEmpty) _joinCollaborationFromInput(invite);
            },
          ),
        ],
      ),
    );
  }

  int get _uncheckedItemCount =>
      _groceryItems.where((item) => item['checked'] == false).length;

  void _shareGroceryList() {
    if (_groceryItems.isEmpty) {
      _message('Your grocery list is empty!');
      return;
    }
    if (_activeCollabCode != null) {
      _showCollaborationInviteDialog(_activeCollabCode!);
    } else {
      _startNewCollaboration();
    }
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
    if (id.isNotEmpty) {
      return 'Recipe · ${id.substring(0, id.length >= 6 ? 6 : id.length)}';
    }

    return 'Recipe (Unknown)';
  }

  Map<String, Map<String, List<Map<String, dynamic>>>>
  _groupRecipeItemsByRecipeThenCategory() {
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
    final RenderBox box =
        _categoryFieldKey.currentContext!.findRenderObject() as RenderBox;
    final RenderBox overlay =
        Overlay.of(context).context.findRenderObject() as RenderBox;

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
      position: RelativeRect.fromLTRB(
        left,
        top,
        right,
        overlaySize.height - top,
      ),
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
              color: isSelected ? const Color(0xFFE6F4F6) : Colors.transparent,
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
                color: isSelected ? const Color(0xFF006677) : Colors.black87,
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
            labelStyle: const TextStyle(color: Color(0xFF006677)),
            filled: true,
            fillColor: Colors.white,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 15,
              vertical: 14,
            ),
            suffixIcon: const Icon(
              Icons.keyboard_arrow_down_rounded,
              color: Color(0xFF006677),
              size: 28,
            ),
          ),
          child: Text(
            _selectedCategory,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          ),
        ),
      ),
    );
  }

  Widget _buildCategorySection(
    String category,
    List<Map<String, dynamic>> items,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 18),
        Text(
          '${_getCategoryIcon(category)} $category',
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            color: Color(0xFF006677),
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
            contentPadding: const EdgeInsets.symmetric(
              vertical: 6.0,
              horizontal: 12.0,
            ),
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
                    decoration: item['checked']
                        ? TextDecoration.lineThrough
                        : null,
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
                    Text(
                      'Qty: ${item['quantity'].toInt()}',
                      style: const TextStyle(fontSize: 14),
                    ),
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
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: const InputDecoration(
                    labelText: 'Price',
                    isDense: true,
                  ),
                  onChanged: (val) =>
                      _updatePrice(index, val, normalizeText: false),
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
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              elevation: 8,
              color: Colors.white,
              itemBuilder: (context) => const [
                PopupMenuItem(
                  value: 'brought',
                  child: Row(
                    children: [
                      Icon(Icons.kitchen, color: Color(0xFF006677)),
                      SizedBox(width: 10),
                      Text('Brought home'),
                    ],
                  ),
                ),
                PopupMenuItem(
                  value: 'move',
                  child: Row(
                    children: [
                      Icon(Icons.swap_horiz, color: Color(0xFF006677)),
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

    return PopScope(
      canPop: !_collabBusy && !_savingCollaboration,
      child: AbsorbPointer(
        absorbing: _collabBusy,
        child: Scaffold(
          appBar: AppBar(
            centerTitle: true,
            leading: widget.showBackButton
                ? IconButton(
                    icon: const Icon(Icons.arrow_back),
                    onPressed: () => Navigator.of(context).maybePop(),
                  )
                : null,
            title: const Text(
              'Grocery List',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w800,
              ),
            ),
            backgroundColor: const Color(0xFF006677),
            iconTheme: const IconThemeData(color: Colors.white),
            actions: [
              IconButton(
                icon: const Icon(Icons.favorite_border),
                onPressed: _saveAsFavorite,
              ),
              IconButton(
                icon: const Icon(Icons.list),
                onPressed: _openFavoritesScreen,
              ),
              IconButton(
                icon: const Icon(Icons.group),
                onPressed: _onGroupIconPressed,
              ),
            ],
          ),
          body: Stack(
            children: [
              Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  children: [
                    AnimatedOpacity(
                      opacity: _showHeader ? 1.0 : 0.0,
                      duration: const Duration(milliseconds: 250),
                      child: AnimatedSlide(
                        duration: const Duration(milliseconds: 250),
                        offset: _showHeader
                            ? Offset.zero
                            : const Offset(0, -0.06),
                        child: Row(
                          children: [
                            Expanded(child: _buildPillToggle()),
                            const SizedBox(width: 10),
                            _HeaderIconButton(
                              icon: _showOptions
                                  ? Icons.expand_less
                                  : Icons.expand_more,
                              tooltip: 'Show/Hide Options',
                              onPressed: () =>
                                  setState(() => _showOptions = !_showOptions),
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
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 15,
                                vertical: 10,
                              ),
                            ),
                          ),
                          const SizedBox(height: 15),

                          _buildCategoryDropdown(),

                          const SizedBox(height: 15),
                          Row(
                            children: [
                              Expanded(
                                child: _GroceryActionButton(
                                  icon: Icons.add,
                                  label: 'Add',
                                  color: Colors.teal,
                                  onPressed: _addItem,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: _GroceryActionButton(
                                  icon: Icons.receipt_long,
                                  label: 'Receipt',
                                  color: const Color(0xFF006677),
                                  onPressed: _openReceiptScanner,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: _GroceryActionButton(
                                  icon: Icons.share,
                                  label: 'Share',
                                  color: Colors.teal,
                                  onPressed: _shareGroceryList,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 15),
                        ],
                      ),

                    Row(
                      children: [
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(
                              Icons.shopping_cart_outlined,
                              color: Color(0xFF006677),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              '$_uncheckedItemCount',
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 16,
                                color: Color(0xFF006677),
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
                              color: Color(0xFF006677),
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

                                final firstItem =
                                    byCategory.values.isNotEmpty &&
                                        byCategory.values.first.isNotEmpty
                                    ? byCategory.values.first.first
                                    : <String, dynamic>{};

                                final recipeLabel = _recipeGroupLabel(
                                  firstItem,
                                );

                                return Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const SizedBox(height: 18),

                                    Container(
                                      width: double.infinity,
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 12,
                                        vertical: 10,
                                      ),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFFE6F4F6),
                                        borderRadius: BorderRadius.circular(12),
                                        border: Border.all(
                                          color: const Color(0xFF006677)
                                              .withOpacity(0.12),
                                        ),
                                      ),
                                      child: Row(
                                        children: [
                                          const Icon(
                                            Icons.restaurant_menu,
                                            color: Color(0xFF006677),
                                            size: 18,
                                          ),
                                          const SizedBox(width: 8),
                                          Expanded(
                                            child: Text(
                                              recipeLabel,
                                              style: const TextStyle(
                                                fontSize: 14,
                                                fontWeight: FontWeight.w800,
                                                color: Color(0xFF006677),
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
                                      return _buildCategorySection(
                                        category,
                                        items,
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
              if (_collabBusy || _savingCollaboration)
                const Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: LinearProgressIndicator(),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _GroceryActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onPressed;

  const _GroceryActionButton({
    required this.icon,
    required this.label,
    required this.color,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return ElevatedButton(
      onPressed: onPressed,
      style: ElevatedButton.styleFrom(
        backgroundColor: Colors.white,
        foregroundColor: color,
        side: BorderSide(color: color),
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 12),
        minimumSize: const Size(0, 56),
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 20),
          const SizedBox(height: 4),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              label,
              maxLines: 1,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
            ),
          ),
        ],
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
          child: Icon(icon, color: const Color(0xFF006677)),
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

    final selectedBg = const Color(0xFF006677)
        .withOpacity(isDark ? 0.35 : 0.12);
    final selectedText = isDark ? Colors.white : const Color(0xFF006677);
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
            color: selected
                ? const Color(0xFF006677)
                : Colors.black.withOpacity(0.12),
          ),
          color: selected
              ? const Color(0xFF006677).withOpacity(0.12)
              : Colors.transparent,
        ),
        child: Text(
          label,
          style: TextStyle(
            fontWeight: FontWeight.w700,
            color: selected ? const Color(0xFF006677) : Colors.black87,
          ),
        ),
      ),
    );
  }
}
