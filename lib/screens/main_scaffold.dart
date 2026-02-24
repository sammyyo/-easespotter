import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../services/presence_service.dart';
import '../widgets/app_bottom_nav.dart';
import 'home_screen.dart';
import 'qr_scanner_screen.dart';
import 'social_profile_screen.dart';

class MainScaffold extends StatefulWidget {
  final int initialIndex;
  const MainScaffold({super.key, this.initialIndex = 0});

  @override
  State<MainScaffold> createState() => _MainScaffoldState();
}

class _MainScaffoldState extends State<MainScaffold> with WidgetsBindingObserver {
  late int _currentIndex;
  int _profileResetNonce = 0;
  String? _avatarUrl;
  final bool _isPublicView = false;
  final PresenceService _presence = PresenceService();

  final List<String?> _titles = [
    null,
    'Scan Store QR Code',
    'Menu',
    'Profile',
  ];

  final List<Color> _tileColors = [
    Color(0xFFDBF0F7), // Followed
    Color(0xFFFFE0B2), // My Stores
    Color(0xFFFAF1BE), // Bookmarks (New color slot or reused)
    Color(0xFFDBF1D8), // Promotions
    Color(0xFFEEE2F4), // Grocery List
    Color(0xFFD8D0C3), // Motivation
    Color(0xFFF0EFEB), // Settings
    Color(0xFFFFE0E0), // About
  ];

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex;
    WidgetsBinding.instance.addObserver(this);
    _presence.setOnline();
    _presence.startHeartbeat();
    _loadAvatar();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _presence.stopHeartbeat();
    _presence.setOffline();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _presence.setOnline();
      _presence.startHeartbeat();
    } else if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive ||
        state == AppLifecycleState.detached) {
      _presence.setOffline();
      _presence.stopHeartbeat();
    }
  }

  Future<void> _loadAvatar() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    final doc = await FirebaseFirestore.instance.collection('users').doc(user.uid).get();
    if (doc.exists && doc.data()?['avatarUrl'] != null) {
      setState(() {
        _avatarUrl = doc['avatarUrl'];
      });
    }
  }


  Widget _buildMenuScreen() {
    final List<Map<String, dynamic>> items = [
      {'icon': Icons.store, 'label': 'Followed Stores', 'route': '/followed-stores'},
      {'icon': Icons.history, 'label': 'My Stores', 'route': '/my-stores'},
      {'icon': Icons.bookmark, 'label': 'Bookmarks', 'route': '/bookmarks'},
      {'icon': Icons.campaign, 'label': 'Promotions', 'route': '/promotions'},
      {'icon': Icons.list_alt, 'label': 'Grocery List', 'route': '/grocery-list'},
      {'icon': Icons.settings, 'label': 'Settings', 'route': '/settings'},
      {'icon': Icons.info, 'label': 'About', 'route': '/about'},
    ];

    return GridView.builder(
      padding: const EdgeInsets.all(20),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 20,
        mainAxisSpacing: 20,
      ),
      itemCount: items.length,
      itemBuilder: (context, index) {
        final item = items[index];
        final color = _tileColors[index % _tileColors.length];
        return InkWell(
          onTap: () {
            if (item['route'] != null) {
              Navigator.pushNamed(context, item['route']);
            }
          },
          borderRadius: BorderRadius.circular(16),
          child: Container(
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: Colors.grey.withOpacity(0.2),
                  blurRadius: 5,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(item['icon'], size: 40, color: Colors.black),
                const SizedBox(height: 10),
                Text(
                  item['label'],
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    // Profile is now index 3 (0: Home, 1: Scan, 2: Menu, 3: Profile)
    final isProfileTab = _currentIndex == 3;
    final appBarTitleStyle =
        Theme.of(context).appBarTheme.titleTextStyle ??
        Theme.of(context).textTheme.titleLarge;

    List<Widget> screens = [
      HomeScreen(onScanPressed: () => setState(() => _currentIndex = 1)),
      const QRScannerScreen(),
      _buildMenuScreen(),
      SocialProfileScreen(key: ValueKey('profile_tab_$_profileResetNonce')),
    ];

    return Scaffold(
      appBar: isProfileTab
          ? null // Remove AppBar entirely when on SocialProfileScreen
          : AppBar(
        title: _titles[_currentIndex] != null
            ? Text(
                _titles[_currentIndex]!,
                style: (appBarTitleStyle ?? const TextStyle()).copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                ),
              )
            : null,
        centerTitle: true,
        backgroundColor: Colors.deepPurple,
        iconTheme: const IconThemeData(color: Colors.white),
        actions: const [],
      ),
      body: screens[_currentIndex],
      bottomNavigationBar: AppBottomNav(
        currentIndex: _currentIndex,
        avatarUrl: _avatarUrl,
        onTap: (index) async {
          if (index == 3) {
            final alreadyOnProfile = _currentIndex == 3;
            setState(() {
              _currentIndex = 3;
              if (alreadyOnProfile) {
                // Recreate SocialProfileScreen so it resolves back to my profile.
                _profileResetNonce++;
              }
            });
            await _loadAvatar();
            return;
          }
          setState(() => _currentIndex = index);
        },
      ),
    );
  }
}
