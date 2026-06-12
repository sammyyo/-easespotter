import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/services.dart';

import '../profile/profile_cache.dart';
import '../../screens/social_profile_screen.dart'; // ✅ Import destination

class CommentsPanel extends StatefulWidget {
  final String recipeId;
  final String ownerUid;
  final ScrollController scrollController;
  const CommentsPanel({
    super.key,
    required this.recipeId,
    required this.ownerUid,
    required this.scrollController,
  });

  @override
  State<CommentsPanel> createState() => _CommentsPanelState();
}

class _CommentsPanelState extends State<CommentsPanel> {
  final TextEditingController _ctrl = TextEditingController();
  final FocusNode _focusNode = FocusNode();

  String? _replyingToCommentId;
  String? _replyingToName;
  bool _sending = false;

  @override
  void dispose() {
    _ctrl.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _startReply({required String commentId, required String name}) {
    setState(() {
      _replyingToCommentId = commentId;
      _replyingToName = name;
    });

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) FocusScope.of(context).requestFocus(_focusNode);
    });
  }

  void _cancelReply() {
    setState(() {
      _replyingToCommentId = null;
      _replyingToName = null;
    });
  }

  Future<void> _send() async {
    final currentUser = FirebaseAuth.instance.currentUser;
    if (currentUser == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sign in to use this action.')),
      );
      return;
    }

    final text = _ctrl.text.trim();
    if (text.isEmpty || _sending) return;

    setState(() => _sending = true);

    try {
      final recipeRef = FirebaseFirestore.instance
          .collection('recipes')
          .doc(widget.recipeId);

      // ✅ Increment total comments count on the parent recipe doc
      // This ensures replies are counted in the main "comments count"
      await recipeRef.update({'commentsCount': FieldValue.increment(1)});

      if (_replyingToCommentId == null) {
        await recipeRef.collection('comments').add({
          'content': text,
          'userId': currentUser.uid,
          'createdAt': FieldValue.serverTimestamp(),
          'upvotedBy': <String>[],
          'upvotesCount': 0,
        });
      } else {
        await recipeRef
            .collection('comments')
            .doc(_replyingToCommentId)
            .collection('replies')
            .add({
              'content': text,
              'userId': currentUser.uid,
              'createdAt': FieldValue.serverTimestamp(),
              'upvotedBy': <String>[],
              'upvotesCount': 0,
            });
      }

      _ctrl.clear();

      setState(() {
        _replyingToCommentId = null;
        _replyingToName = null;
      });

      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) FocusScope.of(context).requestFocus(_focusNode);
      });
    } catch (_) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _replyingToCommentId == null
                ? 'Couldn’t post comment. Please try again.'
                : 'Couldn’t post reply. Please try again.',
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final commentsStream =
        FirebaseFirestore.instance
            .collection('recipes')
            .doc(widget.recipeId)
            .collection('comments')
            .orderBy('createdAt', descending: true)
            .snapshots();

    return SafeArea(
      top: false,
      child: Column(
        children: [
          const SizedBox(height: 8),
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Theme.of(context).dividerColor,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
            child: Row(
              children: const [
                Text(
                  'Comments',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ),
          const Divider(height: 1),

          // List of comments
          Expanded(
            child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
              stream: commentsStream,
              builder: (context, snapshot) {
                final docs = snapshot.data?.docs ?? const [];
                if (docs.isEmpty) {
                  return const Center(child: Text('Be the first to comment!'));
                }
                return ListView.separated(
                  controller: widget.scrollController,
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                  itemCount: docs.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (context, i) {
                    final d = docs[i];
                    final data = d.data();
                    final content = (data['content'] ?? '') as String;
                    final userId = (data['userId'] ?? '') as String;
                    final ts = data['createdAt'];
                    DateTime? dt;
                    if (ts is Timestamp) dt = ts.toDate();

                    String timeLabel;
                    if (dt == null) {
                      timeLabel = 'now';
                    } else {
                      final diff = DateTime.now().difference(dt);
                      if (diff.inMinutes < 1) {
                        timeLabel = 'now';
                      } else if (diff.inMinutes < 60) {
                        timeLabel = '${diff.inMinutes}m';
                      } else if (diff.inHours < 24) {
                        timeLabel = '${diff.inHours}h';
                      } else {
                        timeLabel = '${diff.inDays}d';
                      }
                    }

                    return CommentTile(
                      recipeId: widget.recipeId,
                      ownerUid: widget.ownerUid,
                      commentId: d.id,
                      userId: userId,
                      content: content,
                      timeLabel: timeLabel,
                      onReplyTap: _startReply,
                    );
                  },
                );
              },
            ),
          ),

          const Divider(height: 1),

          if (_replyingToCommentId != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'Replying to ${_replyingToName ?? 'comment'}',
                      style: const TextStyle(fontWeight: FontWeight.w600),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  TextButton(
                    onPressed: _cancelReply,
                    child: const Text('Cancel'),
                  ),
                ],
              ),
            ),

          Padding(
            padding: EdgeInsets.only(
              left: 16,
              right: 10,
              top: 10,
              bottom: 10 + MediaQuery.of(context).viewInsets.bottom,
            ),
            child: CommentComposer(
              controller: _ctrl,
              focusNode: _focusNode,
              isSending: _sending,
              onSend: _send,
              replyingToLabel:
                  _replyingToCommentId == null ? null : _replyingToName,
            ),
          ),
        ],
      ),
    );
  }
}

// ===== Single comment tile with Reply + nested replies =====
class CommentTile extends StatefulWidget {
  final String recipeId;
  final String ownerUid; // recipe owner uid
  final String commentId; // comment doc id
  final String userId; // author of this comment
  final String content;
  final String timeLabel;
  final void Function({required String commentId, required String name})
  onReplyTap;

  const CommentTile({
    super.key,
    required this.recipeId,
    required this.ownerUid,
    required this.commentId,
    required this.userId,
    required this.content,
    required this.timeLabel,
    required this.onReplyTap,
  });

  @override
  State<CommentTile> createState() => _CommentTileState();
}

class _CommentTileState extends State<CommentTile> {
  bool _showReplies = false;

  Stream<UserProfile> _profileStream(String uid) {
    return FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .snapshots()
        .map((doc) => UserProfile.fromDoc(uid, doc.data()));
  }

  Stream<DocumentSnapshot<Map<String, dynamic>>> _commentStream() {
    return FirebaseFirestore.instance
        .collection('recipes')
        .doc(widget.recipeId)
        .collection('comments')
        .doc(widget.commentId)
        .snapshots();
  }

  Future<void> _toggleLike(
    BuildContext context, {
    required bool isLiked,
  }) async {
    final current = FirebaseAuth.instance.currentUser;
    if (current == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sign in to use this action.')),
      );
      return;
    }
    final uid = current.uid;

    try {
      final ref = FirebaseFirestore.instance
          .collection('recipes')
          .doc(widget.recipeId)
          .collection('comments')
          .doc(widget.commentId);

      if (isLiked) {
        await ref.update({
          'upvotedBy': FieldValue.arrayRemove([uid]),
          'upvotesCount': FieldValue.increment(-1),
        });
      } else {
        await ref.update({
          'upvotedBy': FieldValue.arrayUnion([uid]),
          'upvotesCount': FieldValue.increment(1),
        });
      }
    } catch (_) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Couldn’t update like. Please try again.'),
        ),
      );
    }
  }

  Future<void> _deleteComment(BuildContext context) async {
    try {
      final commentRef = FirebaseFirestore.instance
          .collection('recipes')
          .doc(widget.recipeId)
          .collection('comments')
          .doc(widget.commentId);

      const chunk = 300;
      while (true) {
        final replies =
            await commentRef.collection('replies').limit(chunk).get();
        if (replies.docs.isEmpty) break;
        final b = FirebaseFirestore.instance.batch();
        for (final r in replies.docs) {
          b.delete(r.reference);
        }
        await b.commit();
      }

      await commentRef.delete();

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Comment deleted.')));
    } catch (_) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Failed to delete comment. Please try again.'),
        ),
      );
    }
  }

  Future<void> _showDeleteSheet(BuildContext context) async {
    final current = FirebaseAuth.instance.currentUser;
    if (current == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sign in to use this action.')),
      );
      return;
    }

    final canDelete =
        current.uid == widget.userId || current.uid == widget.ownerUid;
    if (!canDelete) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("You don't have permission to delete this comment."),
        ),
      );
      return;
    }

    bool understood = false;

    final repliesStream =
        FirebaseFirestore.instance
            .collection('recipes')
            .doc(widget.recipeId)
            .collection('comments')
            .doc(widget.commentId)
            .collection('replies')
            .snapshots();

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
              padding: EdgeInsets.fromLTRB(
                16,
                12,
                16,
                22 + MediaQuery.of(ctx).viewPadding.bottom,
              ),
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
                                fontSize: 18,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 6),
                            StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                              stream: repliesStream,
                              builder: (context, snap) {
                                final count = snap.data?.size ?? 0;
                                return Text(
                                  count > 0
                                      ? 'This will permanently remove the comment and its $count repl${count == 1 ? 'y' : 'ies'}.'
                                      : 'This will permanently remove the comment.',
                                  style: Theme.of(context).textTheme.bodyMedium,
                                );
                              },
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'This action cannot be undone.',
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(color: Colors.red),
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
                            backgroundColor:
                                understood
                                    ? Colors.red
                                    : Colors.red.withOpacity(0.5),
                            foregroundColor: Colors.white,
                          ),
                          onPressed:
                              understood
                                  ? () async {
                                    HapticFeedback.mediumImpact();
                                    Navigator.of(ctx).pop();
                                    await _deleteComment(context);
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
    final current = FirebaseAuth.instance.currentUser;
    const avatarRadius = 14.0;
    const avatarSize = avatarRadius * 2;
    const gap = 10.0;
    const leftIndent = avatarSize + gap;

    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: _commentStream(),
      builder: (context, snap) {
        final data = snap.data?.data() ?? const <String, dynamic>{};
        final List<String> upvotedBy = ((data['upvotedBy'] ?? []) as List)
            .map((e) => e.toString())
            .toList(growable: false);
        final int upvotesCount =
            (data['upvotesCount'] is int)
                ? data['upvotesCount'] as int
                : upvotedBy.length;
        final isLiked = current != null && upvotedBy.contains(current.uid);

        final cached = ProfileCache.peek(widget.userId);

        return GestureDetector(
          behavior: HitTestBehavior.translucent,
          onLongPress: () => _showDeleteSheet(context),
          onSecondaryTapDown: (_) => _showDeleteSheet(context),
          child: StreamBuilder<UserProfile>(
            stream: _profileStream(widget.userId),
            initialData: cached,
            builder: (context, snapshot) {
              final p =
                  snapshot.data ??
                  UserProfile(
                    uid: widget.userId,
                    displayName: '',
                    avatarUrl: '',
                  );
              if (snapshot.hasData) ProfileCache.putMany([p]);

              final name = p.displayName.isNotEmpty ? p.displayName : 'Someone';
              final hasImage = p.avatarUrl.isNotEmpty;

              final repliesCountStream =
                  FirebaseFirestore.instance
                      .collection('recipes')
                      .doc(widget.recipeId)
                      .collection('comments')
                      .doc(widget.commentId)
                      .collection('replies')
                      .snapshots();

              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // HEADER
                  SizedBox(
                    height: avatarSize,
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        // ✅ Wrap Avatar in InkWell for navigation
                        InkWell(
                          onTap: () async {
                            if (widget.userId.isNotEmpty) {
                              await SocialProfileScreen.open(
                                context,
                                viewedUid: widget.userId,
                                initialProfileHint: {
                                  'displayName': name,
                                  'avatarUrl': p.avatarUrl,
                                },
                              );
                            }
                          },
                          borderRadius: BorderRadius.circular(20),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              CircleAvatar(
                                radius: avatarRadius,
                                backgroundColor: Theme.of(
                                  context,
                                ).colorScheme.secondary.withOpacity(0.12),
                                backgroundImage:
                                    hasImage ? NetworkImage(p.avatarUrl) : null,
                                child:
                                    hasImage
                                        ? null
                                        : Text(
                                          (name.trim().isNotEmpty
                                                  ? name.trim().characters.first
                                                  : 'U')
                                              .toUpperCase(),
                                          style: const TextStyle(
                                            fontSize: 12,
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                              ),
                              const SizedBox(width: gap),
                            ],
                          ),
                        ),

                        // right side
                        Expanded(
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.center,
                            children: [
                              Expanded(
                                child: InkWell(
                                  onTap: () async {
                                    if (widget.userId.isNotEmpty) {
                                      await SocialProfileScreen.open(
                                        context,
                                        viewedUid: widget.userId,
                                        initialProfileHint: {
                                          'displayName': name,
                                          'avatarUrl': p.avatarUrl,
                                        },
                                      );
                                    }
                                  },
                                  borderRadius: BorderRadius.circular(4),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Flexible(
                                        child: Text(
                                          name,
                                          style: const TextStyle(
                                            fontWeight: FontWeight.w700,
                                          ),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                      const SizedBox(width: 6),
                                      Text(
                                        widget.timeLabel,
                                        style: TextStyle(
                                          color:
                                              Theme.of(
                                                context,
                                              ).textTheme.bodySmall?.color,
                                          fontSize: 12,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),

                              IconButton(
                                padding: EdgeInsets.zero,
                                constraints: const BoxConstraints(),
                                tooltip: isLiked ? 'Unlike' : 'Like',
                                icon: AnimatedScale(
                                  scale: isLiked ? 1.15 : 1.0,
                                  duration: const Duration(milliseconds: 150),
                                  child: Icon(
                                    isLiked
                                        ? Icons.favorite
                                        : Icons.favorite_border,
                                    color: isLiked ? Colors.red : Colors.grey,
                                  ),
                                ),
                                onPressed:
                                    () =>
                                        _toggleLike(context, isLiked: isLiked),
                              ),
                              const SizedBox(width: 6),
                              AnimatedSwitcher(
                                duration: const Duration(milliseconds: 180),
                                transitionBuilder:
                                    (child, anim) => ScaleTransition(
                                      scale: anim,
                                      child: child,
                                    ),
                                child: Text(
                                  '$upvotesCount',
                                  key: ValueKey<int>(upvotesCount),
                                  style: const TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 4),

                  // BODY
                  Padding(
                    padding: EdgeInsets.only(left: leftIndent),
                    child: Text(widget.content),
                  ),

                  // ACTIONS
                  Padding(
                    padding: EdgeInsets.only(left: leftIndent, top: 6),
                    child: Row(
                      children: [
                        TextButton.icon(
                          style: TextButton.styleFrom(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            minimumSize: const Size(0, 0),
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          ),
                          onPressed: () {
                            widget.onReplyTap(
                              commentId: widget.commentId,
                              name: name,
                            );
                            setState(() {
                              _showReplies = true;
                            });
                          },
                          icon: const Icon(Icons.reply_outlined, size: 18),
                          label: const Text('Reply'),
                        ),
                        const SizedBox(width: 8),
                        StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                          stream: repliesCountStream,
                          builder: (context, snap) {
                            final count = snap.data?.size ?? 0;
                            if (count == 0) {
                              return const SizedBox.shrink();
                            }
                            final label =
                                _showReplies
                                    ? 'Hide replies ($count)'
                                    : 'View replies ($count)';
                            return TextButton(
                              style: TextButton.styleFrom(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 4,
                                ),
                                minimumSize: const Size(0, 0),
                                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                              ),
                              onPressed:
                                  () => setState(
                                    () => _showReplies = !_showReplies,
                                  ),
                              child: Text(label),
                            );
                          },
                        ),
                      ],
                    ),
                  ),

                  // REPLIES
                  if (_showReplies)
                    RepliesList(
                      recipeId: widget.recipeId,
                      ownerUid: widget.ownerUid,
                      commentId: widget.commentId,
                      parentLeftIndent: leftIndent,
                    ),
                ],
              );
            },
          ),
        );
      },
    );
  }
}

// ===== Replies List =====
class RepliesList extends StatelessWidget {
  final String recipeId;
  final String ownerUid;
  final String commentId;
  final double parentLeftIndent;

  const RepliesList({
    super.key,
    required this.recipeId,
    required this.ownerUid,
    required this.commentId,
    required this.parentLeftIndent,
  });

  @override
  Widget build(BuildContext context) {
    final stream =
        FirebaseFirestore.instance
            .collection('recipes')
            .doc(recipeId)
            .collection('comments')
            .doc(commentId)
            .collection('replies')
            .orderBy('createdAt', descending: false)
            .snapshots();

    final replyIndent = parentLeftIndent + 24;

    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: stream,
      builder: (context, snapshot) {
        final docs = snapshot.data?.docs ?? const [];
        if (docs.isEmpty) {
          return const SizedBox.shrink();
        }
        return Padding(
          padding: EdgeInsets.only(left: replyIndent - parentLeftIndent),
          child: Column(
            children:
                docs.map((d) {
                  final data = d.data();
                  final content = (data['content'] ?? '') as String;
                  final userId = (data['userId'] ?? '') as String;
                  final ts = data['createdAt'];
                  DateTime? dt;
                  if (ts is Timestamp) dt = ts.toDate();

                  String timeLabel;
                  if (dt == null) {
                    timeLabel = 'now';
                  } else {
                    final diff = DateTime.now().difference(dt);
                    if (diff.inMinutes < 1) {
                      timeLabel = 'now';
                    } else if (diff.inMinutes < 60) {
                      timeLabel = '${diff.inMinutes}m';
                    } else if (diff.inHours < 24) {
                      timeLabel = '${diff.inHours}h';
                    } else {
                      timeLabel = '${diff.inDays}d';
                    }
                  }

                  return Padding(
                    padding: const EdgeInsets.only(top: 8, bottom: 6),
                    child: ReplyTile(
                      recipeId: recipeId,
                      ownerUid: ownerUid,
                      commentId: commentId,
                      replyId: d.id,
                      userId: userId,
                      content: content,
                      timeLabel: timeLabel,
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
class ReplyTile extends StatelessWidget {
  final String recipeId;
  final String ownerUid;
  final String commentId;
  final String replyId;
  final String userId;
  final String content;
  final String timeLabel;
  final double leftIndent;

  const ReplyTile({
    super.key,
    required this.recipeId,
    required this.ownerUid,
    required this.commentId,
    required this.replyId,
    required this.userId,
    required this.content,
    required this.timeLabel,
    required this.leftIndent,
  });

  Stream<UserProfile> _profileStream(String uid) {
    return FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .snapshots()
        .map((doc) => UserProfile.fromDoc(uid, doc.data()));
  }

  Stream<DocumentSnapshot<Map<String, dynamic>>> _replyStream() {
    return FirebaseFirestore.instance
        .collection('recipes')
        .doc(recipeId)
        .collection('comments')
        .doc(commentId)
        .collection('replies')
        .doc(replyId)
        .snapshots();
  }

  Future<void> _toggleLike(
    BuildContext context, {
    required bool isLiked,
  }) async {
    final current = FirebaseAuth.instance.currentUser;
    if (current == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sign in to use this action.')),
      );
      return;
    }
    final uid = current.uid;

    try {
      final ref = FirebaseFirestore.instance
          .collection('recipes')
          .doc(recipeId)
          .collection('comments')
          .doc(commentId)
          .collection('replies')
          .doc(replyId);

      if (isLiked) {
        await ref.update({
          'upvotedBy': FieldValue.arrayRemove([uid]),
          'upvotesCount': FieldValue.increment(-1),
        });
      } else {
        await ref.update({
          'upvotedBy': FieldValue.arrayUnion([uid]),
          'upvotesCount': FieldValue.increment(1),
        });
      }
    } catch (_) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Couldn’t update like. Please try again.'),
        ),
      );
    }
  }

  Future<void> _deleteReply(BuildContext context) async {
    try {
      await FirebaseFirestore.instance
          .collection('recipes')
          .doc(recipeId)
          .collection('comments')
          .doc(commentId)
          .collection('replies')
          .doc(replyId)
          .delete();

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Reply deleted.')));
    } catch (_) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Failed to delete reply. Please try again.'),
        ),
      );
    }
  }

  Future<void> _showDeleteSheet(BuildContext context) async {
    final current = FirebaseAuth.instance.currentUser;
    if (current == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sign in to use this action.')),
      );
      return;
    }

    final canDelete = current.uid == userId || current.uid == ownerUid;
    if (!canDelete) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("You don't have permission to delete this reply."),
        ),
      );
      return;
    }

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
              padding: EdgeInsets.fromLTRB(
                16,
                12,
                16,
                22 + MediaQuery.of(ctx).viewPadding.bottom,
              ),
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
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Delete this reply?',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            SizedBox(height: 6),
                            Text('This will permanently remove the reply.'),
                            SizedBox(height: 4),
                          ],
                        ),
                      ),
                    ],
                  ),

                  Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'This action cannot be undone.',
                      style: Theme.of(
                        context,
                      ).textTheme.bodySmall?.copyWith(color: Colors.red),
                    ),
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
                            backgroundColor:
                                understood
                                    ? Colors.red
                                    : Colors.red.withOpacity(0.5),
                            foregroundColor: Colors.white,
                          ),
                          onPressed:
                              understood
                                  ? () async {
                                    HapticFeedback.mediumImpact();
                                    Navigator.of(ctx).pop();
                                    await _deleteReply(context);
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
    final current = FirebaseAuth.instance.currentUser;
    const avatarRadius = 12.0;
    const avatarSize = avatarRadius * 2;
    const gap = 8.0;

    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: _replyStream(),
      builder: (context, snap) {
        final data = snap.data?.data() ?? const <String, dynamic>{};
        final List<String> upvotedBy = ((data['upvotedBy'] ?? []) as List)
            .map((e) => e.toString())
            .toList(growable: false);
        final int upvotesCount =
            (data['upvotesCount'] is int)
                ? data['upvotesCount'] as int
                : upvotedBy.length;
        final isLiked = current != null && upvotedBy.contains(current.uid);

        final cached = ProfileCache.peek(userId);

        return GestureDetector(
          behavior: HitTestBehavior.translucent,
          onLongPress: () => _showDeleteSheet(context),
          onSecondaryTapDown: (_) => _showDeleteSheet(context),
          child: StreamBuilder<UserProfile>(
            stream: _profileStream(userId),
            initialData: cached,
            builder: (context, snapshot) {
              final p =
                  snapshot.data ??
                  UserProfile(uid: userId, displayName: '', avatarUrl: '');
              if (snapshot.hasData) ProfileCache.putMany([p]);

              final name = p.displayName.isNotEmpty ? p.displayName : 'Someone';
              final hasImage = p.avatarUrl.isNotEmpty;

              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // header aligned to reply indent
                  SizedBox(
                    height: avatarSize,
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        SizedBox(width: leftIndent - avatarSize - gap),

                        // ✅ Wrap Reply Avatar in InkWell for navigation
                        InkWell(
                          onTap: () async {
                            if (userId.isNotEmpty) {
                              await SocialProfileScreen.open(
                                context,
                                viewedUid: userId,
                                initialProfileHint: {
                                  'displayName': name,
                                  'avatarUrl': p.avatarUrl,
                                },
                              );
                            }
                          },
                          borderRadius: BorderRadius.circular(20),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              CircleAvatar(
                                radius: avatarRadius,
                                backgroundColor: Theme.of(
                                  context,
                                ).colorScheme.secondary.withOpacity(0.12),
                                backgroundImage:
                                    hasImage ? NetworkImage(p.avatarUrl) : null,
                                child:
                                    hasImage
                                        ? null
                                        : Text(
                                          (name.trim().isNotEmpty
                                                  ? name.trim().characters.first
                                                  : 'U')
                                              .toUpperCase(),
                                          style: const TextStyle(
                                            fontSize: 11,
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                              ),
                              const SizedBox(width: gap),
                            ],
                          ),
                        ),

                        Expanded(
                          child: Row(
                            children: [
                              Expanded(
                                child: InkWell(
                                  onTap: () async {
                                    if (userId.isNotEmpty) {
                                      await SocialProfileScreen.open(
                                        context,
                                        viewedUid: userId,
                                        initialProfileHint: {
                                          'displayName': name,
                                          'avatarUrl': p.avatarUrl,
                                        },
                                      );
                                    }
                                  },
                                  borderRadius: BorderRadius.circular(4),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Flexible(
                                        child: Text(
                                          name,
                                          style: const TextStyle(
                                            fontWeight: FontWeight.w700,
                                          ),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                      const SizedBox(width: 6),
                                      Text(
                                        timeLabel,
                                        style: TextStyle(
                                          color:
                                              Theme.of(
                                                context,
                                              ).textTheme.bodySmall?.color,
                                          fontSize: 11,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                              IconButton(
                                padding: EdgeInsets.zero,
                                constraints: const BoxConstraints(),
                                tooltip: isLiked ? 'Unlike' : 'Like',
                                icon: AnimatedScale(
                                  scale: isLiked ? 1.15 : 1.0,
                                  duration: const Duration(milliseconds: 150),
                                  child: Icon(
                                    isLiked
                                        ? Icons.favorite
                                        : Icons.favorite_border,
                                    color: isLiked ? Colors.red : Colors.grey,
                                    size: 18,
                                  ),
                                ),
                                onPressed:
                                    () =>
                                        _toggleLike(context, isLiked: isLiked),
                              ),
                              const SizedBox(width: 4),
                              AnimatedSwitcher(
                                duration: const Duration(milliseconds: 180),
                                transitionBuilder:
                                    (child, anim) => ScaleTransition(
                                      scale: anim,
                                      child: child,
                                    ),
                                child: Text(
                                  '$upvotesCount',
                                  key: ValueKey<int>(upvotesCount),
                                  style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 4),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),

                  // body
                  Padding(
                    padding: EdgeInsets.only(left: leftIndent),
                    child: Text(content),
                  ),
                ],
              );
            },
          ),
        );
      },
    );
  }
}

// ===== Comment composer (bottom of sheet) =====
class CommentComposer extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode? focusNode;
  final bool isSending;
  final VoidCallback onSend;
  final String? replyingToLabel;

  const CommentComposer({
    super.key,
    required this.controller,
    required this.isSending,
    required this.onSend,
    this.focusNode,
    this.replyingToLabel,
  });

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;
    final theme = Theme.of(context);

    final canSend =
        controller.text.trim().isNotEmpty && !isSending && user != null;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Container(
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerHighest.withOpacity(
                theme.brightness == Brightness.dark ? 0.35 : 0.6,
              ),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: theme.dividerColor.withOpacity(0.7)),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                ComposerAvatar(uid: user?.uid),
                const SizedBox(width: 8),
                // Text field
                Expanded(
                  child: TextField(
                    controller: controller,
                    focusNode: focusNode,
                    enabled: user != null && !isSending,
                    minLines: 1,
                    maxLines: 4,
                    textInputAction: TextInputAction.send,
                    onChanged: (_) => (context as Element).markNeedsBuild(),
                    onSubmitted: (_) {
                      if (canSend) onSend();
                    },
                    decoration: InputDecoration(
                      hintText:
                          user == null
                              ? (replyingToLabel == null
                                  ? 'Sign in to leave a comment…'
                                  : 'Sign in to reply…')
                              : (replyingToLabel == null
                                  ? 'Leave a comment…'
                                  : 'Write a reply…'),
                      isDense: true,
                      border: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 0,
                        vertical: 4,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),

        const SizedBox(width: 8),

        // Send button
        Tooltip(
          message:
              user == null
                  ? 'Sign in to comment'
                  : (canSend ? 'Send' : 'Type a comment'),
          child: Material(
            color:
                canSend
                    ? theme.colorScheme.primary
                    : theme.colorScheme.primary.withOpacity(0.5),
            shape: const CircleBorder(),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: canSend ? onSend : null,
              child: SizedBox(
                width: 40,
                height: 40,
                child: Center(
                  child:
                      isSending
                          ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation<Color>(
                                Colors.white,
                              ),
                            ),
                          )
                          : const Icon(Icons.send, color: Colors.white),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class ComposerAvatar extends StatelessWidget {
  final String? uid;
  const ComposerAvatar({super.key, this.uid});

  @override
  Widget build(BuildContext context) {
    if (uid == null) {
      return const CircleAvatar(
        radius: 14,
        child: Icon(Icons.person, size: 16),
      );
    }

    final cached = ProfileCache.peek(uid!);

    return StreamBuilder<UserProfile>(
      stream: FirebaseFirestore.instance
          .collection('users')
          .doc(uid)
          .snapshots()
          .map((doc) => UserProfile.fromDoc(uid!, doc.data())),
      initialData: cached,
      builder: (context, snapshot) {
        final p =
            snapshot.data ??
            UserProfile(uid: uid!, displayName: '', avatarUrl: '');
        if (snapshot.hasData) ProfileCache.putMany([p]);

        final name = p.displayName.isNotEmpty ? p.displayName : 'U';
        final hasImage = p.avatarUrl.isNotEmpty;
        return CircleAvatar(
          radius: 14,
          backgroundColor: Theme.of(
            context,
          ).colorScheme.secondary.withOpacity(0.12),
          backgroundImage: hasImage ? NetworkImage(p.avatarUrl) : null,
          child:
              hasImage
                  ? null
                  : Text(
                    (name.trim().characters.first).toUpperCase(),
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
        );
      },
    );
  }
}
