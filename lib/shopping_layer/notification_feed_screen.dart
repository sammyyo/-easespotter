import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

class NotificationCenterScreen extends StatelessWidget {
  const NotificationCenterScreen({super.key});

  Future<void> _markAsRead(String uid, String notifId) async {
    await FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .collection('notifications')
        .doc(notifId)
        .update({'isRead': true});
  }

  Future<void> _deleteNotification(String uid, String notifId) async {
    await FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .collection('notifications')
        .doc(notifId)
        .delete();
  }

  String _timeAgo(DateTime? dt) {
    if (dt == null) return "Just now";
    final diff = DateTime.now().difference(dt);

    if (diff.inSeconds < 10) return "Just now";
    if (diff.inMinutes < 1) return "${diff.inSeconds}s ago";
    if (diff.inHours < 1) return "${diff.inMinutes}m ago";
    if (diff.inDays < 1) return "${diff.inHours}h ago";
    if (diff.inDays < 7) return "${diff.inDays}d ago";

    final d = dt.day.toString().padLeft(2, '0');
    final m = dt.month.toString().padLeft(2, '0');
    final y = dt.year.toString();
    return "$d/$m/$y";
  }

  IconData _iconForType(String? type) {
    switch (type) {
      case "reaction":
        return Icons.favorite;
      case "comment":
        return Icons.chat_bubble;
      case "follow":
        return Icons.person_add;
      case "message":
        return Icons.mark_chat_unread;
      default:
        return Icons.notifications;
    }
  }

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) {
      return const Scaffold(
        body: Center(child: Text("Not logged in")),
      );
    }

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
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
        ),
        actions: const [],
      ),
      body: StreamBuilder<QuerySnapshot>(
        stream: notifStream,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return Center(
              child: Text("Error loading notifications: ${snapshot.error}"),
            );
          }

          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }

          final docs = snapshot.data!.docs;

          if (docs.isEmpty) {
            return const Center(child: Text("No notifications yet."));
          }

          // unread count (for header)
          final unreadCount = docs.where((d) {
            final data = d.data() as Map<String, dynamic>;
            return (data['isRead'] as bool?) == false;
          }).length;

          return Column(
            children: [
              //  small header (WhatsApp-ish)
              Container(
                width: double.infinity,
                color: Colors.white,
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                child: Row(
                  children: [
                    Container(
                      height: 10,
                      width: 10,
                      decoration: BoxDecoration(
                        color: unreadCount > 0 ? Colors.deepPurple : Colors.grey.shade400,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Text(
                      unreadCount > 0 ? "Unread ($unreadCount)" : "All caught up",
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        color: Colors.grey.shade900,
                      ),
                    ),
                    const Spacer(),
                  ],
                ),
              ),
              const Divider(height: 1),

              Expanded(
                child: ListView.separated(
                  itemCount: docs.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (context, i) {
                    final doc = docs[i];
                    final data = doc.data() as Map<String, dynamic>;

                    final isRead = (data['isRead'] as bool?) ?? false;
                    final msg = (data['message'] as String?) ?? '[No message]';
                    final type = data['type'] as String?;
                    final actorName = (data['actorName'] as String?) ?? "";
                    final actorAvatarUrl = data['actorAvatarUrl'] as String?;
                    final createdAt = (data['createdAt'] as Timestamp?)?.toDate();

                    final leadingIcon = _iconForType(type);
                    final timeLabel = _timeAgo(createdAt);

                    //  swipe-to-delete (no delete icon shown)
                    return Dismissible(
                      key: ValueKey("notif_${doc.id}"),
                      direction: DismissDirection.endToStart,
                      background: Container(
                        color: Colors.redAccent,
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        alignment: Alignment.centerRight,
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.delete, color: Colors.white),
                            SizedBox(width: 8),
                            Text(
                              "Delete",
                              style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ],
                        ),
                      ),
                      confirmDismiss: (_) async {
                        try {
                          await _deleteNotification(uid, doc.id);
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text("Notification deleted")),
                          );
                          return true;
                        } catch (e) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text("Delete failed: $e")),
                          );
                          return false;
                        }
                      },
                      child: Container(
                        color: isRead ? Colors.white : Colors.deepPurple.shade50,
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        child: ListTile(
                          onTap: () async {
                            //  tap marks as read
                            if (!isRead) {
                              try {
                                await _markAsRead(uid, doc.id);
                              } catch (_) {}
                            }
                            // Later we can route user based on itemType/itemId
                          },
                          leading: Stack(
                            clipBehavior: Clip.none,
                            children: [
                              CircleAvatar(
                                radius: 22,
                                backgroundColor: Colors.deepPurple.withOpacity(0.12),
                                backgroundImage: actorAvatarUrl != null
                                    ? NetworkImage(actorAvatarUrl)
                                    : null,
                                child: actorAvatarUrl == null
                                    ? Icon(leadingIcon, color: Colors.deepPurple)
                                    : null,
                              ),
                              // unread dot (top-right)
                              if (!isRead)
                                Positioned(
                                  top: -1,
                                  right: -1,
                                  child: Container(
                                    height: 10,
                                    width: 10,
                                    decoration: BoxDecoration(
                                      color: Colors.deepPurple,
                                      shape: BoxShape.circle,
                                      border: Border.all(color: Colors.white, width: 2),
                                    ),
                                  ),
                                ),
                            ],
                          ),
                          title: Text(
                            msg,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontWeight: isRead ? FontWeight.w600 : FontWeight.w800,
                              color: Colors.grey.shade900,
                            ),
                          ),
                          subtitle: Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Row(
                              children: [
                                if (actorName.trim().isNotEmpty) ...[
                                  Text(
                                    actorName,
                                    style: TextStyle(
                                      fontWeight: FontWeight.w700,
                                      color: Colors.grey.shade800,
                                    ),
                                  ),
                                  const Text(" • "),
                                ],
                                Text(
                                  timeLabel,
                                  style: TextStyle(
                                    color: Colors.grey.shade600,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ),

                          //  3-dots menu (⋮)
                          trailing: PopupMenuButton<String>(
                            icon: const Icon(Icons.more_vert),
                            onSelected: (value) async {
                              if (value == "read") {
                                try {
                                  await _markAsRead(uid, doc.id);
                                } catch (_) {}
                              } else if (value == "delete") {
                                try {
                                  await _deleteNotification(uid, doc.id);
                                } catch (_) {}
                              }
                            },
                            itemBuilder: (_) => [
                              if (!isRead)
                                const PopupMenuItem(
                                  value: "read",
                                  child: Text("Mark as read"),
                                ),
                              const PopupMenuItem(
                                value: "delete",
                                child: Row(
                                  children: [
                                    Icon(
                                      Icons.delete,
                                      size: 18,
                                      color: Colors.red,
                                    ),
                                    SizedBox(width: 10),
                                    Text("Delete"),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
