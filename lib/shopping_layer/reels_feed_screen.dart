import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import 'package:video_player/video_player.dart';

import '../widgets/comment_list.dart';
import '../widgets/recipe_card/author_header.dart';
import '../widgets/recipe_card/comments_panel.dart';
import 'new_reel_screen.dart';

class ReelsFeedScreen extends StatefulWidget {
  final String? authorUid;
  final String? initialReelId;
  final bool includePrivate;

  const ReelsFeedScreen({
    super.key,
    this.authorUid,
    this.initialReelId,
    this.includePrivate = false,
  });

  @override
  State<ReelsFeedScreen> createState() => _ReelsFeedScreenState();
}

class _ReelsFeedScreenState extends State<ReelsFeedScreen> {
  PageController? _pageController;
  String? _controllerKey;

  Stream<QuerySnapshot<Map<String, dynamic>>> _reelsStream() {
    Query<Map<String, dynamic>> query = FirebaseFirestore.instance.collection(
      'reels',
    );

    if (widget.authorUid != null && widget.authorUid!.isNotEmpty) {
      query = query.where('uid', isEqualTo: widget.authorUid);
      if (!widget.includePrivate) {
        query = query.where('isPublic', isEqualTo: true);
      }
    } else {
      query = query.where('isPublic', isEqualTo: true);
    }

    return query.orderBy('createdAt', descending: true).limit(30).snapshots();
  }

  PageController _controllerFor(List<QueryDocumentSnapshot> docs) {
    final ids = docs.map((doc) => doc.id).join('|');
    final key = '${widget.initialReelId ?? ''}:$ids';
    if (_pageController != null && _controllerKey == key) {
      return _pageController!;
    }

    _pageController?.dispose();
    final initialIndex =
        widget.initialReelId == null
            ? 0
            : docs.indexWhere((doc) => doc.id == widget.initialReelId);
    _controllerKey = key;
    _pageController = PageController(
      initialPage: initialIndex < 0 ? 0 : initialIndex,
    );
    return _pageController!;
  }

  @override
  void dispose() {
    _pageController?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8F6FF),
      appBar: AppBar(
        backgroundColor: Colors.deepPurple,
        iconTheme: const IconThemeData(color: Colors.white),
        centerTitle: true,
        title: const Text(
          'Reels',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900),
        ),
        actions: [
          IconButton(
            tooltip: 'New Reel',
            icon: const Icon(Icons.add_box_outlined, color: Colors.white),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const NewReelScreen()),
              );
            },
          ),
        ],
      ),
      body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: _reelsStream(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(
              child: CircularProgressIndicator(color: Colors.deepPurple),
            );
          }

          final docs = snapshot.data?.docs ?? [];
          if (docs.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(28),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 76,
                      height: 76,
                      decoration: const BoxDecoration(
                        color: Color(0xFFEDE7FF),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.video_collection_outlined,
                        color: Colors.deepPurple,
                        size: 34,
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'No reels yet.',
                      style: TextStyle(
                        color: Colors.deepPurple,
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              ),
            );
          }

          return DecoratedBox(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0xFFF8F6FF), Color(0xFFFFFFFF)],
              ),
            ),
            child: PageView.builder(
              controller: _controllerFor(docs),
              scrollDirection: Axis.vertical,
              itemCount: docs.length,
              itemBuilder: (context, index) {
                final doc = docs[index];
                return _ReelPage(reelId: doc.id, data: doc.data());
              },
            ),
          );
        },
      ),
    );
  }
}

class _ReelPage extends StatefulWidget {
  final String reelId;
  final Map<String, dynamic> data;

  const _ReelPage({required this.reelId, required this.data});

  @override
  State<_ReelPage> createState() => _ReelPageState();
}

class _ReelPageState extends State<_ReelPage> {
  VideoPlayerController? _controller;
  bool _isReady = false;

  @override
  void initState() {
    super.initState();
    _initVideo();
  }

  Future<void> _initVideo() async {
    final url = (widget.data['videoUrl'] ?? '').toString();
    if (url.isEmpty) return;

    final controller = VideoPlayerController.networkUrl(Uri.parse(url));
    try {
      await controller.initialize();
      await controller.setLooping(true);
      await controller.play();
      if (!mounted) {
        await controller.dispose();
        return;
      }
      setState(() {
        _controller = controller;
        _isReady = true;
      });
    } catch (_) {
      await controller.dispose();
    }
  }

  Future<void> _toggleLike() async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return;

    final ref = FirebaseFirestore.instance
        .collection('reels')
        .doc(widget.reelId);
    final likedBy = List<String>.from(widget.data['likedBy'] ?? []);
    final isLiked = likedBy.contains(uid);

    await ref.update({
      'likedBy':
          isLiked
              ? FieldValue.arrayRemove([uid])
              : FieldValue.arrayUnion([uid]),
      'likesCount': FieldValue.increment(isLiked ? -1 : 1),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> _shareReel() async {
    final title = (widget.data['title'] ?? 'Reel').toString();
    final link = 'https://easespotter.com/reels/${widget.reelId}';
    await SharePlus.instance.share(
      ShareParams(text: 'Check out this EaseSpotter reel: $title\n$link'),
    );
  }

  void _openCommentsSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Theme.of(context).colorScheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => _ReelCommentsSheet(reelId: widget.reelId),
    );
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    final uid = FirebaseAuth.instance.currentUser?.uid;
    final likedBy = List<String>.from(widget.data['likedBy'] ?? []);
    final isLiked = uid != null && likedBy.contains(uid);
    final likes =
        (widget.data['likesCount'] as num?)?.toInt() ?? likedBy.length;
    final commentsCount = (widget.data['commentsCount'] as num?)?.toInt() ?? 0;

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () {
        final video = _controller;
        if (video == null) return;
        video.value.isPlaying ? video.pause() : video.play();
      },
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 16),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: const Color(0xFFE5DFFF)),
              boxShadow: [
                BoxShadow(
                  color: Colors.deepPurple.withValues(alpha: 0.10),
                  blurRadius: 18,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Container(color: const Color(0xFF141018)),
                  if (_isReady && controller != null)
                    Center(
                      child: AspectRatio(
                        aspectRatio: controller.value.aspectRatio,
                        child: VideoPlayer(controller),
                      ),
                    )
                  else
                    const Center(
                      child: CircularProgressIndicator(color: Colors.white),
                    ),
                  Positioned.fill(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            Colors.black.withValues(alpha: 0.12),
                            Colors.transparent,
                            Colors.black.withValues(alpha: 0.72),
                          ],
                        ),
                      ),
                    ),
                  ),
                  Positioned(
                    left: 16,
                    right: 88,
                    bottom: 24,
                    child: _ReelTextOverlay(data: widget.data),
                  ),
                  Positioned(
                    right: 14,
                    bottom: 42,
                    child: Column(
                      children: [
                        _ReelActionButton(
                          tooltip: 'Like',
                          icon:
                              isLiked ? Icons.favorite : Icons.favorite_border,
                          iconColor:
                              isLiked
                                  ? const Color(0xFFE94560)
                                  : Colors.deepPurple,
                          onPressed: _toggleLike,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          likes.toString(),
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 14),
                        _ReelActionButton(
                          tooltip: 'Comments',
                          icon: Icons.mode_comment_outlined,
                          iconColor: Colors.deepPurple,
                          onPressed: _openCommentsSheet,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          commentsCount.toString(),
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 14),
                        _ReelActionButton(
                          tooltip: 'Share',
                          icon: Icons.ios_share,
                          iconColor: Colors.deepPurple,
                          onPressed: _shareReel,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ReelActionButton extends StatelessWidget {
  final String tooltip;
  final IconData icon;
  final Color iconColor;
  final VoidCallback onPressed;

  const _ReelActionButton({
    required this.tooltip,
    required this.icon,
    required this.iconColor,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(8),
      elevation: 2,
      child: IconButton(
        tooltip: tooltip,
        icon: Icon(icon, color: iconColor),
        onPressed: onPressed,
      ),
    );
  }
}

class _ReelCommentsSheet extends StatefulWidget {
  final String reelId;

  const _ReelCommentsSheet({required this.reelId});

  @override
  State<_ReelCommentsSheet> createState() => _ReelCommentsSheetState();
}

class _ReelCommentsSheetState extends State<_ReelCommentsSheet> {
  final TextEditingController _controller = TextEditingController();
  final FocusNode _focusNode = FocusNode();

  String? _replyingToCommentId;
  String? _replyingToName;
  bool _sending = false;

  @override
  void dispose() {
    _controller.dispose();
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
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sign in to use this action.')),
      );
      return;
    }

    final text = _controller.text.trim();
    if (text.isEmpty || _sending) return;

    setState(() => _sending = true);

    try {
      final reelRef = FirebaseFirestore.instance
          .collection('reels')
          .doc(widget.reelId);
      final batch = FirebaseFirestore.instance.batch();

      batch.update(reelRef, {
        'commentsCount': FieldValue.increment(1),
        'updatedAt': FieldValue.serverTimestamp(),
      });

      if (_replyingToCommentId == null) {
        final commentRef = reelRef.collection('comments').doc();
        batch.set(commentRef, {
          'uid': user.uid,
          'text': text,
          'createdAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
          'upvotedBy': <String>[],
        });
      } else {
        final replyRef =
            reelRef
                .collection('comments')
                .doc(_replyingToCommentId)
                .collection('replies')
                .doc();
        batch.set(replyRef, {
          'uid': user.uid,
          'text': text,
          'createdAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
          'upvotedBy': <String>[],
        });
      }

      await batch.commit();

      _controller.clear();
      if (!mounted) return;
      setState(() {
        _sending = false;
        _replyingToCommentId = null;
        _replyingToName = null;
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) FocusScope.of(context).requestFocus(_focusNode);
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _sending = false);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text("Couldn't post comment.")));
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.85,
      child: Column(
        children: [
          const SizedBox(height: 8),
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: theme.dividerColor,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 12, 8, 8),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Comments',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
              ),
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: CommentList(
              parentPath: 'reels/${widget.reelId}',
              onReplyTap: _startReply,
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
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w700),
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
            child: Row(
              children: [
                Expanded(
                  child: Container(
                    decoration: BoxDecoration(
                      color: theme.colorScheme.surfaceContainerHighest
                          .withValues(alpha: 0.60),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(
                        color: theme.dividerColor.withValues(alpha: 0.70),
                      ),
                    ),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    child: Row(
                      children: [
                        ComposerAvatar(
                          uid: FirebaseAuth.instance.currentUser?.uid,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: TextField(
                            controller: _controller,
                            focusNode: _focusNode,
                            minLines: 1,
                            maxLines: 4,
                            decoration: InputDecoration(
                              hintText:
                                  _replyingToCommentId == null
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
                  onPressed: _sending ? null : _send,
                  icon:
                      _sending
                          ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                          : const Icon(Icons.send, color: Colors.deepPurple),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ReelTextOverlay extends StatelessWidget {
  final Map<String, dynamic> data;

  const _ReelTextOverlay({required this.data});

  @override
  Widget build(BuildContext context) {
    final title = (data['title'] ?? 'Untitled reel').toString();
    final caption = (data['caption'] ?? '').toString();
    final uid = (data['uid'] ?? data['authorUid'] ?? '').toString();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.92),
            borderRadius: BorderRadius.circular(8),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          child: AuthorHeader(uid: uid),
        ),
        const SizedBox(height: 10),
        Text(
          title,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.w900,
          ),
        ),
        if (caption.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(
            caption,
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 14,
              height: 1.3,
            ),
          ),
        ],
      ],
    );
  }
}
