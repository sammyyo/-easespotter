import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:shimmer/shimmer.dart';

import '../../widgets/recipe_card/author_header.dart';
import '../../widgets/recipe_card/author_actions_menu.dart';
import '../../widgets/recipe_card/comments_count.dart';
import '../../widgets/recipe_card/avatar_stack.dart';
import '../../widgets/recipe_card/comments_panel.dart';
import '../../widgets/recipe_card/delete_utils.dart';
import '../../services/notification_service.dart';
import '../../widgets/share_to_connections_sheet.dart';

import '../../shopping_layer/recipe_detail_screen.dart';

class RecipeCard extends StatefulWidget {
  final String title;
  final String description;
  final String uid;
  final String recipeId;
  final List<String> upvotedBy;
  final String? imageUrl;
  final String? category;

  const RecipeCard({
    super.key,
    required this.title,
    required this.description,
    required this.uid,
    required this.recipeId,
    required this.upvotedBy,
    this.imageUrl,
    this.category,
  });

  @override
  State<RecipeCard> createState() => _RecipeCardState();
}

class _RecipeCardState extends State<RecipeCard> with TickerProviderStateMixin {
  static const int maxAvatars = 3;
  late List<String> _upvotedBy;

  @override
  void initState() {
    super.initState();
    _upvotedBy = List<String>.from(widget.upvotedBy);
  }

  void _requireAuthSnack() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Sign in to use this action.')),
    );
  }

  void _errorSnack(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _toggleUpvote() async {
    final currentUser = FirebaseAuth.instance.currentUser;
    if (currentUser == null) {
      _requireAuthSnack();
      return;
    }

    final uid = currentUser.uid;
    final docRef =
    FirebaseFirestore.instance.collection('recipes').doc(widget.recipeId);
    final isUpvoted = _upvotedBy.contains(uid);

    // Optimistic UI
    setState(() {
      isUpvoted ? _upvotedBy.remove(uid) : _upvotedBy.add(uid);
    });

    try {
      final batch = FirebaseFirestore.instance.batch();
      if (isUpvoted) {
        batch.update(docRef, {
          'upvotedBy': FieldValue.arrayRemove([uid]),
          'upvotesCount': FieldValue.increment(-1),
        });
      } else {
        batch.update(docRef, {
          'upvotedBy': FieldValue.arrayUnion([uid]),
          'upvotesCount': FieldValue.increment(1),
        });

        //  Notification Logic Added Here
        if (widget.uid != uid) {
          final myHandleOrName = currentUser.displayName ?? 'Someone';
          await NotificationService().notifyUser(
            toUid: widget.uid,
            type: "reaction",
            message: " $myHandleOrName liked your recipe", // Adjusted message for recipe
            itemType: "recipe",
            itemId: widget.recipeId,
            actorUid: uid, // Added actorUid to match service
            actorName: myHandleOrName,
            actorAvatarUrl: currentUser.photoURL,
          );
        }
      }
      await batch.commit();
    } catch (_) {
      setState(() {
        isUpvoted ? _upvotedBy.add(uid) : _upvotedBy.remove(uid);
      });
      _errorSnack('Couldn’t update like. Please try again.');
    }
  }

  Future<void> _openCommentsSheet() async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Theme.of(context).colorScheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        return DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.75,
          minChildSize: 0.35,
          maxChildSize: 0.95,
          builder: (ctx, scrollController) {
            return CommentsPanel(
              recipeId: widget.recipeId,
              ownerUid: widget.uid,
              scrollController: scrollController,
            );
          },
        );
      },
    );
  }

  Future<void> _shareRecipe() async {
    final title = widget.title.isNotEmpty ? widget.title : 'Recipe';
    final link = 'https://easespotter.com/recipes/${widget.recipeId}';
    final text = '$title\n$link';

    await showShareToConnectionsSheet(
      context,
      title: 'Share Recipe',
      shareText: text,
    );
  }

  List<String> _uidsForAvatarStack({required String? currentUid}) {
    final hasCurrent = currentUid != null && _upvotedBy.contains(currentUid);
    if (_upvotedBy.isEmpty) return const [];

    if (hasCurrent) {
      final others = _upvotedBy.where((u) => u != currentUid).toList();
      final result = <String>[currentUid];
      for (final u in others) {
        if (result.length >= maxAvatars) break;
        result.add(u);
      }
      return result;
    } else {
      return _upvotedBy.take(maxAvatars).toList();
    }
  }

  Future<void> _handleDeletePressed() async {
    final current = FirebaseAuth.instance.currentUser;
    if (current == null || current.uid != widget.uid) {
      _errorSnack("You don't have permission to delete this.");
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete recipe?'),
        content: const Text(
          'This will permanently remove the recipe and its comments.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(child: CircularProgressIndicator()),
    );

    try {
      await deleteRecipeCascade(
        recipeId: widget.recipeId,
        imageUrl: widget.imageUrl,
      );
      if (mounted) {
        Navigator.of(context).pop(); // close progress
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Recipe deleted.')),
        );
      }
    } catch (e) {
      if (mounted) {
        Navigator.of(context).pop(); // close progress
        _errorSnack('Failed to delete. Please try again.');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final currentUser = FirebaseAuth.instance.currentUser;
    final isUpvoted =
        currentUser != null && _upvotedBy.contains(currentUser.uid);

    return Card(
      margin: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      elevation: 2.5,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => RecipeDetailScreen(recipeId: widget.recipeId),
            ),
          );
        },
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            //  HEADER (avatar + name + owner actions)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Author pill that will shrink to content because AuthorHeader shrinks
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
                      children: [
                        AuthorHeader(uid: widget.uid),
                      ],
                    ),
                  ),

                  const Spacer(),

                  AuthorActionsMenu(
                    authorUid: widget.uid,
                    recipeId: widget.recipeId,
                    onRequestDelete: _handleDeletePressed,
                  ),
                ],
              ),
            ),

            if (widget.imageUrl != null && widget.imageUrl!.isNotEmpty)
              AspectRatio(
                aspectRatio: 4 / 5,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Image.network(
                    widget.imageUrl!,
                    fit: BoxFit.cover,
                    loadingBuilder: (context, child, loadingProgress) {
                      if (loadingProgress == null) return child;
                      return Shimmer.fromColors(
                        baseColor: Colors.grey.shade300,
                        highlightColor: Colors.grey.shade100,
                        child: Container(
                          color: Colors.white,
                        ),
                      );
                    },
                    errorBuilder: (_, __, ___) => const Center(
                      child: Icon(Icons.broken_image, size: 48, color: Colors.grey),
                    ),
                  ),
                ),
              ),

            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Title + category
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          widget.title.isNotEmpty ? widget.title : 'Untitled',
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (widget.category != null &&
                          widget.category!.isNotEmpty) ...[
                        const SizedBox(width: 8),
                        Chip(
                          label: Text(
                            widget.category!,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          visualDensity: VisualDensity.compact,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 0,
                          ),
                          side: BorderSide(color: Colors.deepPurple.shade100),
                          backgroundColor:
                          Colors.deepPurple.withOpacity(0.06),
                          labelStyle:
                          const TextStyle(color: Colors.deepPurple),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    widget.description.isNotEmpty
                        ? widget.description
                        : 'No description provided.',
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 12),

                  // Actions row
                  Row(
                    children: [
                      Transform.translate(
                        offset: const Offset(-8, 0),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            IconButton(
                              tooltip: isUpvoted ? 'Unlike' : 'Like',
                              splashRadius: 20,
                              icon: AnimatedScale(
                                scale: isUpvoted ? 1.15 : 1.0,
                                duration:
                                const Duration(milliseconds: 150),
                                child: Icon(
                                  isUpvoted
                                      ? Icons.favorite
                                      : Icons.favorite_border,
                                  color:
                                  isUpvoted ? Colors.red : Colors.grey,
                                ),
                              ),
                              onPressed: _toggleUpvote,
                            ),
                            AnimatedSwitcher(
                              duration:
                              const Duration(milliseconds: 180),
                              transitionBuilder: (child, anim) =>
                                  ScaleTransition(
                                    scale: anim,
                                    child: child,
                                  ),
                              child: Text(
                                '${_upvotedBy.length}',
                                key: ValueKey<int>(_upvotedBy.length),
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            if (_upvotedBy.isNotEmpty) ...[
                              const SizedBox(width: 6),
                              AvatarStack(
                                uids: _uidsForAvatarStack(
                                  currentUid: currentUser?.uid,
                                ),
                                size: 22,
                                overlap: 10,
                              ),
                            ],
                          ],
                        ),
                      ),

                      const SizedBox(width: 8),

                      IconButton(
                        tooltip: 'Comments',
                        splashRadius: 20,
                        icon: const FaIcon(
                          FontAwesomeIcons.comment,
                          size: 20,
                          color: Colors.grey,
                        ),
                        onPressed: _openCommentsSheet,
                      ),

                      CommentsCount(recipeId: widget.recipeId),

                      const SizedBox(width: 8),

                      IconButton(
                        tooltip: 'Share',
                        splashRadius: 20,
                        icon: const FaIcon(
                          FontAwesomeIcons.share,
                          size: 20,
                        ),
                        onPressed: _shareRecipe,
                      ),

                      const Spacer(),
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
}
