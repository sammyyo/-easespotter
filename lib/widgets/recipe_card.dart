import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../widgets/attribution_tag.dart';
import '../shopping_layer/recipe_detail_screen.dart';





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

class _RecipeCardState extends State<RecipeCard> {
  late List<String> _upvotedBy;

  @override
  void initState() {
    super.initState();
    _upvotedBy = List<String>.from(widget.upvotedBy);
  }

  Future<void> _toggleUpvote() async {
    final currentUser = FirebaseAuth.instance.currentUser;
    if (currentUser == null) return;

    final docRef = FirebaseFirestore.instance.collection('recipes').doc(widget.recipeId);
    final isUpvoted = _upvotedBy.contains(currentUser.uid);

    setState(() {
      if (isUpvoted) {
        _upvotedBy.remove(currentUser.uid);
      } else {
        _upvotedBy.add(currentUser.uid);
      }
    });

    final batch = FirebaseFirestore.instance.batch();

    if (isUpvoted) {
      batch.update(docRef, {
        'upvotedBy': FieldValue.arrayRemove([currentUser.uid]),
        'upvotesCount': FieldValue.increment(-1),
      });
    } else {
      batch.update(docRef, {
        'upvotedBy': FieldValue.arrayUnion([currentUser.uid]),
        'upvotesCount': FieldValue.increment(1),
      });
    }

    await batch.commit();
  }

  @override
  Widget build(BuildContext context) {
    final currentUser = FirebaseAuth.instance.currentUser;
    final isUpvoted = currentUser != null && _upvotedBy.contains(currentUser.uid);

    return GestureDetector(
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => RecipeDetailScreen(recipeId: widget.recipeId)),
        );
      },
      child: Card(
        margin: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        elevation: 3,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (widget.imageUrl != null && widget.imageUrl!.isNotEmpty)
              ClipRRect(
                borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
                child: Image.network(
                  widget.imageUrl!,
                  height: 180,
                  width: double.infinity,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const SizedBox(
                    height: 180,
                    child: Center(child: Icon(Icons.broken_image, size: 48, color: Colors.grey)),
                  ),
                  loadingBuilder: (context, child, loadingProgress) {
                    if (loadingProgress == null) return child;
                    return SizedBox(
                      height: 180,
                      child: Center(
                        child: CircularProgressIndicator(
                          value: loadingProgress.expectedTotalBytes != null
                              ? loadingProgress.cumulativeBytesLoaded /
                              loadingProgress.expectedTotalBytes!
                              : null,
                        ),
                      ),
                    );
                  },
                ),
              ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(widget.title.isNotEmpty ? widget.title : 'Untitled',
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  if (widget.category != null && widget.category!.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text('Category: ${widget.category}',
                          style: const TextStyle(color: Colors.deepPurple, fontSize: 13)),
                    ),
                  const SizedBox(height: 8),
                  Text(
                    widget.description.isNotEmpty ? widget.description : 'No description provided.',
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 12),
                  AttributionTag(uid: widget.uid),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      IconButton(
                        icon: Icon(
                          isUpvoted ? Icons.favorite : Icons.favorite_border,
                          color: isUpvoted ? Colors.red : Colors.grey,
                        ),
                        onPressed: _toggleUpvote,
                      ),
                      Text('${_upvotedBy.length} upvotes'),
                    ],
                  ),
                  if (_upvotedBy.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    const Text('Upvoted by:', style: TextStyle(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 6),
                    Column(
                      children: _upvotedBy.map((uid) => AttributionTag(uid: uid)).toList(),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
