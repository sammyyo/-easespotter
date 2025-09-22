import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class AttributionTag extends StatelessWidget {
  final String uid;
  final bool showDate;

  const AttributionTag({super.key, required this.uid, this.showDate = false});

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<DocumentSnapshot>(
      future: FirebaseFirestore.instance.collection('users').doc(uid).get(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const SizedBox.shrink();
        }

        final data = snapshot.data!.data() as Map<String, dynamic>?;

        if (data == null) return const Text('Unknown User');

        final avatarUrl = data['avatarUrl'] as String?;
        final displayName = data['displayName'] ?? 'Anonymous';
        final handle = data['socialHandle'] ?? '';
        final createdAt = (data['createdAt'] as Timestamp?)?.toDate();

        return Row(
          children: [
            CircleAvatar(
              radius: 14,
              backgroundImage:
              (avatarUrl != null && avatarUrl.isNotEmpty) ? NetworkImage(avatarUrl) : null,
              backgroundColor: Colors.deepPurple,
              child: avatarUrl == null
                  ? const Icon(Icons.person, size: 16, color: Colors.white)
                  : null,
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(displayName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                if (handle.isNotEmpty)
                  Text('@$handle', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                if (showDate && createdAt != null)
                  Text(
                    'Joined ${createdAt.toLocal().toString().split(' ').first}',
                    style: const TextStyle(fontSize: 11, color: Colors.grey),
                  ),
              ],
            ),
          ],
        );
      },
    );
  }
}

