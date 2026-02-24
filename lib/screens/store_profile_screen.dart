import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import 'package:easespotter/services/store_follow_service.dart';
import 'package:easespotter/screens/store_confirmation_screen.dart';
import 'package:easespotter/services/store_api_service.dart';

class StoreProfileScreen extends StatefulWidget {
  final String storeId;
  final String? storeName;
  final String? logoUrl;

  const StoreProfileScreen({
    super.key,
    required this.storeId,
    this.storeName,
    this.logoUrl,
  });

  @override
  State<StoreProfileScreen> createState() => _StoreProfileScreenState();
}

class _StoreProfileScreenState extends State<StoreProfileScreen> {
  bool _isFollowing = false;
  bool _loadingFollow = true;
  bool _openingStorefront = false;

  @override
  void initState() {
    super.initState();
    _loadFollowState();
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
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to update follow: $e')),
      );
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

      final apiData = await StoreApiService.fetchStoreById(vendorId);

      final storeData = <String, dynamic>{
        'vendorId': apiData['vendorId'] ?? vendorId,
        'vendorName': apiData['vendorName'] ?? storeName,
        'logoUrl': apiData['logoUrl'] ?? (logoUrl ?? ''),
        'productsByCategory': apiData['productsByCategory'] ?? <String, dynamic>{},
        'productsByAisle': apiData['productsByAisle'] ?? <String, dynamic>{},
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
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to open store: $e')),
      );
    } finally {
      if (mounted) setState(() => _openingStorefront = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final authUid = FirebaseAuth.instance.currentUser?.uid;

    return StreamBuilder<DocumentSnapshot>(
      stream: FirebaseFirestore.instance
          .collection('stores')
          .doc(widget.storeId)
          .snapshots(),
      builder: (context, storeSnap) {
        if (storeSnap.hasError) {
          return Scaffold(
            appBar: AppBar(
              title: const Text('Store', style: TextStyle(fontWeight: FontWeight.w800)),
              centerTitle: true,
              backgroundColor: Colors.deepPurple,
              foregroundColor: Colors.white,
            ),
            body: Center(child: Text('Store load error: ${storeSnap.error}')),
          );
        }

        if (storeSnap.connectionState == ConnectionState.waiting) {
          return Scaffold(
            appBar: AppBar(
              title: const Text('Store', style: TextStyle(fontWeight: FontWeight.w800)),
              centerTitle: true,
              backgroundColor: Colors.deepPurple,
              foregroundColor: Colors.white,
            ),
            body: const Center(child: CircularProgressIndicator()),
          );
        }

        final storeDoc = (storeSnap.data?.data() as Map<String, dynamic>?) ?? {};

        final resolvedName = (widget.storeName?.trim().isNotEmpty == true)
            ? widget.storeName!
            : (storeDoc['name'] ?? storeDoc['vendorName'] ?? 'Store').toString();

        final resolvedLogo = (widget.logoUrl?.trim().isNotEmpty == true)
            ? widget.logoUrl!
            : (storeDoc['logoUrl'] ?? storeDoc['vendorLogoUrl'] ?? '').toString();

        final visitsQuery = (authUid == null)
            ? null
            : FirebaseFirestore.instance
            .collection('store_visits')
            .where('userId', isEqualTo: authUid)
            .where('storeId', isEqualTo: widget.storeId)
            .orderBy('visitedAt', descending: true)
            .limit(50);

        return Scaffold(
          appBar: AppBar(
            title: Text(resolvedName, style: const TextStyle(fontWeight: FontWeight.w800)),
            centerTitle: true,
            backgroundColor: Colors.deepPurple,
            foregroundColor: Colors.white,
          ),
          body: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                CircleAvatar(
                  radius: 42,
                  backgroundColor: Colors.deepPurple.shade50,
                  child: (resolvedLogo.isNotEmpty)
                      ? ClipOval(
                    child: Image.network(
                      resolvedLogo,
                      width: 84,
                      height: 84,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => const Icon(
                        Icons.store,
                        size: 42,
                        color: Colors.deepPurple,
                      ),
                    ),
                  )
                      : const Icon(Icons.store, size: 42, color: Colors.deepPurple),
                ),
                const SizedBox(height: 14),
                Text(
                  resolvedName,
                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 12),

                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: _openingStorefront
                        ? null
                        : () => _openStorefront(
                      storeName: resolvedName,
                      logoUrl: resolvedLogo.isNotEmpty ? resolvedLogo : null,
                    ),
                    icon: _openingStorefront
                        ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                        : const Icon(Icons.storefront),
                    label: Text(_openingStorefront ? 'Opening…' : 'Browse this store'),
                  ),
                ),

                const SizedBox(height: 10),

                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: _loadingFollow
                        ? null
                        : () => _toggleFollow(
                      resolvedName,
                      resolvedLogo.isNotEmpty ? resolvedLogo : null,
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _isFollowing ? Colors.red : Colors.deepPurple,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    icon: Icon(_isFollowing ? Icons.remove_circle_outline : Icons.add),
                    label: Text(_isFollowing ? 'Unfollow store' : 'Follow store'),
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
                      if (visitSnap.connectionState == ConnectionState.waiting) {
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

                Expanded(
                  child: StreamBuilder<QuerySnapshot>(
                    stream: FirebaseFirestore.instance
                        .collection('store_promotions')
                        .where('storeId', isEqualTo: widget.storeId)
                        .orderBy('startsAt', descending: true)
                        .limit(20)
                        .snapshots(),
                    builder: (context, snap) {
                      if (snap.hasError) {
                        return Center(child: Text('Promotions error: ${snap.error}'));
                      }
                      if (!snap.hasData) {
                        return const Center(child: CircularProgressIndicator());
                      }
                      final docs = snap.data!.docs;

                      if (docs.isEmpty) {
                        return const Center(
                          child: Text('No active promotions right now.', style: TextStyle(color: Colors.grey)),
                        );
                      }

                      return ListView.separated(
                        itemCount: docs.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (context, i) {
                          final p = docs[i].data() as Map<String, dynamic>;
                          return Card(
                            elevation: 0,
                            color: Colors.grey.shade100,
                            child: ListTile(
                              leading: const Icon(Icons.local_offer, color: Colors.deepPurple),
                              title: Text(p['title'] ?? 'Promotion'),
                              subtitle: Text(p['description'] ?? ''),
                            ),
                          );
                        },
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
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
        color: Colors.deepPurple.shade50,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: Colors.deepPurple, size: 20),
          const SizedBox(height: 4),
          Text(title, style: const TextStyle(fontSize: 12, color: Colors.deepPurple)),
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
