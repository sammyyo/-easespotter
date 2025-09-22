import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'new_wall_post_screen.dart';
import '../shopping_layer/wall_post_detail_screen.dart';

class ShoppingWallFeedScreen extends StatefulWidget {
  const ShoppingWallFeedScreen({super.key});

  @override
  State<ShoppingWallFeedScreen> createState() => _ShoppingWallFeedScreenState();
}

class _ShoppingWallFeedScreenState extends State<ShoppingWallFeedScreen> {
  String? selectedEmoji;
  String? selectedTag;

  final List<String> emojis = ['All', '💡', '🔥', '🛍️', '⭐'];
  final List<String> tags = ['All', 'Pantry', 'Snacks', 'Deals', 'Fresh Finds'];

  Future<void> _toggleLike(String postId, List likedBy) async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return;

    final docRef = FirebaseFirestore.instance.collection('shopping_wall').doc(postId);
    final alreadyLiked = likedBy.contains(uid);

    await docRef.update({
      'likedBy': alreadyLiked
          ? FieldValue.arrayRemove([uid])
          : FieldValue.arrayUnion([uid]),
    });
  }

  void _showEditOptionsDialog(String postId, Map<String, dynamic> data) {
    final TextEditingController titleController = TextEditingController(text: data['title']);
    final TextEditingController emojiController = TextEditingController(text: data['emoji'] ?? '');
    final List<String> existingTags = List<String>.from(data['tags'] ?? []);
    final TextEditingController tagController = TextEditingController();

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Edit Post'),
        content: SingleChildScrollView(
          child: Column(
            children: [
              TextField(controller: titleController, decoration: const InputDecoration(labelText: 'Title')),
              TextField(controller: emojiController, decoration: const InputDecoration(labelText: 'Emoji')),
              const SizedBox(height: 10),
              Wrap(
                spacing: 6,
                children: existingTags.map((tag) {
                  return Chip(
                    label: Text(tag),
                    onDeleted: () {
                      setState(() => existingTags.remove(tag));
                      Navigator.pop(context);
                      _showEditOptionsDialog(postId, {
                        ...data,
                        'tags': existingTags,
                      });
                    },
                  );
                }).toList(),
              ),
              TextField(controller: tagController, decoration: const InputDecoration(labelText: 'Add Tag')),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              final updatedTags = [...existingTags];
              final newTag = tagController.text.trim();
              if (newTag.isNotEmpty && !updatedTags.contains(newTag)) {
                updatedTags.add(newTag);
              }

              await FirebaseFirestore.instance.collection('shopping_wall').doc(postId).update({
                'title': titleController.text.trim(),
                'emoji': emojiController.text.trim(),
                'tags': updatedTags,
              });

              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Post updated')));
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  Widget _buildFilters() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: [
          Expanded(
            child: DropdownButton<String>(
              value: selectedEmoji ?? 'All',
              isExpanded: true,
              items: emojis.map((e) => DropdownMenuItem(value: e, child: Text(e))).toList(),
              onChanged: (val) => setState(() => selectedEmoji = val == 'All' ? null : val),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: DropdownButton<String>(
              value: selectedTag ?? 'All',
              isExpanded: true,
              items: tags.map((e) => DropdownMenuItem(value: e, child: Text(e))).toList(),
              onChanged: (val) => setState(() => selectedTag = val == 'All' ? null : val),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser?.uid;

    return Scaffold(
      appBar: AppBar(title: const Text('🧱 Shopping Wall')),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const NewWallPostScreen()),
          );
        },
        backgroundColor: Colors.deepPurple,
        child: const Icon(Icons.add),
      ),
      body: Column(
        children: [
          _buildFilters(),
          Expanded(
            child: StreamBuilder<QuerySnapshot>(
              stream: FirebaseFirestore.instance
                  .collection('shopping_wall')
                  .orderBy('createdAt', descending: true)
                  .snapshots(),
              builder: (context, snapshot) {
                if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
                final docs = snapshot.data!.docs;

                final filteredDocs = docs.where((doc) {
                  final data = doc.data() as Map<String, dynamic>;
                  final tagMatch = selectedTag == null || (data['tags'] as List?)?.contains(selectedTag) == true;
                  final emojiMatch = selectedEmoji == null || data['emoji'] == selectedEmoji;
                  return tagMatch && emojiMatch;
                }).toList();

                if (filteredDocs.isEmpty) return const Center(child: Text('No posts match your filter.'));

                return ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: filteredDocs.length,
                  itemBuilder: (context, index) {
                    final doc = filteredDocs[index];
                    final data = doc.data() as Map<String, dynamic>;
                    final postId = doc.id;
                    final title = data['title'] ?? '';
                    final emoji = data['emoji'] ?? '🧾';
                    final tags = (data['tags'] as List?)?.join(' • ') ?? '';
                    final imageUrl = data['imageUrl'];
                    final likedBy = List<String>.from(data['likedBy'] ?? []);
                    final isLiked = uid != null && likedBy.contains(uid);

                    return GestureDetector(
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(builder: (_) => WallPostDetailScreen(postId: postId)),
                        );
                      },
                      onLongPress: () {
                        if (data['uid'] == uid) {
                          _showEditOptionsDialog(postId, data);
                        }
                      },
                      child: Card(
                        margin: const EdgeInsets.only(bottom: 20),
                        elevation: 3,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (imageUrl != null && imageUrl.isNotEmpty)
                              ClipRRect(
                                borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
                                child: Image.network(imageUrl, height: 160, width: double.infinity, fit: BoxFit.cover),
                              ),
                            Padding(
                              padding: const EdgeInsets.all(12),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('$emoji $title', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                                  if (tags.isNotEmpty)
                                    Padding(
                                      padding: const EdgeInsets.only(top: 6),
                                      child: Text(tags, style: const TextStyle(color: Colors.black54)),
                                    ),
                                  const SizedBox(height: 10),
                                  StreamBuilder<QuerySnapshot>(
                                    stream: FirebaseFirestore.instance
                                        .collection('shopping_wall')
                                        .doc(postId)
                                        .collection('comments')
                                        .snapshots(),
                                    builder: (context, commentSnapshot) {
                                      final commentCount = commentSnapshot.data?.docs.length ?? 0;

                                      return Row(
                                        children: [
                                          IconButton(
                                            icon: Icon(
                                              isLiked ? Icons.favorite : Icons.favorite_border,
                                              color: isLiked ? Colors.red : Colors.grey,
                                            ),
                                            onPressed: () => _toggleLike(postId, likedBy),
                                          ),
                                          Text('${likedBy.length}'),
                                          const SizedBox(width: 16),
                                          const Icon(Icons.comment, size: 20, color: Colors.grey),
                                          const SizedBox(width: 4),
                                          Text('$commentCount'),
                                        ],
                                      );
                                    },
                                  ),
                                ],
                              ),
                            ),
                          ],
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
