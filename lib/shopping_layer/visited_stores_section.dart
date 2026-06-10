import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:easespotter/services/store_logo_service.dart';

class VisitedStoresSection extends StatelessWidget {
  final String? userId;

  const VisitedStoresSection({super.key, this.userId});

  @override
  Widget build(BuildContext context) {
    final currentUser = FirebaseAuth.instance.currentUser;
    final effectiveUserId = userId ?? currentUser?.uid;

    if (effectiveUserId == null) {
      // Not logged in / no user – you can show nothing or a message
      return const SizedBox.shrink();
    }

    final visitsQuery = FirebaseFirestore.instance
        .collection('store_visits')
        .where('userId', isEqualTo: effectiveUserId)
        .orderBy('visitedAt', descending: true)
        .limit(50); // limit to keep it light

    return StreamBuilder<QuerySnapshot>(
      stream: visitsQuery.snapshots(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Padding(
            padding: EdgeInsets.all(16.0),
            child: LinearProgressIndicator(),
          );
        }

        if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
          return const SizedBox.shrink();
        }

        final visitDocs = snapshot.data!.docs;

        // Group by storeId and count visits
        final Map<String, int> visitCounts = {};
        final Map<String, Timestamp?> lastVisitMap = {};

        for (final doc in visitDocs) {
          final data = doc.data() as Map<String, dynamic>;
          final storeId = data['storeId']?.toString();
          if (storeId == null || storeId.isEmpty) continue;

          visitCounts[storeId] = (visitCounts[storeId] ?? 0) + 1;

          final ts = data['visitedAt'] as Timestamp?;
          final currentLast = lastVisitMap[storeId];
          if (ts != null) {
            if (currentLast == null || ts.compareTo(currentLast) > 0) {
              lastVisitMap[storeId] = ts;
            }
          }
        }

        if (visitCounts.isEmpty) {
          return const SizedBox.shrink();
        }

        // Take top N stores (by visit count)
        final sortedStoreIds =
            visitCounts.keys.toList()..sort((a, b) {
              final countDiff = (visitCounts[b] ?? 0) - (visitCounts[a] ?? 0);
              if (countDiff != 0) return countDiff;
              final tA = lastVisitMap[a];
              final tB = lastVisitMap[b];
              if (tA == null && tB == null) return 0;
              if (tA == null) return 1;
              if (tB == null) return -1;
              return tB.compareTo(tA);
            });

        final topStoreIds = sortedStoreIds.take(10).toList();

        // Now fetch those stores from `stores` collection
        final storesRef = FirebaseFirestore.instance.collection('stores');

        return FutureBuilder<QuerySnapshot>(
          future:
              storesRef.where(FieldPath.documentId, whereIn: topStoreIds).get(),
          builder: (context, storesSnapshot) {
            if (storesSnapshot.connectionState == ConnectionState.waiting) {
              return const Padding(
                padding: EdgeInsets.all(16.0),
                child: LinearProgressIndicator(),
              );
            }

            if (!storesSnapshot.hasData || storesSnapshot.data!.docs.isEmpty) {
              return const SizedBox.shrink();
            }

            final storeDocs = storesSnapshot.data!.docs;

            // Map storeId -> store data
            final Map<String, Map<String, dynamic>> storeDataById = {
              for (final doc in storeDocs)
                doc.id: doc.data() as Map<String, dynamic>,
            };

            // Build a list of stores in the same topStoreIds order
            final stores =
                topStoreIds.where((id) => storeDataById.containsKey(id)).map((
                  id,
                ) {
                  final data = storeDataById[id]!;
                  return _VisitedStoreItemData(
                    storeId: id,
                    name: data['name']?.toString() ?? 'Store',
                    logoUrl: StoreLogoService.resolveFromData(data),
                    visits: visitCounts[id] ?? 0,
                  );
                }).toList();

            if (stores.isEmpty) {
              return const SizedBox.shrink();
            }

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Padding(
                  padding: EdgeInsets.symmetric(
                    horizontal: 16.0,
                    vertical: 8.0,
                  ),
                  child: Text(
                    'Stores you’ve shopped at',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                ),
                SizedBox(
                  height: 110,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 16.0),
                    itemCount: stores.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 12),
                    itemBuilder: (context, index) {
                      final store = stores[index];
                      return _VisitedStoreChip(store: store);
                    },
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }
}

class _VisitedStoreItemData {
  final String storeId;
  final String name;
  final String? logoUrl;
  final int visits;

  _VisitedStoreItemData({
    required this.storeId,
    required this.name,
    this.logoUrl,
    required this.visits,
  });
}

class _VisitedStoreChip extends StatelessWidget {
  final _VisitedStoreItemData store;

  const _VisitedStoreChip({required this.store});

  @override
  Widget build(BuildContext context) {
    final resolvedLogo = StoreLogoService.resolveUrl(store.logoUrl);

    return InkWell(
      onTap: () {
        // TODO: Navigate to your Store screen by storeId
        // e.g. Navigator.pushNamed(context, '/store', arguments: store.storeId);
      },
      child: Container(
        width: 120,
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: Colors.grey.shade900.withOpacity(0.5),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.white10),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Logo / fallback circle
            CircleAvatar(
              radius: 20,
              backgroundImage:
                  resolvedLogo.isNotEmpty ? NetworkImage(resolvedLogo) : null,
              child:
                  resolvedLogo.isEmpty
                      ? Image.asset(
                        StoreLogoService.fallbackAsset,
                        width: 26,
                        height: 26,
                        fit: BoxFit.contain,
                        errorBuilder:
                            (_, __, ___) => Text(
                              store.name.isNotEmpty
                                  ? store.name[0].toUpperCase()
                                  : '?',
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                      )
                      : null,
            ),
            const SizedBox(height: 8),
            Text(
              store.name,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12),
            ),
            const SizedBox(height: 4),
            Text(
              '${store.visits} visit${store.visits == 1 ? '' : 's'}',
              style: TextStyle(fontSize: 10, color: Colors.grey.shade400),
            ),
          ],
        ),
      ),
    );
  }
}
