import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../widgets/recipe_card.dart';
import 'new_recipe_screen.dart';

class CommunityRecipesScreen extends StatefulWidget {
  const CommunityRecipesScreen({super.key});

  @override
  State<CommunityRecipesScreen> createState() => _CommunityRecipesScreenState();
}

class _CommunityRecipesScreenState extends State<CommunityRecipesScreen> {
  List<DocumentSnapshot> _recipes = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchRecipes();
  }

  Future<void> _fetchRecipes() async {
    try {
      final snapshot = await FirebaseFirestore.instance
          .collection('recipes')
          .limit(20)
          .get();

      print("Fetched ${snapshot.docs.length} recipes");

      for (var doc in snapshot.docs) {
        print("Recipe ID: ${doc.id}, Data: ${doc.data()}");
      }

      setState(() {
        _recipes = snapshot.docs;
        _isLoading = false;
      });
    } catch (e) {
      print("Fetch error: $e");
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error loading recipes: $e')));
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.deepPurple,
        iconTheme: const IconThemeData(color: Colors.white),
        centerTitle: true,
        title: const Text(
          'Community Recipes',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _recipes.isEmpty
          ? const Center(child: Text("No recipes found."))
          : ListView.builder(
        itemCount: _recipes.length,
        itemBuilder: (context, index) {
          final doc = _recipes[index];
          final data = doc.data() as Map<String, dynamic>;

          return RecipeCard(
            title: data['title'] ?? 'Untitled',
            description: data['description'] ?? '',
            uid: data['uid'] ?? '',
            recipeId: doc.id,
            upvotedBy: List<String>.from(data['upvotedBy'] ?? []),
            imageUrl: data['imageUrl'],
            category: data['category'],
          );
        },
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const NewRecipeScreen()),
        ),
        backgroundColor: Colors.deepPurple,
        foregroundColor: Colors.white,
        child: const Icon(Icons.add),
      ),
    );
  }
}
