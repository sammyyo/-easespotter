import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../services/messaging_service.dart';

Future<void> showShareToConnectionsSheet(
  BuildContext context, {
  required String title,
  required String shareText,
}) async {
  final me = FirebaseAuth.instance.currentUser;
  if (me == null) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Sign in to share.')),
    );
    return;
  }

  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (sheetContext) {
      return _ShareToConnectionsSheet(
        rootContext: context,
        myUid: me.uid,
        title: title,
        shareText: shareText,
      );
    },
  );
}

class _ShareToConnectionsSheet extends StatefulWidget {
  final BuildContext rootContext;
  final String myUid;
  final String title;
  final String shareText;

  const _ShareToConnectionsSheet({
    required this.rootContext,
    required this.myUid,
    required this.title,
    required this.shareText,
  });

  @override
  State<_ShareToConnectionsSheet> createState() =>
      _ShareToConnectionsSheetState();
}

class _ShareToConnectionsSheetState extends State<_ShareToConnectionsSheet>
    with SingleTickerProviderStateMixin {
  final _messaging = MessagingService();
  final _db = FirebaseFirestore.instance;
  final Set<String> _sendingTo = {};
  late final TabController _tabController;
  late final Future<List<Map<String, dynamic>>> _followingUsersFuture;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _followingUsersFuture = _loadFollowingUsers();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<List<Map<String, dynamic>>> _loadFollowingUsers() async {
    final snap = await _db.collection('users').doc(widget.myUid).get();
    final data = snap.data() ?? {};
    final following = List<String>.from(data['following'] ?? []);

    if (following.isEmpty) return [];

    final chunks = <List<String>>[];
    for (var i = 0; i < following.length; i += 10) {
      final end = (i + 10) < following.length ? i + 10 : following.length;
      chunks.add(following.sublist(i, end));
    }

    final results = await Future.wait(
      chunks.map(
        (chunk) => _db
            .collection('users')
            .where(FieldPath.documentId, whereIn: chunk)
            .get(),
      ),
    );

    final users = <Map<String, dynamic>>[];
    for (final result in results) {
      for (final doc in result.docs) {
        users.add({
          'uid': doc.id,
          ...doc.data(),
        });
      }
    }
    return users;
  }

  Stream<QuerySnapshot<Map<String, dynamic>>> _followersStream() {
    return _db
        .collection('users')
        .where('following', arrayContains: widget.myUid)
        .snapshots();
  }

  Future<void> _sendShare(String otherUid) async {
    if (_sendingTo.contains(otherUid)) return;
    setState(() => _sendingTo.add(otherUid));

    try {
      final convoId = await _messaging.ensureConversation(otherUid: otherUid);
      await _messaging.sendTextMessage(
        convoId: convoId,
        otherUid: otherUid,
        text: widget.shareText,
      );

      if (!mounted) return;
      Navigator.pop(context);
      ScaffoldMessenger.of(widget.rootContext).showSnackBar(
        const SnackBar(content: Text('Shared in chat.')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Share failed: $e')),
      );
    } finally {
      if (mounted) setState(() => _sendingTo.remove(otherUid));
    }
  }

  Widget _buildUserTile(Map<String, dynamic> userData) {
    final uid = (userData['uid'] ?? '').toString();
    if (uid.isEmpty || uid == widget.myUid) return const SizedBox.shrink();

    final avatarUrl = (userData['avatarUrl'] ?? '').toString();
    final displayName =
        (userData['displayName'] ?? userData['name'] ?? 'User').toString();
    final handle = (userData['socialHandle'] ?? '').toString();

    return ListTile(
      leading: CircleAvatar(
        backgroundImage: avatarUrl.isNotEmpty ? NetworkImage(avatarUrl) : null,
        child: avatarUrl.isEmpty ? const Icon(Icons.person) : null,
      ),
      title: Text(displayName),
      subtitle: handle.isNotEmpty ? Text('@$handle') : null,
      trailing: _sendingTo.contains(uid)
          ? const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : TextButton(
              onPressed: () => _sendShare(uid),
              child: const Text('Send'),
            ),
      onTap: () => _sendShare(uid),
    );
  }

  Widget _buildFollowersTab(ScrollController controller) {
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: _followersStream(),
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snap.hasError) {
          return Center(child: Text('Error: ${snap.error}'));
        }
        final docs = snap.data?.docs ?? [];
        if (docs.isEmpty) {
          return const Center(child: Text('No followers yet.'));
        }
        return ListView.separated(
          controller: controller,
          itemCount: docs.length,
          separatorBuilder: (_, __) => const Divider(height: 1),
          itemBuilder: (context, i) {
            final data = docs[i].data();
            return _buildUserTile({'uid': docs[i].id, ...data});
          },
        );
      },
    );
  }

  Widget _buildFollowingTab(ScrollController controller) {
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: _followingUsersFuture,
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snap.hasError) {
          return Center(child: Text('Error: ${snap.error}'));
        }
        final users = snap.data ?? [];
        if (users.isEmpty) {
          return const Center(child: Text('Not following anyone.'));
        }
        return ListView.separated(
          controller: controller,
          itemCount: users.length,
          separatorBuilder: (_, __) => const Divider(height: 1),
          itemBuilder: (context, i) => _buildUserTile(users[i]),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.7,
      minChildSize: 0.45,
      maxChildSize: 0.9,
      builder: (context, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
          ),
          child: Column(
            children: [
              const SizedBox(height: 8),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.black12,
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        widget.title,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: () => Navigator.pop(context),
                    ),
                  ],
                ),
              ),
              TabBar(
                controller: _tabController,
                labelColor: Colors.deepPurple,
                unselectedLabelColor: Colors.grey,
                indicatorColor: Colors.deepPurple,
                tabs: const [
                  Tab(text: 'Followers'),
                  Tab(text: 'Following'),
                ],
              ),
              Expanded(
                child: TabBarView(
                  controller: _tabController,
                  children: [
                    _buildFollowersTab(scrollController),
                    _buildFollowingTab(scrollController),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
