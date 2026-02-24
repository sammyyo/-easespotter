import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_staggered_grid_view/flutter_staggered_grid_view.dart';
import 'glowup_detail_screen.dart';
import '../widgets/share_to_connections_sheet.dart';
import '../widgets/recipe_card/author_header.dart';
import '../services/notification_service.dart';

/// Top-level model (Dart does NOT support nested classes)
class GlowTag {
  final String label;
  final String queryValue;
  final IconData icon;
  const GlowTag(this.label, this.queryValue, this.icon);
}

class GlowUpFeedScreen extends StatefulWidget {
  const GlowUpFeedScreen({super.key});
  @override
  State<GlowUpFeedScreen> createState() => _GlowUpFeedScreenState();
}

class _GlowUpFeedScreenState extends State<GlowUpFeedScreen> {
  final List<GlowTag> _tags = const [
    GlowTag('All',    'all',    Icons.grid_view_rounded),
    GlowTag('Pantry', 'pantry', Icons.kitchen_rounded),
    GlowTag('Budget', 'budget', Icons.attach_money_rounded),
    GlowTag('Vegan',  'vegan',  Icons.eco_rounded),
    GlowTag('Snacks', 'snacks', Icons.fastfood_rounded),
    GlowTag('Glow-Up','glow-up',Icons.auto_awesome_rounded),
  ];

  String _selectedTag = 'All';

  // Prevent double-taps on a single card while a write is in flight
  final Set<String> _pending = <String>{};

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.deepPurple,
        centerTitle: true,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text('Glow-Up Feed',
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
      body: Column(
        children: [
          _TopShadow(
            child: _TagFilterBar(
              tags: _tags,
              selectedLabel: _selectedTag,
              onSelect: (label) {
                HapticFeedback.selectionClick();
                setState(() => _selectedTag = label);
              },
            ),
          ),
          Expanded(
            child: StreamBuilder<QuerySnapshot>(
              stream: _glowUpStream(),
              builder: (context, snapshot) {
                if (snapshot.hasError) {
                  debugPrint('Firestore stream error: ${snapshot.error}');
                  return const Center(child: Text('Empty glow-ups feed.'));
                }

                if (!snapshot.hasData) {
                  return const Center(child: CircularProgressIndicator());
                }

                final docs = snapshot.data!.docs;
                if (docs.isEmpty) {
                  return const Center(child: Text('No glow-ups found.'));
                }

                return Padding(
                  padding: const EdgeInsets.all(12),
                  child: MasonryGridView.count(
                    crossAxisCount: 2,
                    mainAxisSpacing: 12,
                    crossAxisSpacing: 12,
                    itemCount: docs.length,
                    itemBuilder: (context, index) {
                      final doc = docs[index];
                      final data = doc.data() as Map<String, dynamic>;
                      return _buildGlowUpCard(data, doc.id);
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Stream<QuerySnapshot> _glowUpStream() {
    final baseQuery = FirebaseFirestore.instance
        .collection('glowups')
        .where('isPublic', isEqualTo: true);

    final filteredQuery = _selectedTag != 'All'
        ? baseQuery.where('tags', arrayContains: _selectedTag.toLowerCase())
        : baseQuery;

    return filteredQuery.orderBy('createdAt', descending: true).snapshots();
  }

  Future<void> _shareGlowUp({
    required String docId,
    required String title,
  }) async {
    final resolvedTitle = title.isNotEmpty ? title : 'Glow-Up Story';
    final link = 'https://easespotter.com/glowup/$docId';
    final text = '$resolvedTitle\n$link';

    await showShareToConnectionsSheet(
      context,
      title: 'Share Glow-Up Story',
      shareText: text,
    );
  }

  Widget _buildGlowUpCard(Map<String, dynamic> data, String docId) {
    final user = FirebaseAuth.instance.currentUser;
    final canReact = user != null;

    final String imageUrl = (data['imageUrl'] ?? '') as String;
    final String title = (data['title'] ?? '') as String;
    final String description = (data['description'] ?? '') as String;
    final String authorUid = (data['authorUid'] ?? data['uid'] ?? '').toString();

    final List<String> likedBy =
    List<String>.from((data['likedBy'] ?? const <dynamic>[]) as List);

    final bool isLiked = canReact && likedBy.contains(user.uid);
    final bool isBusy = _pending.contains(docId);

    return GestureDetector(
      key: ValueKey(docId),
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => GlowUpDetailScreen(glowUpId: docId)),
      ),
      child: Card(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        clipBehavior: Clip.antiAlias,
        elevation: 4,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (authorUid.isNotEmpty)
              Padding(
                padding: const EdgeInsets.all(8.0),
                child: AuthorHeader(uid: authorUid),
              ),

            if (imageUrl.isNotEmpty)
              Stack(
                children: [
                  Image.network(
                    imageUrl,
                    height: 180,
                    width: double.infinity,
                    fit: BoxFit.cover,
                    loadingBuilder: (context, child, progress) {
                      if (progress == null) return child;
                      return Container(
                        height: 180,
                        color: Colors.grey.shade200,
                        child: const Center(child: CircularProgressIndicator(strokeWidth: 2)),
                      );
                    },
                    errorBuilder: (context, error, stackTrace) => Container(
                      height: 180,
                      color: Colors.grey.shade100,
                      child: const Icon(Icons.broken_image, size: 48),
                    ),
                  ),
                  Positioned(
                    bottom: 0, left: 0, right: 0,
                    child: Container(
                      height: 60,
                      decoration: const BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter, end: Alignment.bottomCenter,
                          colors: [Colors.transparent, Colors.black54],
                        ),
                      ),
                    ),
                  ),
                  Positioned(
                    bottom: 8, left: 10, right: 10,
                    child: Text(
                      title,
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                        fontSize: 14,
                        shadows: [Shadow(blurRadius: 2, color: Colors.black45)],
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            Padding(
              padding: const EdgeInsets.all(10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    description,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 13, color: Colors.black87),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      IconButton(
                        icon: Icon(
                          isLiked ? Icons.favorite : Icons.favorite_border,
                          color: isLiked ? Colors.red : Colors.grey,
                          size: 20,
                        ),
                        onPressed: (!canReact || isBusy)
                            ? null
                            : () {
                          HapticFeedback.selectionClick();
                          _toggleLike(docId: docId, authorUid: authorUid);
                        },
                        tooltip: canReact ? 'Like' : 'Sign in to react',
                      ),
                      Text('${likedBy.length}'),
                      const SizedBox(width: 8),
                      IconButton(
                        tooltip: 'Share',
                        icon: const Icon(Icons.share, size: 20),
                        onPressed: () => _shareGlowUp(docId: docId, title: title),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _toggleLike({required String docId, required String authorUid}) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please sign in to react')),
      );
      return;
    }

    if (_pending.contains(docId)) return;
    setState(() => _pending.add(docId));

    final docRef = FirebaseFirestore.instance.collection('glowups').doc(docId);
    bool liked = false;

    try {
      await FirebaseFirestore.instance.runTransaction((tx) async {
        final snap = await tx.get(docRef);
        if (!snap.exists) return;

        final data = (snap.data() ?? {});
        final Set<String> likes =
        Set<String>.from((data['likedBy'] ?? const <dynamic>[]) as List);

        final bool hasLike = likes.contains(user.uid);

        if (hasLike) {
          likes.remove(user.uid);
          liked = false;
        } else {
          likes.add(user.uid);
          liked = true;
        }

        tx.update(docRef, {
          'likedBy': likes.toList(),
          'updatedAt': FieldValue.serverTimestamp(),
        });
      });

      if (liked && authorUid.isNotEmpty && authorUid != user.uid) {
        final notif = NotificationService();
        final myHandleOrName = user.displayName ?? 'Someone';
        await notif.notifyUser(
          toUid: authorUid,
          type: "reaction",
          message: "$myHandleOrName liked your glow-up",
          itemType: "glowup",
          itemId: docId,
          actorUid: user.uid,
          actorName: myHandleOrName,
          actorAvatarUrl: user.photoURL,
        );
      }
    } catch (e) {
      debugPrint('❤️ Like toggle error for $docId: $e');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Couldn’t update reaction: $e')),
      );
    } finally {
      if (mounted) setState(() => _pending.remove(docId));
    }
  }
}

class _TopShadow extends StatelessWidget {
  final Widget child;
  const _TopShadow({required this.child});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        child,
        Container(height: 1, color: Theme.of(context).dividerColor.withOpacity(0.5)),
      ],
    );
  }
}

class _TagFilterBar extends StatelessWidget {
  final List<GlowTag> tags;
  final String selectedLabel;
  final ValueChanged<String> onSelect;

  const _TagFilterBar({
    required this.tags,
    required this.selectedLabel,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      elevation: 2,
      color: Theme.of(context).colorScheme.surface,
      child: SizedBox(
        height: 56,
        child: ListView.separated(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          scrollDirection: Axis.horizontal,
          itemCount: tags.length,
          separatorBuilder: (_, __) => const SizedBox(width: 8),
          itemBuilder: (context, i) {
            final tag = tags[i];
            final bool selected = tag.label == selectedLabel;

            return Semantics(
              button: true,
              selected: selected,
              label: 'Filter: ${tag.label}',
              child: ChoiceChip(
                labelPadding: const EdgeInsets.symmetric(horizontal: 8),
                avatar: Icon(
                  tag.icon,
                  size: 18,
                  color: selected
                      ? Colors.white
                      : Theme.of(context).colorScheme.onSurface.withOpacity(0.7),
                ),
                label: Text(
                  tag.label,
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    color: selected
                        ? Colors.white
                        : Theme.of(context).colorScheme.onSurface,
                  ),
                ),
                selected: selected,
                showCheckmark: false,
                backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
                selectedColor: Colors.deepPurple,
                shape: StadiumBorder(
                  side: BorderSide(
                    color: selected
                        ? Colors.deepPurple
                        : Theme.of(context).dividerColor,
                  ),
                ),
                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                onSelected: (_) => onSelect(tag.label),
              ),
            );
          },
        ),
      ),
    );
  }
}
