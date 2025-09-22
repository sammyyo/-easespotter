import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_staggered_grid_view/flutter_staggered_grid_view.dart';
import 'glowup_detail_screen.dart';

class GlowUpFeedScreen extends StatefulWidget {
  const GlowUpFeedScreen({super.key});

  @override
  State<GlowUpFeedScreen> createState() => _GlowUpFeedScreenState();
}

class _GlowUpFeedScreenState extends State<GlowUpFeedScreen> {
  final List<String> _tags = ['All', 'Pantry', 'Budget', 'Vegan', 'Snacks', 'Glow-Up'];
  String _selectedTag = 'All';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.deepPurple,
        centerTitle: true,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text(
          'Glow-Up Feed',
          style: TextStyle(color: Colors.white),
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: DropdownButtonFormField<String>(
              value: _selectedTag,
              decoration: const InputDecoration(labelText: 'Filter by Tag'),
              items: _tags.map((tag) => DropdownMenuItem(value: tag, child: Text(tag))).toList(),
              onChanged: (val) => setState(() => _selectedTag = val!),
            ),
          ),
          Expanded(
            child: StreamBuilder<QuerySnapshot>(
              stream: _glowUpStream(),
              builder: (context, snapshot) {
                if (snapshot.hasError) {
                  print('🔥 Firestore stream error: ${snapshot.error}');
                  return const Center(child: Text('Empty glow-ups feed.'));
                }

                if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());

                final docs = snapshot.data!.docs;
                if (docs.isEmpty) return const Center(child: Text('No glow-ups found.'));

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
    try {
      final baseQuery = FirebaseFirestore.instance
          .collection('glowups')
          .where('isPublic', isEqualTo: true);

      final filteredQuery = _selectedTag != 'All'
          ? baseQuery.where('tags', arrayContains: _selectedTag.toLowerCase())
          : baseQuery;

      return filteredQuery.orderBy('createdAt', descending: true).snapshots();
    } catch (e) {
      print('🔥 Query construction error: $e');
      rethrow;
    }
  }

  Widget _buildGlowUpCard(Map<String, dynamic> data, String docId) {
    final imageUrl = data['imageUrl'] ?? '';
    final title = data['title'] ?? '';
    final description = data['description'] ?? '';
    final currentUser = FirebaseAuth.instance.currentUser;

    final List<String> likedBy = List<String>.from(data['likedBy'] ?? []);
    final List<String> fireBy = List<String>.from(data['fireBy'] ?? []);

    final bool isLiked = currentUser != null && likedBy.contains(currentUser.uid);
    final bool isFired = currentUser != null && fireBy.contains(currentUser.uid);

    return GestureDetector(
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => GlowUpDetailScreen(glowUpId: docId)),
      ),
      child: Card(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        clipBehavior: Clip.antiAlias,
        elevation: 4,
        child: Stack(
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
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
                        bottom: 0,
                        left: 0,
                        right: 0,
                        child: Container(
                          height: 60,
                          decoration: const BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [Colors.transparent, Colors.black54],
                            ),
                          ),
                        ),
                      ),
                      Positioned(
                        bottom: 8,
                        left: 10,
                        right: 10,
                        child: Text(
                          title,
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                            fontSize: 16,
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
                            onPressed: () => _toggleReaction(docId, 'likedBy', isLiked),
                          ),
                          Text('${likedBy.length}'),
                          const SizedBox(width: 10),
                          IconButton(
                            icon: Icon(
                              Icons.whatshot,
                              color: isFired ? Colors.orange : Colors.grey,
                              size: 20,
                            ),
                            onPressed: () => _toggleReaction(docId, 'fireBy', isFired),
                          ),
                          Text('${fireBy.length}'),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _toggleReaction(String docId, String field, bool isActive) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    final docRef = FirebaseFirestore.instance.collection('glowups').doc(docId);
    await docRef.update({
      field: isActive ? FieldValue.arrayRemove([user.uid]) : FieldValue.arrayUnion([user.uid]),
    });
  }
}
