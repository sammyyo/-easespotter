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
      backgroundColor: const Color(0xFFE6F4F6),
      appBar: AppBar(
        title: const Text(
          'Promotions',
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
        centerTitle: true,
        backgroundColor: const Color(0xFF006677),
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

          final followedStoreIds = <String>[];
          for (final doc in followedDocs) {
            final data = doc.data() as Map<String, dynamic>;
            if (_isDeletedOrInactive(data)) {
              debugPrint('Promotions: skipped inactive followed doc ${doc.id}');
              continue;
            }

            final storeId = (data['storeId'] ?? doc.id).toString().trim();
            if (storeId.isEmpty) continue;
            followedStoreIds.add(storeId);

            debugPrint(
              'Promotions: followed doc ${doc.id} storeId=$storeId name=${data['storeName'] ?? data['vendorName'] ?? data['name'] ?? ''}',
            );
          }

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
            future: _fetchPromotions(normalizedIds),
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
                    originalPriceText: promo.originalPriceText,
                    salePriceText: promo.salePriceText,
                    discountText: promo.discountText,
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder:
                              (_) => _PromotionDetailScreen(promotion: promo),
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

  static Future<_PromotionFetchResult> _fetchPromotions(
    List<String> storeIds,
  ) async {
    final firestoreResult = await _fetchFirestorePromotions(storeIds);
    final apiResult = await _fetchApiPromotions(storeIds);

    final byLogicalKey = <String, _Promotion>{};

    for (final promo in [
      ...firestoreResult.promotions,
      ...apiResult.promotions,
    ]) {
      final existing = byLogicalKey[promo.logicalKey];
      if (existing == null || promo.isMoreSpecificThan(existing)) {
        byLogicalKey[promo.logicalKey] = promo;
      }
    }

    return _PromotionFetchResult(
      promotions: byLogicalKey.values.toList(),
      checkedStoreCount: firestoreResult.checkedStoreCount,
      backendKeys: apiResult.backendKeys,
    );
  }

  static Future<_PromotionFetchResult> _fetchFirestorePromotions(
    List<String> storeIds,
  ) async {
    final promos = <_Promotion>[];
    final uniqueStoreIds = _uniqueStoreIds(storeIds);
    final lookupIds = _storeIdLookupValues(uniqueStoreIds);
    final seenDocs = <String>{};

    for (final field in const ['storeId', 'vendorId', 'vendor_id']) {
      for (final chunk in _chunks(lookupIds, 10)) {
        try {
          final snap =
              await FirebaseFirestore.instance
                  .collection('store_promotions')
                  .where(field, whereIn: chunk)
                  .get();

          for (final doc in snap.docs) {
            if (!seenDocs.add(doc.id)) continue;
            final data = doc.data();
            if (_isDeletedOrInactive(data)) {
              debugPrint('Promotions: skipped inactive promo doc ${doc.id}');
              continue;
            }
            promos.add(
              _Promotion.fromMap(
                data,
                fallbackStoreId: (data[field] ?? '').toString(),
                fallbackDedupeKey: 'firestore:${doc.id}',
              ),
            );
          }
        } catch (e) {
          debugPrint(
            'Promotions: Firestore promo fetch failed for $field $chunk: $e',
          );
        }
      }
    }

    debugPrint('Promotions: Firestore promos: ${promos.length}');
    return _PromotionFetchResult(
      promotions: promos,
      checkedStoreCount: uniqueStoreIds.length,
      backendKeys: const [],
    );
  }

  static List<Object> _storeIdLookupValues(List<String> storeIds) {
    final values = <Object>[];
    final seen = <String>{};

    for (final id in storeIds) {
      final trimmed = id.trim();
      if (trimmed.isEmpty) continue;

      if (seen.add('s:$trimmed')) values.add(trimmed);

      final numeric = int.tryParse(trimmed);
      if (numeric != null && seen.add('i:$numeric')) values.add(numeric);
    }

    return values;
  }

  static bool _isDeletedOrInactive(Map<String, dynamic> data) {
    if (_truthy(data['deleted']) ||
        _truthy(data['isDeleted']) ||
        _truthy(data['archived']) ||
        data['deletedAt'] != null) {
      return true;
    }

    final status =
        (data['status'] ?? data['state'] ?? data['vendorStatus'] ?? '')
            .toString()
            .trim()
            .toLowerCase();
    if (status.isEmpty) return false;

    return const {
      'deleted',
      'inactive',
      'disabled',
      'archived',
      'removed',
      'suspended',
    }.contains(status);
  }

  static bool _truthy(dynamic value) {
    if (value is bool) return value;
    if (value is num) return value != 0;
    if (value is String) {
      final lower = value.trim().toLowerCase();
      return lower == 'true' || lower == 'yes' || lower == '1';
    }
    return false;
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
        if (_isDeletedOrInactive(data)) {
          debugPrint(
            'Promotions: skipped deleted/inactive backend store $storeId',
          );
          continue;
        }
        try {
          final rawDirectoryData = await StoreApiService.fetchStoreDirectory(
            numericStoreId,
          );
          final directoryData = _extractApiData(rawDirectoryData);
          if (_isDeletedOrInactive(directoryData)) {
            debugPrint(
              'Promotions: skipped deleted/inactive directory store $storeId',
            );
            continue;
          }
          backendKeys.addAll(directoryData.keys.map((key) => key.toString()));
          _mergeProductCollections(data, directoryData);
          debugPrint(
            'Promotions: directory store $storeId keys: ${directoryData.keys.toList()}',
          );
        } catch (e) {
          debugPrint('Promotions: directory product enrich failed: $e');
        }
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

  static Iterable<List<T>> _chunks<T>(List<T> values, int size) sync* {
    for (var i = 0; i < values.length; i += size) {
      final end = (i + size) > values.length ? values.length : i + size;
      yield values.sublist(i, end);
    }
  }

  static void _mergeProductCollections(
    Map<String, dynamic> target,
    Map<String, dynamic> source,
  ) {
    for (final key in const [
      'productsByCategory',
      'productsByAisle',
      'products',
      'items',
    ]) {
      final sourceValue = source[key];
      if (!_hasCollectionItems(sourceValue)) continue;

      final targetValue = target[key];
      if (!_hasCollectionItems(targetValue)) {
        target[key] = sourceValue;
      }
    }
  }

  static bool _hasCollectionItems(dynamic value) {
    if (value is List) return value.isNotEmpty;
    if (value is Map) {
      return value.values.any((entry) {
        if (entry is List) return entry.isNotEmpty;
        if (entry is Map) return entry.isNotEmpty;
        return entry != null;
      });
    }
    return false;
  }

  static Map<String, dynamic> _extractApiData(Map<String, dynamic> raw) {
    final data = raw['data'];
    if (raw['success'] == true && data is Map<String, dynamic>) return data;
    return raw;
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
  final String? originalPriceText;
  final String? salePriceText;
  final String? discountText;
  final VoidCallback? onTap;

  const _PromoCard({
    required this.title,
    required this.storeName,
    required this.endsText,
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
            Colors.pinkAccent.withValues(alpha: 0.10),
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
          // image / icon
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
                  (imageUrl != null)
                      ? Image.network(
                        imageUrl!,
                        fit: BoxFit.cover,
                        errorBuilder:
                            (_, __, ___) => const Icon(
                              Icons.local_offer_outlined,
                              color: Color(0xFF006677),
                            ),
                      )
                      : const Icon(
                        Icons.local_offer_outlined,
                        color: Color(0xFF006677),
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
                          color: Colors.white.withValues(alpha: 0.55),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          endsText!,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: Color(0xFF006677),
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

class _PromotionDetailScreen extends StatelessWidget {
  final _Promotion promotion;

  const _PromotionDetailScreen({required this.promotion});

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
                      Text(
                        promotion.storeName,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Color(0xFF006677),
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 10),
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
          if (promotion.storeId.trim().isNotEmpty) ...[
            const SizedBox(height: 16),
            SizedBox(
              height: 52,
              child: ElevatedButton.icon(
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder:
                          (_) => StoreProfileScreen(
                            storeId: promotion.storeId,
                            storeName: promotion.cleanStoreName,
                          ),
                    ),
                  );
                },
                icon: const Icon(Icons.storefront_outlined),
                label: const Text('View Store'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF006677),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                  textStyle: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
          ],
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
  final String cleanStoreName;
  final String title;
  final String? imageUrl;
  final DateTime? startsAt;
  final DateTime? endsAt;
  final String status;
  final bool? activeFlag;
  final String? originalPriceText;
  final String? salePriceText;
  final String? discountText;
  final String dedupeKey;

  const _Promotion({
    required this.storeId,
    required this.storeName,
    required this.cleanStoreName,
    required this.title,
    required this.imageUrl,
    required this.startsAt,
    required this.endsAt,
    required this.status,
    required this.activeFlag,
    required this.originalPriceText,
    required this.salePriceText,
    required this.discountText,
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
    final cleanStoreName = _stringValue(data, const [
      'cleanStoreName',
      'baseStoreName',
      'businessName',
      'vendorBusinessName',
      'vendorName',
      'store_name',
      'vendor_name',
      'storeName',
    ], fallback: storeName);

    final imageUrl = _stringValue(data, const [
      'imageUrl',
      'imageURL',
      'image',
      'image_url',
      'photoUrl',
      'photoURL',
      'productImageUrl',
      'productImageURL',
      'product_image_url',
      'thumbnail',
      'thumbnailUrl',
      'thumbnail_url',
      'url',
      'src',
      'logoUrl',
    ], fallback: '');
    final status =
        _stringValue(data, const [
          'status',
          'state',
        ], fallback: '').toLowerCase();
    final discount = _stringValue(data, const [
      'discountPercent',
      'discount',
      'discountPercentage',
      'percentOff',
    ], fallback: '');
    final originalPriceValue = _firstValue(data, const [
      'originalPrice',
      'oldPrice',
      'regularPrice',
      'priceBefore',
      'wasPrice',
      'beforePrice',
      'compareAtPrice',
      'listPrice',
    ]);
    final explicitSalePriceValue = _firstValue(data, const [
      'salePrice',
      'newPrice',
      'discountedPrice',
      'priceAfter',
      'nowPrice',
      'afterPrice',
      'currentPrice',
      'promoPrice',
      'offerPrice',
    ]);
    final salePriceValue =
        explicitSalePriceValue ??
        _discountedPriceValue(originalPriceValue, discount);

    return _Promotion(
      storeId: storeId,
      storeName: storeName,
      cleanStoreName: cleanStoreName,
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
      activeFlag: _boolValue(data, const [
        'active',
        'isActive',
        'enabled',
        'published',
        'isPublished',
      ]),
      originalPriceText: _priceText(originalPriceValue),
      salePriceText: _priceText(salePriceValue),
      discountText: discount.isEmpty ? null : '${_cleanPercent(discount)}% off',
      dedupeKey: fallbackDedupeKey,
    );
  }

  bool isActiveAt(DateTime now) {
    if (activeFlag == false) return false;
    if (_isDeletedOrInactivePromotionStatus) return false;
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

  bool get _isDeletedOrInactivePromotionStatus {
    return const {
      'deleted',
      'inactive',
      'disabled',
      'archived',
      'removed',
      'suspended',
      'cancelled',
      'canceled',
    }.contains(status);
  }

  String get logicalKey {
    final normalizedTitle = title.trim().toLowerCase();
    final normalizedStore = storeId.trim().isEmpty ? storeName : storeId;
    return '$normalizedStore:$normalizedTitle';
  }

  bool isMoreSpecificThan(_Promotion other) {
    final score = _specificityScore;
    final otherScore = other._specificityScore;
    if (score != otherScore) return score > otherScore;
    return dedupeKey.startsWith('api:') && !other.dedupeKey.startsWith('api:');
  }

  int get _specificityScore {
    var score = 0;
    if (imageUrl != null) score += 2;
    if (originalPriceText != null) score += 2;
    if (salePriceText != null) score += 2;
    if (!title.toLowerCase().contains('sale')) score += 1;
    return score;
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
    debugPrint(
      'Promotions: store $storeId product lookup count: ${productsById.length}',
    );

    for (final promoData in promotionMaps) {
      final promoId = _stringValue(promoData, const [
        'id',
        'promotionId',
        'promoId',
        'campaignId',
      ], fallback: promoData.hashCode.toString());
      final appliedIds = _appliedProductIds(promoData);
      final generalDedupeKey = 'api:$storeId:$promoId:general';
      var addedProductSpecific = false;
      final directProducts = _promotionProductMaps(promoData);
      debugPrint(
        'Promotions: promo $promoId directProducts=${directProducts.length} appliedIds=${appliedIds.toList()}',
      );

      for (final product in directProducts) {
        final productId = _stringValue(product, const [
          'id',
          'productId',
          'productID',
          'itemId',
          'itemID',
        ], fallback: product.hashCode.toString());
        final dedupeKey = 'api:$storeId:$promoId:direct-product:$productId';
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
        addedProductSpecific = true;
      }

      for (final productId in appliedIds) {
        final product = productsById[productId];
        if (product == null) {
          debugPrint(
            'Promotions: promo $promoId missing product details for applied product $productId',
          );
          continue;
        }

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
        addedProductSpecific = true;
      }

      if (!addedProductSpecific && seen.add(generalDedupeKey)) {
        promos.add(
          _Promotion.fromGeneralPromotion(
            promotion: promoData,
            storeId: storeId,
            storeName: storeName,
            storeLogoUrl: storeLogoUrl,
            dedupeKey: generalDedupeKey,
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

  factory _Promotion.fromGeneralPromotion({
    required Map<String, dynamic> promotion,
    required String storeId,
    required String storeName,
    required String storeLogoUrl,
    required String dedupeKey,
  }) {
    final discount = _stringValue(promotion, const [
      'discountPercent',
      'discount',
      'discountPercentage',
      'percentOff',
    ], fallback: '');
    final imageUrl = _stringValue(promotion, const [
      'imageUrl',
      'imageURL',
      'image_url',
      'image',
      'photoUrl',
      'photoURL',
      'productImageUrl',
      'productImageURL',
      'product_image_url',
      'thumbnail',
      'thumbnailUrl',
      'thumbnail_url',
      'url',
      'src',
    ], fallback: '');

    final data = <String, dynamic>{
      ...promotion,
      'storeId': storeId,
      'storeName': discount.isEmpty ? storeName : '$storeName · $discount% off',
      'cleanStoreName': storeName,
      if (imageUrl.isNotEmpty)
        'imageUrl': imageUrl
      else if (storeLogoUrl.isNotEmpty)
        'imageUrl': storeLogoUrl,
    };

    return _Promotion.fromMap(
      data,
      fallbackStoreId: storeId,
      fallbackDedupeKey: dedupeKey,
    );
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
      'productImageUrl',
      'productImageURL',
      'product_image_url',
      'imageUrl',
      'imageURL',
      'image_url',
      'image',
      'thumbnail',
      'thumbnailUrl',
      'thumbnail_url',
      'photoUrl',
      'photoURL',
      'url',
      'src',
    ], fallback: '');
    final imageUrl =
        _isVendorLogoImage(productImage, storeLogoUrl) ? '' : productImage;
    final subtitleParts = <String>[storeName];
    if (promoName.isNotEmpty) subtitleParts.add(promoName);
    if (discount.isNotEmpty) subtitleParts.add('$discount% off');
    final productBasePrice = _firstValue(product, const [
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

    final data = <String, dynamic>{
      ...promotion,
      'storeId': storeId,
      'storeName': subtitleParts.join(' · '),
      'cleanStoreName': storeName,
      'title': productName,
      if (productBasePrice != null) 'originalPrice': productBasePrice,
      for (final key in const [
        'originalPrice',
        'oldPrice',
        'regularPrice',
        'priceBefore',
        'wasPrice',
        'beforePrice',
        'compareAtPrice',
        'listPrice',
      ])
        if (product[key] != null) key: product[key],
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
      if (imageUrl.isNotEmpty) 'imageUrl': imageUrl,
    };
    for (final key in const [
      'imageUrl',
      'imageURL',
      'image_url',
      'image',
      'photoUrl',
      'photoURL',
      'logoUrl',
      'vendorLogoUrl',
      'storeLogoUrl',
      'logo',
    ]) {
      data.remove(key);
    }
    if (imageUrl.isNotEmpty) data['imageUrl'] = imageUrl;

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

    void addProductMap(Map<dynamic, dynamic> rawProduct) {
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

    void addProductList(dynamic rawProducts) {
      if (rawProducts is! List) return;
      for (final rawProduct in rawProducts) {
        if (rawProduct is Map) addProductMap(rawProduct);
      }
    }

    void addGroupedProducts(dynamic groupedProducts) {
      if (groupedProducts is! Map) return;
      for (final entry in groupedProducts.values) {
        addProductList(entry);
      }
    }

    addGroupedProducts(storeData['productsByCategory']);
    addGroupedProducts(storeData['productsByAisle']);
    addProductList(storeData['products']);
    addProductList(storeData['items']);

    return products;
  }

  static List<Map<String, dynamic>> _promotionProductMaps(
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
      final raw = promotion[key];
      if (raw is! List) continue;
      products.addAll(
        raw.whereType<Map>().map(
          (product) => Map<String, dynamic>.from(product),
        ),
      );
    }

    final appliedProducts = promotion['appliedProducts'];
    if (appliedProducts is List) {
      products.addAll(
        appliedProducts.whereType<Map>().map(
          (product) => Map<String, dynamic>.from(product),
        ),
      );
    }

    return products;
  }

  static List<Map<String, dynamic>> _explicitPromotionMaps(
    Map<String, dynamic> storeData,
  ) {
    final maps = <Map<String, dynamic>>[];
    final byId = <String, Map<String, dynamic>>{};
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

    for (final map in maps) {
      final id = _stringValue(map, const [
        'id',
        'promotionId',
        'promoId',
        'campaignId',
      ], fallback: '');
      if (id.isEmpty) {
        byId['hash:${map.hashCode}'] = map;
        continue;
      }

      final existing = byId[id];
      if (existing == null) {
        byId[id] = map;
      } else {
        byId[id] = _mergePromotionMap(existing, map);
      }
    }

    return byId.values.toList();
  }

  static Map<String, dynamic> _mergePromotionMap(
    Map<String, dynamic> first,
    Map<String, dynamic> second,
  ) {
    final merged = <String, dynamic>{...first, ...second};

    for (final key in const [
      'products',
      'appliedProductDetails',
      'appliedProductsDetails',
      'productDetails',
      'items',
    ]) {
      final firstValue = first[key];
      final secondValue = second[key];
      if (PromotionsScreen._hasCollectionItems(firstValue) &&
          !PromotionsScreen._hasCollectionItems(secondValue)) {
        merged[key] = firstValue;
      }
    }

    return merged;
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
    if (value == null) return null;
    final raw = value.toString().trim();
    if (raw.isEmpty || raw.toLowerCase() == 'null') return null;

    final parsed = _numberValue(raw);
    if (parsed != null) return '€${parsed.toStringAsFixed(2)}';

    return raw;
  }

  static double? _discountedPriceValue(dynamic originalPrice, String discount) {
    final original = _numberValue(originalPrice);
    final percent = _numberValue(discount);
    if (original == null || percent == null || percent <= 0) return null;

    final discounted = original * (1 - (percent / 100));
    if (discounted < 0) return 0;
    return discounted;
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

  static String _cleanPercent(String value) {
    final parsed = _numberValue(value);
    if (parsed == null) return value;
    if (parsed == parsed.roundToDouble()) return parsed.toStringAsFixed(0);
    return parsed.toStringAsFixed(2);
  }

  static bool _isVendorLogoImage(String imageUrl, String storeLogoUrl) {
    final image = imageUrl.trim();
    if (image.isEmpty) return true;

    final logo = storeLogoUrl.trim();
    if (logo.isNotEmpty && image == logo) return true;

    final lower = image.toLowerCase();
    return lower.contains('/logos/') || lower.contains('default-vendor');
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
