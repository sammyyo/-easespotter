import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:share_plus/share_plus.dart';
import 'package:easespotter/screens/grocery_list_screen.dart';
import 'package:easespotter/services/user_scoped_prefs.dart';
import '../widgets/attribution_tag.dart';

class RecipeDetailScreen extends StatelessWidget {
  final String recipeId;

  const RecipeDetailScreen({super.key, required this.recipeId});

  List<Map<String, dynamic>> _readIngredients(Map<String, dynamic> data) {
    final raw = data['ingredients'];
    if (raw == null) return [];

    if (raw is List) {
      final out = <Map<String, dynamic>>[];

      for (final item in raw) {
        if (item == null) continue;

        if (item is String) {
          final name = item.trim();
          if (name.isNotEmpty) out.add({'name': name});
          continue;
        }

        if (item is Map) {
          final name = item['name'];
          if (name is String && name.trim().isNotEmpty) {
            out.add({'name': name.trim()});
          }
          continue;
        }
      }

      final seen = <String>{};
      final deduped = <Map<String, dynamic>>[];
      for (final i in out) {
        final n = (i['name'] ?? '').toString().trim().toLowerCase();
        if (n.isEmpty || seen.contains(n)) continue;
        seen.add(n);
        deduped.add({'name': i['name']});
      }

      return deduped;
    }

    return [];
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.deepPurple,
        centerTitle: true,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text(
          "Recipe Details",
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
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
        future:
            FirebaseFirestore.instance
                .collection('recipes')
                .doc(recipeId)
                .get(),
        builder: (context, snapshot) {
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }

          final data = snapshot.data!.data() as Map<String, dynamic>;
          final title = data['title'] ?? '';
          final description = data['description'] ?? '';
          final uid = data['uid'] ?? '';
          final imageUrl = data['imageUrl'];
          final category = data['category'];

          final ingredients = _readIngredients(data);

          Future<Set<String>> getInventoryNamesLower() async {
            final user = FirebaseAuth.instance.currentUser;
            if (user == null) return {};

            final snap =
                await FirebaseFirestore.instance
                    .collection('users')
                    .doc(user.uid)
                    .collection('home_inventory')
                    .get();

            return snap.docs
                .map(
                  (d) =>
                      (d.data()['name'] ?? '').toString().trim().toLowerCase(),
                )
                .where((s) => s.isNotEmpty)
                .toSet();
          }

          Future<bool> confirmAddEvenIfOwned({
            required int alreadyHaveCount,
            required List<String> alreadyHaveNames,
          }) async {
            return (await showDialog<bool>(
                  context: context,
                  builder:
                      (ctx) => AlertDialog(
                        title: const Text('Already in your Home Inventory'),
                        content: Text(
                          alreadyHaveCount == 1
                              ? 'You already have: ${alreadyHaveNames.first}\n\nAdd it to your Grocery List anyway?'
                              : 'You already have $alreadyHaveCount items.\n\nAdd them to your Grocery List anyway?',
                        ),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.pop(ctx, false),
                            child: const Text('Skip owned'),
                          ),
                          ElevatedButton(
                            onPressed: () => Navigator.pop(ctx, true),
                            child: const Text('Add anyway'),
                          ),
                        ],
                      ),
                )) ??
                false;
          }

          Future<void> addIngredientsToGroceryList() async {
            final prefs = await SharedPreferences.getInstance();
            final storedJson =
                prefs.getString(UserScopedPrefs.key('grocery_list')) ?? '[]';
            final existingList = List<Map<String, dynamic>>.from(
              jsonDecode(storedJson),
            );

            final existingNames =
                existingList
                    .map(
                      (e) => (e['title'] ?? '').toString().trim().toLowerCase(),
                    )
                    .where((s) => s.isNotEmpty)
                    .toSet();

            final inventoryNames = await getInventoryNamesLower();

            final alreadyOwned = <String>[];
            for (final ing in ingredients) {
              final nameRaw = (ing['name'] ?? '').toString().trim();
              final n = nameRaw.toLowerCase();
              if (n.isEmpty) continue;
              if (inventoryNames.contains(n)) alreadyOwned.add(nameRaw);
            }

            bool addOwnedToo = true;
            if (alreadyOwned.isNotEmpty) {
              addOwnedToo = await confirmAddEvenIfOwned(
                alreadyHaveCount: alreadyOwned.length,
                alreadyHaveNames: alreadyOwned.take(3).toList(),
              );
            }

            int addedCount = 0;

            for (final ing in ingredients) {
              final nameRaw = (ing['name'] ?? '').toString().trim();
              final name = nameRaw.toLowerCase();
              if (name.isEmpty) continue;

              if (!addOwnedToo && inventoryNames.contains(name)) continue;
              if (existingNames.contains(name)) continue;

              existingList.add({
                'title': nameRaw,
                'checked': false,
                'category': 'General',
                'quantity': 1,
                'unitPrice': 0.0,
                'price': 0.0,
                'source': 'recipe',
                'recipeId': recipeId,
                'recipeTitle': title,
              });

              existingNames.add(name);
              addedCount++;
            }

            await prefs.setString(
              UserScopedPrefs.key('grocery_list'),
              jsonEncode(existingList),
            );

            if (!context.mounted) return;

            await Navigator.of(context).push(
              MaterialPageRoute(
                builder:
                    (_) => GroceryListScreen(
                      initialViewIndex: 1,
                      showBackButton: true,
                      initialAddedCount: addedCount,
                      initialRecipeTitle: title.toString(),
                    ),
              ),
            );
          }

          final hasImage = imageUrl != null && imageUrl.toString().isNotEmpty;

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Card(
              elevation: 3,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(18),
              ),
              clipBehavior: Clip.antiAlias,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (hasImage)
                    ClipRRect(
                      borderRadius: const BorderRadius.only(
                        topLeft: Radius.circular(18),
                        topRight: Radius.circular(18),
                      ),
                      child: Image.network(
                        imageUrl,
                        fit: BoxFit.cover,
                        width: double.infinity,
                        height: 220,
                      ),
                    ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Align(
                          alignment: Alignment.centerLeft,
                          child: IntrinsicWidth(
                            child: Container(
                              decoration: BoxDecoration(
                                color: Colors.grey.shade200,
                                borderRadius: BorderRadius.circular(40),
                              ),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 6,
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [AttributionTag(uid: uid)],
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),

                        /// TITLE SIZE REDUCED HERE
                        Text(
                          title,
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            height: 1.3,
                          ),
                        ),

                        const SizedBox(height: 6),
                        if (category != null)
                          Text(
                            category,
                            style: const TextStyle(
                              color: Colors.deepPurple,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        const SizedBox(height: 16),
                        Text(
                          description,
                          style: const TextStyle(fontSize: 16, height: 1.4),
                        ),

                        if (ingredients.isNotEmpty) ...[
                          const SizedBox(height: 18),
                          const Text(
                            'Ingredients',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 10),
                          ...ingredients.map(
                            (i) => Padding(
                              padding: const EdgeInsets.only(bottom: 6),
                              child: Text(
                                '• ${(i['name'] ?? '').toString()}',
                                style: const TextStyle(
                                  fontSize: 15,
                                  height: 1.3,
                                ),
                              ),
                            ),
                          ),
                        ],

                        const SizedBox(height: 24),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton.icon(
                            icon: const Icon(
                              Icons.playlist_add,
                              color: Colors.white,
                            ),
                            label: const Text(
                              "Make This → Add to Grocery List",
                              style: TextStyle(color: Colors.white),
                            ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.deepPurple,
                              minimumSize: const Size(double.infinity, 54),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                            onPressed: addIngredientsToGroceryList,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
