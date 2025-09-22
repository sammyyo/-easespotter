import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../widgets/attribution_tag.dart';

class CommentList extends StatelessWidget {
  final String parentPath; // Example: 'glowups/glow123'

  const CommentList({super.key, required this.parentPath});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<QuerySnapshot>(
      stream: FirebaseFirestore.instance
          .collection('$parentPath/comments')
          .orderBy('createdAt', descending: true)
          .snapshots(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) return const CircularProgressIndicator();

        final docs = snapshot.data!.docs;
        final currentUser = FirebaseAuth.instance.currentUser;

        return ListView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: docs.length,
          itemBuilder: (context, index) {
            final data = docs[index].data() as Map<String, dynamic>;
            final uid = data['uid'] ?? '';
            final text = data['text'] ?? '';
            final commentId = docs[index].id;

            return ListTile(
              contentPadding: EdgeInsets.zero,
              leading: AttributionTag(uid: uid),
              title: Text(text),
              trailing: currentUser != null && currentUser.uid == uid
                  ? IconButton(
                icon: const Icon(Icons.delete, color: Colors.red),
                onPressed: () async {
                  final confirmed = await showDialog<bool>(
                    context: context,
                    builder: (_) => AlertDialog(
                      title: const Text("Delete Comment"),
                      content: const Text("Are you sure you want to delete this comment?"),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(context, false),
                          child: const Text("Cancel"),
                        ),
                        TextButton(
                          onPressed: () => Navigator.pop(context, true),
                          child: const Text("Delete"),
                        ),
                      ],
                    ),
                  );

                  if (confirmed == true) {
                    await FirebaseFirestore.instance
                        .collection('$parentPath/comments')
                        .doc(commentId)
                        .delete();
                  }
                },
              )
                  : null,
            );
          },
        );
      },
    );
  }
}
