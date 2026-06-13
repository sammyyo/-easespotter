import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import 'package:video_player/video_player.dart';

import '../services/grocery_list_service.dart';
import '../widgets/comment_list.dart';
import '../widgets/recipe_card/author_header.dart';
import '../widgets/recipe_card/comments_panel.dart';
import 'community_recipes_screen.dart';
import 'new_reel_screen.dart';
import 'recipe_detail_screen.dart';

enum _ReelFeedMode { reels, following }

bool _isRecipeReelData(Map<String, dynamic> data) {
  final type =
      (data['type'] ?? data['reelType'] ?? '').toString().toLowerCase();
  final recipeId = (data['recipeId'] ?? '').toString().trim();
  return type == 'recipe' || recipeId.isNotEmpty;
}

class ReelsFeedScreen extends StatefulWidget {
  final String? authorUid;
  final String? initialReelId;
  final bool includePrivate;
  final bool startFollowing;

  const ReelsFeedScreen({
    super.key,
    this.authorUid,
    this.initialReelId,
    this.includePrivate = false,
    this.startFollowing = false,
  });

  @override
  State<ReelsFeedScreen> createState() => _ReelsFeedScreenState();
}

class _ReelsFeedScreenState extends State<ReelsFeedScreen> {
  PageController? _pageController;
  String? _controllerKey;
  _ReelFeedMode _mode = _ReelFeedMode.reels;

  @override
  void initState() {
    super.initState();
    if (widget.startFollowing) {
      _mode = _ReelFeedMode.following;
    }
  }

  Stream<QuerySnapshot<Map<String, dynamic>>> _reelsStream({
    List<String>? followingUids,
  }) {
    Query<Map<String, dynamic>> query = FirebaseFirestore.instance.collection(
      'reels',
    );

    if (followingUids != null) {
      query = query
          .where('isPublic', isEqualTo: true)
          .where('uid', whereIn: followingUids.take(10).toList());
    } else if (widget.authorUid != null && widget.authorUid!.isNotEmpty) {
      query = query.where('uid', isEqualTo: widget.authorUid);
      if (!widget.includePrivate) {
        query = query.where('isPublic', isEqualTo: true);
      }
    } else {
      query = query.where('isPublic', isEqualTo: true);
    }

    return query.orderBy('createdAt', descending: true).limit(30).snapshots();
  }

  Future<List<String>> _followingUids() async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return const [];

    final snap =
        await FirebaseFirestore.instance.collection('users').doc(uid).get();
    final raw = snap.data()?['following'];
    if (raw is! List) return const [];

    return raw
        .map((item) => item.toString().trim())
        .where((item) => item.isNotEmpty)
        .toSet()
        .toList();
  }

  void _resetPager() {
    _controllerKey = null;
    _pageController?.dispose();
    _pageController = null;
  }

  void _showReels() {
    if (_mode == _ReelFeedMode.reels) return;
    setState(() {
      _mode = _ReelFeedMode.reels;
      _resetPager();
    });
  }

  void _showFollowing() {
    if (_mode == _ReelFeedMode.following) return;
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => const ReelsFeedScreen(startFollowing: true),
      ),
    );
  }

  void _openExplore() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const CommunityRecipesScreen()),
    );
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
      backgroundColor: Colors.black,
      extendBodyBehindAppBar: true,
      body:
          _mode == _ReelFeedMode.following
              ? FutureBuilder<List<String>>(
                future: _followingUids(),
                builder: (context, snapshot) {
                  final following = snapshot.data ?? const [];
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const Center(
                      child: CircularProgressIndicator(
                        color: Colors.deepPurple,
                      ),
                    );
                  }
                  if (following.isEmpty) {
                    return _emptyState('No following reels yet.');
                  }
                  return _feedStream(
                    stream: _reelsStream(followingUids: following),
                  );
                },
              )
              : _feedStream(stream: _reelsStream()),
    );
  }

  Widget _feedStream({
    required Stream<QuerySnapshot<Map<String, dynamic>>> stream,
  }) {
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: stream,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(
            child: CircularProgressIndicator(color: Colors.deepPurple),
          );
        }

        final docs = snapshot.data?.docs ?? [];
        if (docs.isEmpty) {
          return _emptyState(
            _mode == _ReelFeedMode.following
                ? 'No following reels yet.'
                : 'No reels yet.',
          );
        }

        return Stack(
          children: [
            PageView.builder(
              controller: _controllerFor(docs),
              scrollDirection: Axis.vertical,
              itemCount: docs.length,
              itemBuilder: (context, index) {
                final doc = docs[index];
                return _ReelPage(reelId: doc.id, data: doc.data());
              },
            ),
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(8, 6, 8, 0),
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      Align(
                        alignment: Alignment.centerLeft,
                        child: _TopOverlayButton(
                          tooltip: 'Back',
                          icon: Icons.arrow_back,
                          onPressed: () {
                            final navigator = Navigator.of(context);
                            if (navigator.canPop()) {
                              navigator.pop();
                            }
                          },
                        ),
                      ),
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          _ReelTabLabel(label: 'Explore', onTap: _openExplore),
                          const SizedBox(width: 24),
                          _ReelTabLabel(
                            label: 'Reels',
                            selected: _mode == _ReelFeedMode.reels,
                            onTap: _showReels,
                          ),
                          const SizedBox(width: 24),
                          _ReelTabLabel(
                            label: 'Following',
                            selected: _mode == _ReelFeedMode.following,
                            onTap: _showFollowing,
                          ),
                        ],
                      ),
                      Align(
                        alignment: Alignment.centerRight,
                        child: _TopOverlayButton(
                          tooltip: 'New Reel',
                          icon: Icons.add_circle_outline,
                          onPressed: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => const NewReelScreen(),
                              ),
                            );
                          },
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _emptyState(String message) {
    return Stack(
      children: [
        Positioned(
          top: 0,
          left: 0,
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(8, 6, 0, 0),
              child: _TopOverlayButton(
                tooltip: 'Back',
                icon: Icons.arrow_back,
                onPressed: () => Navigator.maybePop(context),
              ),
            ),
          ),
        ),
        Center(
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
                Text(
                  message,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _TopOverlayButton extends StatelessWidget {
  final String tooltip;
  final IconData icon;
  final VoidCallback onPressed;

  const _TopOverlayButton({
    required this.tooltip,
    required this.icon,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.black.withValues(alpha: 0.30),
      borderRadius: BorderRadius.circular(8),
      child: IconButton(
        tooltip: tooltip,
        icon: Icon(icon, color: Colors.white),
        onPressed: onPressed,
      ),
    );
  }
}

class _ReelTabLabel extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _ReelTabLabel({
    required this.label,
    required this.onTap,
    this.selected = false,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: TextStyle(
                color: Colors.white.withValues(alpha: selected ? 1 : 0.82),
                fontSize: 15,
                fontWeight: selected ? FontWeight.w900 : FontWeight.w600,
              ),
            ),
            const SizedBox(height: 5),
            AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              height: 2,
              width: selected ? 28 : 0,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ],
        ),
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
  final GroceryListService _groceryList = GroceryListService();
  bool _isReady = false;
  bool _groceryExpanded = false;
  bool _savingGroceryItems = false;
  bool _grocerySaved = false;
  bool _savingReel = false;
  Set<int>? _selectedGroceryIndexes;

  List<Map<String, dynamic>> get _groceryItems {
    final raw = widget.data['groceryListItems'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  String get _groceryTitle {
    return (widget.data['groceryListTitle'] ?? 'Grocery List')
        .toString()
        .trim();
  }

  bool get _isOwner {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    final ownerUid =
        (widget.data['uid'] ?? widget.data['authorUid'] ?? '').toString();
    return uid != null && uid == ownerUid;
  }

  bool get _isRecipeReel => _isRecipeReelData(widget.data);

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

  DocumentReference<Map<String, dynamic>>? _savedReelRef() {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return null;

    return FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .collection('savedReels')
        .doc(widget.reelId);
  }

  Future<void> _toggleSaveReel({required bool isSaved}) async {
    final ref = _savedReelRef();
    if (ref == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Sign in to save reels.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }
    if (_savingReel) return;

    setState(() => _savingReel = true);
    try {
      if (isSaved) {
        await ref.delete();
      } else {
        final ownerUid =
            (widget.data['uid'] ?? widget.data['authorUid'] ?? '').toString();
        await ref.set({
          'reelId': widget.reelId,
          'ownerUid': ownerUid,
          'title': (widget.data['title'] ?? '').toString(),
          'caption': (widget.data['caption'] ?? '').toString(),
          'videoUrl': (widget.data['videoUrl'] ?? '').toString(),
          'thumbnailUrl': (widget.data['thumbnailUrl'] ?? '').toString(),
          'isPublic': widget.data['isPublic'] == true,
          'savedAt': FieldValue.serverTimestamp(),
          'reelCreatedAt': widget.data['createdAt'],
        }, SetOptions(merge: true));
      }

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(isSaved ? 'Reel removed from saved.' : 'Reel saved.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Could not update saved reel: $e'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } finally {
      if (mounted) setState(() => _savingReel = false);
    }
  }

  void _openShop() {
    if (_groceryItems.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No grocery list attached to this reel.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }
    setState(() => _groceryExpanded = true);
  }

  void _openMoreActions() {
    final savedRef = _savedReelRef();
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder:
          (context) => SafeArea(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ListTile(
                  leading: const Icon(Icons.ios_share),
                  title: const Text('Share Reel'),
                  onTap: () {
                    Navigator.pop(context);
                    _shareReel();
                  },
                ),
                if (savedRef == null)
                  ListTile(
                    leading: const Icon(Icons.bookmark_border),
                    title: const Text('Save Reel'),
                    onTap: () {
                      Navigator.pop(context);
                      _toggleSaveReel(isSaved: false);
                    },
                  )
                else
                  StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
                    stream: savedRef.snapshots(),
                    builder: (context, snapshot) {
                      final isSaved = snapshot.data?.exists == true;
                      return ListTile(
                        leading: Icon(
                          isSaved ? Icons.bookmark : Icons.bookmark_border,
                        ),
                        title: Text(isSaved ? 'Unsave Reel' : 'Save Reel'),
                        onTap: () {
                          Navigator.pop(context);
                          _toggleSaveReel(isSaved: isSaved);
                        },
                      );
                    },
                  ),
                if (_isOwner)
                  ListTile(
                    leading: const Icon(
                      Icons.delete_outline,
                      color: Color(0xFFE94560),
                    ),
                    title: const Text(
                      'Delete Reel',
                      style: TextStyle(color: Color(0xFFE94560)),
                    ),
                    onTap: () {
                      Navigator.pop(context);
                      _confirmDeleteReel();
                    },
                  ),
              ],
            ),
          ),
    );
  }

  Future<void> _confirmDeleteReel() async {
    if (!_isOwner) return;

    final ok = await showDialog<bool>(
      context: context,
      builder:
          (context) => AlertDialog(
            title: const Text('Delete reel?'),
            content: const Text(
              'This will permanently remove the reel, its video, and comments.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Cancel'),
              ),
              TextButton(
                onPressed: () => Navigator.pop(context, true),
                style: TextButton.styleFrom(
                  foregroundColor: const Color(0xFFE94560),
                ),
                child: const Text('Delete'),
              ),
            ],
          ),
    );

    if (ok != true || !mounted) return;

    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(child: CircularProgressIndicator()),
    );

    try {
      await _controller?.pause();
      await _deleteReelCascade();

      if (!mounted) return;
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Reel deleted.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Could not delete reel: $e'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  Future<void> _deleteReelCascade() async {
    final reelRef = FirebaseFirestore.instance
        .collection('reels')
        .doc(widget.reelId);

    const pageSize = 300;
    while (true) {
      final comments =
          await reelRef.collection('comments').limit(pageSize).get();
      if (comments.docs.isEmpty) break;

      for (final comment in comments.docs) {
        while (true) {
          final replies =
              await comment.reference
                  .collection('replies')
                  .limit(pageSize)
                  .get();
          if (replies.docs.isEmpty) break;

          final replyBatch = FirebaseFirestore.instance.batch();
          for (final reply in replies.docs) {
            replyBatch.delete(reply.reference);
          }
          await replyBatch.commit();
        }
      }

      final commentBatch = FirebaseFirestore.instance.batch();
      for (final comment in comments.docs) {
        commentBatch.delete(comment.reference);
      }
      await commentBatch.commit();
    }

    await reelRef.delete();

    final storagePath = (widget.data['storagePath'] ?? '').toString().trim();
    final videoUrl = (widget.data['videoUrl'] ?? '').toString().trim();
    try {
      if (storagePath.isNotEmpty) {
        await FirebaseStorage.instance.ref(storagePath).delete();
      } else if (videoUrl.isNotEmpty) {
        await FirebaseStorage.instance.refFromURL(videoUrl).delete();
      }
    } on FirebaseException catch (e) {
      if (e.code != 'object-not-found') rethrow;
    }
  }

  Future<void> _saveSelectedGroceryItems() async {
    final selected = _selectedGroceryIndexes ?? _defaultGrocerySelection();
    final sourceItems = _groceryItems;
    if (sourceItems.isEmpty || selected.isEmpty || _savingGroceryItems) return;

    setState(() => _savingGroceryItems = true);

    try {
      final existing = await _groceryList.getList();
      final existingNames =
          existing
              .map(
                (item) => (item['title'] ?? '').toString().trim().toLowerCase(),
              )
              .where((name) => name.isNotEmpty)
              .toSet();

      int added = 0;
      for (final index in selected) {
        if (index < 0 || index >= sourceItems.length) continue;
        final source = sourceItems[index];
        final title =
            (source['title'] ?? source['name'] ?? '').toString().trim();
        if (title.isEmpty) continue;

        final key = title.toLowerCase();
        if (existingNames.contains(key)) continue;

        existing.add({
          ...source,
          'title': title,
          'checked': false,
          'category': (source['category'] ?? 'General').toString(),
          'quantity': source['quantity'] ?? 1,
          'unitPrice': source['unitPrice'] ?? 0.0,
          'price': source['price'] ?? 0.0,
          'source': 'reel',
          'reelId': widget.reelId,
          'reelTitle': (widget.data['title'] ?? '').toString(),
        });
        existingNames.add(key);
        added++;
      }

      if (added > 0) {
        await _groceryList.saveList(existing);
      }

      if (!mounted) return;
      setState(() {
        _savingGroceryItems = false;
        _grocerySaved = true;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            added == 0
                ? 'Those items are already in your Grocery List.'
                : 'Added $added item${added == 1 ? '' : 's'} to your Grocery List.',
          ),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _savingGroceryItems = false);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Could not save list: $e')));
    }
  }

  Set<int> _defaultGrocerySelection() {
    return Set<int>.from(
      List<int>.generate(_groceryItems.length, (index) => index),
    );
  }

  Set<int> _currentGrocerySelection() {
    _selectedGroceryIndexes ??= _defaultGrocerySelection();
    return _selectedGroceryIndexes!;
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
      builder:
          (_) => _ReelCommentsSheet(
            reelId: widget.reelId,
            isRecipeReel: _isRecipeReel,
          ),
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
    final savedRef = _savedReelRef();

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () async {
        final video = _controller;
        if (video == null) return;
        if (video.value.isPlaying) {
          await video.pause();
        } else {
          await video.play();
        }
        if (mounted) setState(() {});
      },
      child: Stack(
        fit: StackFit.expand,
        children: [
          Container(color: Colors.black),
          if (_isReady && controller != null)
            FittedBox(
              fit: BoxFit.cover,
              child: SizedBox(
                width: controller.value.size.width,
                height: controller.value.size.height,
                child: VideoPlayer(controller),
              ),
            )
          else
            const Center(child: CircularProgressIndicator(color: Colors.white)),
          if (_isReady && controller != null && !controller.value.isPlaying)
            Center(
              child: Container(
                width: 78,
                height: 78,
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.46),
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.26),
                  ),
                ),
                child: const Icon(
                  Icons.play_arrow_rounded,
                  color: Colors.white,
                  size: 54,
                ),
              ),
            ),
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withValues(alpha: 0.42),
                    Colors.transparent,
                    Colors.black.withValues(alpha: 0.78),
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            left: 16,
            right: 88,
            bottom: 26 + MediaQuery.of(context).padding.bottom,
            child: _ReelTextOverlay(data: widget.data),
          ),
          if (_groceryItems.isNotEmpty)
            Positioned(
              left: 14,
              right: _groceryExpanded ? 14 : 88,
              bottom:
                  (_groceryExpanded ? 16 : 132) +
                  MediaQuery.of(context).padding.bottom,
              child: _GroceryListOverlay(
                title: _groceryTitle.isEmpty ? 'Grocery List' : _groceryTitle,
                items: _groceryItems,
                expanded: _groceryExpanded,
                selectedIndexes: _currentGrocerySelection(),
                saving: _savingGroceryItems,
                saved: _grocerySaved,
                onToggleExpanded:
                    () => setState(() => _groceryExpanded = !_groceryExpanded),
                onToggleItem: (index) {
                  setState(() {
                    final selected = _currentGrocerySelection();
                    if (selected.contains(index)) {
                      selected.remove(index);
                    } else {
                      selected.add(index);
                    }
                  });
                },
                onSave: _saveSelectedGroceryItems,
              ),
            ),
          Positioned(
            right: 14,
            bottom: 42 + MediaQuery.of(context).padding.bottom,
            child: Column(
              children: [
                _ReelActionButton(
                  tooltip: 'Like',
                  icon: isLiked ? Icons.favorite : Icons.favorite_border,
                  iconColor: isLiked ? const Color(0xFFFF4D67) : Colors.white,
                  label: likes.toString(),
                  onPressed: _toggleLike,
                ),
                const SizedBox(height: 12),
                _ReelActionButton(
                  tooltip: 'Comments',
                  icon: Icons.mode_comment_outlined,
                  iconColor: Colors.white,
                  label: commentsCount.toString(),
                  onPressed: _openCommentsSheet,
                ),
                const SizedBox(height: 12),
                if (savedRef == null)
                  _ReelActionButton(
                    tooltip: 'Save',
                    icon: Icons.bookmark_border,
                    iconColor: Colors.white,
                    onPressed: () => _toggleSaveReel(isSaved: false),
                  )
                else
                  StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
                    stream: savedRef.snapshots(),
                    builder: (context, snapshot) {
                      final isSaved = snapshot.data?.exists == true;
                      return _ReelActionButton(
                        tooltip: isSaved ? 'Unsave' : 'Save',
                        icon: isSaved ? Icons.bookmark : Icons.bookmark_border,
                        iconColor:
                            isSaved ? const Color(0xFFFFB020) : Colors.white,
                        onPressed:
                            _savingReel
                                ? () {}
                                : () => _toggleSaveReel(isSaved: isSaved),
                      );
                    },
                  ),
                const SizedBox(height: 12),
                _ReelActionButton(
                  tooltip: 'Share',
                  icon: Icons.ios_share,
                  iconColor: Colors.white,
                  onPressed: _shareReel,
                ),
                const SizedBox(height: 12),
                _ReelActionButton(
                  tooltip: 'Recipe',
                  icon: Icons.restaurant_menu_rounded,
                  iconColor: Colors.white,
                  onPressed: _openShop,
                ),
                const SizedBox(height: 12),
                _ReelActionButton(
                  tooltip: 'More',
                  icon: Icons.add_circle_outline,
                  iconColor: Colors.white,
                  onPressed: _openMoreActions,
                ),
              ],
            ),
          ),
          if (_isReady && controller != null)
            Positioned(
              left: 18,
              right: 18,
              bottom: 8 + MediaQuery.of(context).padding.bottom,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: VideoProgressIndicator(
                  controller,
                  allowScrubbing: true,
                  colors: const VideoProgressColors(
                    playedColor: Color(0xFF6F3BFF),
                    bufferedColor: Colors.white54,
                    backgroundColor: Colors.white24,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _ReelActionButton extends StatelessWidget {
  final String tooltip;
  final IconData icon;
  final Color iconColor;
  final String? label;
  final VoidCallback onPressed;

  const _ReelActionButton({
    required this.tooltip,
    required this.icon,
    required this.iconColor,
    this.label,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onPressed,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: iconColor, size: 32),
            if (label != null) ...[
              const SizedBox(height: 3),
              Text(
                label!,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  shadows: [
                    Shadow(
                      color: Colors.black54,
                      blurRadius: 4,
                      offset: Offset(0, 1),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ReelCommentsSheet extends StatefulWidget {
  final String reelId;
  final bool isRecipeReel;

  const _ReelCommentsSheet({required this.reelId, required this.isRecipeReel});

  @override
  State<_ReelCommentsSheet> createState() => _ReelCommentsSheetState();
}

class _ReelCommentsSheetState extends State<_ReelCommentsSheet> {
  final TextEditingController _controller = TextEditingController();
  final FocusNode _focusNode = FocusNode();

  String? _replyingToCommentId;
  String? _replyingToName;
  bool _sending = false;
  int _selectedRating = 0;

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
      _selectedRating = 0;
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

      if (_replyingToCommentId == null) {
        final rating = widget.isRecipeReel ? _selectedRating : 0;
        final batch = FirebaseFirestore.instance.batch();
        final commentRef = reelRef.collection('comments').doc();

        batch.set(commentRef, {
          'uid': user.uid,
          'text': text,
          if (rating > 0) 'rating': rating,
          'createdAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
          'upvotedBy': <String>[],
        });
        batch.update(reelRef, {
          'commentsCount': FieldValue.increment(1),
          'updatedAt': FieldValue.serverTimestamp(),
        });
        await batch.commit();
      } else {
        final batch = FirebaseFirestore.instance.batch();
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
        batch.update(reelRef, {
          'commentsCount': FieldValue.increment(1),
          'updatedAt': FieldValue.serverTimestamp(),
        });
        await batch.commit();
      }

      _controller.clear();
      if (!mounted) return;
      setState(() {
        _sending = false;
        _replyingToCommentId = null;
        _replyingToName = null;
        _selectedRating = 0;
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
          if (widget.isRecipeReel && _replyingToCommentId == null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
              child: Row(
                children: [
                  const Text(
                    'Rate this recipe:',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(width: 10),
                  _RecipeRatingPicker(
                    rating: _selectedRating,
                    onChanged:
                        (rating) => setState(() => _selectedRating = rating),
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

class _RecipeRatingPicker extends StatelessWidget {
  final int rating;
  final ValueChanged<int> onChanged;

  const _RecipeRatingPicker({required this.rating, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(5, (index) {
        final value = index + 1;
        final selected = value <= rating;
        return InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: () => onChanged(value),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 1),
            child: Icon(
              selected ? Icons.star_rounded : Icons.star_border_rounded,
              size: 24,
              color: const Color(0xFFFFB020),
            ),
          ),
        );
      }),
    );
  }
}

class _GroceryListOverlay extends StatelessWidget {
  final String title;
  final List<Map<String, dynamic>> items;
  final bool expanded;
  final Set<int> selectedIndexes;
  final bool saving;
  final bool saved;
  final VoidCallback onToggleExpanded;
  final ValueChanged<int> onToggleItem;
  final VoidCallback onSave;

  const _GroceryListOverlay({
    required this.title,
    required this.items,
    required this.expanded,
    required this.selectedIndexes,
    required this.saving,
    required this.saved,
    required this.onToggleExpanded,
    required this.onToggleItem,
    required this.onSave,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 240),
      curve: Curves.easeOutCubic,
      height: expanded ? MediaQuery.of(context).size.height * 0.48 : 58,
      decoration: BoxDecoration(
        color:
            expanded
                ? Colors.white.withValues(alpha: 0.96)
                : Colors.white.withValues(alpha: 0.20),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.white.withValues(alpha: 0.34)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.24),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: expanded ? _expanded(context) : _collapsed(),
    );
  }

  Widget _collapsed() {
    return InkWell(
      onTap: onToggleExpanded,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.92),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(
                Icons.shopping_bag_outlined,
                color: Colors.deepPurple,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Ingredients List Attached (${items.length} items)',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w900,
                  fontSize: 13,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Text(
                'View & Save',
                style: TextStyle(
                  color: Colors.deepPurple,
                  fontSize: 12,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _expanded(BuildContext context) {
    final selectedCount = selectedIndexes.length;

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 10, 8),
          child: Row(
            children: [
              const Icon(Icons.checklist_rounded, color: Colors.deepPurple),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.deepPurple,
                    fontWeight: FontWeight.w900,
                    fontSize: 16,
                  ),
                ),
              ),
              IconButton(
                tooltip: 'Collapse',
                onPressed: onToggleExpanded,
                icon: const Icon(Icons.keyboard_arrow_down),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
          child: SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: selectedCount == 0 || saving ? null : onSave,
              icon:
                  saving
                      ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                      : Icon(
                        saved ? Icons.check_circle : Icons.playlist_add_check,
                      ),
              label: Text(
                saved ? 'Added to My Lists' : 'Add $selectedCount to My Lists',
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor:
                    saved ? const Color(0xFF1B8A4B) : Colors.deepPurple,
                foregroundColor: Colors.white,
                minimumSize: const Size.fromHeight(42),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
            ),
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
            itemCount: items.length,
            separatorBuilder: (_, __) => const SizedBox(height: 4),
            itemBuilder: (context, index) {
              final item = items[index];
              final name =
                  (item['title'] ?? item['name'] ?? 'Item').toString().trim();
              final location =
                  (item['location'] ?? item['aisle'] ?? item['storeName'] ?? '')
                      .toString()
                      .trim();
              final checked = selectedIndexes.contains(index);

              return CheckboxListTile(
                value: checked,
                onChanged: (_) => onToggleItem(index),
                dense: true,
                controlAffinity: ListTileControlAffinity.leading,
                activeColor: Colors.deepPurple,
                title: Text(
                  name.isEmpty ? 'Item' : name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                subtitle:
                    location.isEmpty
                        ? null
                        : Align(
                          alignment: Alignment.centerLeft,
                          child: Container(
                            margin: const EdgeInsets.only(top: 4),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: const Color(0xFFF0EBFF),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              location,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Colors.deepPurple,
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _ReelTextOverlay extends StatefulWidget {
  final Map<String, dynamic> data;

  const _ReelTextOverlay({required this.data});

  @override
  State<_ReelTextOverlay> createState() => _ReelTextOverlayState();
}

class _ReelTextOverlayState extends State<_ReelTextOverlay> {
  bool _expanded = false;
  bool _updatingFollow = false;

  String get _authorUid =>
      (widget.data['uid'] ?? widget.data['authorUid'] ?? '').toString();

  List<Map<String, dynamic>> get _ingredients {
    final raw = widget.data['groceryListItems'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .where(
          (item) =>
              (item['title'] ?? item['name'] ?? '')
                  .toString()
                  .trim()
                  .isNotEmpty,
        )
        .toList();
  }

  Future<void> _toggleFollow(bool isFollowing) async {
    final myUid = FirebaseAuth.instance.currentUser?.uid;
    final authorUid = _authorUid;
    if (myUid == null || authorUid.isEmpty || myUid == authorUid) return;
    if (_updatingFollow) return;

    setState(() => _updatingFollow = true);
    final users = FirebaseFirestore.instance.collection('users');

    try {
      if (isFollowing) {
        await users.doc(myUid).update({
          'following': FieldValue.arrayRemove([authorUid]),
        });
        await users.doc(authorUid).update({
          'followers': FieldValue.arrayRemove([myUid]),
        });
      } else {
        await users.doc(myUid).set({
          'following': FieldValue.arrayUnion([authorUid]),
        }, SetOptions(merge: true));
        await users.doc(authorUid).set({
          'followers': FieldValue.arrayUnion([myUid]),
        }, SetOptions(merge: true));
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not update follow status.')),
      );
    } finally {
      if (mounted) setState(() => _updatingFollow = false);
    }
  }

  Widget _followButton() {
    final myUid = FirebaseAuth.instance.currentUser?.uid;
    final authorUid = _authorUid;
    if (myUid == null || authorUid.isEmpty || myUid == authorUid) {
      return const SizedBox.shrink();
    }

    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream:
          FirebaseFirestore.instance.collection('users').doc(myUid).snapshots(),
      builder: (context, snapshot) {
        final following = List<String>.from(
          snapshot.data?.data()?['following'] ?? const [],
        );
        final isFollowing = following.contains(authorUid);

        return OutlinedButton(
          onPressed: _updatingFollow ? null : () => _toggleFollow(isFollowing),
          style: OutlinedButton.styleFrom(
            visualDensity: VisualDensity.compact,
            minimumSize: const Size(0, 32),
            padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 0),
            foregroundColor: Colors.white,
            side: BorderSide(color: Colors.white.withValues(alpha: 0.72)),
            backgroundColor:
                isFollowing
                    ? Colors.white.withValues(alpha: 0.16)
                    : const Color(0xFF6F3BFF),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(999),
            ),
          ),
          child:
              _updatingFollow
                  ? const SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                  : Text(
                    isFollowing ? 'Following' : 'Follow',
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
        );
      },
    );
  }

  void _openRecipe() {
    final recipeId = (widget.data['recipeId'] ?? '').toString().trim();
    if (recipeId.isEmpty) return;

    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => RecipeDetailScreen(recipeId: recipeId)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final title = (widget.data['title'] ?? 'Untitled reel').toString().trim();
    final caption = (widget.data['caption'] ?? '').toString().trim();
    final uid = _authorUid;
    final isRecipeReel = _isRecipeReelData(widget.data);
    final ratingCount = (widget.data['ratingCount'] as num?)?.toInt() ?? 0;
    final averageRating =
        (widget.data['averageRating'] as num?)?.toDouble() ??
        (((widget.data['ratingSum'] as num?)?.toDouble() ?? 0) /
            (ratingCount == 0 ? 1 : ratingCount));
    final category =
        (widget.data['category'] ?? widget.data['groceryListTitle'] ?? '')
            .toString()
            .trim();
    final recipeId = (widget.data['recipeId'] ?? '').toString().trim();
    final ingredients = _ingredients.take(8).toList();
    final expandedMaxHeight = (MediaQuery.of(context).size.height * 0.38).clamp(
      220.0,
      320.0,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (isRecipeReel && ratingCount > 0) ...[
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.34),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.star_rounded,
                  size: 15,
                  color: Color(0xFFFFB020),
                ),
                const SizedBox(width: 5),
                Text(
                  '${averageRating.toStringAsFixed(1)} · $ratingCount rating${ratingCount == 1 ? '' : 's'}',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
        ],
        Row(
          children: [
            Flexible(
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.30),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.18),
                  ),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                child: Theme(
                  data: Theme.of(context).copyWith(
                    textTheme: Theme.of(context).textTheme.apply(
                      bodyColor: Colors.white,
                      displayColor: Colors.white,
                    ),
                    colorScheme: Theme.of(context).colorScheme.copyWith(
                      onSurface: Colors.white,
                      secondary: Colors.white,
                    ),
                  ),
                  child: DefaultTextStyle.merge(
                    style: const TextStyle(color: Colors.white),
                    child: IconTheme.merge(
                      data: const IconThemeData(color: Colors.white),
                      child: AuthorHeader(uid: uid),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            _followButton(),
          ],
        ),
        if (category.isNotEmpty) ...[
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFFFFB020), Color(0xFFFF8A00)],
              ),
              borderRadius: BorderRadius.circular(999),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFFFFB020).withValues(alpha: 0.28),
                  blurRadius: 10,
                ),
              ],
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.shopping_cart, color: Colors.white, size: 14),
                const SizedBox(width: 5),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 150),
                  child: Text(
                    category,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 10),
        AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          constraints: BoxConstraints(
            maxWidth: _expanded ? 330 : 270,
            maxHeight: _expanded ? expandedMaxHeight : 132,
          ),
          padding: EdgeInsets.all(_expanded ? 14 : 11),
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: _expanded ? 0.58 : 0.26),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
          ),
          child: SingleChildScrollView(
            physics:
                _expanded
                    ? const BouncingScrollPhysics()
                    : const NeverScrollableScrollPhysics(),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title.isEmpty ? 'Untitled reel' : title,
                  maxLines: _expanded ? null : 2,
                  overflow:
                      _expanded ? TextOverflow.visible : TextOverflow.ellipsis,
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: _expanded ? 15 : 11.5,
                    fontWeight: FontWeight.w800,
                    height: 1.18,
                  ),
                ),
                if (caption.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    caption,
                    maxLines: _expanded ? null : 2,
                    overflow:
                        _expanded
                            ? TextOverflow.visible
                            : TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      height: 1.32,
                      fontWeight: FontWeight.w400,
                    ),
                  ),
                ],
                if (_expanded && ingredients.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  const Text(
                    'Ingredients:',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 5),
                  ...ingredients.map((item) {
                    final name =
                        (item['title'] ?? item['name'] ?? '').toString().trim();
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 3),
                      child: Text(
                        '• $name',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 13,
                          height: 1.25,
                          fontWeight: FontWeight.w400,
                        ),
                      ),
                    );
                  }),
                ],
                if (_expanded && recipeId.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  TextButton(
                    onPressed: _openRecipe,
                    style: TextButton.styleFrom(
                      padding: EdgeInsets.zero,
                      foregroundColor: const Color(0xFFFFB020),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      minimumSize: const Size(0, 32),
                    ),
                    child: const Text(
                      'View Full Recipe',
                      style: TextStyle(fontWeight: FontWeight.w900),
                    ),
                  ),
                ],
                if (caption.isNotEmpty || ingredients.isNotEmpty) ...[
                  SizedBox(height: _expanded ? 4 : 2),
                  GestureDetector(
                    onTap: () => setState(() => _expanded = !_expanded),
                    child: Text(
                      _expanded ? 'Less' : 'More',
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}
