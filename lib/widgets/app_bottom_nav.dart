import 'package:flutter/material.dart';

class AppBottomNav extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onTap;
  final String? avatarUrl;

  const AppBottomNav({
    super.key,
    required this.currentIndex,
    required this.onTap,
    this.avatarUrl,
  });

  @override
  Widget build(BuildContext context) {
    return BottomNavigationBar(
      currentIndex: currentIndex,
      selectedItemColor: const Color(0xFF006677),
      unselectedItemColor: Colors.grey,
      backgroundColor: Colors.white,
      onTap: onTap,
      items: [
        const BottomNavigationBarItem(icon: Icon(Icons.home), label: 'Home'),
        const BottomNavigationBarItem(
          icon: Icon(Icons.qr_code_scanner),
          label: 'Scan',
        ),
        const BottomNavigationBarItem(
          icon: Icon(Icons.more_horiz),
          label: 'Menu',
        ),
        BottomNavigationBarItem(
          icon:
              avatarUrl != null && avatarUrl!.isNotEmpty
                  ? CircleAvatar(
                    radius: 12,
                    backgroundImage: NetworkImage(avatarUrl!),
                  )
                  : const CircleAvatar(
                    radius: 12,
                    backgroundColor: const Color(0xFF006677),
                    child: Icon(Icons.person, size: 16, color: Colors.white),
                  ),
          label: 'Profile',
        ),
      ],
    );
  }
}
