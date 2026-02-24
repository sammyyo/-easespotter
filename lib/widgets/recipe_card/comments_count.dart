import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class CommentsCount extends StatelessWidget {
  final String recipeId;
  const CommentsCount({super.key, required this.recipeId});

  @override
  Widget build(BuildContext context) {
    // We listen to the recipe doc to get the aggregated "commentsCount".
    final docStream = FirebaseFirestore.instance
        .collection('recipes')
        .doc(recipeId)
        .snapshots();

    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: docStream,
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const SizedBox(width: 24, child: Text('...')); 
        }

        final data = snapshot.data?.data();
        // If "commentsCount" exists, use it.
        if (data != null && data.containsKey('commentsCount')) {
          final count = (data['commentsCount'] ?? 0) as int;
          return AnimatedSwitcher(
            duration: const Duration(milliseconds: 180),
            transitionBuilder: (child, anim) => ScaleTransition(scale: anim, child: child),
            child: Text(
              '$count',
              key: ValueKey<int>(count),
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
            ),
          );
        }

        // Fallback: If no "commentsCount" field (legacy data),
        // we listen to the 'comments' subcollection size (parents only).
        // This ensures old recipes don't show "0" incorrectly, 
        // though they won't count replies until migrated.
        return StreamBuilder<QuerySnapshot>(
          stream: FirebaseFirestore.instance
              .collection('recipes')
              .doc(recipeId)
              .collection('comments')
              .snapshots(),
          builder: (context, subSnap) {
            final count = subSnap.data?.size ?? 0;
            return AnimatedSwitcher(
              duration: const Duration(milliseconds: 180),
              transitionBuilder: (child, anim) => ScaleTransition(scale: anim, child: child),
              child: Text(
                '$count',
                key: ValueKey<int>(count),
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
              ),
            );
          },
        );
      },
    );
  }
}
