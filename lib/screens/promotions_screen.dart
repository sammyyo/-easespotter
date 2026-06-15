import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import 'package:easespotter/screens/store_profile_screen.dart';
import 'package:easespotter/services/store_api_service.dart';

class PromotionsScreen extends StatelessWidget {
  const PromotionsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser?.uid;

    if (uid == null) {
      return const Scaffold(
        body: Center(child: Text('Please sign in to see promotions.')),
      );
    }

    //  REVERTED: Use users/{uid}/followedStores as source of truth
    final followedStoresStream =
        FirebaseFirestore.instance
            .collection('users')
            .doc(uid)
            .collection('followedStores')
            .orderBy('followedAt', descending: true)
            .snapshots();

    return Scaffold(
      backgroundColor: const Color(0xFFF3F1FF),
      appBar: AppBar(
        title: const Text(
          'Promotions',
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
        centerTitle: true,
        backgroundColor: Colors.deepPurple,
        foregroundColor: Colors.white,
      ),
      body: StreamBuilder<QuerySnapshot>(
        stream: followedStoresStream,
        builder: (context, followedSnap) {
          if (followedSnap.hasError) {
            return _EmptyState(
              title: 'Couldn’t load followed stores',
              subtitle: '${followedSnap.error}',
              icon: Icons.error_outline,
            );
          }

          if (!followedSnap.hasData) {
            return const Center(child: CircularProgressIndicator());
          }

          final followedDocs = followedSnap.data!.docs;

          //  Updated extraction block
          final followedStoreIds =
              followedDocs
                  .map((d) {
                    final data = d.data() as Map<String, dynamic>;
                    // storeId is usually stored in the doc, but fallback to doc id
                    return (data['storeId'] ?? d.id).toString();
                  })
                  .where((id) => id.trim().isNotEmpty)
                  .toList();

          //  NEW: Normalization
          final normalizedIds =
              followedStoreIds
                  .map((id) => id.trim())
                  .where((id) => id.isNotEmpty)
                  .toList();
          debugPrint('Promotions: followed store IDs: $normalizedIds');

          if (normalizedIds.isEmpty) {
            return const _EmptyState(
              title: 'No promotions yet',
              subtitle: 'Follow stores to see promotions here.',
              icon: Icons.local_offer_outlined,
            );
          }

          return FutureBuilder<_PromotionFetchResult>(
            future: _fetchApiPromotions(normalizedIds),
            builder: (context, promoSnap) {
              if (promoSnap.hasError) {
                return _EmptyState(
                  title: 'Couldn’t load promotions',
                  subtitle: '${promoSnap.error}',
                  icon: Icons.error_outline,
                );
              }

              if (!promoSnap.hasData) {
                return const Center(child: CircularProgressIndicator());
              }

              final result = promoSnap.data!;
              final allPromos = result.promotions;
              debugPrint(
                'Promotions: backend matched promos: ${allPromos.length}',
              );
              final now = DateTime.now();

              //  Show active API promotions for followed stores.
              final active =
                  allPromos.where((promo) {
                    return promo.isActiveAt(now);
                  }).toList();

              // Sort: earliest ending first, fallback to newest
              active.sort((a, b) {
                final aEnd = a.endsAt;
                final bEnd = b.endsAt;

                if (aEnd != null && bEnd != null) {
                  return aEnd.compareTo(bEnd);
                }
                if (aEnd != null) return -1;
                if (bEnd != null) return 1;

                if (a.startsAt != null && b.startsAt != null) {
                  return b.startsAt!.compareTo(a.startsAt!); // newest first
                }
                return 0;
              });

              if (active.isEmpty) {
                return const _EmptyState(
                  title: 'No active promotions',
                  icon: Icons.local_offer_outlined,
                );
              }

              return ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
                itemCount: active.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (context, i) {
                  final promo = active[i];
                  final endsText =
                      promo.endsAt == null ? null : _formatEnds(promo.endsAt!);

                  return _PromoCard(
                    title: promo.title,
                    storeName: promo.storeName,
                    endsText: endsText,
                    imageUrl: promo.imageUrl,
                    onTap:
                        promo.storeId.trim().isEmpty
                            ? null
                            : () {
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder:
                                      (_) => StoreProfileScreen(
                                        storeId: promo.storeId,
                                        storeName: promo.storeName,
                                      ),
                                ),
                              );
                            },
                  );
                },
              );
            },
          );
        },
      ),
    );
  }

  static List<String> _uniqueStoreIds(List<String> storeIds) {
    final ids = <String>[];
    final seen = <String>{};
    for (final rawId in storeIds) {
      final id = rawId.trim();
      if (id.isEmpty) continue;
      if (seen.add(id)) ids.add(id);
    }
    return ids;
  }

  static Future<_PromotionFetchResult> _fetchApiPromotions(
    List<String> storeIds,
  ) async {
    final promos = <_Promotion>[];
    final backendKeys = <String>{};
    final uniqueStoreIds = _uniqueStoreIds(storeIds);

    for (final storeId in uniqueStoreIds) {
      final numericStoreId = int.tryParse(storeId);
      if (numericStoreId == null) {
        debugPrint(
          'Promotions: skipped non-numeric backend store ID: $storeId',
        );
        continue;
      }

      try {
        final data = await StoreApiService.fetchStoreById(numericStoreId);
        backendKeys.addAll(data.keys.map((key) => key.toString()));
        debugPrint(
          'Promotions: backend store $storeId keys: ${data.keys.toList()}',
        );
        promos.addAll(_Promotion.fromApiStoreData(storeId, data));
      } catch (e) {
        debugPrint('Promotions: API promo fallback failed for $storeId: $e');
      }
    }
    debugPrint('Promotions: backend API promos: ${promos.length}');
    return _PromotionFetchResult(
      promotions: promos,
      checkedStoreCount: uniqueStoreIds.length,
      backendKeys: backendKeys.toList()..sort(),
    );
  }

  static String _formatEnds(DateTime dt) {
    final now = DateTime.now();
    final diff = dt.difference(now);

    if (diff.inHours < 24) {
      final h = diff.inHours.clamp(0, 999);
      return 'Ends in ${h}h';
    }
    final d = diff.inDays.clamp(0, 999);
    return 'Ends in ${d}d';
  }
}

class _PromoCard extends StatelessWidget {
  final String title;
  final String storeName;
  final String? endsText;
  final String? imageUrl;
  final VoidCallback? onTap;

  const _PromoCard({
    required this.title,
    required this.storeName,
    required this.endsText,
    required this.imageUrl,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final card = Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            Colors.deepPurple.withOpacity(0.16),
            Colors.pinkAccent.withOpacity(0.10),
            Colors.white.withOpacity(0.55),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.06),
            blurRadius: 7,
            offset: const Offset(0, 3),
          ),
        ],
        border: Border.all(color: Colors.white.withOpacity(0.22)),
      ),
      child: Row(
        children: [
          // image / icon
          Container(
            width: 58,
            height: 58,
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.75),
              borderRadius: BorderRadius.circular(16),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child:
                  (imageUrl != null)
                      ? Image.network(
                        imageUrl!,
                        fit: BoxFit.cover,
                        errorBuilder:
                            (_, __, ___) => const Icon(
                              Icons.local_offer_outlined,
                              color: Colors.deepPurple,
                            ),
                      )
                      : const Icon(
                        Icons.local_offer_outlined,
                        color: Colors.deepPurple,
                      ),
            ),
          ),
          const SizedBox(width: 12),

          // text
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
                    letterSpacing: -0.2,
                  ),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        storeName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12.5,
                          color: Colors.black54,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    if (endsText != null) ...[
                      const SizedBox(width: 10),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.55),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          endsText!,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: Colors.deepPurple,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Icon(
            Icons.chevron_right,
            color: Colors.black.withOpacity(0.3),
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

class _EmptyState extends StatelessWidget {
  final String title;
  final String? subtitle;
  final IconData icon;

  const _EmptyState({required this.title, this.subtitle, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 48, color: Colors.grey.shade400),
            const SizedBox(height: 16),
            Text(
              title,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: Colors.grey.shade800,
              ),
            ),
            if (subtitle != null && subtitle!.trim().isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                subtitle!,
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.grey.shade600, height: 1.4),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _PromotionFetchResult {
  final List<_Promotion> promotions;
  final int checkedStoreCount;
  final List<String> backendKeys;

  const _PromotionFetchResult({
    required this.promotions,
    required this.checkedStoreCount,
    required this.backendKeys,
  });

  String get backendKeysPreview {
    if (backendKeys.isEmpty) return 'none';
    final preview = backendKeys.take(10).join(', ');
    return backendKeys.length > 10 ? '$preview...' : preview;
  }
}

class _Promotion {
  final String storeId;
  final String storeName;
  final String title;
  final String? imageUrl;
  final DateTime? startsAt;
  final DateTime? endsAt;
  final String status;
  final String dedupeKey;

  const _Promotion({
    required this.storeId,
    required this.storeName,
    required this.title,
    required this.imageUrl,
    required this.startsAt,
    required this.endsAt,
    required this.status,
    required this.dedupeKey,
  });

  factory _Promotion.fromMap(
    Map<String, dynamic> data, {
    required String fallbackStoreId,
    required String fallbackDedupeKey,
  }) {
    final storeId = _stringValue(data, const [
      'storeId',
      'vendorId',
      'vendorid',
      'store_id',
      'vendor_id',
      'storeID',
      'vendorID',
    ], fallback: fallbackStoreId);

    final title = _stringValue(data, const [
      'title',
      'name',
      'headline',
      'description',
      'promoTitle',
    ], fallback: 'Promotion');

    final storeName = _stringValue(data, const [
      'storeName',
      'vendorName',
      'store_name',
      'vendor_name',
    ], fallback: 'Store');

    final imageUrl = _stringValue(data, const [
      'imageUrl',
      'imageURL',
      'image',
      'photoUrl',
      'photoURL',
      'logoUrl',
    ], fallback: '');
    final status =
        _stringValue(data, const [
          'status',
          'state',
        ], fallback: '').toLowerCase();

    return _Promotion(
      storeId: storeId,
      storeName: storeName,
      title: title,
      imageUrl: imageUrl.isEmpty ? null : _absoluteImageUrl(imageUrl),
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
      status: status,
      dedupeKey: fallbackDedupeKey,
    );
  }

  bool isActiveAt(DateTime now) {
    if (status.isNotEmpty && status != 'active') return false;
    if (startsAt != null && startsAt!.isAfter(now)) return false;
    if (endsAt != null && !endsAt!.isAfter(now)) return false;
    return true;
  }

  static List<_Promotion> fromApiStoreData(
    String storeId,
    Map<String, dynamic> storeData,
  ) {
    final storeName = _stringValue(storeData, const [
      'storeName',
      'vendorName',
      'vendorBusinessName',
      'name',
    ], fallback: 'Store');
    final storeLogoUrl = _stringValue(storeData, const [
      'logoUrl',
      'vendorLogoUrl',
      'storeLogoUrl',
      'logo',
    ], fallback: '');

    final promos = <_Promotion>[];
    final seen = <String>{};
    final productsById = _productsById(storeData);
    final promotionMaps = _explicitPromotionMaps(storeData);

    for (final promoData in promotionMaps) {
      final promoId = _stringValue(promoData, const [
        'id',
        'promotionId',
        'promoId',
        'campaignId',
      ], fallback: promoData.hashCode.toString());
      final appliedIds = _appliedProductIds(promoData);

      for (final productId in appliedIds) {
        final product = productsById[productId];
        if (product == null) continue;

        final dedupeKey = 'api:$storeId:$promoId:product:$productId';
        if (!seen.add(dedupeKey)) continue;

        promos.add(
          _Promotion.fromPromotedProduct(
            product: product,
            promotion: promoData,
            storeId: storeId,
            storeName: storeName,
            storeLogoUrl: storeLogoUrl,
            dedupeKey: dedupeKey,
          ),
        );
      }
    }

    _addProductsWithEmbeddedPromotions(
      storeData: storeData,
      storeId: storeId,
      storeName: storeName,
      storeLogoUrl: storeLogoUrl,
      promos: promos,
      seen: seen,
    );

    return promos;
  }

  factory _Promotion.fromPromotedProduct({
    required Map<String, dynamic> product,
    required Map<String, dynamic> promotion,
    required String storeId,
    required String storeName,
    required String storeLogoUrl,
    required String dedupeKey,
  }) {
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
    final discount = _stringValue(promotion, const [
      'discountPercent',
      'discount',
      'discountPercentage',
      'percentOff',
    ], fallback: '');
    final productImage = _stringValue(product, const [
      'imageUrl',
      'imageURL',
      'image_url',
      'image',
      'photoUrl',
      'photoURL',
      'productImageUrl',
      'productImageURL',
      'thumbnail',
      'thumbnailUrl',
    ], fallback: '');
    final imageUrl = productImage.isNotEmpty ? productImage : storeLogoUrl;
    final subtitleParts = <String>[storeName];
    if (promoName.isNotEmpty) subtitleParts.add(promoName);
    if (discount.isNotEmpty) subtitleParts.add('$discount% off');

    final data = <String, dynamic>{
      ...promotion,
      'storeId': storeId,
      'storeName': subtitleParts.join(' · '),
      'title': productName,
      if (imageUrl.isNotEmpty) 'imageUrl': imageUrl,
    };

    return _Promotion.fromMap(
      data,
      fallbackStoreId: storeId,
      fallbackDedupeKey: dedupeKey,
    );
  }

  static Map<String, Map<String, dynamic>> _productsById(
    Map<String, dynamic> storeData,
  ) {
    final products = <String, Map<String, dynamic>>{};
    final productsByCategory = storeData['productsByCategory'];
    if (productsByCategory is! Map) return products;

    for (final entry in productsByCategory.entries) {
      final rawProducts = entry.value;
      if (rawProducts is! List) continue;

      for (final rawProduct in rawProducts) {
        if (rawProduct is! Map) continue;
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
    }

    return products;
  }

  static List<Map<String, dynamic>> _explicitPromotionMaps(
    Map<String, dynamic> storeData,
  ) {
    final maps = <Map<String, dynamic>>[];
    for (final key in const [
      'activePromotions',
      'promotions',
      'deals',
      'offers',
      'discounts',
    ]) {
      final node = storeData[key];
      if (node is List) {
        maps.addAll(node.whereType<Map>().map(Map<String, dynamic>.from));
      } else if (node is Map) {
        maps.add(Map<String, dynamic>.from(node));
      }
    }
    return maps;
  }

  static Set<String> _appliedProductIds(Map<String, dynamic> promotion) {
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

  static void _addProductsWithEmbeddedPromotions({
    required Map<String, dynamic> storeData,
    required String storeId,
    required String storeName,
    required String storeLogoUrl,
    required List<_Promotion> promos,
    required Set<String> seen,
  }) {
    final productsByCategory = storeData['productsByCategory'];
    if (productsByCategory is! Map) return;

    for (final entry in productsByCategory.entries) {
      final rawProducts = entry.value;
      if (rawProducts is! List) continue;

      for (final rawProduct in rawProducts) {
        if (rawProduct is! Map) continue;
        final product = Map<String, dynamic>.from(rawProduct);
        final embedded = product['promotions'];
        if (embedded is! List || embedded.isEmpty) continue;

        for (final rawPromotion in embedded) {
          final promotion =
              rawPromotion is Map
                  ? Map<String, dynamic>.from(rawPromotion)
                  : <String, dynamic>{'name': rawPromotion.toString()};
          final productId = _stringValue(product, const [
            'id',
            'productId',
            'productID',
            'itemId',
            'itemID',
          ], fallback: product.hashCode.toString());
          final promoId = _stringValue(promotion, const [
            'id',
            'promotionId',
            'promoId',
            'campaignId',
          ], fallback: promotion.hashCode.toString());
          final dedupeKey = 'api:$storeId:embedded:$promoId:product:$productId';
          if (!seen.add(dedupeKey)) continue;

          promos.add(
            _Promotion.fromPromotedProduct(
              product: product,
              promotion: promotion,
              storeId: storeId,
              storeName: storeName,
              storeLogoUrl: storeLogoUrl,
              dedupeKey: dedupeKey,
            ),
          );
        }
      }
    }
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

  static String _absoluteImageUrl(String rawUrl) {
    final value = rawUrl.trim();
    if (value.isEmpty) return '';

    final uri = Uri.tryParse(value);
    if (uri != null && uri.hasScheme) return value;
    if (value.startsWith('//')) return 'https:$value';
    if (value.startsWith('/')) return '${StoreApiService.baseUrl}$value';
    return '${StoreApiService.baseUrl}/$value';
  }

  static DateTime? _dateValue(Map<String, dynamic> data, List<String> keys) {
    for (final key in keys) {
      final value = data[key];
      if (value is Timestamp) return value.toDate();
      if (value is DateTime) return value;
      if (value is int) {
        return DateTime.fromMillisecondsSinceEpoch(value);
      }
      if (value is String) {
        final parsed = DateTime.tryParse(value);
        if (parsed != null) return parsed;
      }
    }
    return null;
  }
}
