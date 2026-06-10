import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';

import '../widgets/attribution_tag.dart';
import '../widgets/comment_list.dart';
import '../widgets/recipe_card/avatar_stack.dart';
import '../widgets/recipe_card/comments_panel.dart';

class GlowUpDetailScreen extends StatefulWidget {
  final String glowUpId;

  const GlowUpDetailScreen({super.key, required this.glowUpId});

  @override
  State<GlowUpDetailScreen> createState() => _GlowUpDetailScreenState();
}

class _GlowUpDetailScreenState extends State<GlowUpDetailScreen> {
  bool isLiked = false;
  List<String> likedBy = [];

  @override
  void initState() {
    super.initState();
    _loadReactions();
  }

  Future<void> _loadReactions() async {
    final doc =
        await FirebaseFirestore.instance
            .collection('glowups')
            .doc(widget.glowUpId)
            .get();

    if (!doc.exists) return;
    final data = doc.data();
    if (data == null) return;

    final List<String> serverLikedBy =
        (data['likedBy'] is Iterable)
            ? List<String>.from(data['likedBy'])
            : <String>[];

    final currentUser = FirebaseAuth.instance.currentUser;
    if (mounted) {
      setState(() {
        likedBy = serverLikedBy;
        isLiked =
            currentUser != null && serverLikedBy.contains(currentUser.uid);
      });
    }
  }

  Future<void> _toggleLike() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    final docRef = FirebaseFirestore.instance
        .collection('glowups')
        .doc(widget.glowUpId);

    final wasLiked = isLiked;
    // Optimistic update
    setState(() {
      isLiked = !wasLiked;
      if (wasLiked) {
        likedBy.remove(user.uid);
      } else {
        likedBy.add(user.uid);
      }
    });

    try {
      if (wasLiked) {
        await docRef.update({
          'likedBy': FieldValue.arrayRemove([user.uid]),
        });
      } else {
        await docRef.update({
          'likedBy': FieldValue.arrayUnion([user.uid]),
        });
      }
    } catch (_) {
      // Revert on error
      if (mounted) {
        setState(() {
          isLiked = wasLiked;
          if (wasLiked) {
            likedBy.add(user.uid);
          } else {
            likedBy.remove(user.uid);
          }
        });
      }
    }
  }

  void _shareGlowUp() async {
    final url = 'https://easespotter.com/glowup/${widget.glowUpId}';
    await Clipboard.setData(ClipboardData(text: url));
    if (mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Link copied to clipboard')));
    }
  }

  void _openCommentsSheet(String authorUid) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Theme.of(context).colorScheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => _GlowUpCommentsSheet(glowUpId: widget.glowUpId),
    );
  }

  String _timeAgo(DateTime dt) {
    final now = DateTime.now();
    Duration diff = now.difference(dt);
    if (diff.isNegative) diff = Duration.zero;
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.deepPurple,
        centerTitle: true,
        iconTheme: const IconThemeData(color: Colors.white),
        systemOverlayStyle: SystemUiOverlayStyle.light,
        title: const Text(
          'Glow-Up Story',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
        ),
      ),
      body: FutureBuilder<DocumentSnapshot>(
        future:
            FirebaseFirestore.instance
                .collection('glowups')
                .doc(widget.glowUpId)
                .get(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (!snapshot.hasData || !snapshot.data!.exists) {
            return const Center(child: Text('This Glow-Up was not found.'));
          }

          final raw = snapshot.data!.data() as Map<String, dynamic>? ?? {};
          final imageUrl = (raw['imageUrl'] ?? '').toString();
          final title = (raw['title'] ?? '').toString();
          final description = (raw['description'] ?? '').toString();
          final authorUid = (raw['authorUid'] ?? '').toString();
          final hotness = (raw['hotness'] ?? 0) as int;
          final createdAt =
              (raw['createdAt'] is Timestamp)
                  ? (raw['createdAt'] as Timestamp).toDate()
                  : null;

          return SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (imageUrl.isNotEmpty)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Image.network(imageUrl, fit: BoxFit.cover),
                  ),
                const SizedBox(height: 20),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Container(
                      decoration: BoxDecoration(
                        color: Colors.grey.shade200,
                        borderRadius: BorderRadius.circular(40),
                      ),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 4,
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [AttributionTag(uid: authorUid)],
                      ),
                    ),
                    const Spacer(),
                    if (createdAt != null)
                      Text(
                        _timeAgo(createdAt),
                        style: const TextStyle(
                          color: Colors.grey,
                          fontSize: 12,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 10),
                Text(
                  title.isEmpty ? 'Untitled Glow-Up' : title,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  description.isEmpty
                      ? 'No description provided.'
                      : description,
                  style: const TextStyle(fontSize: 16),
                ),
                const SizedBox(height: 24),
                Row(
                  children: [
                    Transform.translate(
                      offset: const Offset(-8, 0),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(
                            tooltip: isLiked ? 'Unlike' : 'Like',
                            splashRadius: 20,
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
                            onPressed: _toggleLike,
                          ),
                          AnimatedSwitcher(
                            duration: const Duration(milliseconds: 180),
                            transitionBuilder:
                                (child, anim) =>
                                    ScaleTransition(scale: anim, child: child),
                            child: Text(
                              '${likedBy.length}',
                              key: ValueKey<int>(likedBy.length),
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          if (likedBy.isNotEmpty) ...[
                            const SizedBox(width: 6),
                            AvatarStack(uids: likedBy, size: 22, overlap: 10),
                          ],
                          if (hotness > 0) ...[
                            const SizedBox(width: 12),
                            const Icon(
                              FontAwesomeIcons.fire,
                              color: Colors.orange,
                              size: 20,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              hotness.toString(),
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    IconButton(
                      tooltip: 'Comments',
                      splashRadius: 20,
                      icon: const FaIcon(
                        FontAwesomeIcons.comment,
                        size: 20,
                        color: Colors.grey,
                      ),
                      onPressed: () => _openCommentsSheet(authorUid),
                    ),
                    StreamBuilder<QuerySnapshot>(
                      stream:
                          FirebaseFirestore.instance
                              .doc('glowups/${widget.glowUpId}')
                              .collection('comments')
                              .snapshots(),
                      builder: (context, snapshot) {
                        if (!snapshot.hasData || snapshot.data!.size == 0) {
                          return const SizedBox.shrink();
                        }
                        return Padding(
                          padding: const EdgeInsets.only(left: 4.0),
                          child: Text(
                            snapshot.data!.size.toString(),
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        );
                      },
                    ),
                    IconButton(
                      tooltip: 'Share',
                      splashRadius: 20,
                      icon: const FaIcon(FontAwesomeIcons.share, size: 20),
                      onPressed: _shareGlowUp,
                    ),
                  ],
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _GlowUpCommentsSheet extends StatefulWidget {
  final String glowUpId;
  const _GlowUpCommentsSheet({required this.glowUpId});

  @override
  State<_GlowUpCommentsSheet> createState() => _GlowUpCommentsSheetState();
}

class _GlowUpCommentsSheetState extends State<_GlowUpCommentsSheet> {
  final TextEditingController ctrl = TextEditingController();
  final FocusNode focusNode = FocusNode();

  String? replyingToCommentId;
  String? replyingToName;
  bool sending = false;

  @override
  void dispose() {
    ctrl.dispose();
    focusNode.dispose();
    super.dispose();
  }

  void startReply({required String commentId, required String name}) {
    setState(() {
      replyingToCommentId = commentId;
      replyingToName = name;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) FocusScope.of(context).requestFocus(focusNode);
    });
  }

  Future<void> send() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sign in to use this action.')),
      );
      return;
    }

    final text = ctrl.text.trim();
    if (text.isEmpty || sending) return;

    setState(() => sending = true);

    try {
      final glowRef = FirebaseFirestore.instance
          .collection('glowups')
          .doc(widget.glowUpId);

      if (replyingToCommentId == null) {
        await glowRef.collection('comments').add({
          'uid': user.uid,
          'text': text,
          'createdAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
          'upvotedBy': <String>[],
        });
      } else {
        await glowRef
            .collection('comments')
            .doc(replyingToCommentId)
            .collection('replies')
            .add({'uid': user.uid, 'text': text, 'createdAt': Timestamp.now()});
      }

      ctrl.clear();
      setState(() {
        sending = false;
        replyingToCommentId = null;
        replyingToName = null;
      });

      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) FocusScope.of(context).requestFocus(focusNode);
      });
    } catch (e) {
      if (mounted) {
        setState(() => sending = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Couldn't post reply (permissions).")),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.of(context).size.height;
    final theme = Theme.of(context);

    // Using Column + Expanded + Padding(viewInsets) logic as requested
    return SizedBox(
      height: screenHeight * 0.85,
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
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 12, 8, 8),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Comments',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
              ),
            ),
          ),
          const Divider(height: 1),

          Expanded(
            child: CommentList(
              parentPath: 'glowups/${widget.glowUpId}',
              onReplyTap: startReply,
            ),
          ),

          const Divider(height: 1),

          if (replyingToCommentId != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'Replying to ${replyingToName ?? 'comment'}',
                      style: const TextStyle(fontWeight: FontWeight.w600),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  TextButton(
                    onPressed:
                        () => setState(() {
                          replyingToCommentId = null;
                          replyingToName = null;
                        }),
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
              bottom:
                  22 +
                  MediaQuery.of(context).viewInsets.bottom +
                  MediaQuery.of(context).viewPadding.bottom,
            ),
            child: Row(
              children: [
                Expanded(
                  child: Container(
                    decoration: BoxDecoration(
                      color: theme.colorScheme.surfaceContainerHighest
                          .withValues(
                            alpha:
                                theme.brightness == Brightness.dark
                                    ? 0.35
                                    : 0.6,
                          ),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(
                        color: theme.dividerColor.withValues(alpha: 0.7),
                      ),
                    ),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    child: Row(
                      children: [
                        // ✅ Avatar restored
                        ComposerAvatar(
                          uid: FirebaseAuth.instance.currentUser?.uid,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: TextField(
                            controller: ctrl,
                            focusNode: focusNode,
                            minLines: 1,
                            maxLines: 4,
                            decoration: InputDecoration(
                              hintText:
                                  replyingToCommentId == null
                                      ? 'Leave a comment...'
                                      : 'Write a reply...',
                              border: InputBorder.none,
                              isDense: true,
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
                IconButton(
                  onPressed: sending ? null : send,
                  icon:
                      sending
                          ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                          : Icon(
                            Icons.send,
                            color: Theme.of(context).primaryColor,
                          ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
