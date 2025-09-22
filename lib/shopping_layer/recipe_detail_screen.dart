import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../widgets/attribution_tag.dart';
import 'package:share_plus/share_plus.dart';

class RecipeDetailScreen extends StatelessWidget {
  final String recipeId;

  const RecipeDetailScreen({super.key, required this.recipeId});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.deepPurple,
        centerTitle: true,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text(
          "Recipe Details",
          style: TextStyle(color: Colors.white),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.share, color: Colors.white),
            onPressed: () {
              final url = 'https://easespotter.com/recipes/$recipeId';
              Share.share('Check out this recipe on EaseSpotter 🍽️:\n$url');
            },
          ),
        ],
      ),
      body: FutureBuilder<DocumentSnapshot>(
        future: FirebaseFirestore.instance.collection('recipes').doc(recipeId).get(),
        builder: (context, snapshot) {
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());

          final data = snapshot.data!.data() as Map<String, dynamic>;
          final title = data['title'] ?? '';
          final description = data['description'] ?? '';
          final uid = data['uid'] ?? '';
          final imageUrl = data['imageUrl'];
          final category = data['category'];
          final ingredients = List<Map<String, dynamic>>.from(data['ingredients'] ?? []);
          final upvotedBy = List<String>.from(data['upvotedBy'] ?? []);
          final currentUser = FirebaseAuth.instance.currentUser;
          final isUpvoted = currentUser != null && upvotedBy.contains(currentUser.uid);

          Future<void> toggleUpvote() async {
            final docRef = FirebaseFirestore.instance.collection('recipes').doc(recipeId);
            if (isUpvoted) {
              await docRef.update({
                'upvotedBy': FieldValue.arrayRemove([currentUser.uid]),
                'upvotesCount': FieldValue.increment(-1),
              });
            } else {
              await docRef.update({
                'upvotedBy': FieldValue.arrayUnion([currentUser!.uid]),
                'upvotesCount': FieldValue.increment(1),
              });
            }
          }

          Future<void> addIngredientsToGroceryList() async {
            final prefs = await SharedPreferences.getInstance();
            final storedJson = prefs.getString('grocery_list') ?? '[]';
            final existingList = List<Map<String, dynamic>>.from(jsonDecode(storedJson));

            final taggedIngredients = ingredients.map((item) => {
              ...item,
              'source': 'recipe',
            }).toList();

            final updatedList = [...existingList, ...taggedIngredients];
            await prefs.setString('grocery_list', jsonEncode(updatedList));

            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text("Ingredients added to Grocery List!")),
            );
          }

          return SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (imageUrl != null)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: Image.network(imageUrl, fit: BoxFit.cover),
                  ),
                const SizedBox(height: 20),
                Text(title, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                if (category != null)
                  Text('Category: $category', style: const TextStyle(color: Colors.deepPurple)),
                const SizedBox(height: 12),
                AttributionTag(uid: uid),
                const SizedBox(height: 20),
                Text(description, style: const TextStyle(fontSize: 16)),
                const SizedBox(height: 20),

                Row(
                  children: [
                    IconButton(
                      icon: Icon(
                        isUpvoted ? Icons.favorite : Icons.favorite_border,
                        color: isUpvoted ? Colors.red : Colors.grey,
                      ),
                      onPressed: toggleUpvote,
                    ),
                    Text('${upvotedBy.length} upvotes'),
                  ],
                ),
                const SizedBox(height: 16),
                if (upvotedBy.isNotEmpty) ...[
                  const Text('Upvoted by:', style: TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 10),
                  Column(
                    children: upvotedBy.map((u) => AttributionTag(uid: u)).toList(),
                  ),
                ],
                ElevatedButton.icon(
                  icon: const Icon(Icons.playlist_add, color: Colors.white),
                  label: const Text(
                    "Make This → Add to Grocery List",
                    style: TextStyle(color: Colors.white),
                  ),
                  style: ElevatedButton.styleFrom(backgroundColor: Colors.deepPurple),
                  onPressed: addIngredientsToGroceryList,
                ),
                const SizedBox(height: 20),
              ],
            ),
          );
        },
      ),
    );
  }
}
