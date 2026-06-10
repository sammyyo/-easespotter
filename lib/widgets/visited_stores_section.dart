import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart'; // For kIsWeb
import 'package:easespotter/screens/store_profile_screen.dart';
import 'package:easespotter/services/store_logo_service.dart';
import 'package:easespotter/services/store_review_service.dart';

class VisitedStoresSection extends StatefulWidget {
  final String userId;

  const VisitedStoresSection({super.key, required this.userId});

  @override
  State<VisitedStoresSection> createState() => _VisitedStoresSectionState();
}

class _VisitedStoresSectionState extends State<VisitedStoresSection> {
  late Stream<QuerySnapshot> _visitsStream;

  @override
  void initState() {
    super.initState();
    _visitsStream = _getVisitsStream();
  }

  @override
  void didUpdateWidget(VisitedStoresSection oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.userId != oldWidget.userId) {
      _visitsStream = _getVisitsStream();
    }
  }

  Stream<QuerySnapshot> _getVisitsStream() {
    return FirebaseFirestore.instance
        .collection('store_visits')
        .where('userId', isEqualTo: widget.userId)
        .where('visitedAt', isGreaterThan: Timestamp(0, 0))
        .orderBy('visitedAt', descending: true)
        .limit(50)
        .snapshots();
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<QuerySnapshot>(
      stream: _visitsStream,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              'Error loading store visits: ${snapshot.error}',
              style: const TextStyle(color: Colors.redAccent),
            ),
          );
        }

        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Padding(
            padding: EdgeInsets.all(16),
            child: LinearProgressIndicator(),
          );
        }

        if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
          return const Padding(
            padding: EdgeInsets.all(16),
            child: Text(
              'Scan a store QR to see your visited stores here.',
              style: TextStyle(fontSize: 13, color: Colors.grey),
            ),
          );
        }

        final visitDocs = snapshot.data!.docs;
        final Map<String, _VisitedStoreAggregate> aggregates = {};

        final now = DateTime.now();
        final sevenDaysAgo = now.subtract(const Duration(days: 7));
        int visitsThisWeek = 0;

        for (final doc in visitDocs) {
          final data = doc.data() as Map<String, dynamic>;
          final storeId = data['storeId']?.toString();
          final visitedAt = data['visitedAt'] as Timestamp?;

          if (visitedAt != null && visitedAt.toDate().isAfter(sevenDaysAgo)) {
            visitsThisWeek++;
          }

          if (storeId == null || storeId.isEmpty) continue;

          final storeName = (data['storeName'] ?? storeId).toString();
          final logoUrl = StoreLogoService.resolveFromData(data);

          final agg = aggregates.putIfAbsent(
            storeId,
            () => _VisitedStoreAggregate(
              storeId: storeId,
              storeName: storeName,
              visits: 0,
              lastVisitedAt: visitedAt,
              logoUrl: logoUrl,
            ),
          );

          agg.visits += 1;

          if (visitedAt != null &&
              (agg.lastVisitedAt == null ||
                  visitedAt.compareTo(agg.lastVisitedAt!) > 0)) {
            agg.lastVisitedAt = visitedAt;
          }

          if (agg.logoUrl == null && logoUrl.isNotEmpty) {
            agg.logoUrl = logoUrl;
          }

          if (storeName.isNotEmpty) {
            agg.storeName = storeName;
          }
        }

        final stores =
            aggregates.values.toList()..sort((a, b) {
              final diff = b.visits - a.visits;
              if (diff != 0) return diff;
              return (b.lastVisitedAt ?? Timestamp(0, 0)).compareTo(
                a.lastVisitedAt ?? Timestamp(0, 0),
              );
            });

        final topStores = stores.take(12).toList();
        final favoriteStore = topStores.isNotEmpty ? topStores.first : null;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Insight cards
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: IntrinsicHeight(
                child: Row(
                  children: [
                    Expanded(
                      child: _InsightCard(
                        title: 'Most Visited',
                        value: favoriteStore?.storeName ?? 'None',
                        subValue:
                            favoriteStore != null
                                ? '${favoriteStore.visits} visits'
                                : '',
                        icon: Icons.emoji_events,
                        color: Colors.amber.shade100,
                        iconColor: Colors.amber.shade800,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _InsightCard(
                        title: 'This Week',
                        value: '$visitsThisWeek',
                        subValue: 'last 7 days',
                        icon: Icons.calendar_month,
                        color: Colors.blue.shade100,
                        iconColor: Colors.blue.shade800,
                      ),
                    ),
                  ],
                ),
              ),
            ),

            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
              child: Text(
                'Stores you’ve shopped at',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.2,
                  color: Colors.grey.shade800,
                ),
              ),
            ),

            // Grid
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final crossAxisCount = constraints.maxWidth >= 520 ? 4 : 3;

                  return GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: topStores.length,
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: crossAxisCount,
                      crossAxisSpacing: 12,
                      mainAxisSpacing: 12,
                      childAspectRatio: 0.75,
                    ),
                    itemBuilder: (context, index) {
                      return _VisitedStoreChip(store: topStores[index]);
                    },
                  );
                },
              ),
            ),

            const SizedBox(height: 8),
          ],
        );
      },
    );
  }
}

class _InsightCard extends StatelessWidget {
  final String title;
  final String value;
  final String subValue;
  final IconData icon;
  final Color color;
  final Color iconColor;

  const _InsightCard({
    required this.title,
    required this.value,
    required this.subValue,
    required this.icon,
    required this.color,
    required this.iconColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 20, color: iconColor),
              const SizedBox(width: 6),
              Text(
                title,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                  color: Colors.grey.shade800,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
          if (subValue.isNotEmpty)
            Text(
              subValue,
              style: TextStyle(fontSize: 11, color: Colors.grey.shade700),
            ),
        ],
      ),
    );
  }
}

class _VisitedStoreAggregate {
  final String storeId;
  int visits;
  Timestamp? lastVisitedAt;
  String storeName;
  String? logoUrl;

  _VisitedStoreAggregate({
    required this.storeId,
    required this.storeName,
    required this.visits,
    required this.lastVisitedAt,
    this.logoUrl,
  });
}

class _VisitedStoreChip extends StatefulWidget {
  final _VisitedStoreAggregate store;

  const _VisitedStoreChip({required this.store});

  @override
  State<_VisitedStoreChip> createState() => _VisitedStoreChipState();
}

class _VisitedStoreChipState extends State<_VisitedStoreChip> {
  bool _pressed = false;

  static const Color _cardBg = Color(0xFFEFF2FF);
  static const Color _cardBorder = Color(0xFFD9E1FF);

  _VisitedStoreAggregate get store => widget.store;

  Widget _fallbackInitial() {
    return Image.asset(
      StoreLogoService.fallbackAsset,
      width: 24,
      height: 24,
      fit: BoxFit.contain,
      errorBuilder:
          (_, __, ___) => Text(
            store.storeName.isNotEmpty ? store.storeName[0].toUpperCase() : '?',
            style: TextStyle(
              fontWeight: FontWeight.bold,
              color: Colors.indigo.shade400,
            ),
          ),
    );
  }

  void _openReviewSheet(
    BuildContext context, {
    required String storeId,
    required String storeName,
    String? logoUrl,
  }) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder:
          (_) => _StoreReviewSheet(
            storeId: storeId,
            storeName: storeName,
            logoUrl: logoUrl,
          ),
    );
  }

  Widget _buildContent(String? logoUrl) {
    final resolvedLogo = StoreLogoService.resolveUrl(logoUrl);

    return AnimatedScale(
      scale: _pressed ? 0.97 : 1.0,
      duration: const Duration(milliseconds: 120),
      curve: Curves.easeOut,
      child: Ink(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: _cardBg,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: _cardBorder),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.06),
              blurRadius: 10,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: Colors.white.withOpacity(0.8),
              child:
                  resolvedLogo.isNotEmpty
                      ? ClipOval(
                        child: Image.network(
                          resolvedLogo,
                          width: 36,
                          height: 36,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => _fallbackInitial(),
                        ),
                      )
                      : _fallbackInitial(),
            ),
            const SizedBox(height: 8),
            Text(
              store.storeName,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 12,
                height: 1.15,
                fontWeight: FontWeight.w700,
                color: Colors.grey.shade900,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              '${store.visits} visit${store.visits == 1 ? '' : 's'}',
              style: TextStyle(
                fontSize: 10.5,
                color: Colors.grey.shade700,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            // ✅ Button added
            SizedBox(
              height: 28,
              child: ElevatedButton(
                onPressed:
                    () => _openReviewSheet(
                      context,
                      storeId: store.storeId,
                      storeName: store.storeName,
                      logoUrl: logoUrl,
                    ),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  backgroundColor: Colors.deepPurple,
                  foregroundColor: Colors.white,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                child: const Text('Review', style: TextStyle(fontSize: 11)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (store.logoUrl != null && store.logoUrl!.isNotEmpty) {
      return _tapWrapper(context, store.logoUrl);
    }

    return FutureBuilder<DocumentSnapshot>(
      future:
          FirebaseFirestore.instance
              .collection('stores')
              .doc(store.storeId)
              .get(),
      builder: (context, snapshot) {
        final data = snapshot.data?.data() as Map<String, dynamic>?;
        final fetchedLogo = StoreLogoService.resolveFromData(data);
        return _tapWrapper(context, fetchedLogo);
      },
    );
  }

  Widget _tapWrapper(BuildContext context, String? logoUrl) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTapDown: (_) => setState(() => _pressed = true),
        onTapCancel: () => setState(() => _pressed = false),
        onTapUp: (_) => setState(() => _pressed = false),
        splashColor: Colors.indigo.withOpacity(0.10),
        highlightColor: Colors.indigo.withOpacity(0.06),
        onTap:
            () => Navigator.push(
              context,
              MaterialPageRoute(
                builder:
                    (_) => StoreProfileScreen(
                      storeId: store.storeId,
                      storeName: store.storeName,
                      logoUrl: logoUrl,
                    ),
              ),
            ),
        child: _buildContent(logoUrl),
      ),
    );
  }
}

// ✅ Bottom Sheet Added
class _StoreReviewSheet extends StatefulWidget {
  final String storeId;
  final String storeName;
  final String? logoUrl;

  const _StoreReviewSheet({
    required this.storeId,
    required this.storeName,
    this.logoUrl,
  });

  @override
  State<_StoreReviewSheet> createState() => _StoreReviewSheetState();
}

class _StoreReviewSheetState extends State<_StoreReviewSheet> {
  int _rating = 5;
  bool _isPublic = true;
  bool _saving = false;

  final _wentWell = TextEditingController();
  final _suggestion = TextEditingController();

  @override
  void dispose() {
    _wentWell.dispose();
    _suggestion.dispose();
    super.dispose();
  }

  String _device() {
    if (kIsWeb) return "web";
    return defaultTargetPlatform == TargetPlatform.iOS ? "ios" : "android";
  }

  Future<void> _submit() async {
    setState(() => _saving = true);
    try {
      await StoreReviewService.submitReview(
        storeId: widget.storeId,
        rating: _rating,
        signals: null, // add later if you want
        wentWell: _wentWell.text,
        suggestion: _suggestion.text,
        visitRefId: null, // optional (we can wire this later)
        isPublic: _isPublic,
        device: _device(),
      );

      // ✅ Clear inputs after successful submission
      _wentWell.clear();
      _suggestion.clear();
      setState(() {
        _rating = 5;
      });

      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Review posted ✅')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Failed to post review: $e')));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    final resolvedLogo = StoreLogoService.resolveUrl(widget.logoUrl);

    return Container(
      padding: EdgeInsets.fromLTRB(16, 14, 16, 14 + bottom),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 16,
                  backgroundColor: Colors.grey.shade200,
                  backgroundImage:
                      resolvedLogo.isNotEmpty
                          ? NetworkImage(resolvedLogo)
                          : null,
                  child:
                      resolvedLogo.isEmpty
                          ? Image.asset(
                            StoreLogoService.fallbackAsset,
                            width: 22,
                            height: 22,
                            fit: BoxFit.contain,
                            errorBuilder:
                                (_, __, ___) => Text(
                                  widget.storeName.isNotEmpty
                                      ? widget.storeName[0].toUpperCase()
                                      : "?",
                                ),
                          )
                          : null,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Review ${widget.storeName}',
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 12),

            Text(
              'Rating: $_rating/5',
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            Slider(
              value: _rating.toDouble(),
              min: 1,
              max: 5,
              divisions: 4,
              label: '$_rating',
              onChanged: (v) => setState(() => _rating = v.round()),
            ),

            TextField(
              controller: _wentWell,
              decoration: const InputDecoration(labelText: 'What went well?'),
              maxLines: 2,
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _suggestion,
              decoration: const InputDecoration(
                labelText: 'Suggestion (optional)',
              ),
              maxLines: 2,
            ),

            const SizedBox(height: 10),

            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _isPublic,
              title: const Text('Public review'),
              onChanged: (v) => setState(() => _isPublic = v),
            ),

            const SizedBox(height: 8),

            SizedBox(
              width: double.infinity,
              height: 44,
              child: ElevatedButton(
                onPressed: _saving ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.deepPurple,
                  foregroundColor: Colors.white,
                ),
                child: Text(_saving ? 'Posting...' : 'Post review'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
