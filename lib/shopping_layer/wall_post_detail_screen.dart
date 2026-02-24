import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:easespotter/services/notification_service.dart';

class WallPostDetailScreen extends StatefulWidget {
  final String postId;
  const WallPostDetailScreen({super.key, required this.postId});

  @override
  State<WallPostDetailScreen> createState() => _WallPostDetailScreenState();
}

class _WallPostDetailScreenState extends State<WallPostDetailScreen> {
  final TextEditingController _commentController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  static const List<String> reactionEmojis = ['❤️', '🔥', '👍', '😂', '🛍️'];

  final List<DocumentSnapshot> _comments = [];
  bool _isLoading = false;
  bool _hasMore = true;
  final int _limit = 10;

  @override
  void initState() {
    super.initState();
    _loadMoreComments();
    _scrollController.addListener(() {
      if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 100 && !_isLoading && _hasMore) {
        _loadMoreComments();
      }
    });
  }

  Future<void> _loadMoreComments() async {
    setState(() => _isLoading = true);

    Query query = FirebaseFirestore.instance
        .collection('shopping_wall')
        .doc(widget.postId)
        .collection('comments')
        .orderBy('createdAt', descending: true)
        .limit(_limit);

    if (_comments.isNotEmpty) {
      query = query.startAfterDocument(_comments.last);
    }

    final snapshot = await query.get();
    if (snapshot.docs.length < _limit) {
      _hasMore = false;
    }

    setState(() {
      _comments.addAll(snapshot.docs);
      _isLoading = false;
    });
  }

  Future<void> _toggleEmojiReaction(DocumentReference ref, String emoji, bool alreadyReacted) async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return;

    final field = 'reactions.$emoji';

    await ref.update({
      field: alreadyReacted ? FieldValue.arrayRemove([uid]) : FieldValue.arrayUnion([uid])
    });

    if (!alreadyReacted) {
      final commentSnap = await ref.get();
      final commentData = commentSnap.data() as Map<String, dynamic>?;
      final commentOwnerId = commentData?['uid'];

      if (commentOwnerId != null && commentOwnerId != uid) {
        await FirebaseFirestore.instance
            .collection('users')
            .doc(commentOwnerId)
            .collection('notifications')
            .add({
          'type': 'reaction',
          'emoji': emoji,
          'message': 'reacted to your comment with $emoji',
          'sourceUid': uid,
          'relatedId': widget.postId,
          'createdAt': FieldValue.serverTimestamp(),
          'isRead': false,
        });
      }
    }
  }

  void _showEditDialog(DocumentReference commentRef, String currentText) {
    final editController = TextEditingController(text: currentText);
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Edit Comment'),
        content: TextField(
          controller: editController,
          decoration: const InputDecoration(labelText: 'Update your comment'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              final newText = editController.text.trim();
              if (newText.isNotEmpty) {
                await commentRef.update({'text': newText});
              }
              Navigator.pop(context);
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final currentUser = FirebaseAuth.instance.currentUser;

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Post Details',
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
      body: FutureBuilder<DocumentSnapshot>(
        future: FirebaseFirestore.instance.collection('shopping_wall').doc(widget.postId).get(),
        builder: (context, snapshot) {
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
          final data = snapshot.data!.data() as Map<String, dynamic>;
          final title = data['title'] ?? '';
          final desc = data['description'] ?? '';
          final imageUrl = data['imageUrl'];
          final tags = (data['tags'] as List?)?.join(', ') ?? '';
          final emoji = data['emoji'] ?? '🛍️';
          final postOwnerId = data['creatorUid'];

          return SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (imageUrl != null && imageUrl.isNotEmpty)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.network(imageUrl),
                  ),
                const SizedBox(height: 20),
                Text('$emoji $title', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                const SizedBox(height: 10),
                Text(desc),
                const SizedBox(height: 16),
                Text('Tags: $tags', style: const TextStyle(color: Colors.grey)),
                const Divider(height: 40),
                const Text('Comments', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                const SizedBox(height: 10),

                ListView.separated(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  controller: _scrollController,
                  itemCount: _comments.length + (_hasMore ? 1 : 0),
                  separatorBuilder: (_, __) => const Divider(),
                  itemBuilder: (context, index) {
                    if (index >= _comments.length) {
                      return const Padding(
                        padding: EdgeInsets.symmetric(vertical: 10),
                        child: Center(child: CircularProgressIndicator()),
                      );
                    }

                    final doc = _comments[index];
                    final comment = doc.data() as Map<String, dynamic>;
                    final commentText = comment['text'] ?? '';
                    final userId = comment['uid'] ?? '';
                    final createdAt = (comment['createdAt'] as Timestamp?)?.toDate();
                    final reactions = Map<String, dynamic>.from(comment['reactions'] ?? {});
                    final flaggedBy = List<String>.from(comment['flaggedBy'] ?? []);
                    final isAuthor = userId == currentUser?.uid;
                    final isFlagged = currentUser != null && flaggedBy.contains(currentUser.uid);

                    return ListTile(
                      dense: true,
                      isThreeLine: true,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                      title: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(commentText),
                          const SizedBox(height: 6),
                          Text(
                            'User: $userId${createdAt != null ? ' • ${createdAt.toLocal().toString().split(' ').first}' : ''}',
                            style: const TextStyle(fontSize: 12, color: Colors.grey),
                          ),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 4,
                            children: reactionEmojis.map((emoji) {
                              final users = List<String>.from(reactions[emoji] ?? []);
                              final hasReacted = currentUser != null && users.contains(currentUser.uid);
                              return GestureDetector(
                                onTap: () => _toggleEmojiReaction(doc.reference, emoji, hasReacted),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                  decoration: BoxDecoration(
                                    color: hasReacted ? Colors.deepPurple.shade100 : Colors.grey.shade200,
                                    borderRadius: BorderRadius.circular(16),
                                  ),
                                  child: Text('$emoji ${users.length}', style: const TextStyle(fontSize: 14)),
                                ),
                              );
                            }).toList(),
                          ),
                          const SizedBox(height: 6),
                          Row(
                            children: [
                              IconButton(
                                icon: Icon(Icons.flag, color: isFlagged ? Colors.orange : Colors.grey),
                                onPressed: () {
                                  doc.reference.update({
                                    'flaggedBy': isFlagged
                                        ? FieldValue.arrayRemove([currentUser.uid])
                                        : FieldValue.arrayUnion([currentUser!.uid]),
                                  });
                                },
                              ),
                              if (isAuthor) ...[
                                IconButton(
                                  icon: const Icon(Icons.edit, color: Colors.blue),
                                  onPressed: () => _showEditDialog(doc.reference, commentText),
                                ),
                                IconButton(
                                  icon: const Icon(Icons.delete, color: Colors.red),
                                  onPressed: () async {
                                    final confirm = await showDialog<bool>(
                                      context: context,
                                      builder: (context) => AlertDialog(
                                        title: const Text('Delete Comment'),
                                        content: const Text('Are you sure you want to delete this comment?'),
                                        actions: [
                                          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
                                          ElevatedButton(onPressed: () => Navigator.pop(context, true), child: const Text('Delete')),
                                        ],
                                      ),
                                    );
                                    if (confirm == true) {
                                      await doc.reference.delete();
                                    }
                                  },
                                ),
                              ]
                            ],
                          ),
                        ],
                      ),
                    );
                  },
                ),

                const SizedBox(height: 20),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _commentController,
                        decoration: const InputDecoration(hintText: 'Write a comment...', border: OutlineInputBorder()),
                        minLines: 1,
                        maxLines: 3,
                      ),
                    ),
                    const SizedBox(width: 10),
                    ElevatedButton(
                      onPressed: () async {
                        final text = _commentController.text.trim();
                        final user = FirebaseAuth.instance.currentUser;
                        if (text.isNotEmpty && user != null) {
                          // Add comment
                          await FirebaseFirestore.instance
                              .collection('shopping_wall')
                              .doc(widget.postId)
                              .collection('comments')
                              .add({
                            'uid': user.uid,
                            'text': text,
                            'createdAt': FieldValue.serverTimestamp(),
                          });

                          _commentController.clear();

                          // Send notification if not the post owner
                          if (postOwnerId != null && postOwnerId != user.uid) {
                            final myHandleOrName = user.displayName ?? "Someone";
                            await NotificationService().notifyUser(
                              toUid: postOwnerId,
                              type: "comment",
                              message: "$myHandleOrName commented on your post",
                              itemType: "shopping_wall",
                              itemId: widget.postId,
                              actorUid: user.uid,
                              actorName: myHandleOrName,
                              actorAvatarUrl: user.photoURL,
                            );
                          }
                        }
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.deepPurple,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      ),
                      child: const Text('Send'),
                    ),
                  ],
                )
              ],
            ),
          );
        },
      ),
    );
  }
}
