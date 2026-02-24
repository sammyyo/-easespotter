import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:geolocator/geolocator.dart';
import 'package:easespotter/widgets/visited_stores_section.dart';

class MyVisitedStoresScreen extends StatefulWidget {
  const MyVisitedStoresScreen({super.key});

  @override
  State<MyVisitedStoresScreen> createState() => _MyVisitedStoresScreenState();
}

class _MyVisitedStoresScreenState extends State<MyVisitedStoresScreen> {
  late final PageController _pageController;
  int _selectedIndex = 0;

  @override
  void initState() {
    super.initState();
    _pageController = PageController(initialPage: _selectedIndex);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _setIndex(int index) {
    if (_selectedIndex == index) return;
    setState(() => _selectedIndex = index);

    _pageController.animateToPage(
      index,
      duration: const Duration(milliseconds: 260),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser?.uid;

    if (uid == null) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('My Stores'),
          centerTitle: true,
          backgroundColor: Colors.deepPurple,
          foregroundColor: Colors.white,
        ),
        body: const Center(child: Text('Sign in to see your visited stores.')),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'My Stores',
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
        centerTitle: true,
        backgroundColor: Colors.deepPurple,
        foregroundColor: Colors.white,
      ),
      body: Column(
        children: [
          _PillSwitchRow(
            selectedIndex: _selectedIndex,
            onSelect: _setIndex,
          ),

          Expanded(
            child: PageView(
              controller: _pageController,
              // Keep disabled if you prefer only button switching:
              physics: const NeverScrollableScrollPhysics(),
              onPageChanged: (i) => setState(() => _selectedIndex = i),
              children: [
                // Page 1: List View
                ListView(
                  children: [
                    VisitedStoresSection(userId: uid),
                    const SizedBox(height: 16),
                  ],
                ),

                // Page 2: Map View
                _VisitedStoresMap(userId: uid),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Two pill buttons (List / Map View) that sit under the AppBar.
/// No TabController / TabBar used.
class _PillSwitchRow extends StatelessWidget {
  final int selectedIndex;
  final ValueChanged<int> onSelect;

  const _PillSwitchRow({
    required this.selectedIndex,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final surface = isDark ? Colors.black12 : Colors.grey.shade100;
    final border = isDark ? Colors.white10 : Colors.black.withOpacity(0.06);

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
      decoration: BoxDecoration(
        color: surface,
        border: Border(bottom: BorderSide(color: border)),
      ),
      child: Container(
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
                label: 'List',
                selected: selectedIndex == 0,
                onTap: () => onSelect(0),
              ),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: _PillButton(
                label: 'Map View',
                selected: selectedIndex == 1,
                onTap: () => onSelect(1),
              ),
            ),
          ],
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

    final selectedBg = Colors.deepPurple.withOpacity(isDark ? 0.35 : 0.12);
    final selectedText = isDark ? Colors.white : Colors.deepPurple;

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

class _VisitedStoresMap extends StatefulWidget {
  final String userId;

  const _VisitedStoresMap({required this.userId});

  @override
  State<_VisitedStoresMap> createState() => _VisitedStoresMapState();
}

class _VisitedStoresMapState extends State<_VisitedStoresMap> {
  GoogleMapController? _mapController;
  final Set<Marker> _markers = {};
  bool _loading = true;
  String? _error;
  bool _permissionGranted = false;

  static const _initialTarget = LatLng(37.0902, -95.7129);

  @override
  void initState() {
    super.initState();
    _checkLocationPermission();
    _loadMapData();
  }

  Future<void> _checkLocationPermission() async {
    bool serviceEnabled;
    LocationPermission permission;

    serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return;

    permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) return;
    }

    if (permission == LocationPermission.deniedForever) return;

    if (mounted) setState(() => _permissionGranted = true);
  }

  Future<void> _loadMapData() async {
    try {
      final visitSnap = await FirebaseFirestore.instance
          .collection('store_visits')
          .where('userId', isEqualTo: widget.userId)
          .orderBy('visitedAt', descending: true)
          .limit(50)
          .get();

      if (visitSnap.docs.isEmpty) {
        if (mounted) setState(() => _loading = false);
        return;
      }

      final storeIds = visitSnap.docs
          .map((d) => (d.data()['storeId'] ?? '').toString())
          .where((id) => id.trim().isNotEmpty)
          .toSet()
          .toList();

      if (storeIds.isEmpty) {
        if (mounted) setState(() => _loading = false);
        return;
      }

      final Set<Marker> markers = {};
      final List<LatLng> points = [];

      for (final storeId in storeIds) {
        final doc =
        await FirebaseFirestore.instance.collection('stores').doc(storeId).get();
        if (!doc.exists) continue;

        final data = doc.data()!;
        final geo = data['geo'];
        if (geo is GeoPoint) {
          final latLng = LatLng(geo.latitude, geo.longitude);
          points.add(latLng);

          final name = data['name'] ?? data['vendorName'] ?? 'Store';

          markers.add(
            Marker(
              markerId: MarkerId(storeId),
              position: latLng,
              infoWindow: InfoWindow(
                title: name.toString(),
                snippet: 'Visited',
              ),
            ),
          );
        }
      }

      if (mounted) {
        setState(() {
          _markers.addAll(markers);
          _loading = false;
        });

        if (points.isNotEmpty && _mapController != null) {
          Future.delayed(const Duration(milliseconds: 300), () => _fitBounds(points));
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Failed to load map: $e';
          _loading = false;
        });
      }
    }
  }

  void _fitBounds(List<LatLng> points) {
    if (points.isEmpty || _mapController == null) return;

    double minLat = points.first.latitude;
    double maxLat = points.first.latitude;
    double minLng = points.first.longitude;
    double maxLng = points.first.longitude;

    for (final p in points) {
      if (p.latitude < minLat) minLat = p.latitude;
      if (p.latitude > maxLat) maxLat = p.latitude;
      if (p.longitude < minLng) minLng = p.longitude;
      if (p.longitude > maxLng) maxLng = p.longitude;
    }

    _mapController!.animateCamera(
      CameraUpdate.newLatLngBounds(
        LatLngBounds(
          southwest: LatLng(minLat, minLng),
          northeast: LatLng(maxLat, maxLng),
        ),
        50.0,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());

    if (_error != null) {
      return Center(child: Text(_error!, style: const TextStyle(color: Colors.red)));
    }

    if (_markers.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(20.0),
          child: Text(
            'No stores close to you yet.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.grey),
          ),
        ),
      );
    }

    return GoogleMap(
      initialCameraPosition: const CameraPosition(
        target: _initialTarget,
        zoom: 4,
      ),
      markers: _markers,
      myLocationEnabled: _permissionGranted,
      myLocationButtonEnabled: _permissionGranted,
      onMapCreated: (controller) {
        _mapController = controller;
        if (_markers.isNotEmpty) {
          final points = _markers.map((m) => m.position).toList();
          _fitBounds(points);
        }
      },
    );
  }
}
