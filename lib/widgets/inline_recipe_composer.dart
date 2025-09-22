import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import '../shopping_layer/new_recipe_screen.dart';

class InlineRecipeComposer extends StatefulWidget {

  final VoidCallback? onSubmitted;

  const InlineRecipeComposer({super.key, this.onSubmitted});

  @override
  State<InlineRecipeComposer> createState() => _InlineRecipeComposerState();
}

class _InlineRecipeComposerState extends State<InlineRecipeComposer> {
  final _titleController = TextEditingController();
  final _descController = TextEditingController();
  bool _isLoading = false;

  Future<void> _submitQuickRecipe() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    final title = _titleController.text.trim();
    final desc = _descController.text.trim();
    if (title.isEmpty || desc.isEmpty) return;

    setState(() => _isLoading = true);

    try {
      await FirebaseFirestore.instance.collection('recipes').add({
        'title': title,
        'description': desc,
        'uid': user.uid,
        'createdAt': FieldValue.serverTimestamp(),
        'isPublic': true,
        'upvotedBy': [],
        'upvotesCount': 0,
        'category': 'Snack',
      });

      _titleController.clear();
      _descController.clear();
      widget.onSubmitted?.call();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: ${e.toString()}')),
      );
    } finally {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 3,
      margin: const EdgeInsets.symmetric(vertical: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            TextField(
              controller: _titleController,
              decoration: const InputDecoration(labelText: 'Quick Recipe Title'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _descController,
              decoration: const InputDecoration(labelText: 'What’s the recipe?'),
              minLines: 2,
              maxLines: 4,
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                ElevatedButton.icon(
                  onPressed: _isLoading ? null : _submitQuickRecipe,
                  icon: const Icon(Icons.send, color: Colors.white),
                  label: const Text('Post', style: TextStyle(color: Colors.white)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.deepPurple,
                    foregroundColor: Colors.white,
                  ),
                ),
                const SizedBox(width: 12),
                OutlinedButton.icon(
                  icon: const Icon(Icons.add),
                  label: const Text('Full Composer'),
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const NewRecipeScreen()),
                    );
                  },
                )
              ],
            ),
          ],
        ),
      ),
    );
  }
}
