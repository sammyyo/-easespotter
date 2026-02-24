// archived_inbox_screen.dart
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../services/messaging_service.dart';
import 'chat_screen.dart';

class ArchivedInboxScreen extends StatefulWidget {
  const ArchivedInboxScreen({super.key});

  @override
  State<ArchivedInboxScreen> createState() => _ArchivedInboxScreenState();
}

class _ArchivedInboxScreenState extends State<ArchivedInboxScreen> {
  final MessagingService _messaging = MessagingService();
  final FirebaseFirestore _db = FirebaseFirestore.instance;

  final Map<String, Map<String, dynamic>?> _userCache = {};

  String? get _myUid => FirebaseAuth.instance.currentUser?.uid;

  DocumentReference<Map<String, dynamic>> _convoRef(String convoId) =>
      _db.collection('conversations').doc(convoId);

  DocumentReference<Map<String, dynamic>> _inboxRef(String uid, String convoId) =>
      _db.collection('users').doc(uid).collection('inbox').doc(convoId);

  Future<Map<String, dynamic>?> _fetchUserCached(String uid) async {
    if (_userCache.containsKey(uid)) return _userCache[uid];

    final snap = await _db.collection('users').doc(uid).get();
    final data = snap.data();
    _userCache[uid] = data;
    return data;
  }

  String _displayName(Map<String, dynamic>? user, String fallbackUid) {
    if (user == null) return fallbackUid;

    final handle = user['handle'];
    final name = user['displayName'];

    if (handle is String && handle.trim().isNotEmpty) {
      final clean = handle.trim().replaceAll('@', '');
      return "@$clean";
    }
    if (name is String && name.trim().isNotEmpty) return name.trim();

    return fallbackUid;
  }

  String? _avatarUrl(Map<String, dynamic>? user) {
    final v = user?['avatarUrl'];
    return (v is String && v.trim().isNotEmpty) ? v.trim() : null;
  }

  String _formatTime(Timestamp? ts) {
    if (ts == null) return "";
    final dt = ts.toDate();
    final now = DateTime.now();

    final sameDay = dt.year == now.year && dt.month == now.month && dt.day == now.day;

    if (sameDay) {
      final h = dt.hour.toString().padLeft(2, '0');
      final m = dt.minute.toString().padLeft(2, '0');
      return "$h:$m";
    }

    final d = dt.day.toString().padLeft(2, '0');
    final mo = dt.month.toString().padLeft(2, '0');
    return "$d/$mo";
  }

  bool _isTrue(Map<String, dynamic> data, String key) {
    final v = data[key];
    return v == true;
  }

  Future<void> _unarchiveConversation(String convoId) async {
    final uid = _myUid;
    if (uid == null) return;

    // ✅ This is what BOTH screens should use:
    // users/{uid}/inbox/{convoId}.archived
    await _inboxRef(uid, convoId).set({
      'archived': false,
      'archivedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));

    // Optional: keep your conversation-level map too (safe)
    await _convoRef(convoId).set({
      'archivedBy': {uid: false},
      'archivedAt': {uid: FieldValue.serverTimestamp()},
    }, SetOptions(merge: true));
  }

  @override
  Widget build(BuildContext context) {
    final uid = _myUid;

    if (uid == null) {
      return Scaffold(
        appBar: AppBar(
          backgroundColor: Colors.deepPurple,
          centerTitle: true,
          iconTheme: const IconThemeData(color: Colors.white),
          title: const Text(
            "Archived",
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
          ),
        ),
        body: const Center(child: Text("Please sign in.")),
      );
    }

    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.deepPurple,
        centerTitle: true,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text(
          "Archived",
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
      body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: _messaging.inboxStream(), // must be users/{uid}/inbox
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return Center(child: Text("Error: ${snapshot.error}"));
          }
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }

          final docs = snapshot.data!.docs;

          // ✅ archived == true, deleted != true
          final archivedDocs = docs.where((d) {
            final data = d.data();
            final convoId = (data['conversationId'] as String?) ?? d.id;

            final archived = _isTrue(data, 'archived');
            final deleted = _isTrue(data, 'deleted');

            return archived && !deleted && convoId.isNotEmpty;
          }).toList();

          if (archivedDocs.isEmpty) {
            return const Center(child: Text("No archived conversations."));
          }

          return ListView.builder(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: archivedDocs.length,
            itemBuilder: (context, index) {
              final doc = archivedDocs[index];
              final data = doc.data();

              final convoId = (data['conversationId'] as String?) ?? doc.id;
              final otherUid = (data['otherUid'] as String?) ?? '';
              final lastMessage = (data['lastMessage'] as String?) ?? '';
              final unread = (data['unreadCount'] as int?) ?? 0;
              final lastAt = data['lastMessageAt'] as Timestamp?;

              if (otherUid.isEmpty) return const SizedBox.shrink();

              return FutureBuilder<Map<String, dynamic>?>(
                future: _fetchUserCached(otherUid),
                builder: (context, userSnap) {
                  final userData = userSnap.data;
                  final title = _displayName(userData, otherUid);
                  final avatar = _avatarUrl(userData);
                  final time = _formatTime(lastAt);

                  return Dismissible(
                    key: ValueKey("archived_$convoId"),
                    direction: DismissDirection.startToEnd,
                    background: Container(
                      color: Colors.green,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      alignment: Alignment.centerLeft,
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.unarchive, color: Colors.white),
                          SizedBox(width: 8),
                          Text(
                            "Unarchive",
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
                        await _unarchiveConversation(convoId);
                        if (!mounted) return false;

                        final snack = ScaffoldMessenger.of(context);
                        snack.hideCurrentSnackBar();
                        snack.showSnackBar(
                          const SnackBar(content: Text("Conversation unarchived")),
                        );
                        return true;
                      } catch (e) {
                        if (!mounted) return false;
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text("Unarchive failed: $e")),
                        );
                        return false;
                      }
                    },
                    child: Column(
                      children: [
                        ListTile(
                          onTap: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => ChatScreen(
                                  conversationId: convoId,
                                  otherUid: otherUid,
                                  otherDisplayName: title,
                                ),
                              ),
                            );
                          },
                          leading: CircleAvatar(
                            radius: 22,
                            backgroundImage: avatar != null ? NetworkImage(avatar) : null,
                            child: avatar == null ? const Icon(Icons.person) : null,
                          ),
                          title: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  title,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontWeight: FontWeight.w700),
                                ),
                              ),
                              if (time.isNotEmpty)
                                Text(
                                  time,
                                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                                ),
                            ],
                          ),
                          subtitle: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  lastMessage,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    color: Colors.grey.shade700,
                                    fontWeight: unread > 0 ? FontWeight.w600 : FontWeight.w400,
                                  ),
                                ),
                              ),
                              if (unread > 0)
                                Container(
                                  margin: const EdgeInsets.only(left: 8),
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: Colors.redAccent,
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                  child: Text(
                                    unread.toString(),
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                        const Divider(height: 1),
                      ],
                    ),
                  );
                },
              );
            },
          );
        },
      ),
    );
  }
}
