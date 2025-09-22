import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

class NotificationCenterScreen extends StatelessWidget {
  const NotificationCenterScreen({super.key});

  Future<void> _markAsRead(String uid, String notifId) async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    print('🔑 Current UID: $uid');
    await FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .collection('notifications')
        .doc(notifId)
        .update({'isRead': true});
  }

  Future<void> sendTestNotification() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    await FirebaseFirestore.instance
        .collection('users')
        .doc(user.uid)
        .collection('notifications')
        .add({
      'type': 'reaction',
      'actorUid': user.uid,
      'actorName': 'TestUser',
      'actorAvatarUrl': 'https://shafn.com/favicon.ico',
      'itemType': 'glowup',
      'itemId': 'glow123',
      'message': 'You liked your own glow-up!',
      'createdAt': FieldValue.serverTimestamp(),
      'isRead': false,
    });
  }

  Future<void> _deleteNotification(String uid, String notifId) async {
    await FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .collection('notifications')
        .doc(notifId)
        .delete();
  }

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return const Center(child: Text("Not logged in"));

    final notifStream = FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .collection('notifications')
        .orderBy('createdAt', descending: true)
        .snapshots();

    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.deepPurple,
        centerTitle: true,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text(
          "Notifications",
          style: TextStyle(color: Colors.white),
        ),
      ),
      body: StreamBuilder<QuerySnapshot>(
        stream: notifStream,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            print('🔥 Notification stream error: ${snapshot.error}');
            return const Center(child: Text("Error loading notifications."));
          }

          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }

          final docs = snapshot.data!.docs;

          if (docs.isEmpty) {
            return const Center(child: Text("No notifications yet."));
          }

          return ListView.separated(
            itemCount: docs.length,
            separatorBuilder: (_, __) => const Divider(),
            itemBuilder: (context, i) {
              final doc = docs[i];
              final data = doc.data() as Map<String, dynamic>;

              final isRead = data['isRead'] ?? false;
              final msg = data['message'] ?? '[No message]';
              final time = (data['createdAt'] as Timestamp?)?.toDate();
              final displayTime = time != null
                  ? time.toLocal().toString().split('.').first
                  : 'Just now';

              return ListTile(
                tileColor: isRead ? null : Colors.deepPurple.shade50,
                title: Text(msg),
                subtitle: Text(displayTime),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (!isRead)
                      IconButton(
                        icon: const Icon(Icons.done, color: Colors.green),
                        onPressed: () => _markAsRead(uid, doc.id),
                        tooltip: 'Mark as read',
                      ),
                    IconButton(
                      icon: const Icon(Icons.delete, color: Colors.red),
                      onPressed: () => _deleteNotification(uid, doc.id),
                      tooltip: 'Delete',
                    ),
                  ],
                ),
              );
            },
          );
        },
      ),
    );
  }
}
