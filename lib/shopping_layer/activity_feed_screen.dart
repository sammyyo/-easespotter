import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class ActivityFeedScreen extends StatelessWidget {
  const ActivityFeedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return const Center(child: Text("Not logged in",));

    return Scaffold(
      appBar: AppBar(title: const Text("Activity Feed",
        style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
      )),
      body: StreamBuilder<QuerySnapshot>(
        stream: FirebaseFirestore.instance
            .collection('users')
            .doc(uid)
            .collection('activity_feed')
            .orderBy('createdAt', descending: true)
            .limit(50)
            .snapshots(),
        builder: (context, snapshot) {
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
          final docs = snapshot.data!.docs;

          if (docs.isEmpty) return const Center(child: Text("No recent activity."));

          return ListView.separated(
            itemCount: docs.length,
            separatorBuilder: (_, __) => const Divider(),
            itemBuilder: (context, i) {
              final data = docs[i].data() as Map<String, dynamic>;
              final msg = data['message'] ?? '';
              final time = (data['createdAt'] as Timestamp?)?.toDate();
              final displayTime = time != null ? time.toLocal().toString().split('.').first : 'Just now';

              return ListTile(
                leading: data['actorAvatarUrl'] != null
                    ? CircleAvatar(backgroundImage: NetworkImage(data['actorAvatarUrl']))
                    : const CircleAvatar(child: Icon(Icons.person)),
                title: Text(msg),
                subtitle: Text(displayTime),
                onTap: () {
                  // Optional: Navigate to related item if needed
                  final itemId = data['itemId'];
                  final itemType = data['itemType'];
                  if (itemType == 'mission') {
                    Navigator.pushNamed(context, '/mission/$itemId');
                  }
                  // Add other itemTypes as needed
                },
              );
            },
          );
        },
      ),
    );
  }
}
