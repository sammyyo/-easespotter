import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:easespotter/services/store_follow_service.dart';
import 'package:easespotter/screens/store_confirmation_screen.dart';
import 'package:easespotter/services/store_api_service.dart';
import 'package:easespotter/services/store_logo_service.dart';

class StoreProfileScreen extends StatefulWidget {
  final String storeId;
  final String? storeName;
  final String? logoUrl;
  final Map<String, dynamic>? initialStoreData;
  final bool allowRemoteLookup;

  const StoreProfileScreen({
    super.key,
    required this.storeId,
    this.storeName,
    this.logoUrl,
    this.initialStoreData,
    this.allowRemoteLookup = true,
  });

  @override
  State<StoreProfileScreen> createState() => _StoreProfileScreenState();
}

class _StoreProfileScreenState extends State<StoreProfileScreen> {
  bool _isFollowing = false;
  bool _loadingFollow = true;
  bool _openingStorefront = false;
  late Future<List<_StoreProfilePromotion>> _promotionsFuture;

  @override
  void initState() {
    super.initState();
    _promotionsFuture = _fetchStoreProfilePromotions();
    _loadFollowState();
  }

  @override
  void didUpdateWidget(covariant StoreProfileScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.storeId != widget.storeId) {
      _promotionsFuture = _fetchStoreProfilePromotions();
    }
  }

  Future<void> _loadFollowState() async {
    try {
      final isFollowing = await StoreFollowService.isFollowing(widget.storeId);
      if (!mounted) return;
      setState(() {
        _isFollowing = isFollowing;
        _loadingFollow = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loadingFollow = false);
      debugPrint('Error loading follow state: $e');
    }
  }

  Future<void> _toggleFollow(String storeName, String? logoUrl) async {
    setState(() => _loadingFollow = true);
    try {
      if (_isFollowing) {
        await StoreFollowService.unfollowStore(widget.storeId);
      } else {
        await StoreFollowService.followStore(
          storeId: widget.storeId,
          storeName: storeName,
          logoUrl: logoUrl,
        );
      }

      if (!mounted) return;
      setState(() {
        _isFollowing = !_isFollowing;
        _loadingFollow = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loadingFollow = false);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Failed to update follow: $e')));
    }
  }

  Future<void> _openStorefront({
    required String storeName,
    required String? logoUrl,
  }) async {
    final vendorId = int.tryParse(widget.storeId);

    if (vendorId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Invalid vendorId/storeId: ${widget.storeId}')),
      );
      return;
    }

    try {
      setState(() => _openingStorefront = true);

      final apiData = await _fetchStorefrontData(vendorId);
      final productsByCategory = _asMap(apiData['productsByCategory']);
      final productsByAisle = _asMap(apiData['productsByAisle']);
      final resolvedLogo = StoreLogoService.resolveFromData(apiData);

      final storeData = <String, dynamic>{
        ...apiData,
        'vendorId': apiData['vendorId'] ?? vendorId,
        'vendorName': apiData['vendorName'] ?? storeName,
        'logoUrl':
            resolvedLogo.isNotEmpty
                ? resolvedLogo
                : StoreLogoService.resolveUrl(logoUrl),
        'productsByCategory': productsByCategory,
        'productsByAisle': productsByAisle,
        'totalProducts': apiData['totalProducts'] ?? 0,
        'timestamp': apiData['timestamp'],
      };

      if (!mounted) return;

      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => StoreConfirmationScreen(storeData: storeData),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Failed to open store: $e')));
    } finally {
      if (mounted) setState(() => _openingStorefront = false);
    }
  }

  Future<Map<String, dynamic>> _fetchStorefrontData(int vendorId) async {
    if (widget.initialStoreData != null) {
      return _extractStoreData(widget.initialStoreData);
    }

    final cachedData = await _cachedStorefrontData(vendorId);
    if (cachedData != null) return cachedData;

    if (!widget.allowRemoteLookup) {
      throw Exception(
        'Store product data is not saved on this followed store yet. Unfollow it, scan the store QR again, then follow it from the store page.',
      );
    }

    try {
      final directoryData = _extractStoreData(
        await StoreApiService.fetchStoreDirectory(vendorId),
      );
      if (_hasProducts(directoryData)) {
        return directoryData;
      }
      debugPrint(
        'StoreProfile directory fetch for $vendorId returned no products',
      );
    } catch (e) {
      debugPrint('StoreProfile directory fetch failed for $vendorId: $e');
    }

    try {
      final storeData = _extractStoreData(
        await StoreApiService.fetchStoreById(vendorId),
      );
      if (_hasProducts(storeData)) {
        return storeData;
      }
      debugPrint('StoreProfile full store fetch for $vendorId had no products');
    } catch (e) {
      debugPrint('StoreProfile full store fetch failed for $vendorId: $e');
    }

    final firestoreData = await _firestoreStorefrontData(vendorId);
    if (firestoreData != null) return firestoreData;

    throw Exception(
      'Store product data is not saved on this followed store yet. Unfollow it, scan the store QR again, then follow it from the store page.',
    );
  }

  Future<List<_StoreProfilePromotion>> _fetchStoreProfilePromotions() async {
    final vendorId = int.tryParse(widget.storeId);
    final backendPromotions = <_StoreProfilePromotion>[];

    if (vendorId != null) {
      try {
        final storeData = _extractStoreData(
          await StoreApiService.fetchStoreById(vendorId),
        );
        backendPromotions.addAll(_promotionsFromStoreData(storeData));
      } catch (e) {
        debugPrint('StoreProfile backend promotions failed: $e');
      }
    }

    if (backendPromotions.isNotEmpty) return backendPromotions;

    try {
      final snap =
          await FirebaseFirestore.instance
              .collection('store_promotions')
              .where('storeId', isEqualTo: widget.storeId)
              .orderBy('startsAt', descending: true)
              .limit(20)
              .get();

      return snap.docs
          .map((doc) => _StoreProfilePromotion.fromMap(doc.data()))
          .where((promo) => promo.isActive)
          .toList();
    } catch (e) {
      debugPrint('StoreProfile Firestore promotions failed: $e');
      return backendPromotions;
    }
  }

  List<_StoreProfilePromotion> _promotionsFromStoreData(
    Map<String, dynamic> storeData,
  ) {
    final promos = <_StoreProfilePromotion>[];
    final seen = <String>{};
    final productsById = _productsById(storeData);

    for (final promoMap in _promotionMaps(storeData)) {
      final promoId = _stringValue(promoMap, const [
        'id',
        'promotionId',
        'promoId',
        'campaignId',
      ], fallback: promoMap.hashCode.toString());

      final directProducts = _promotionProductMaps(promoMap);
      if (directProducts.isNotEmpty) {
        for (final product in directProducts) {
          final productId = _stringValue(product, const [
            'id',
            'productId',
            'productID',
            'itemId',
            'itemID',
          ], fallback: product.hashCode.toString());
          final key = '$promoId:$productId';
          if (!seen.add(key)) continue;
          promos.add(
            _StoreProfilePromotion.fromPromotionAndProduct(promoMap, product),
          );
        }
        continue;
      }

      var addedProduct = false;
      for (final productId in _appliedProductIds(promoMap)) {
        final product = productsById[productId];
        if (product == null) continue;
        final key = '$promoId:$productId';
        if (!seen.add(key)) continue;
        promos.add(
          _StoreProfilePromotion.fromPromotionAndProduct(promoMap, product),
        );
        addedProduct = true;
      }

      if (!addedProduct && seen.add('$promoId:general')) {
        promos.add(_StoreProfilePromotion.fromMap(promoMap));
      }
    }

    final now = DateTime.now();
    return promos.where((promo) => promo.isActiveAt(now)).toList();
  }

  Future<Map<String, dynamic>?> _cachedStorefrontData(int vendorId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString('store_cache_$vendorId');
      if (raw == null || raw.trim().isEmpty) return null;

      return _extractStoreData(jsonDecode(raw));
    } catch (e) {
      debugPrint('StoreProfile cached store load failed for $vendorId: $e');
      return null;
    }
  }

  Future<Map<String, dynamic>?> _firestoreStorefrontData(int vendorId) async {
    try {
      final snap =
          await FirebaseFirestore.instance
              .collection('stores')
              .doc(vendorId.toString())
              .get();
      final data = snap.data();
      if (data == null) return null;

      final payload = data['payload'];
      if (payload is Map) return _extractStoreData(payload);

      return _extractStoreData(data);
    } catch (e) {
      debugPrint('StoreProfile Firestore store load failed for $vendorId: $e');
      return null;
    }
  }

  Map<String, dynamic> _extractStoreData(dynamic decoded) {
    if (decoded is Map) {
      final map = Map<String, dynamic>.from(decoded);
      final data = map['data'];

      if (map['success'] == true && data is Map) {
        return _normalizeStoreData(data);
      }

      return _normalizeStoreData(map);
    }

    throw const FormatException('Malformed store response');
  }

  Map<String, dynamic> _normalizeStoreData(Map<dynamic, dynamic> rawData) {
    final storeData = Map<String, dynamic>.from(rawData);
    final storeId =
        storeData['vendorId'] ??
        storeData['storeId'] ??
        storeData['vendor_id'] ??
        storeData['store_id'] ??
        storeData['vendorID'] ??
        storeData['storeID'] ??
        storeData['id'];

    final cleanStoreId = storeId?.toString().trim();
    if (cleanStoreId == null || cleanStoreId.isEmpty) {
      throw const FormatException('Store response missing store ID');
    }

    storeData['vendorId'] = cleanStoreId;
    storeData['storeId'] ??= cleanStoreId;
    return storeData;
  }

  bool _hasProducts(Map<String, dynamic> storeData) {
    final totalProducts = storeData['totalProducts'];
    if (totalProducts is num && totalProducts > 0) return true;

    final productsByCategory = storeData['productsByCategory'];
    if (productsByCategory is Map) {
      return productsByCategory.values.any(
        (items) => items is List && items.isNotEmpty,
      );
    }

    final productsByAisle = storeData['productsByAisle'];
    if (productsByAisle is Map) {
      return productsByAisle.values.any(
        (items) => items is List && items.isNotEmpty,
      );
    }

    return false;
  }

  Map<String, dynamic> _asMap(dynamic value) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map) return Map<String, dynamic>.from(value);
    return <String, dynamic>{};
  }

  bool _isPlaceholderStoreName(String value) {
    final clean = value.trim();
    if (clean.isEmpty) return true;
    final lower = clean.toLowerCase();
    return lower == 'store' ||
        lower == widget.storeId.trim().toLowerCase() ||
        RegExp(r'^store\s*#?\s*\d+$').hasMatch(lower);
  }

  String _storeNameFromData(Map<String, dynamic> data) {
    for (final key in const [
      'name',
      'vendorName',
      'storeName',
      'vendorBusinessName',
      'businessName',
    ]) {
      final value = data[key]?.toString().trim() ?? '';
      if (value.isNotEmpty && !_isPlaceholderStoreName(value)) return value;
    }
    return '';
  }

  List<Map<String, dynamic>> _promotionMaps(Map<String, dynamic> storeData) {
    final maps = <Map<String, dynamic>>[];
    for (final key in const [
      'activePromotions',
      'promotions',
      'deals',
      'offers',
      'discounts',
    ]) {
      final value = storeData[key];
      if (value is List) {
        maps.addAll(value.whereType<Map>().map(Map<String, dynamic>.from));
      } else if (value is Map) {
        maps.add(Map<String, dynamic>.from(value));
      }
    }
    return maps;
  }

  Map<String, Map<String, dynamic>> _productsById(
    Map<String, dynamic> storeData,
  ) {
    final products = <String, Map<String, dynamic>>{};

    void addProduct(dynamic rawProduct) {
      if (rawProduct is! Map) return;
      final product = Map<String, dynamic>.from(rawProduct);
      final id = _stringValue(product, const [
        'id',
        'productId',
        'productID',
        'itemId',
        'itemID',
      ], fallback: '');
      if (id.isNotEmpty) products[id] = product;
    }

    void addList(dynamic rawProducts) {
      if (rawProducts is! List) return;
      for (final product in rawProducts) {
        addProduct(product);
      }
    }

    void addGrouped(dynamic grouped) {
      if (grouped is! Map) return;
      for (final value in grouped.values) {
        addList(value);
      }
    }

    addGrouped(storeData['productsByCategory']);
    addGrouped(storeData['productsByAisle']);
    addList(storeData['products']);
    addList(storeData['items']);

    return products;
  }

  List<Map<String, dynamic>> _promotionProductMaps(
    Map<String, dynamic> promotion,
  ) {
    final products = <Map<String, dynamic>>[];
    for (final key in const [
      'products',
      'appliedProductDetails',
      'appliedProductsDetails',
      'productDetails',
      'items',
    ]) {
      final value = promotion[key];
      if (value is List) {
        products.addAll(value.whereType<Map>().map(Map<String, dynamic>.from));
      }
    }

    final appliedProducts = promotion['appliedProducts'];
    if (appliedProducts is List) {
      products.addAll(
        appliedProducts.whereType<Map>().map(Map<String, dynamic>.from),
      );
    }

    return products;
  }

  Set<String> _appliedProductIds(Map<String, dynamic> promotion) {
    final raw =
        promotion['appliedProducts'] ??
        promotion['productIds'] ??
        promotion['productIDs'] ??
        promotion['products'] ??
        promotion['items'];
    final ids = <String>{};
    if (raw is List) {
      for (final item in raw) {
        if (item is Map) {
          final id = _stringValue(Map<String, dynamic>.from(item), const [
            'id',
            'productId',
            'productID',
            'itemId',
            'itemID',
          ], fallback: '');
          if (id.isNotEmpty) ids.add(id);
        } else {
          final id = item.toString().trim();
          if (id.isNotEmpty && id.toLowerCase() != 'null') ids.add(id);
        }
      }
    }
    return ids;
  }

  static String _stringValue(
    Map<String, dynamic> data,
    List<String> keys, {
    required String fallback,
  }) {
    for (final key in keys) {
      final value = data[key];
      if (value == null) continue;
      final text = value.toString().trim();
      if (text.isNotEmpty && text.toLowerCase() != 'null') return text;
    }
    return fallback;
  }

  @override
  Widget build(BuildContext context) {
    final authUid = FirebaseAuth.instance.currentUser?.uid;

    return StreamBuilder<DocumentSnapshot>(
      stream:
          FirebaseFirestore.instance
              .collection('stores')
              .doc(widget.storeId)
              .snapshots(),
      builder: (context, storeSnap) {
        if (storeSnap.hasError) {
          return Scaffold(
            appBar: AppBar(
              title: const Text(
                'Store',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
              centerTitle: true,
              backgroundColor: const Color(0xFF006677),
              foregroundColor: Colors.white,
            ),
            body: Center(child: Text('Store load error: ${storeSnap.error}')),
          );
        }

        if (storeSnap.connectionState == ConnectionState.waiting) {
          return Scaffold(
            appBar: AppBar(
              title: const Text(
                'Store',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
              centerTitle: true,
              backgroundColor: const Color(0xFF006677),
              foregroundColor: Colors.white,
            ),
            body: const Center(child: CircularProgressIndicator()),
          );
        }

        final storeDoc =
            (storeSnap.data?.data() as Map<String, dynamic>?) ?? {};

        final docName = _storeNameFromData(storeDoc);
        final passedName = widget.storeName?.trim() ?? '';
        final resolvedName =
            docName.isNotEmpty
                ? docName
                : (passedName.isNotEmpty &&
                    !_isPlaceholderStoreName(passedName))
                ? passedName
                : 'Store';

        final resolvedLogo =
            (widget.logoUrl?.trim().isNotEmpty == true)
                ? StoreLogoService.resolveUrl(widget.logoUrl)
                : StoreLogoService.resolveFromData(storeDoc);

        final visitsQuery =
            (authUid == null)
                ? null
                : FirebaseFirestore.instance
                    .collection('store_visits')
                    .where('userId', isEqualTo: authUid)
                    .where('storeId', isEqualTo: widget.storeId)
                    .orderBy('visitedAt', descending: true)
                    .limit(50);

        return Scaffold(
          appBar: AppBar(
            title: Text(
              resolvedName,
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
            centerTitle: true,
            backgroundColor: const Color(0xFF006677),
            foregroundColor: Colors.white,
          ),
          body: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                CircleAvatar(
                  radius: 42,
                  backgroundColor: const Color(0xFFE6F4F6),
                  child:
                      (resolvedLogo.isNotEmpty)
                          ? ClipOval(
                            child: Image.network(
                              resolvedLogo,
                              width: 84,
                              height: 84,
                              fit: BoxFit.cover,
                              errorBuilder:
                                  (_, __, ___) => const Icon(
                                    Icons.store,
                                    size: 42,
                                    color: Color(0xFF006677),
                                  ),
                            ),
                          )
                          : Image.asset(
                            StoreLogoService.fallbackAsset,
                            width: 60,
                            height: 60,
                            fit: BoxFit.contain,
                            errorBuilder:
                                (_, __, ___) => const Icon(
                                  Icons.store,
                                  size: 42,
                                  color: Color(0xFF006677),
                                ),
                          ),
                ),
                const SizedBox(height: 14),
                Text(
                  resolvedName,
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 12),

                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed:
                        _openingStorefront
                            ? null
                            : () => _openStorefront(
                              storeName: resolvedName,
                              logoUrl:
                                  resolvedLogo.isNotEmpty ? resolvedLogo : null,
                            ),
                    icon:
                        _openingStorefront
                            ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                            : const Icon(Icons.storefront),
                    label: Text(
                      _openingStorefront ? 'Opening…' : 'Browse this store',
                    ),
                  ),
                ),

                const SizedBox(height: 10),

                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed:
                        _loadingFollow
                            ? null
                            : () => _toggleFollow(
                              resolvedName,
                              resolvedLogo.isNotEmpty ? resolvedLogo : null,
                            ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor:
                          _isFollowing ? Colors.red : const Color(0xFF006677),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    icon: Icon(
                      _isFollowing ? Icons.remove_circle_outline : Icons.add,
                    ),
                    label: Text(
                      _isFollowing ? 'Unfollow store' : 'Follow store',
                    ),
                  ),
                ),

                const SizedBox(height: 18),
                const Divider(),

                Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'Your visits',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Colors.grey.shade800,
                    ),
                  ),
                ),
                const SizedBox(height: 10),

                if (authUid == null)
                  const Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'Sign in to see your visit stats.',
                      style: TextStyle(color: Colors.grey),
                    ),
                  )
                else
                  StreamBuilder<QuerySnapshot>(
                    stream: visitsQuery!.snapshots(),
                    builder: (context, visitSnap) {
                      if (visitSnap.hasError) {
                        return Align(
                          alignment: Alignment.centerLeft,
                          child: Text(
                            'Visits error: ${visitSnap.error}',
                            style: const TextStyle(color: Colors.redAccent),
                          ),
                        );
                      }
                      if (visitSnap.connectionState ==
                          ConnectionState.waiting) {
                        return const Padding(
                          padding: EdgeInsets.symmetric(vertical: 8.0),
                          child: LinearProgressIndicator(),
                        );
                      }

                      final docs = visitSnap.data?.docs ?? [];
                      final count = docs.length;

                      Timestamp? lastVisited;
                      if (docs.isNotEmpty) {
                        final d0 = docs.first.data() as Map<String, dynamic>;
                        lastVisited = d0['visitedAt'] as Timestamp?;
                      }

                      String lastVisitedText = '—';
                      if (lastVisited != null) {
                        final dt = lastVisited.toDate();
                        lastVisitedText =
                            '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}/${dt.year}  '
                            '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
                      }

                      return IntrinsicHeight(
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Expanded(
                              child: _StatCard(
                                title: 'Total',
                                value: '$count',
                                icon: Icons.history,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: _StatCard(
                                title: 'Last visited',
                                value: lastVisitedText,
                                icon: Icons.schedule,
                                small: true,
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),

                const SizedBox(height: 18),
                const Divider(),

                const Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'Promotions',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                ),
                const SizedBox(height: 10),

                FutureBuilder<List<_StoreProfilePromotion>>(
                  future: _promotionsFuture,
                  builder: (context, snap) {
                    if (snap.hasError) {
                      return Padding(
                        padding: const EdgeInsets.symmetric(vertical: 18),
                        child: Text('Promotions error: ${snap.error}'),
                      );
                    }
                    if (!snap.hasData) {
                      return const Padding(
                        padding: EdgeInsets.symmetric(vertical: 18),
                        child: Center(child: CircularProgressIndicator()),
                      );
                    }
                    final promotions = snap.data!;

                    if (promotions.isEmpty) {
                      return const Padding(
                        padding: EdgeInsets.symmetric(vertical: 18),
                        child: Center(
                          child: Text(
                            'No active promotions right now.',
                            style: TextStyle(color: Colors.grey),
                          ),
                        ),
                      );
                    }

                    return Column(
                      children: [
                        for (var i = 0; i < promotions.length; i++) ...[
                          if (i > 0) const SizedBox(height: 8),
                          _StoreProfilePromoCard(
                            title: promotions[i].title,
                            subtitle: promotions[i].subtitle,
                            imageUrl: promotions[i].imageUrl,
                            originalPriceText: promotions[i].originalPriceText,
                            salePriceText: promotions[i].salePriceText,
                            discountText: promotions[i].discountText,
                            onTap: () {
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder:
                                      (_) => _StoreProfilePromotionDetailScreen(
                                        promotion: promotions[i],
                                      ),
                                ),
                              );
                            },
                          ),
                        ],
                      ],
                    );
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _StoreProfilePromoCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final String? imageUrl;
  final String? originalPriceText;
  final String? salePriceText;
  final String? discountText;
  final VoidCallback? onTap;

  const _StoreProfilePromoCard({
    required this.title,
    required this.subtitle,
    required this.imageUrl,
    required this.originalPriceText,
    required this.salePriceText,
    required this.discountText,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final card = Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            const Color(0xFF006677).withValues(alpha: 0.16),
            const Color(0xFFF88400).withValues(alpha: 0.10),
            Colors.white.withValues(alpha: 0.55),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 7,
            offset: const Offset(0, 3),
          ),
        ],
        border: Border.all(color: Colors.white.withValues(alpha: 0.22)),
      ),
      child: Row(
        children: [
          Container(
            width: 58,
            height: 58,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.75),
              borderRadius: BorderRadius.circular(16),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child:
                  imageUrl == null
                      ? const Icon(
                        Icons.local_offer_outlined,
                        color: Color(0xFF006677),
                      )
                      : Image.network(
                        imageUrl!,
                        fit: BoxFit.cover,
                        errorBuilder:
                            (_, __, ___) => const Icon(
                              Icons.local_offer_outlined,
                              color: Color(0xFF006677),
                            ),
                      ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 6),
                if (originalPriceText != null || salePriceText != null) ...[
                  Wrap(
                    spacing: 8,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      if (originalPriceText != null)
                        Text(
                          originalPriceText!,
                          style: const TextStyle(
                            fontSize: 12,
                            color: Colors.black45,
                            fontWeight: FontWeight.w700,
                            decoration: TextDecoration.lineThrough,
                          ),
                        ),
                      if (salePriceText != null)
                        Text(
                          salePriceText!,
                          style: const TextStyle(
                            fontSize: 15,
                            color: Color(0xFF006677),
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      if (discountText != null)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF88400),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            discountText!,
                            style: const TextStyle(
                              fontSize: 10.5,
                              color: Colors.white,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 6),
                ],
                if (subtitle.isNotEmpty)
                  Text(
                    subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12.5,
                      color: Colors.black54,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Icon(
            Icons.chevron_right,
            color: Colors.black.withValues(alpha: 0.3),
            size: 20,
          ),
        ],
      ),
    );

    if (onTap == null) return card;

    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: card,
    );
  }
}

class _StoreProfilePromotionDetailScreen extends StatelessWidget {
  final _StoreProfilePromotion promotion;

  const _StoreProfilePromotionDetailScreen({required this.promotion});

  @override
  Widget build(BuildContext context) {
    final dateText = _dateRangeText(promotion.startsAt, promotion.endsAt);

    return Scaffold(
      backgroundColor: const Color(0xFFE6F4F6),
      appBar: AppBar(
        title: const Text(
          'Promotion Details',
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
        centerTitle: true,
        backgroundColor: const Color(0xFF006677),
        foregroundColor: Colors.white,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: [
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.06),
                  blurRadius: 14,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AspectRatio(
                  aspectRatio: 1.25,
                  child: ClipRRect(
                    borderRadius: const BorderRadius.vertical(
                      top: Radius.circular(16),
                    ),
                    child:
                        promotion.imageUrl == null
                            ? Container(
                              color: const Color(0xFFE6F4F6),
                              child: const Icon(
                                Icons.local_offer_outlined,
                                size: 72,
                                color: Color(0xFF006677),
                              ),
                            )
                            : Image.network(
                              promotion.imageUrl!,
                              fit: BoxFit.contain,
                              errorBuilder:
                                  (_, __, ___) => Container(
                                    color: const Color(0xFFE6F4F6),
                                    child: const Icon(
                                      Icons.local_offer_outlined,
                                      size: 72,
                                      color: Color(0xFF006677),
                                    ),
                                  ),
                            ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (promotion.subtitle.isNotEmpty) ...[
                        Text(
                          promotion.subtitle,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Color(0xFF006677),
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 10),
                      ],
                      Text(
                        promotion.title,
                        style: const TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w900,
                          height: 1.08,
                        ),
                      ),
                      const SizedBox(height: 14),
                      Wrap(
                        spacing: 10,
                        runSpacing: 10,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          if (promotion.originalPriceText != null)
                            Text(
                              promotion.originalPriceText!,
                              style: const TextStyle(
                                fontSize: 16,
                                color: Colors.black45,
                                fontWeight: FontWeight.w800,
                                decoration: TextDecoration.lineThrough,
                              ),
                            ),
                          if (promotion.salePriceText != null)
                            Text(
                              promotion.salePriceText!,
                              style: const TextStyle(
                                fontSize: 24,
                                color: Color(0xFF006677),
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          if (promotion.discountText != null)
                            _detailPill(
                              promotion.discountText!,
                              const Color(0xFFFFF3E0),
                              const Color(0xFFB45F06),
                            ),
                        ],
                      ),
                      if (dateText.isNotEmpty) ...[
                        const SizedBox(height: 14),
                        _detailPill(
                          dateText,
                          const Color(0xFFE6F4F6),
                          const Color(0xFF006677),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static Widget _detailPill(String text, Color background, Color foreground) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: foreground,
          fontSize: 13,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }

  static String _dateRangeText(DateTime? startsAt, DateTime? endsAt) {
    if (startsAt == null && endsAt == null) return '';
    if (startsAt != null && endsAt != null) {
      return '${_shortDate(startsAt)} - ${_shortDate(endsAt)}';
    }
    if (startsAt != null) return 'Starts ${_shortDate(startsAt)}';
    return 'Ends ${_shortDate(endsAt!)}';
  }

  static String _shortDate(DateTime date) {
    final local = date.toLocal();
    final month = local.month.toString().padLeft(2, '0');
    final day = local.day.toString().padLeft(2, '0');
    return '$day.$month.${local.year}';
  }
}

class _StoreProfilePromotion {
  final String title;
  final String subtitle;
  final String? imageUrl;
  final String? originalPriceText;
  final String? salePriceText;
  final String? discountText;
  final String status;
  final bool? activeFlag;
  final DateTime? startsAt;
  final DateTime? endsAt;

  const _StoreProfilePromotion({
    required this.title,
    required this.subtitle,
    required this.imageUrl,
    required this.originalPriceText,
    required this.salePriceText,
    required this.discountText,
    required this.status,
    required this.activeFlag,
    required this.startsAt,
    required this.endsAt,
  });

  factory _StoreProfilePromotion.fromMap(Map<String, dynamic> data) {
    final title = _stringValue(data, const [
      'title',
      'name',
      'headline',
      'promoTitle',
    ], fallback: 'Promotion');
    final subtitle = _stringValue(data, const [
      'description',
      'summary',
      'subtitle',
    ], fallback: '');
    final discount = _stringValue(data, const [
      'discountPercent',
      'discount',
      'discountPercentage',
      'percentOff',
    ], fallback: '');
    final imageUrl = _stringValue(data, const [
      'imageUrl',
      'imageURL',
      'image',
      'image_url',
      'productImageUrl',
      'productImageURL',
      'product_image_url',
      'thumbnailUrl',
      'thumbnail',
      'url',
      'src',
    ], fallback: '');
    final originalPrice = _firstValue(data, const [
      'originalPrice',
      'oldPrice',
      'regularPrice',
      'priceBefore',
      'wasPrice',
      'beforePrice',
      'compareAtPrice',
      'listPrice',
    ]);
    final salePrice =
        _firstValue(data, const [
          'salePrice',
          'newPrice',
          'discountedPrice',
          'priceAfter',
          'nowPrice',
          'afterPrice',
          'currentPrice',
          'promoPrice',
          'offerPrice',
        ]) ??
        _discountedPriceValue(originalPrice, discount);

    return _StoreProfilePromotion(
      title: title,
      subtitle: subtitle,
      imageUrl: imageUrl.isEmpty ? null : _absoluteImageUrl(imageUrl),
      originalPriceText: _priceText(originalPrice),
      salePriceText: _priceText(salePrice),
      discountText: discount.isEmpty ? null : '${_cleanPercent(discount)}% off',
      status:
          _stringValue(data, const [
            'status',
            'state',
          ], fallback: '').toLowerCase(),
      activeFlag: _boolValue(data, const [
        'active',
        'isActive',
        'enabled',
        'published',
        'isPublished',
      ]),
      startsAt: _dateValue(data, const [
        'startsAt',
        'startAt',
        'startDate',
        'validFrom',
      ]),
      endsAt: _dateValue(data, const [
        'endsAt',
        'endAt',
        'endDate',
        'validUntil',
        'expiresAt',
      ]),
    );
  }

  factory _StoreProfilePromotion.fromPromotionAndProduct(
    Map<String, dynamic> promotion,
    Map<String, dynamic> product,
  ) {
    final productName = _stringValue(product, const [
      'name',
      'title',
      'productName',
      'itemName',
    ], fallback: 'Promoted product');
    final promoName = _stringValue(promotion, const [
      'title',
      'name',
      'headline',
      'promoTitle',
    ], fallback: '');

    return _StoreProfilePromotion.fromMap({
      ...promotion,
      'title': productName,
      if (promoName.isNotEmpty) 'description': promoName,
      ..._productPromoFields(product),
    });
  }

  bool get isActive => isActiveAt(DateTime.now());

  bool isActiveAt(DateTime now) {
    if (activeFlag == false) return false;
    if (status.isNotEmpty &&
        !const {
          'active',
          'published',
          'live',
          'enabled',
          'approved',
        }.contains(status)) {
      return false;
    }
    if (startsAt != null && startsAt!.isAfter(now)) return false;
    if (endsAt != null && !endsAt!.isAfter(now)) return false;
    return true;
  }

  static String _stringValue(
    Map<String, dynamic> data,
    List<String> keys, {
    required String fallback,
  }) {
    for (final key in keys) {
      final value = data[key];
      if (value == null) continue;
      final text = value.toString().trim();
      if (text.isNotEmpty && text.toLowerCase() != 'null') return text;
    }
    return fallback;
  }

  static Map<String, dynamic> _productPromoFields(
    Map<String, dynamic> product,
  ) {
    final imageUrl = _stringValue(product, const [
      'productImageUrl',
      'productImageURL',
      'product_image_url',
      'imageUrl',
      'imageURL',
      'image_url',
      'image',
      'thumbnailUrl',
      'thumbnail',
      'url',
      'src',
    ], fallback: '');
    final basePrice = _firstValue(product, const [
      'originalPrice',
      'oldPrice',
      'regularPrice',
      'priceBefore',
      'wasPrice',
      'beforePrice',
      'compareAtPrice',
      'listPrice',
      'price',
      'unitPrice',
    ]);

    return {
      if (imageUrl.isNotEmpty) 'imageUrl': imageUrl,
      if (basePrice != null) 'originalPrice': basePrice,
      for (final key in const [
        'salePrice',
        'newPrice',
        'discountedPrice',
        'priceAfter',
        'nowPrice',
        'afterPrice',
        'currentPrice',
        'promoPrice',
        'offerPrice',
      ])
        if (product[key] != null) key: product[key],
    };
  }

  static dynamic _firstValue(Map<String, dynamic> data, List<String> keys) {
    for (final key in keys) {
      final value = data[key];
      if (value == null) continue;
      final text = value.toString().trim();
      if (text.isNotEmpty && text.toLowerCase() != 'null') return value;
    }
    return null;
  }

  static String? _priceText(dynamic value) {
    final parsed = _numberValue(value);
    if (parsed != null) return '€${parsed.toStringAsFixed(2)}';
    final raw = value?.toString().trim() ?? '';
    return raw.isEmpty || raw.toLowerCase() == 'null' ? null : raw;
  }

  static double? _discountedPriceValue(dynamic originalPrice, String discount) {
    final original = _numberValue(originalPrice);
    final percent = _numberValue(discount);
    if (original == null || percent == null || percent <= 0) return null;
    final discounted = original * (1 - (percent / 100));
    return discounted < 0 ? 0 : discounted;
  }

  static double? _numberValue(dynamic value) {
    if (value == null) return null;
    if (value is num) return value.toDouble();

    var raw = value.toString().trim();
    if (raw.isEmpty || raw.toLowerCase() == 'null') return null;
    raw = raw.replaceAll(RegExp(r'[^0-9,.\-]'), '');
    if (raw.isEmpty) return null;

    final comma = raw.lastIndexOf(',');
    final dot = raw.lastIndexOf('.');
    if (comma > dot) {
      raw = raw.replaceAll('.', '').replaceAll(',', '.');
    } else {
      raw = raw.replaceAll(',', '');
    }

    return double.tryParse(raw);
  }

  static String _absoluteImageUrl(String rawUrl) {
    final value = rawUrl.trim();
    if (value.isEmpty) return '';

    final uri = Uri.tryParse(value);
    if (uri != null && uri.hasScheme) return value;
    if (value.startsWith('//')) return 'https:$value';
    if (value.startsWith('/')) return '${StoreApiService.baseUrl}$value';
    return '${StoreApiService.baseUrl}/$value';
  }

  static String _cleanPercent(String value) {
    final parsed = _numberValue(value);
    if (parsed == null) return value;
    if (parsed == parsed.roundToDouble()) return parsed.toStringAsFixed(0);
    return parsed.toStringAsFixed(2);
  }

  static bool? _boolValue(Map<String, dynamic> data, List<String> keys) {
    for (final key in keys) {
      final value = data[key];
      if (value is bool) return value;
      if (value is num) return value != 0;
      if (value is String) {
        final lower = value.trim().toLowerCase();
        if (lower == 'true' || lower == 'yes' || lower == '1') return true;
        if (lower == 'false' || lower == 'no' || lower == '0') return false;
      }
    }
    return null;
  }

  static DateTime? _dateValue(Map<String, dynamic> data, List<String> keys) {
    for (final key in keys) {
      final value = data[key];
      if (value is Timestamp) return value.toDate();
      if (value is DateTime) return value;
      if (value is int) return DateTime.fromMillisecondsSinceEpoch(value);
      if (value is String) {
        final parsed = DateTime.tryParse(value);
        if (parsed != null) return parsed;
      }
    }
    return null;
  }
}

class _StatCard extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;
  final bool small;

  const _StatCard({
    required this.title,
    required this.value,
    required this.icon,
    this.small = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFE6F4F6),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: const Color(0xFF006677), size: 20),
          const SizedBox(height: 4),
          Text(
            title,
            style: const TextStyle(fontSize: 12, color: Color(0xFF006677)),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
              fontSize: small ? 13 : 18,
              fontWeight: FontWeight.bold,
              color: Colors.black87,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}
