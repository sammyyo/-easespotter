import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:geolocator/geolocator.dart'; // Added for GPS

import 'package:easespotter/screens/store_profile_screen.dart';
import 'package:easespotter/services/store_api_service.dart';

class DiscoverScreen extends StatefulWidget {
  const DiscoverScreen({super.key});

  @override
  State<DiscoverScreen> createState() => _DiscoverScreenState();
}

class _DiscoverScreenState extends State<DiscoverScreen> {
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      final next = _searchController.text.trim();
      if (next != _query) setState(() => _query = next);
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _openStore({
    required String storeId,
    required String storeName,
    String? logoUrl,
  }) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => StoreProfileScreen(
          storeId: storeId,
          storeName: storeName,
          logoUrl: logoUrl,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    final appBarTitleStyle =
        Theme.of(context).appBarTheme.titleTextStyle ??
        Theme.of(context).textTheme.titleLarge;

    return Scaffold(
      backgroundColor: const Color(0xFFF3F1FF),
      appBar: AppBar(
        title: Text(
          'Discover',
          style: (appBarTitleStyle ?? const TextStyle()).copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w800,
          ),
        ),
        centerTitle: true,
        backgroundColor: Colors.deepPurple,
        foregroundColor: Colors.white,
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Search bar
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
              child: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      Colors.deepPurple.withOpacity(0.14),
                      Colors.pinkAccent.withOpacity(0.10),
                      Colors.blueAccent.withOpacity(0.08),
                    ],
                  ),
                  borderRadius: BorderRadius.circular(16),
                ),
                padding: const EdgeInsets.all(1.2),
                child: TextField(
                  controller: _searchController,
                  textInputAction: TextInputAction.search,
                  decoration: InputDecoration(
                    hintText: 'Search stores, brands, products',
                    prefixIcon: const Icon(Icons.search),
                    filled: true,
                    fillColor: Colors.white.withOpacity(0.95),
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 14,
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
              ),
            ),

            Expanded(
              child: _query.isNotEmpty
                  ? _StoreSearchResults(
                      query: _query,
                      onOpenStore: _openStore,
                    )
                  : ListView(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                      children: [
                        const _SectionTitle(title: 'Trending stores'),
                        const SizedBox(height: 10),
                        _TrendingStoresList(
                          onOpenStore: _openStore,
                        ),

                        // NEW: Nearby with GPS
                        const SizedBox(height: 18),
                        const _SectionTitle(title: 'Nearby stores'),
                        const SizedBox(height: 10),
                        _NearbyGpsStoresList(
                          onOpenStore: _openStore,
                        ),

                        const SizedBox(height: 18),
                        const _SectionTitle(title: 'Nearby based on your visits'),
                        const SizedBox(height: 10),
                        if (uid == null)
                          const _InfoCard(
                            title: 'Sign in to see nearby stores',
                            subtitle: 'Nearby is based on your store visits (no GPS).',
                          )
                        else
                          _NearbyNoGpsList(
                            uid: uid,
                            onOpenStore: _openStore,
                          ),

                        const SizedBox(height: 18),
                        const _SectionTitle(title: 'Your followed stores'),
                        const SizedBox(height: 10),
                        if (uid == null)
                          const _InfoCard(
                            title: 'Sign in to see followed stores',
                            subtitle:
                                'Once signed in, you can follow stores and they’ll appear here.',
                          )
                        else
                          _FollowedStoresList(
                            uid: uid,
                            onOpenStore: _openStore,
                          ),

                        const SizedBox(height: 18),
                        const _SectionTitle(title: 'Recently visited'),
                        const SizedBox(height: 10),
                        if (uid == null)
                          const _InfoCard(
                            title: 'Sign in to see recent visits',
                            subtitle:
                                'Scan a store QR and your visits will show here.',
                          )
                        else
                          _RecentVisitsList(
                            uid: uid,
                            onOpenStore: _openStore,
                          ),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String title;

  const _SectionTitle({required this.title});

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: const TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.2,
      ),
    );
  }
}

class _StoreSearchResults extends StatelessWidget {
  final String query;
  final void Function({
    required String storeId,
    required String storeName,
    String? logoUrl,
  }) onOpenStore;

  const _StoreSearchResults({
    required this.query,
    required this.onOpenStore,
  });

  @override
  Widget build(BuildContext context) {
    final q = query.trim().toLowerCase();

    // v1 = fetch a small set, filter locally (fast + simple)
    // Removed orderBy('updatedAt') for safety as per instruction
    final stream = FirebaseFirestore.instance
        .collection('stores')
        .limit(80)
        .snapshots();

    return StreamBuilder<QuerySnapshot>(
      stream: stream,
      builder: (context, snap) {
        if (snap.hasError) {
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              _InfoCard(
                title: 'Search error',
                subtitle: '${snap.error}',
              ),
            ],
          );
        }

        if (!snap.hasData) {
          // FIX: Removed 'const' before ListView
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: const [
              _LoadingList(),
            ],
          );
        }

        final docs = snap.data!.docs;

        final matches = docs.where((d) {
          final data = (d.data() as Map<String, dynamic>);
          final name = (data['name'] ?? data['vendorName'] ?? '')
              .toString()
              .toLowerCase();
          return name.contains(q);
        }).toList();

        if (matches.isEmpty) {
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              _ColorCard(
                variant: _CardVariant.neutral,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'No matches for “$query”',
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Try a shorter keyword or different spelling.',
                      style: TextStyle(color: Colors.black54),
                    ),
                  ],
                ),
              ),
            ],
          );
        }

        final show = matches.take(12).toList();

        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            const _SectionTitle(title: 'Search results'),
            const SizedBox(height: 10),
            ...List.generate(show.length, (i) {
              final doc = show[i];
              final data = (doc.data() as Map<String, dynamic>);

              final storeId = doc.id;
              final storeName =
                  (data['name'] ?? data['vendorName'] ?? 'Store').toString();
              final logoUrl =
                  (data['logoUrl'] ?? data['vendorLogoUrl'] ?? '').toString();

              final variant = (i % 3 == 0)
                  ? _CardVariant.purple
                  : (i % 3 == 1)
                      ? _CardVariant.blue
                      : _CardVariant.green;

              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _StoreRowCard(
                  storeName: storeName,
                  meta: 'Store',
                  variant: variant,
                  logoUrl: logoUrl.isNotEmpty ? logoUrl : null,
                  onTap: () => onOpenStore(
                    storeId: storeId,
                    storeName: storeName,
                    logoUrl: logoUrl.isNotEmpty ? logoUrl : null,
                  ),
                ),
              );
            }),
          ],
        );
      },
    );
  }
}

class _TrendingStoresList extends StatelessWidget {
  final void Function({
  required String storeId,
  required String storeName,
  String? logoUrl,
  }) onOpenStore;

  const _TrendingStoresList({
    required this.onOpenStore,
  });

  @override
  Widget build(BuildContext context) {
    final stream = FirebaseFirestore.instance
        .collection('stores')
        .orderBy('updatedAt', descending: true)
        .limit(6)
        .snapshots();

    return StreamBuilder<QuerySnapshot>(
      stream: stream,
      builder: (context, snap) {
        if (snap.hasError) {
          return _InfoCard(
            title: 'Couldn’t load trending stores',
            subtitle: '${snap.error}',
          );
        }

        if (snap.connectionState == ConnectionState.waiting) {
          return const _LoadingList();
        }

        final docs = snap.data?.docs ?? [];
        if (docs.isEmpty) {
          return const _InfoCard(
            title: 'No trending stores yet',
            subtitle: 'Once stores exist in Firestore, they’ll appear here.',
          );
        }

        return Column(
          children: List.generate(docs.length, (i) {
            final data = docs[i].data() as Map<String, dynamic>;
            final storeId = docs[i].id;
            final storeName = (data['name'] ?? data['vendorName'] ?? 'Store').toString();
            final logoUrl = (data['logoUrl'] ?? data['vendorLogoUrl'] ?? '').toString();

            final variant = (i % 3 == 0)
                ? _CardVariant.orange
                : (i % 3 == 1)
                ? _CardVariant.pink
                : _CardVariant.blue;

            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _StoreRowCard(
                storeName: storeName,
                meta: null,
                variant: variant,
                logoUrl: logoUrl.isNotEmpty ? logoUrl : null,
                onTap: () => onOpenStore(
                  storeId: storeId,
                  storeName: storeName,
                  logoUrl: logoUrl.isNotEmpty ? logoUrl : null,
                ),
              ),
            );
          }),
        );
      },
    );
  }
}

//  NEW: GPS-based nearby list
class _NearbyGpsStoresList extends StatefulWidget {
  final void Function({
    required String storeId,
    required String storeName,
    String? logoUrl,
  }) onOpenStore;

  const _NearbyGpsStoresList({
    required this.onOpenStore,
  });

  @override
  State<_NearbyGpsStoresList> createState() => _NearbyGpsStoresListState();
}

class _NearbyGpsStoresListState extends State<_NearbyGpsStoresList> {
  bool _loading = true;
  String? _error;
  Position? _pos;

  @override
  void initState() {
    super.initState();
    _initLocation();
  }

  Future<void> _initLocation() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        setState(() {
          _loading = false;
          _error = 'Location services are off. Turn them on to see nearby stores.';
        });
        return;
      }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }

      if (permission == LocationPermission.denied) {
        setState(() {
          _loading = false;
          _error = 'Location permission denied.';
        });
        return;
      }

      if (permission == LocationPermission.deniedForever) {
        setState(() {
          _loading = false;
          _error =
              'Location permission permanently denied. Enable it in Settings.';
        });
        return;
      }

      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );

      if (!mounted) return;
      setState(() {
        _pos = pos;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Failed to get location: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const _LoadingList();

    if (_error != null) {
      return _InfoCard(
        title: 'Nearby unavailable',
        subtitle: _error!,
      );
    }

    final pos = _pos;
    if (pos == null) {
      return const _InfoCard(
        title: 'Nearby unavailable',
        subtitle: 'Could not read your location.',
      );
    }

    // We fetch candidate store IDs from the app database, then resolve
    // coordinates from the Neon-backed store address API.
    final stream = FirebaseFirestore.instance
        .collection('stores')
        .limit(80)
        .snapshots();

    return StreamBuilder<QuerySnapshot>(
      stream: stream,
      builder: (context, snap) {
        if (snap.hasError) {
          return _InfoCard(
            title: 'Couldn’t load stores',
            subtitle: '${snap.error}',
          );
        }

        if (!snap.hasData) return const _LoadingList();

        return FutureBuilder<List<_NearbyStoreItem>>(
          future: _loadNearbyStoresFromApi(pos, snap.data!.docs),
          builder: (context, nearbySnap) {
            if (nearbySnap.hasError) {
              return _InfoCard(
                title: 'Couldn’t load nearby stores',
                subtitle: '${nearbySnap.error}',
              );
            }

            if (!nearbySnap.hasData) return const _LoadingList();

            final show = nearbySnap.data!;
            if (show.isEmpty) {
              return const _InfoCard(
                title: 'No nearby stores yet',
                subtitle: 'No store addresses with coordinates were found.',
              );
            }

            return Column(
              children: List.generate(show.length, (i) {
                final s = show[i];

                final km = s.meters / 1000.0;
                final kmText = km < 1
                    ? '${(s.meters).round()} m'
                    : '${km.toStringAsFixed(1)} km';

                final variant = (i % 3 == 0)
                    ? _CardVariant.blue
                    : (i % 3 == 1)
                        ? _CardVariant.green
                        : _CardVariant.purple;

                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _StoreRowCard(
                    storeName: s.storeName,
                    meta: kmText,
                    variant: variant,
                    logoUrl: s.logoUrl,
                    onTap: () => widget.onOpenStore(
                      storeId: s.storeId,
                      storeName: s.storeName,
                      logoUrl: s.logoUrl,
                    ),
                  ),
                );
              }),
            );
          },
        );
      },
    );
  }

  Future<List<_NearbyStoreItem>> _loadNearbyStoresFromApi(
    Position pos,
    List<QueryDocumentSnapshot> docs,
  ) async {
    final items = <_NearbyStoreItem>[];

    for (final d in docs) {
      final data = d.data() as Map<String, dynamic>;
      final storeId = _storeIdFromDoc(d, data);
      final numericStoreId = int.tryParse(storeId);
      if (numericStoreId == null) continue;

      final fallbackName =
          (data['name'] ?? data['vendorName'] ?? data['storeName'] ?? 'Store')
              .toString();
      final logoUrl =
          (data['logoUrl'] ?? data['vendorLogoUrl'] ?? '').toString().trim();

      try {
        final addresses = await StoreApiService.fetchStoreAddresses(numericStoreId);
        for (final address in addresses) {
          final lat = _doubleValue(address['latitude']);
          final lng = _doubleValue(address['longitude']);
          if (lat == null || lng == null) continue;

          final storeName =
              (address['label'] ??
                      address['vendorName'] ??
                      address['businessName'] ??
                      fallbackName)
                  .toString();

          final meters = Geolocator.distanceBetween(
            pos.latitude,
            pos.longitude,
            lat,
            lng,
          );

          items.add(
            _NearbyStoreItem(
              storeId: storeId,
              storeName: storeName,
              logoUrl: logoUrl.isNotEmpty ? logoUrl : null,
              meters: meters,
            ),
          );
        }
      } catch (e) {
        debugPrint('Nearby stores: address lookup failed for $storeId: $e');
      }
    }

    items.sort((a, b) => a.meters.compareTo(b.meters));
    return items.take(10).toList();
  }

  String _storeIdFromDoc(DocumentSnapshot doc, Map<String, dynamic> data) {
    return (data['storeId'] ??
            data['vendorId'] ??
            data['vendorid'] ??
            doc.id)
        .toString()
        .trim();
  }

  double? _doubleValue(dynamic value) {
    if (value is num) return value.toDouble();
    if (value is String) return double.tryParse(value.trim());
    return null;
  }
}

class _NearbyStoreItem {
  final String storeId;
  final String storeName;
  final String? logoUrl;
  final double meters;

  _NearbyStoreItem({
    required this.storeId,
    required this.storeName,
    required this.logoUrl,
    required this.meters,
  });
}

class _NearbyNoGpsList extends StatelessWidget {
  final String uid;
  final void Function({
  required String storeId,
  required String storeName,
  String? logoUrl,
  }) onOpenStore;

  const _NearbyNoGpsList({
    required this.uid,
    required this.onOpenStore,
  });

  @override
  Widget build(BuildContext context) {
    // 1. Query only user's visits
    final stream = FirebaseFirestore.instance
        .collection('store_visits')
        .where('userId', isEqualTo: uid)
        .orderBy('visitedAt', descending: true)
        .limit(50)
        .snapshots();

    return StreamBuilder<QuerySnapshot>(
      stream: stream,
      builder: (context, snap) {
        if (snap.hasError) {
          return _InfoCard(
            title: 'Couldn’t calculate nearby stores',
            subtitle: '${snap.error}',
          );
        }

        if (snap.connectionState == ConnectionState.waiting) {
          return const _LoadingList();
        }

        final docs = snap.data?.docs ?? [];
        if (docs.isEmpty) {
          return const _InfoCard(
            title: 'No visit data yet',
            subtitle: 'Nearby uses your visit history to guess which stores you use most.',
          );
        }

        // 2. Aggregate counts client-side
        final Map<String, int> counts = {};
        final Map<String, String> names = {};
        // We'll also track order of appearance for "recent" fallback
        final List<String> recentOrder = [];

        for (final d in docs) {
          final data = d.data() as Map<String, dynamic>;
          final sid = (data['storeId'] ?? '').toString();
          if (sid.isEmpty) continue;

          counts[sid] = (counts[sid] ?? 0) + 1;
          
          if (!names.containsKey(sid)) {
            names[sid] = (data['storeName'] ?? sid).toString();
          }
          if (!recentOrder.contains(sid)) {
            recentOrder.add(sid);
          }
        }

        // 3. Sort by count (descending)
        final sortedIds = counts.keys.toList()
          ..sort((a, b) {
            final cA = counts[a]!;
            final cB = counts[b]!;
            if (cA != cB) return cB.compareTo(cA); // higher count first
            // tie-break: recency
            return recentOrder.indexOf(a).compareTo(recentOrder.indexOf(b));
          });

        // Top 5 "Nearby" (Most Visited)
        final top = sortedIds.take(5).toList();

        return Column(
          children: List.generate(top.length, (i) {
            final sid = top[i];
            final name = names[sid] ?? 'Store';
            final count = counts[sid]!;
            
            final variant = (i % 3 == 0)
                ? _CardVariant.green
                : (i % 3 == 1)
                ? _CardVariant.blue
                : _CardVariant.purple;

            // ✅ CHANGED: Use helper that fetches logoUrl
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _StoreWithLogoLookup(
                storeId: sid,
                fallbackName: name,
                meta: '$count visit${count == 1 ? '' : 's'}',
                variant: variant,
                onOpenStore: onOpenStore,
              ),
            );
          }),
        );
      },
    );
  }
}

class _FollowedStoresList extends StatelessWidget {
  final String uid;
  final void Function({
  required String storeId,
  required String storeName,
  String? logoUrl,
  }) onOpenStore;

  const _FollowedStoresList({
    required this.uid,
    required this.onOpenStore,
  });

  @override
  Widget build(BuildContext context) {
    final stream = FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .collection('followedStores')
        .orderBy('followedAt', descending: true)
        .limit(20)
        .snapshots();

    return StreamBuilder<QuerySnapshot>(
      stream: stream,
      builder: (context, snap) {
        if (snap.hasError) {
          return _InfoCard(
            title: 'Couldn’t load followed stores',
            subtitle: '${snap.error}',
          );
        }

        if (snap.connectionState == ConnectionState.waiting) {
          return const _LoadingList();
        }

        final docs = snap.data?.docs ?? [];
        if (docs.isEmpty) {
          return const _InfoCard(
            title: 'No followed stores yet',
            subtitle: 'Open a store and tap “Follow store” to save it here.',
          );
        }

        return Column(
          children: List.generate(docs.length.clamp(0, 10), (i) {
            final data = docs[i].data() as Map<String, dynamic>;
            final storeId = (data['storeId'] ?? docs[i].id).toString();
            final storeName = (data['storeName'] ?? 'Store').toString();
            final logoUrl = (data['logoUrl'] ?? '').toString();

            final variant = (i % 3 == 0)
                ? _CardVariant.purple
                : (i % 3 == 1)
                ? _CardVariant.blue
                : _CardVariant.green;

            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _StoreRowCard(
                storeName: storeName,
                meta: null,
                variant: variant,
                logoUrl: logoUrl.isNotEmpty ? logoUrl : null,
                onTap: () => onOpenStore(
                  storeId: storeId,
                  storeName: storeName,
                  logoUrl: logoUrl.isNotEmpty ? logoUrl : null,
                ),
              ),
            );
          }),
        );
      },
    );
  }
}

class _RecentVisitsList extends StatelessWidget {
  final String uid;
  final void Function({
  required String storeId,
  required String storeName,
  String? logoUrl,
  }) onOpenStore;

  const _RecentVisitsList({
    required this.uid,
    required this.onOpenStore,
  });

  @override
  Widget build(BuildContext context) {
    final stream = FirebaseFirestore.instance
        .collection('store_visits')
        .where('userId', isEqualTo: uid)
        .orderBy('visitedAt', descending: true)
        .limit(30)
        .snapshots();

    return StreamBuilder<QuerySnapshot>(
      stream: stream,
      builder: (context, snap) {
        if (snap.hasError) {
          return _InfoCard(
            title: 'Couldn’t load recent visits',
            subtitle: '${snap.error}',
          );
        }

        if (snap.connectionState == ConnectionState.waiting) {
          return const _LoadingList();
        }

        final docs = snap.data?.docs ?? [];
        if (docs.isEmpty) {
          return const _InfoCard(
            title: 'No visits yet',
            subtitle: 'Scan a store QR and your visits will show here.',
          );
        }

        final seen = <String>{};
        final items = <Map<String, dynamic>>[];

        for (final d in docs) {
          final data = d.data() as Map<String, dynamic>;
          final storeId = (data['storeId'] ?? '').toString();
          if (storeId.isEmpty || seen.contains(storeId)) continue;

          seen.add(storeId);
          items.add(data);
          if (items.length >= 10) break;
        }

        return Column(
          children: List.generate(items.length, (i) {
            final data = items[i];
            final storeId = (data['storeId'] ?? '').toString();
            final storeName = (data['storeName'] ?? 'Store').toString();

            final variant = (i % 3 == 0)
                ? _CardVariant.orange
                : (i % 3 == 1)
                ? _CardVariant.pink
                : _CardVariant.blue;

            // ✅ CHANGED: Use helper that fetches logoUrl
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _StoreWithLogoLookup(
                storeId: storeId,
                fallbackName: storeName,
                meta: null,
                variant: variant,
                onOpenStore: onOpenStore,
              ),
            );
          }),
        );
      },
    );
  }
}

class _LoadingList extends StatelessWidget {
  const _LoadingList();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: const [
        _StoreRowCard(
          storeName: 'Loading…',
          meta: null,
          variant: _CardVariant.purple,
          logoUrl: null,
          onTap: null,
        ),
        SizedBox(height: 10),
        _StoreRowCard(
          storeName: 'Loading…',
          meta: null,
          variant: _CardVariant.blue,
          logoUrl: null,
          onTap: null,
        ),
      ],
    );
  }
}

class _InfoCard extends StatelessWidget {
  final String title;
  final String subtitle;

  const _InfoCard({required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    return _ColorCard(
      variant: _CardVariant.neutral,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text(subtitle, style: const TextStyle(color: Colors.black54, height: 1.3)),
        ],
      ),
    );
  }
}

// ✅ NEW HELPER: Fetches stores/{id} to get logoUrl before rendering row
class _StoreWithLogoLookup extends StatelessWidget {
  final String storeId;
  final String fallbackName;
  final String? meta;
  final _CardVariant variant;
  final void Function({
    required String storeId,
    required String storeName,
    String? logoUrl,
  }) onOpenStore;

  const _StoreWithLogoLookup({
    required this.storeId,
    required this.fallbackName,
    required this.meta,
    required this.variant,
    required this.onOpenStore,
  });

  @override
  Widget build(BuildContext context) {
    // We assume storeId is valid. We fetch the store doc just to get logoUrl.
    return FutureBuilder<DocumentSnapshot>(
      future: FirebaseFirestore.instance.collection('stores').doc(storeId).get(),
      builder: (context, snap) {
        // While loading or error, just show with fallback name and no logo (or previous behavior)
        if (!snap.hasData) {
          return _StoreRowCard(
            storeName: fallbackName,
            meta: meta,
            variant: variant,
            logoUrl: null,
            onTap: () => onOpenStore(
              storeId: storeId,
              storeName: fallbackName,
              logoUrl: null,
            ),
          );
        }

        final data = snap.data?.data() as Map<String, dynamic>?;
        final logoUrl = (data?['logoUrl'] ?? data?['vendorLogoUrl'])?.toString();
        // If the store doc has a better name, use it, otherwise fallback
        final name = (data?['name'] ?? data?['vendorName'] ?? fallbackName).toString();

        return _StoreRowCard(
          storeName: name,
          meta: meta,
          variant: variant,
          logoUrl: (logoUrl != null && logoUrl.isNotEmpty) ? logoUrl : null,
          onTap: () => onOpenStore(
            storeId: storeId,
            storeName: name,
            logoUrl: (logoUrl != null && logoUrl.isNotEmpty) ? logoUrl : null,
          ),
        );
      },
    );
  }
}

class _StoreRowCard extends StatelessWidget {
  final String storeName;
  final String? meta;
  final String? logoUrl;
  final _CardVariant variant;
  final VoidCallback? onTap;

  const _StoreRowCard({
    required this.storeName,
    this.meta,
    this.logoUrl,
    required this.variant,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final initial = storeName.isNotEmpty ? storeName[0].toUpperCase() : '?';

    return _ColorCard(
      variant: variant,
      onTap: onTap,
      child: Row(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.65),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Center(
              child: (logoUrl != null && logoUrl!.isNotEmpty)
                  ? ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.network(
                  logoUrl!,
                  width: 40,
                  height: 40,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Text(
                    initial,
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
              )
                  : Text(
                initial,
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  storeName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.2,
                  ),
                ),
                if (meta != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    meta!,
                    style: const TextStyle(
                      fontSize: 12,
                      color: Colors.black54,
                    ),
                  ),
                ]
              ],
            ),
          ),
          const SizedBox(width: 12),
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.55),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(
              Icons.chevron_right,
              color: Colors.black87,
            ),
          ),
        ],
      ),
    );
  }
}

class _ColorCard extends StatelessWidget {
  final Widget child;
  final _CardVariant variant;
  final VoidCallback? onTap;

  const _ColorCard({
    required this.child,
    required this.variant,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final cfg = _variantConfig(variant);

    final card = Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: cfg.gradient,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: cfg.shadowColor.withOpacity(0.05),
            blurRadius: 6,
            offset: const Offset(0, 3),
          ),
        ],
        border: Border.all(color: Colors.white.withOpacity(0.16)),
      ),
      child: child,
    );

    if (onTap == null) return card;

    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: card,
    );
  }

  _VariantConfig _variantConfig(_CardVariant v) {
    switch (v) {
      case _CardVariant.purple:
        return _VariantConfig(
          gradient: [
            const Color(0xFF6D28D9).withOpacity(0.22),
            const Color(0xFF9333EA).withOpacity(0.16),
            const Color(0xFFFFFFFF).withOpacity(0.25),
          ],
          shadowColor: const Color(0xFF6D28D9),
        );
      case _CardVariant.blue:
        return _VariantConfig(
          gradient: [
            const Color(0xFF2563EB).withOpacity(0.20),
            const Color(0xFF06B6D4).withOpacity(0.14),
            const Color(0xFFFFFFFF).withOpacity(0.25),
          ],
          shadowColor: const Color(0xFF2563EB),
        );
      case _CardVariant.green:
        return _VariantConfig(
          gradient: [
            const Color(0xFF10B981).withOpacity(0.18),
            const Color(0xFF22C55E).withOpacity(0.14),
            const Color(0xFFFFFFFF).withOpacity(0.25),
          ],
          shadowColor: const Color(0xFF10B981),
        );
      case _CardVariant.orange:
        return _VariantConfig(
          gradient: [
            const Color(0xFFF97316).withOpacity(0.18),
            const Color(0xFFF59E0B).withOpacity(0.14),
            const Color(0xFFFFFFFF).withOpacity(0.25),
          ],
          shadowColor: const Color(0xFFF97316),
        );
      case _CardVariant.pink:
        return _VariantConfig(
          gradient: [
            const Color(0xFFEC4899).withOpacity(0.18),
            const Color(0xFFFB7185).withOpacity(0.14),
            const Color(0xFFFFFFFF).withOpacity(0.25),
          ],
          shadowColor: const Color(0xFFEC4899),
        );
      case _CardVariant.neutral:
      default:
        return _VariantConfig(
          gradient: [
            const Color(0xFF111827).withOpacity(0.06),
            const Color(0xFF6B7280).withOpacity(0.05),
            const Color(0xFFFFFFFF).withOpacity(0.25),
          ],
          shadowColor: const Color(0xFF111827),
        );
    }
  }
}

class _VariantConfig {
  final List<Color> gradient;
  final Color shadowColor;

  _VariantConfig({
    required this.gradient,
    required this.shadowColor,
  });
}

enum _CardVariant { purple, blue, green, orange, pink, neutral }
