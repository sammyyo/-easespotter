import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../services/messaging_service.dart';
import 'archived_inbox_screen.dart';
import 'chat_screen.dart';

class InboxScreen extends StatefulWidget {
  const InboxScreen({super.key});

  @override
  State<InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends State<InboxScreen> {
  final MessagingService _messaging = MessagingService();
  final FirebaseFirestore _db = FirebaseFirestore.instance;

  final TextEditingController _searchController = TextEditingController();
  bool _showSearch = false;
  String _query = "";

  bool _unreadOnly = false;

  final Map<String, Map<String, dynamic>?> _userCache = {};
  // NEW: cache futures to avoid refetch + micro flicker during rebuilds
  final Map<String, Future<Map<String, dynamic>?>> _userFutureCache = {};

  final Set<String> _locallyHiddenConvos = {};

  String? get _myUid => FirebaseAuth.instance.currentUser?.uid;

  DocumentReference<Map<String, dynamic>> _convoRef(String convoId) =>
      _db.collection('conversations').doc(convoId);

  DocumentReference<Map<String, dynamic>> _inboxRef(String uid, String convoId) =>
      _db.collection('users').doc(uid).collection('inbox').doc(convoId);

  // NEW: heuristic to detect UID-like strings so we never show them as a “name”
  bool _looksLikeUid(String s) {
    final v = s.trim();
    if (v.isEmpty) return false;
    return v.length >= 20 && !v.contains(' ') && v.contains(RegExp(r'[0-9]'));
  }

  // NEW: safe immediate title from inbox doc (never UID)
  String _safeImmediateNameFromInboxDoc(Map<String, dynamic> inboxDoc, String otherUid) {
    final raw = (inboxDoc['otherDisplayName'] ?? '').toString().trim();
    if (raw.isEmpty) return "Loading…";
    if (raw == otherUid) return "Loading…";
    if (_looksLikeUid(raw)) return "Loading…";
    return raw;
  }

  // UPDATED: fetch with stable future caching
  Future<Map<String, dynamic>?> _fetchUserCached(String uid) {
    if (_userCache.containsKey(uid)) return Future.value(_userCache[uid]);
    if (_userFutureCache.containsKey(uid)) return _userFutureCache[uid]!;

    final fut = _db.collection('users').doc(uid).get().then((snap) {
      final data = snap.data();
      _userCache[uid] = data;
      return data;
    });

    _userFutureCache[uid] = fut;
    return fut;
  }

  // UPDATED: do NOT return fallbackUid if it looks like UID
  String _displayName(Map<String, dynamic>? user, String fallback) {
    if (user == null) {
      // never show uid-like fallback
      return _looksLikeUid(fallback) ? "Loading…" : fallback;
    }

    final handle = user['handle'];
    final name = user['displayName'];

    if (handle is String && handle.trim().isNotEmpty) {
      final clean = handle.trim().replaceAll('@', '');
      return "@$clean";
    }
    if (name is String && name.trim().isNotEmpty) return name.trim();

    // never show uid-like fallback
    return _looksLikeUid(fallback) ? "Loading…" : fallback;
  }

  String? _avatarUrl(Map<String, dynamic>? user) {
    final v = user?['avatarUrl'];
    return (v is String && v.trim().isNotEmpty) ? v.trim() : null;
  }

  bool _isOnline(Map<String, dynamic>? user) {
    if (user == null) return false;

    final isOnline = user['isOnline'];
    if (isOnline is bool) return isOnline;

    final lastActive = user['lastActive'];
    if (lastActive is Timestamp) {
      final dt = lastActive.toDate();
      final diff = DateTime.now().difference(dt);
      return diff.inMinutes < 2;
    }
    return false;
  }

  String _formatTime(Timestamp? ts) {
    if (ts == null) return "";

    final dt = ts.toDate();
    final now = DateTime.now();

    final today = DateTime(now.year, now.month, now.day);
    final msgDay = DateTime(dt.year, dt.month, dt.day);
    final diffDays = today.difference(msgDay).inDays;

    // Today → 14:32
    if (diffDays == 0) {
      final h = dt.hour.toString().padLeft(2, '0');
      final m = dt.minute.toString().padLeft(2, '0');
      return "$h:$m";
    }

    // Yesterday
    if (diffDays == 1) {
      return "Yesterday";
    }

    // Within last 7 days → Mon, Tue, etc.
    if (diffDays < 7) {
      const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      return weekdays[dt.weekday - 1];
    }

    // Older → 12/09
    final d = dt.day.toString().padLeft(2, '0');
    final mo = dt.month.toString().padLeft(2, '0');
    return "$d/$mo";
  }


  void _toggleSearch() {
    setState(() {
      _showSearch = !_showSearch;
      if (!_showSearch) {
        _searchController.clear();
        _query = "";
      }
    });
  }

  void _onSearchChanged(String v) {
    setState(() => _query = v.trim().toLowerCase());
  }

  void _clearSearch() {
    setState(() {
      _searchController.clear();
      _query = "";
    });
  }

  bool _matchesQuery({
    required String title,
    required String lastMessage,
  }) {
    if (_query.isEmpty) return true;
    return title.toLowerCase().contains(_query) ||
        lastMessage.toLowerCase().contains(_query);
  }

  bool _isTrue(Map<String, dynamic> data, String key) => data[key] == true;

  Future<void> _archiveConversation(String convoId) async {
    final uid = _myUid;
    if (uid == null) return;

    await _inboxRef(uid, convoId).set(
      {
        'archived': true,
        'archivedAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );

    await _convoRef(convoId).set(
      {
        'archivedBy': {uid: true},
        'archivedAt': {uid: FieldValue.serverTimestamp()},
      },
      SetOptions(merge: true),
    );
  }

  Future<void> _unarchiveConversation(String convoId) async {
    final uid = _myUid;
    if (uid == null) return;

    await _inboxRef(uid, convoId).set(
      {
        'archived': false,
        'archivedAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );

    await _convoRef(convoId).set(
      {
        'archivedBy': {uid: false},
        'archivedAt': {uid: FieldValue.serverTimestamp()},
      },
      SetOptions(merge: true),
    );
  }

  Future<void> _deleteConversation(String convoId) async {
    final uid = _myUid;
    if (uid == null) return;

    await _inboxRef(uid, convoId).set(
      {
        'deleted': true,
        'deletedAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );

    await _convoRef(convoId).set(
      {
        'deletedBy': {uid: true},
        'deletedAt': {uid: FieldValue.serverTimestamp()},
      },
      SetOptions(merge: true),
    );
  }

  Future<void> _undeleteConversation(String convoId) async {
    final uid = _myUid;
    if (uid == null) return;

    await _inboxRef(uid, convoId).set(
      {
        'deleted': false,
        'deletedAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );

    await _convoRef(convoId).set(
      {
        'deletedBy': {uid: false},
        'deletedAt': {uid: FieldValue.serverTimestamp()},
      },
      SetOptions(merge: true),
    );
  }

  Future<bool?> _confirmDeleteDialog(BuildContext context) {
    return showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text("Delete conversation?"),
        content: const Text("This will remove it from your inbox."),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text("Cancel"),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text(
              "Delete",
              style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }

  Widget _swipeBackground({
    required Alignment alignment,
    required IconData icon,
    required String label,
    required Color color,
  }) {
    return Container(
      color: color,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      alignment: alignment,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: Colors.white),
          const SizedBox(width: 8),
          Text(
            label,
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
          ),
        ],
      ),
    );
  }

  Widget _avatarWithOnlineDot({
    required String? avatarUrl,
    required bool isOnline,
  }) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        CircleAvatar(
          radius: 22,
          backgroundImage: avatarUrl != null ? NetworkImage(avatarUrl) : null,
          child: avatarUrl == null ? const Icon(Icons.person) : null,
        ),
        Positioned(
          right: -1,
          bottom: -1,
          child: Container(
            height: 12,
            width: 12,
            decoration: BoxDecoration(
              color: isOnline ? Colors.green : Colors.grey.shade400,
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 2),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildStickyFilterBar(int unreadTotal) {
    final label = unreadTotal > 0 ? "Unread ($unreadTotal)" : "Unread";

    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      child: Row(
        children: [
          FilterChip(
            label: Text(label),
            selected: _unreadOnly,
            onSelected: (v) => setState(() => _unreadOnly = v),
            selectedColor: Colors.deepPurple.withOpacity(0.18),
            checkmarkColor: Colors.deepPurple,
            labelStyle: TextStyle(
              fontWeight: FontWeight.w700,
              color: _unreadOnly ? Colors.deepPurple : Colors.black87,
            ),
            side: BorderSide(
              color: _unreadOnly ? Colors.deepPurple : Colors.grey.shade300,
            ),
          ),
          const SizedBox(width: 10),
          Text(
            _unreadOnly ? "Showing unread only" : "All messages",
            style: TextStyle(
              fontSize: 12,
              color: Colors.grey.shade700,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final uid = _myUid;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.deepPurple,
        centerTitle: !_showSearch,
        iconTheme: const IconThemeData(color: Colors.white),
        leading: IconButton(
          onPressed: () {
            if (Navigator.of(context).canPop()) Navigator.of(context).pop();
          },
          icon: const Icon(Icons.chevron_left, color: Colors.white, size: 28),
          splashRadius: 22,
          tooltip: "Back",
        ),
        title: _showSearch
            ? TextField(
          controller: _searchController,
          autofocus: true,
          onChanged: _onSearchChanged,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
          cursorColor: Colors.white,
          decoration: InputDecoration(
            hintText: "Search…",
            hintStyle: TextStyle(
              color: Colors.white.withOpacity(0.75),
              fontWeight: FontWeight.w500,
            ),
            border: InputBorder.none,
            isDense: true,
          ),
        )
            : const Text(
          "Inbox",
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
        ),
        actions: [
          IconButton(
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const ArchivedInboxScreen()),
              );
            },
            icon: const Icon(Icons.archive_outlined, color: Colors.white),
            tooltip: "Archived",
          ),
          if (_showSearch && _query.isNotEmpty)
            IconButton(
              onPressed: _clearSearch,
              icon: const Icon(Icons.close, color: Colors.white),
              tooltip: "Clear",
            ),
          IconButton(
            onPressed: _toggleSearch,
            icon: Icon(_showSearch ? Icons.search_off : Icons.search, color: Colors.white),
            tooltip: _showSearch ? "Close search" : "Search",
          ),
        ],
      ),
      body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: _messaging.inboxStream(),
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return Center(child: Text("Error: ${snapshot.error}"));
          }
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }

          final docs = snapshot.data!.docs;

          if (docs.isEmpty) {
            return const Center(child: Text("No conversations yet."));
          }

          int unreadTotal = 0;
          for (final d in docs) {
            final data = d.data();
            final convoId = (data['conversationId'] as String?) ?? d.id;
            final otherUid = (data['otherUid'] as String?) ?? '';
            final unread = (data['unreadCount'] as int?) ?? 0;

            if (otherUid.isEmpty) continue;
            if (_locallyHiddenConvos.contains(convoId)) continue;

            final isArchived = _isTrue(data, 'archived');
            final isDeleted = _isTrue(data, 'deleted');
            if (isArchived || isDeleted) continue;

            if (unread > 0) unreadTotal += unread;
          }

          return CustomScrollView(
            slivers: [
              SliverPersistentHeader(
                pinned: true,
                delegate: _SimplePinnedHeaderDelegate(
                  child: _buildStickyFilterBar(unreadTotal),
                  height: 52,
                ),
              ),
              SliverList(
                delegate: SliverChildBuilderDelegate(
                      (context, index) {
                    final data = docs[index].data();

                    final convoId = (data['conversationId'] as String?) ?? docs[index].id;
                    final otherUid = (data['otherUid'] as String?) ?? '';
                    final lastMessage = (data['lastMessage'] as String?) ?? '';
                    final unread = (data['unreadCount'] as int?) ?? 0;
                    final lastAt = data['lastMessageAt'] as Timestamp?;

                    if (otherUid.isEmpty) return const SizedBox.shrink();
                    if (_locallyHiddenConvos.contains(convoId)) return const SizedBox.shrink();

                    final isArchived = _isTrue(data, 'archived');
                    final isDeleted = _isTrue(data, 'deleted');
                    if (isArchived || isDeleted) return const SizedBox.shrink();

                    if (_unreadOnly && unread <= 0) return const SizedBox.shrink();

                    // FIX: never use UID as the visible fallback
                    final cachedTitle = _safeImmediateNameFromInboxDoc(data, otherUid);

                    return FutureBuilder<Map<String, dynamic>?>(
                      future: _fetchUserCached(otherUid),
                      builder: (context, userSnap) {
                        if (_query.isNotEmpty &&
                            userSnap.connectionState != ConnectionState.done) {
                          return const SizedBox.shrink();
                        }

                        final userData = userSnap.data;
                        final title = _displayName(userData, cachedTitle);
                        final avatar = _avatarUrl(userData);
                        final time = _formatTime(lastAt);
                        final online = _isOnline(userData);

                        if (!_matchesQuery(title: title, lastMessage: lastMessage)) {
                          return const SizedBox.shrink();
                        }

                        return Dismissible(
                          key: ValueKey("convo_$convoId"),
                          direction: DismissDirection.horizontal,
                          background: _swipeBackground(
                            alignment: Alignment.centerLeft,
                            icon: Icons.archive,
                            label: "Archive",
                            color: Colors.blueGrey,
                          ),
                          secondaryBackground: _swipeBackground(
                            alignment: Alignment.centerRight,
                            icon: Icons.delete,
                            label: "Delete",
                            color: Colors.redAccent,
                          ),
                          confirmDismiss: (direction) async {
                            if (uid == null) return false;

                            if (direction == DismissDirection.startToEnd) {
                              try {
                                await _archiveConversation(convoId);
                                if (!mounted) return false;

                                setState(() => _locallyHiddenConvos.add(convoId));

                                final snack = ScaffoldMessenger.of(context);
                                snack.hideCurrentSnackBar();
                                snack.showSnackBar(
                                  SnackBar(
                                    content: const Text("Conversation archived"),
                                    action: SnackBarAction(
                                      label: "Undo",
                                      onPressed: () async {
                                        await _unarchiveConversation(convoId);
                                        if (!mounted) return;
                                        setState(() => _locallyHiddenConvos.remove(convoId));
                                      },
                                    ),
                                  ),
                                );
                              } catch (e) {
                                if (!mounted) return false;
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(content: Text("Archive failed: $e")),
                                );
                              }
                              return false;
                            }

                            final ok = await _confirmDeleteDialog(context);
                            if (ok != true) return false;

                            try {
                              await _deleteConversation(convoId);
                              if (!mounted) return false;

                              setState(() => _locallyHiddenConvos.add(convoId));

                              final snack = ScaffoldMessenger.of(context);
                              snack.hideCurrentSnackBar();
                              snack.showSnackBar(
                                SnackBar(
                                  content: const Text("Conversation deleted"),
                                  action: SnackBarAction(
                                    label: "Undo",
                                    onPressed: () async {
                                      await _undeleteConversation(convoId);
                                      if (!mounted) return;
                                      setState(() => _locallyHiddenConvos.remove(convoId));
                                    },
                                  ),
                                ),
                              );
                            } catch (e) {
                              if (!mounted) return false;
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text("Delete failed: $e")),
                              );
                            }
                            return false;
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
                                leading: _avatarWithOnlineDot(
                                  avatarUrl: avatar,
                                  isOnline: online,
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
                                        style: TextStyle(
                                          fontSize: 12,
                                          color: Colors.grey.shade600,
                                        ),
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
                                          fontWeight:
                                          unread > 0 ? FontWeight.w600 : FontWeight.w400,
                                        ),
                                      ),
                                    ),
                                    if (unread > 0)
                                      Container(
                                        margin: const EdgeInsets.only(left: 8),
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 8,
                                          vertical: 4,
                                        ),
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
                  childCount: docs.length,
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _SimplePinnedHeaderDelegate extends SliverPersistentHeaderDelegate {
  final Widget child;
  final double height;

  _SimplePinnedHeaderDelegate({
    required this.child,
    required this.height,
  });

  @override
  double get minExtent => height;

  @override
  double get maxExtent => height;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    return Material(
      elevation: overlapsContent ? 1 : 0,
      child: child,
    );
  }

  @override
  bool shouldRebuild(covariant _SimplePinnedHeaderDelegate oldDelegate) {
    return oldDelegate.child != child || oldDelegate.height != height;
  }
}
