import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/services.dart';
import './profile/profile_cache.dart';
import '../screens/social_profile_screen.dart';

class CommentList extends StatelessWidget {
  final String parentPath;
  final void Function({required String commentId, required String name}) onReplyTap;

  const CommentList({
    super.key,
    required this.parentPath,
    required this.onReplyTap,
  });

  @override
  Widget build(BuildContext context) {
    final commentsQuery = FirebaseFirestore.instance
        .doc(parentPath)
        .collection('comments')
        .orderBy('createdAt', descending: true);

    return StreamBuilder<QuerySnapshot>(
      stream: commentsQuery.snapshots(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
          return const Padding(
            padding: EdgeInsets.all(16),
            child: Text('No comments yet. Be the first!'),
          );
        }

        final docs = snapshot.data!.docs;

        return Padding(
          padding: const EdgeInsets.only(top: 16),
          child: ListView.separated(
            key: PageStorageKey<String>('comments_$parentPath'),
            addAutomaticKeepAlives: true,
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            itemCount: docs.length,
            separatorBuilder: (_, __) => const SizedBox(height: 12),
            itemBuilder: (context, index) {
              final doc = docs[index];
              return _CommentTile(
                key: ValueKey(doc.id),
                commentDoc: doc,
                parentPath: parentPath,
                onReplyTap: onReplyTap,
              );
            },
          ),
        );
      },
    );
  }
}


class _CommentTile extends StatefulWidget {
  final DocumentSnapshot commentDoc;
  final String parentPath;
  final void Function({required String commentId, required String name}) onReplyTap;

  const _CommentTile({
    super.key,
    required this.commentDoc,
    required this.parentPath,
    required this.onReplyTap,
  });

  @override
  State<_CommentTile> createState() => _CommentTileState();
}

class _CommentTileState extends State<_CommentTile> with AutomaticKeepAliveClientMixin {
  bool _showReplies = false;

  @override
  bool get wantKeepAlive => true; 

  String _timeLabelFromTs(dynamic ts) {
    if (ts is! Timestamp) return 'now';
    final dt = ts.toDate();
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1) return 'now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m';
    if (diff.inHours < 24) return '${diff.inHours}h';
    return '${diff.inDays}d';
  }

  Future<void> _toggleLike(BuildContext context, {required bool isLiked}) async {
    final currentUser = FirebaseAuth.instance.currentUser;
    if (currentUser == null) return;

    final ref = widget.commentDoc.reference;
    try {
      if (isLiked) {
        await ref.update({
          'upvotedBy': FieldValue.arrayRemove([currentUser.uid]),
        });
      } else {
        await ref.update({
          'upvotedBy': FieldValue.arrayUnion([currentUser.uid]),
        });
      }
    } catch (_) {
      // ignore
    }
  }

  Future<void> _showDeleteSheet(
      BuildContext context, String parentPath, String commentId) async {
    final currentUser = FirebaseAuth.instance.currentUser;
    final data = widget.commentDoc.data() as Map<String, dynamic>;
    final authorUid = data['uid'] ?? '';

    if (currentUser == null || currentUser.uid != authorUid) return;

    bool understood = false;

    await showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      backgroundColor: Theme.of(context).colorScheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setState) {
            return Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 38,
                    height: 4,
                    decoration: BoxDecoration(
                      color: Theme.of(ctx).dividerColor,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: Colors.red.withOpacity(0.08),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.delete_forever_outlined,
                          color: Colors.red,
                          size: 26,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Delete this comment?',
                              style: TextStyle(
                                  fontSize: 18, fontWeight: FontWeight.w700),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              'This will permanently remove the comment and its replies.',
                              style: Theme.of(context).textTheme.bodyMedium,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    controlAffinity: ListTileControlAffinity.leading,
                    value: understood,
                    onChanged: (v) => setState(() => understood = v ?? false),
                    title: const Text('I understand — delete permanently'),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => Navigator.of(ctx).maybePop(),
                          child: const Text('Cancel'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: FilledButton(
                          style: FilledButton.styleFrom(
                            backgroundColor: understood
                                ? Colors.red
                                : Colors.red.withOpacity(0.5),
                            foregroundColor: Colors.white,
                          ),
                          onPressed: understood
                              ? () async {
                                  HapticFeedback.mediumImpact();
                                  Navigator.of(ctx).pop();
                                  await widget.commentDoc.reference.delete();
                                }
                              : null,
                          child: const Text('Delete'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);

    final data = widget.commentDoc.data() as Map<String, dynamic>;
    final uid = (data['userId'] ?? data['uid'] ?? '').toString();
    final text = (data['text'] ?? '').toString();
    final timeLabel = _timeLabelFromTs(data['createdAt']);
    final upvotedBy = List<String>.from(data['upvotedBy'] ?? []);

    final currentUser = FirebaseAuth.instance.currentUser;
    final isLiked = currentUser != null && upvotedBy.contains(currentUser.uid);
    final canDelete = currentUser != null && currentUser.uid == uid;

    final cached = ProfileCache.peek(uid);

    const avatarRadius = 18.0;
    const avatarSize = avatarRadius * 2;
    const gap = 10.0;
    const leftIndent = avatarSize + gap;

    final repliesStream = widget.commentDoc.reference.collection('replies').snapshots();

    final commentBody = StreamBuilder<UserProfile>(
      stream: FirebaseFirestore.instance
          .collection('users')
          .doc(uid)
          .snapshots()
          .map((d) => UserProfile.fromDoc(uid, d.data())),
      initialData: cached,
      builder: (context, snap) {
        final p = snap.data ?? UserProfile(uid: uid, displayName: '', avatarUrl: '');
        if (snap.hasData) ProfileCache.putMany([p]);

        final name = p.displayName.isNotEmpty ? p.displayName : 'Someone';
        final hasImage = p.avatarUrl.isNotEmpty;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // HEADER
            SizedBox(
              height: avatarSize,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  // ✅ Wrap Avatar/Name in InkWell for navigation
                  InkWell(
                    onTap: () async {
                      if (uid.isNotEmpty) {
                        await SocialProfileScreen.open(
                          context,
                          viewedUid: uid,
                          initialProfileHint: {
                            'displayName': name,
                            'avatarUrl': p.avatarUrl,
                          },
                        );
                      }
                    },
                    borderRadius: BorderRadius.circular(20),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4.0, vertical: 2.0),
                      child: Row(
                        children: [
                          CircleAvatar(
                            radius: avatarRadius,
                            backgroundColor:
                                Theme.of(context).colorScheme.secondary.withOpacity(0.12),
                            backgroundImage: hasImage ? NetworkImage(p.avatarUrl) : null,
                            child: hasImage
                                ? null
                                : Text(
                                    (name.trim().isNotEmpty ? name.trim().characters.first : 'U')
                                        .toUpperCase(),
                                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                                  ),
                          ),
                          const SizedBox(width: gap),
                          ConstrainedBox(
                             constraints: const BoxConstraints(maxWidth: 160),
                             child: Text(
                               name, 
                               style: const TextStyle(fontWeight: FontWeight.w700), 
                               maxLines: 1, 
                               overflow: TextOverflow.ellipsis
                             ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  
                  // Time
                  Text(
                    timeLabel,
                    style: TextStyle(color: Theme.of(context).textTheme.bodySmall?.color, fontSize: 12),
                  ),
                  
                  const Spacer(),

                  // LIKE button and count
                  IconButton(
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    visualDensity: VisualDensity.compact,
                    tooltip: isLiked ? 'Unlike' : 'Like',
                    icon: Icon(
                      isLiked ? Icons.favorite : Icons.favorite_border,
                      color: isLiked ? Colors.red : Colors.grey,
                      size: 18,
                    ),
                    onPressed: () => _toggleLike(context, isLiked: isLiked),
                  ),
                  const SizedBox(width: 4),
                  Text('${upvotedBy.length}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                ],
              ),
            ), const SizedBox(height: 4),

            // BODY
            Padding(
              padding: const EdgeInsets.only(left: leftIndent),
              child: Text(text, maxLines: 10, overflow: TextOverflow.fade),
            ),

            // ACTIONS
            Padding(
              padding: EdgeInsets.only(left: leftIndent, top: 6),
              child: Row(
                children: [
                  TextButton.icon(
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      minimumSize: const Size(0, 0),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    onPressed: () {
                       widget.onReplyTap(commentId: widget.commentDoc.id, name: name);
                       setState(() => _showReplies = true);
                    },
                    icon: const Icon(Icons.reply_outlined, size: 18),
                    label: const Text('Reply'),
                  ),
                  const SizedBox(width: 8),
                  StreamBuilder<QuerySnapshot>(
                    stream: repliesStream,
                    builder: (context, snap) {
                      final count = snap.data?.size ?? 0;
                      if (count == 0) return const SizedBox.shrink();
                      return TextButton(
                        style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4), minimumSize: const Size(0, 0), tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                        onPressed: () => setState(() => _showReplies = !_showReplies),
                        child: Text(_showReplies ? 'Hide replies ($count)' : 'View replies ($count)'),
                      );
                    },
                  ),
                ],
              ),
            ),

            if (_showReplies)
              _RepliesList(
                parentPath: widget.parentPath,
                commentId: widget.commentDoc.id,
                parentLeftIndent: leftIndent,
              ),
          ],
        );
      },
    );

    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onLongPress: canDelete ? () => _showDeleteSheet(context, widget.parentPath, widget.commentDoc.id) : null,
      onSecondaryTapDown: canDelete ? (_) => _showDeleteSheet(context, widget.parentPath, widget.commentDoc.id) : null,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: commentBody,
      ),
    );
  }
}


// ===== Replies List =====
class _RepliesList extends StatelessWidget {
  final String parentPath;
  final String commentId;
  final double parentLeftIndent;

  const _RepliesList({
    required this.parentPath,
    required this.commentId,
    required this.parentLeftIndent,
  });

  @override
  Widget build(BuildContext context) {
    final stream = FirebaseFirestore.instance
        .doc(parentPath)
        .collection('comments')
        .doc(commentId)
        .collection('replies')
        .orderBy('createdAt', descending: false)
        .snapshots();

    final replyIndent = parentLeftIndent + 24;

    return StreamBuilder<QuerySnapshot>(
      stream: stream,
      builder: (context, snapshot) {
        final docs = snapshot.data?.docs ?? const [];
        if (docs.isEmpty) return const SizedBox.shrink();
        return Padding(
          padding: EdgeInsets.only(left: parentLeftIndent),
          child: Column(
            children: docs.map((doc) {
              return Padding(
                padding: const EdgeInsets.only(top: 8, bottom: 6),
                child: _ReplyTile(
                  parentPath: parentPath,
                  commentId: commentId,
                  replyDoc: doc,
                  leftIndent: replyIndent,
                ),
              );
            }).toList(),
          ),
        );
      },
    );
  }
}

// ===== Single reply tile =====
class _ReplyTile extends StatelessWidget {
  final String parentPath;
  final String commentId;
  final DocumentSnapshot replyDoc;
  final double leftIndent;

  const _ReplyTile({
    required this.parentPath,
    required this.commentId,
    required this.replyDoc,
    required this.leftIndent,
  });

  String _timeLabelFromTs(dynamic ts) {
    if (ts is! Timestamp) return 'now';
    final dt = ts.toDate();
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1) return 'now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m';
    if (diff.inHours < 24) return '${diff.inHours}h';
    return '${diff.inDays}d';
  }

  Future<void> _toggleReplyLike(bool isLiked) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    final ref = replyDoc.reference;
    try {
      if (isLiked) {
        await ref.update({
          'upvotedBy': FieldValue.arrayRemove([user.uid]),
        });
      } else {
        await ref.update({
          'upvotedBy': FieldValue.arrayUnion([user.uid]),
        });
      }
    } catch (_) {
      // optional: show snackbar
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = replyDoc.data() as Map<String, dynamic>;
    final uid = data['uid'] ?? '';
    final text = data['text'] ?? '';
    final timeLabel = _timeLabelFromTs(data['createdAt']);

    final upvotedBy = List<String>.from(data['upvotedBy'] ?? []);
    final currentUser = FirebaseAuth.instance.currentUser;
    final isLiked = currentUser != null && upvotedBy.contains(currentUser.uid);
    final likeCount = upvotedBy.length;

    const avatarRadius = 12.0;
    const avatarSize = avatarRadius * 2;
    const gap = 8.0;

    final cached = ProfileCache.peek(uid);

    return StreamBuilder<UserProfile>(
      stream: FirebaseFirestore.instance
          .collection('users')
          .doc(uid)
          .snapshots()
          .map((d) => UserProfile.fromDoc(uid, d.data())),
      initialData: cached,
      builder: (context, snapshot) {
        final p = snapshot.data ??
            UserProfile(uid: uid, displayName: '', avatarUrl: '');
        if (snapshot.hasData) ProfileCache.putMany([p]);

        final name =
        p.displayName.isNotEmpty ? p.displayName : 'Someone';
        final hasImage = p.avatarUrl.isNotEmpty;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // HEADER (avatar + name + time + like)
            SizedBox(
              height: avatarSize,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  // ✅ Wrap Reply Avatar/Name in InkWell
                  InkWell(
                    onTap: () async {
                      if (uid.isNotEmpty) {
                        await SocialProfileScreen.open(
                          context,
                          viewedUid: uid,
                          initialProfileHint: {
                            'displayName': name,
                            'avatarUrl': p.avatarUrl,
                          },
                        );
                      }
                    },
                    borderRadius: BorderRadius.circular(20),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4.0, vertical: 2.0),
                      child: Row(
                        children: [
                          CircleAvatar(
                            radius: avatarRadius,
                            backgroundImage:
                            hasImage ? NetworkImage(p.avatarUrl) : null,
                            child: hasImage
                                ? null
                                : Text(
                              (name.trim().isNotEmpty
                                  ? name.trim().characters.first
                                  : 'U')
                                  .toUpperCase(),
                              style: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700),
                            ),
                          ),
                          const SizedBox(width: gap),
                          ConstrainedBox(
                             constraints: const BoxConstraints(maxWidth: 130),
                             child: Text(
                               name,
                               style: const TextStyle(
                                 fontWeight: FontWeight.w700,
                               ),
                               maxLines: 1,
                               overflow: TextOverflow.ellipsis,
                             ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    timeLabel,
                    style: TextStyle(
                      color: Theme.of(context)
                          .textTheme
                          .bodySmall
                          ?.color,
                      fontSize: 11,
                    ),
                  ),
                  
                  const Spacer(),
                  // LIKE BUTTON + COUNT FOR REPLY
                  IconButton(
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    visualDensity: VisualDensity.compact,
                    tooltip: isLiked ? 'Unlike' : 'Like',
                    icon: Icon(
                      isLiked ? Icons.favorite : Icons.favorite_border,
                      color: isLiked ? Colors.red : Colors.grey,
                      size: 16,
                    ),
                    onPressed: currentUser == null
                        ? null
                        : () => _toggleReplyLike(isLiked),
                  ),
                  const SizedBox(width: 4),
                  Text(
                    '$likeCount',
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),

            // BODY TEXT (indented under name, not under avatar)
            Padding(
              padding: EdgeInsets.only(left: avatarSize + gap),
              child: Text(text),
            ),
          ],
        );
      },
    );
  }
}
