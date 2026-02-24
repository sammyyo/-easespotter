import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../shopping_layer/public_list_detail_screen.dart';
import '../shopping_layer/recipe_detail_screen.dart';
import '../shopping_layer/glowup_detail_screen.dart';
import '../shopping_layer/mission_detail_screen.dart';
import '../shopping_layer/all_recipes_screen.dart';
import '../shopping_layer/all_public_lists_screen.dart';
import '../shopping_layer/all_glowups_screen.dart';
import '../shopping_layer/all_missions_screen.dart';


class ExploreTabScreen extends StatelessWidget {
  const ExploreTabScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Explore',
        style: TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w800,
        ),
      )),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildSection(
              context,
              title: '🔥 Trending Lists',
              collection: 'public_lists',
              orderBy: 'views',
              onTapBuilder: (id, _) => PublicListDetailScreen(listId: id),
              imageField: 'imageUrl',
              titleField: 'title',
              subtitleField: 'description',
              onSeeAll: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const AllPublicListsScreen()),
              ),
            ),
            _buildSection(
              context,
              title: '👨‍🍳 Top Recipes',
              collection: 'recipes',
              orderBy: 'upvotesCount',
              onTapBuilder: (id, _) => RecipeDetailScreen(recipeId: id),
              imageField: 'imageUrl',
              titleField: 'title',
              subtitleField: 'category',
              onSeeAll: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const AllRecipesScreen()),
              ),
            ),
            _buildSection(
              context,
              title: '✨ Featured Glow-Ups',
              collection: 'glowups',
              orderBy: 'likedBy.length',
              onTapBuilder: (id, _) => GlowUpDetailScreen(glowUpId: id),
              imageField: 'imageUrl',
              titleField: 'title',
              subtitleField: 'tags',
              onSeeAll: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const AllGlowUpsScreen()),
                );
              },

            ),
            _buildSection(
              context,
              title: '🧭 Popular Missions',
              collection: 'missions',
              orderBy: 'joinedCount',
              onTapBuilder: (id, _) => MissionDetailScreen(missionId: id),
              imageField: 'imageUrl',
              titleField: 'title',
              subtitleField: 'goal',
              onSeeAll: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const AllMissionsScreen()),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSection(
      BuildContext context, {
        required String title,
        required String collection,
        required String orderBy,
        required Widget Function(String docId, Map<String, dynamic> data) onTapBuilder,
        required String imageField,
        required String titleField,
        String? subtitleField,
        VoidCallback? onSeeAll,
      }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 30),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            TextButton(
              onPressed: onSeeAll,
              child: const Text('See All'),
            ),
          ],
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 220,
          child: StreamBuilder<QuerySnapshot>(
            stream: FirebaseFirestore.instance
                .collection(collection)
                .where('isPublic', isEqualTo: true)
                .orderBy(orderBy, descending: true)
                .limit(10)
                .snapshots(),
            builder: (context, snapshot) {
              if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());

              final docs = snapshot.data!.docs;
              return ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: docs.length,
                separatorBuilder: (_, __) => const SizedBox(width: 12),
                itemBuilder: (context, index) {
                  final doc = docs[index];
                  final data = doc.data() as Map<String, dynamic>;

                  final imageUrl = data[imageField];
                  final titleText = data[titleField] ?? '';
                  String? subtitleText;

                  if (subtitleField != null) {
                    final raw = data[subtitleField];
                    subtitleText = raw is List ? raw.join(', ') : raw?.toString();
                  }

                  return GestureDetector(
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => onTapBuilder(doc.id, data)),
                      );
                    },
                    child: Container(
                      width: 160,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        boxShadow: [
                          BoxShadow(color: Colors.black12, blurRadius: 4, offset: Offset(0, 2)),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (imageUrl != null && imageUrl.toString().isNotEmpty)
                            ClipRRect(
                              borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
                              child: Image.network(imageUrl, height: 100, width: 160, fit: BoxFit.cover),
                            ),
                          Padding(
                            padding: const EdgeInsets.all(10),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(titleText, style: const TextStyle(fontWeight: FontWeight.bold), maxLines: 2),
                                if (subtitleText != null)
                                  Padding(
                                    padding: const EdgeInsets.only(top: 6),
                                    child: Text(
                                      subtitleText,
                                      style: const TextStyle(color: Colors.black54, fontSize: 13),
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
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
              );
            },
          ),
        ),
      ],
    );
  }
}
