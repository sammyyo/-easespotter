import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'home_screen.dart';
import 'qr_scanner_screen.dart';
import 'bookmarks_screen.dart';
import 'social_profile_screen.dart';



class MainScaffold extends StatefulWidget {
  const MainScaffold({super.key});

  @override
  State<MainScaffold> createState() => _MainScaffoldState();
}

class _MainScaffoldState extends State<MainScaffold> {
  int _currentIndex = 0;
  String? _avatarUrl;
  final bool _isPublicView = false;

  final List<String?> _titles = [
    null,
    'Scan Store QR Code',
    'Bookmarks',
    'Menu',
    'Profile',
  ];

  final List<Color> _tileColors = [
    Color(0xFFDBF0F7),
    Color(0xFFF5F5F5),
    Color(0xFFFAF1BE),
    Color(0xFFDBF1D8),
    Color(0xFFEEE2F4),
    Color(0xFFD8D0C3),
    Color(0xFFF0EFEB),
    Color(0xFFFFE0E0),
  ];

  @override
  void initState() {
    super.initState();
    _loadAvatar();
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
      {'icon': Icons.campaign, 'label': 'Promotions', 'route': '/promotions'},
      {'icon': Icons.list_alt, 'label': 'Grocery List', 'route': '/grocery-list'},
      {'icon': Icons.lightbulb, 'label': 'Motivation Preview', 'route': '/motivation-preview'},
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
    final isProfileTab = _currentIndex == 4;

    List<Widget> screens = [
      HomeScreen(onScanPressed: () => setState(() => _currentIndex = 1)),
      const QRScannerScreen(),
      BookmarksScreen(),
      _buildMenuScreen(),
      const SocialProfileScreen(),

    ];

    return Scaffold(
      appBar: isProfileTab
          ? null // Remove AppBar entirely when on SocialProfileScreen
          : AppBar(
        title: _titles[_currentIndex] != null
            ? Text(_titles[_currentIndex]!, style: const TextStyle(color: Colors.white))
            : null,
        centerTitle: true,
        backgroundColor: Colors.deepPurple,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: screens[_currentIndex],
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        selectedItemColor: Colors.deepPurple,
        unselectedItemColor: Colors.grey,
        backgroundColor: Colors.white,
        onTap: (index) async {
          setState(() => _currentIndex = index);
          if (index == 4) await _loadAvatar();
        },
        items: [
          const BottomNavigationBarItem(icon: Icon(Icons.home), label: 'Home'),
          const BottomNavigationBarItem(icon: Icon(Icons.qr_code_scanner), label: 'Scan'),
          const BottomNavigationBarItem(icon: Icon(Icons.bookmark), label: 'Bookmarks'),
          const BottomNavigationBarItem(icon: Icon(Icons.more_horiz), label: 'Menu'),
          BottomNavigationBarItem(
            icon: _avatarUrl != null
                ? CircleAvatar(radius: 12, backgroundImage: NetworkImage(_avatarUrl!))
                : const CircleAvatar(
              radius: 12,
              backgroundColor: Colors.deepPurple,
              child: Icon(Icons.person, size: 16, color: Colors.white),
            ),
            label: 'Profile',
          ),
        ],
      ),
    );
  }
}
