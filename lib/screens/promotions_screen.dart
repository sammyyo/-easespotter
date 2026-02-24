import 'dart:async'; // Added for StreamController and StreamSubscription
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import 'package:easespotter/screens/store_profile_screen.dart';

class PromotionsScreen extends StatelessWidget {
  const PromotionsScreen({super.key});

  static const int _followedLimit = 50; // load up to N followed stores
  static const int _chunkSize = 10;     // Firestore whereIn chunk size

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser?.uid;

    if (uid == null) {
      return const Scaffold(
        body: Center(child: Text('Please sign in to see promotions.')),
      );
    }

    //  REVERTED: Use users/{uid}/followedStores as source of truth
    final followedStoresStream = FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .collection('followedStores')
        .orderBy('followedAt', descending: true)
        .limit(_followedLimit)
        .snapshots();

    return Scaffold(
      backgroundColor: const Color(0xFFF3F1FF),
      appBar: AppBar(
        title: const Text('Promotions', style: TextStyle(fontWeight: FontWeight.w800)),
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
          final followedStoreIds = followedDocs
              .map((d) {
            final data = d.data() as Map<String, dynamic>;
            // storeId is usually stored in the doc, but fallback to doc id
            return (data['storeId'] ?? d.id).toString();
          })
              .where((id) => id.trim().isNotEmpty)
              .toList();

          //  NEW: Normalization
          final normalizedIds = followedStoreIds
              .map((id) => id.trim())
              .where((id) => id.isNotEmpty)
              .toList();

          if (normalizedIds.isEmpty) {
            return const _EmptyState(
              title: 'No promotions yet',
              subtitle: 'Follow stores to see promotions here.',
              icon: Icons.local_offer_outlined,
            );
          }

          //  Stream promotions using normalized IDs
          final promotionsStream =
              _multiWhereInPromotionsStream(normalizedIds);

          return StreamBuilder<List<QueryDocumentSnapshot>>(
            stream: promotionsStream,
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

              final allPromoDocs = promoSnap.data!;
              final now = DateTime.now();

              //  Optional: show only "active" promos when endsAt exists
              final active = allPromoDocs.where((doc) {
                final data = doc.data() as Map<String, dynamic>;

                final endsAt = data['endsAt'];
                if (endsAt is Timestamp) {
                  return endsAt.toDate().isAfter(now);
                }
                return true; // if no endsAt, keep it (v1)
              }).toList();

              // Sort: earliest ending first, fallback to newest
              active.sort((a, b) {
                final da = a.data() as Map<String, dynamic>;
                final db = b.data() as Map<String, dynamic>;

                final aEnd = da['endsAt'];
                final bEnd = db['endsAt'];

                if (aEnd is Timestamp && bEnd is Timestamp) {
                  return aEnd.compareTo(bEnd);
                }
                if (aEnd is Timestamp) return -1;
                if (bEnd is Timestamp) return 1;

                final aStart = da['startsAt'];
                final bStart = db['startsAt'];
                if (aStart is Timestamp && bStart is Timestamp) {
                  return bStart.compareTo(aStart); // newest first
                }
                return 0;
              });

              if (active.isEmpty) {
                return const _EmptyState(
                  title: 'No active promotions',
                  subtitle: 'Your followed stores don’t have active promos right now.',
                  icon: Icons.local_offer_outlined,
                );
              }

              return ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
                itemCount: active.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (context, i) {
                  final doc = active[i];
                  final data = doc.data() as Map<String, dynamic>;

                  final storeId = (data['storeId'] ?? '').toString();
                  final title = (data['title'] ?? 'Promotion').toString();
                  final storeName = (data['storeName'] ?? 'Store').toString();
                  final imageUrl = (data['imageUrl'] ?? '').toString();

                  final endsAt = data['endsAt'];
                  final endsText = (endsAt is Timestamp)
                      ? _formatEnds(endsAt.toDate())
                      : null;

                  return _PromoCard(
                    title: title,
                    storeName: storeName,
                    endsText: endsText,
                    imageUrl: imageUrl.isNotEmpty ? imageUrl : null,
                    onTap: storeId.trim().isEmpty
                        ? null
                        : () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => StoreProfileScreen(
                            storeId: storeId,
                            storeName: storeName,
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

  /// Returns a single stream of docs by merging multiple `whereIn` queries.
  Stream<List<QueryDocumentSnapshot>> _multiWhereInPromotionsStream(
      List<String> storeIds,
      ) async* {
    final ids = List<String>.from(storeIds);
    final chunks = <List<String>>[];

    for (int i = 0; i < ids.length; i += _chunkSize) {
      chunks.add(ids.sublist(i, (i + _chunkSize).clamp(0, ids.length)));
    }

    // Build each chunk stream
    final streams = chunks.map((chunk) {
      return FirebaseFirestore.instance
          .collection('store_promotions')
          .where('storeId', whereIn: chunk)
          .snapshots()
          .map((snap) => snap.docs);
    }).toList();

    if (streams.isEmpty) {
      yield <QueryDocumentSnapshot>[];
      return;
    }

    // Merge streams manually (simple merge)
    final latest = List<List<QueryDocumentSnapshot>>.filled(streams.length, []);
    final subs = <StreamSubscription>[];
    final controller = StreamController<List<QueryDocumentSnapshot>>();

    void emit() {
      final merged = <QueryDocumentSnapshot>[];
      for (final list in latest) {
        merged.addAll(list);
      }
      controller.add(merged);
    }

    for (int i = 0; i < streams.length; i++) {
      final sub = streams[i].listen((docs) {
        latest[i] = docs;
        emit();
      }, onError: controller.addError);
      subs.add(sub);
    }

    yield* controller.stream;

    // ignore: unreachable_from_main
    // Clean-up (won’t run in typical Stateless usage, but correct)
    // for (final s in subs) { await s.cancel(); }
    // await controller.close();
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
              child: (imageUrl != null)
                  ? Image.network(
                imageUrl!,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => const Icon(
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
  final String subtitle;
  final IconData icon;

  const _EmptyState({
    required this.title,
    required this.subtitle,
    required this.icon,
  });

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
            const SizedBox(height: 8),
            Text(
              subtitle,
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey.shade600, height: 1.4),
            ),
          ],
        ),
      ),
    );
  }
}
