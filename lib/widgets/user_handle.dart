import 'package:flutter/material.dart';
import 'package:easespotter/screens/public_profile_screen.dart';

class UserHandle extends StatelessWidget {
  final String handle;
  final String uid;

  const UserHandle({
    super.key,
    required this.handle,
    required this.uid,
  });

  @override
  Widget build(BuildContext context) {
    if (handle.isEmpty) {
      return const SizedBox.shrink(); // Don't display anything if the handle is empty
    }
    return InkWell(
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => PublicProfileScreen(uid: uid),
          ),
        );
      },
      child: Text(
        '@${handle.toLowerCase()}',
        style: const TextStyle(
          color: Colors.blue,
          // decoration: TextDecoration.underline, // Removed this line
          fontSize: 14, // You can adjust the style as needed
        ),
      ),
    );
  }
}