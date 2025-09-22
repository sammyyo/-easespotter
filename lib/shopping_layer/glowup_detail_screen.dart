import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../widgets/attribution_tag.dart';
import '../widgets/comment_input_field.dart';
import '../widgets/comment_list.dart';

class GlowUpDetailScreen extends StatefulWidget {
  final String glowUpId;

  const GlowUpDetailScreen({super.key, required this.glowUpId});

  @override
  State<GlowUpDetailScreen> createState() => _GlowUpDetailScreenState();
}

class _GlowUpDetailScreenState extends State<GlowUpDetailScreen> {
  bool isLiked = false;
  List<String> likedBy = [];

  @override
  void initState() {
    super.initState();
    _loadReactions();
  }

  Future<void> _loadReactions() async {
    final doc = await FirebaseFirestore.instance.collection('glowups').doc(widget.glowUpId).get();
    final data = doc.data();
    if (data != null && data['likedBy'] != null) {
      final currentUser = FirebaseAuth.instance.currentUser;
      likedBy = List<String>.from(data['likedBy']);
      if (currentUser != null && likedBy.contains(currentUser.uid)) {
        setState(() => isLiked = true);
      }
    }
  }

  Future<void> _toggleLike() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;
    final docRef = FirebaseFirestore.instance.collection('glowups').doc(widget.glowUpId);

    if (isLiked) {
      await docRef.update({'likedBy': FieldValue.arrayRemove([user.uid])});
    } else {
      await docRef.update({'likedBy': FieldValue.arrayUnion([user.uid])});
    }

    setState(() {
      isLiked = !isLiked;
      if (isLiked) {
        likedBy.add(user.uid);
      } else {
        likedBy.remove(user.uid);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Glow-Up Story')),
      body: FutureBuilder<DocumentSnapshot>(
        future: FirebaseFirestore.instance.collection('glowups').doc(widget.glowUpId).get(),
        builder: (context, snapshot) {
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());

          final data = snapshot.data!.data() as Map<String, dynamic>;
          final imageUrl = data['imageUrl'] ?? '';
          final title = data['title'] ?? '';
          final description = data['description'] ?? '';
          final authorUid = data['authorUid'] ?? '';
          final createdAt = (data['createdAt'] as Timestamp?)?.toDate();

          return SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (imageUrl.isNotEmpty)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Image.network(imageUrl, fit: BoxFit.cover),
                  ),
                const SizedBox(height: 20),
                Text(title, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                if (createdAt != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      'Posted on ${createdAt.toLocal().toString().split(' ').first}',
                      style: const TextStyle(color: Colors.grey),
                    ),
                  ),
                const SizedBox(height: 12),
                AttributionTag(uid: authorUid),
                const SizedBox(height: 16),
                Text(description, style: const TextStyle(fontSize: 16)),
                const SizedBox(height: 24),
                Row(
                  children: [
                    IconButton(
                      icon: Icon(
                        isLiked ? Icons.favorite : Icons.favorite_border,
                        color: isLiked ? Colors.red : Colors.grey,
                      ),
                      onPressed: _toggleLike,
                    ),
                    Text('${likedBy.length} ❤️'),
                  ],
                ),
                const SizedBox(height: 20),
                const Divider(),
                const Text('Comments', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 12),
                CommentInputField(
                  parentPath: 'glowups/${widget.glowUpId}',
                  itemOwnerUid: authorUid,
                ),
                const SizedBox(height: 12),
                CommentList(
                  parentPath: 'glowups/${widget.glowUpId}',
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
