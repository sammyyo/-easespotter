import 'package:easespotter/widgets/safety_controls.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollCacheExtent;

import '../widgets/bite_video_cover.dart';
import 'reels_feed_screen.dart';

enum _ProfileReelsView { publicReels, savedReels }

class ProfileReelsScreen extends StatefulWidget {
  final String uid;
  final bool isOwnerViewing;

  const ProfileReelsScreen({
    super.key,
    required this.uid,
    required this.isOwnerViewing,
  });

  @override
  State<ProfileReelsScreen> createState() => _ProfileReelsScreenState();
}

class _ProfileReelsScreenState extends State<ProfileReelsScreen> {
  _ProfileReelsView _view = _ProfileReelsView.publicReels;

  Stream<QuerySnapshot<Map<String, dynamic>>> _publicReelsStream() {
    return FirebaseFirestore.instance
        .collection('reels')
        .where('uid', isEqualTo: widget.uid)
        .where('isPublic', isEqualTo: true)
        .orderBy('createdAt', descending: true)
        .snapshots();
  }

  Stream<QuerySnapshot<Map<String, dynamic>>> _savedReelsStream() {
    return FirebaseFirestore.instance
        .collection('users')
        .doc(widget.uid)
        .collection('savedReels')
        .orderBy('savedAt', descending: true)
        .snapshots();
  }

  void _openReel({required String reelId, required String ownerUid}) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ReelsFeedScreen(
          authorUid: ownerUid,
          initialReelId: reelId,
          includePrivate: false,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isSaved = _view == _ProfileReelsView.savedReels;
    final stream = isSaved ? _savedReelsStream() : _publicReelsStream();

    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF006677),
        centerTitle: true,
        iconTheme: const IconThemeData(color: Colors.white),
        title: Text(
          'Bites',
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
      body: Column(
        children: [
          if (widget.isOwnerViewing)
            _ProfileReelsPillSwitch(
              selectedIndex: isSaved ? 1 : 0,
              onSelect: (index) => setState(
                () => _view = index == 0
                    ? _ProfileReelsView.publicReels
                    : _ProfileReelsView.savedReels,
              ),
            ),
          Expanded(
            child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
              stream: stream,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }

                final docs = snapshot.data?.docs ?? [];
                if (docs.isEmpty) {
                  return Center(
                    child: Text(
                      isSaved ? 'No saved bites yet.' : 'No public bites yet.',
                    ),
                  );
                }

                return GridView.builder(
                  padding: EdgeInsets.zero,
                  scrollCacheExtent: const ScrollCacheExtent.pixels(0),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    crossAxisSpacing: 0,
                    mainAxisSpacing: 0,
                    childAspectRatio: 0.68,
                  ),
                  itemCount: docs.length,
                  itemBuilder: (context, index) {
                    final doc = docs[index];
                    final data = doc.data();
                    final reelId = isSaved
                        ? (data['reelId'] ?? doc.id).toString()
                        : doc.id;
                    final ownerUid =
                        (data['ownerUid'] ?? data['uid'] ?? widget.uid)
                            .toString();
                    final title = (data['title'] ?? 'Bite').toString();
                    final coverUrl = _reelCoverUrl(data);

                    return SafetyContent(
                      key: ValueKey(reelId),
                      uid: ownerUid,
                      child: InkWell(
                        borderRadius: BorderRadius.zero,
                        onTap: () => _openReel(
                          reelId: reelId,
                          ownerUid: ownerUid.isEmpty ? widget.uid : ownerUid,
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.zero,
                          child: Stack(
                            fit: StackFit.expand,
                            children: [
                              BiteVideoCover(
                                coverUrl: coverUrl,
                                videoUrl: (data['videoUrl'] ?? '')
                                    .toString()
                                    .trim(),
                              ),
                              const DecoratedBox(
                                decoration: BoxDecoration(
                                  gradient: LinearGradient(
                                    begin: Alignment.topCenter,
                                    end: Alignment.bottomCenter,
                                    colors: [
                                      Colors.transparent,
                                      Color(0x99000000),
                                    ],
                                  ),
                                ),
                              ),
                              const Center(
                                child: Icon(
                                  Icons.play_circle_fill_rounded,
                                  color: Colors.white70,
                                  size: 42,
                                ),
                              ),
                              Positioned(
                                left: 8,
                                right: 8,
                                bottom: 8,
                                child: Text(
                                  title,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

String _reelCoverUrl(Map<String, dynamic> data) {
  final candidates = [
    data['thumbnailUrl'],
    data['coverUrl'],
    data['coverImageUrl'],
    data['imageUrl'],
    data['image'],
  ];

  for (final value in candidates) {
    final url = (value ?? '').toString().trim();
    if (url.startsWith('http')) return url;
  }
  return '';
}

class _ProfileReelsPillSwitch extends StatelessWidget {
  final int selectedIndex;
  final ValueChanged<int> onSelect;

  const _ProfileReelsPillSwitch({
    required this.selectedIndex,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surface = isDark ? Colors.black12 : Colors.grey.shade100;
    final border = isDark
        ? Colors.white10
        : Colors.black.withValues(alpha: 0.06);

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
      decoration: BoxDecoration(
        color: surface,
        border: Border(bottom: BorderSide(color: border)),
      ),
      child: Container(
        height: 42,
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: isDark ? Colors.black12 : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: border),
        ),
        child: Row(
          children: [
            Expanded(
              child: _ProfileReelsPillButton(
                label: 'Public Bites',
                selected: selectedIndex == 0,
                onTap: () => onSelect(0),
              ),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: _ProfileReelsPillButton(
                label: 'My Saved Bites',
                selected: selectedIndex == 1,
                onTap: () => onSelect(1),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProfileReelsPillButton extends StatefulWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _ProfileReelsPillButton({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  State<_ProfileReelsPillButton> createState() =>
      _ProfileReelsPillButtonState();
}

class _ProfileReelsPillButtonState extends State<_ProfileReelsPillButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final selectedBg = const Color(0xFF006677)
        .withValues(alpha: isDark ? 0.35 : 0.12);
    final selectedText = isDark ? Colors.white : const Color(0xFF006677);
    final unselectedText = isDark ? Colors.white70 : Colors.grey.shade700;

    return GestureDetector(
      onTapDown: (_) => setState(() => _pressed = true),
      onTapCancel: () => setState(() => _pressed = false),
      onTapUp: (_) => setState(() => _pressed = false),
      onTap: widget.onTap,
      child: AnimatedScale(
        scale: _pressed ? 0.98 : 1,
        duration: const Duration(milliseconds: 110),
        curve: Curves.easeOut,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            color: widget.selected ? selectedBg : Colors.transparent,
          ),
          child: Text(
            widget.label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontWeight: FontWeight.w700,
              color: widget.selected ? selectedText : unselectedText,
            ),
          ),
        ),
      ),
    );
  }
}
