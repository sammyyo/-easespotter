import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../widgets/recipe_card/recipe_card.dart';
import '../services/home_inventory_service.dart';
import 'new_recipe_screen.dart';
import 'new_glowup_screen.dart';
import 'new_reel_screen.dart';
import '../services/grocery_list_service.dart';

class CommunityRecipesScreen extends StatefulWidget {
  const CommunityRecipesScreen({super.key});

  @override
  State<CommunityRecipesScreen> createState() => _CommunityRecipesScreenState();
}

class _CommunityRecipesScreenState extends State<CommunityRecipesScreen> {
  List<DocumentSnapshot> _recipes = [];
  bool _isLoading = true;

  // Controls whether the mini menu is visible
  bool _fabExpanded = false;

  // toggle for cook-with-what-you-have
  bool _cookWithWhatIHave = false;

  final _inventory = HomeInventoryService();
  final _groceryList = GroceryListService();

  @override
  void initState() {
    super.initState();
    _fetchRecipes();
  }

  Future<void> _fetchRecipes() async {
    try {
      final snapshot =
          await FirebaseFirestore.instance
              .collection('recipes')
              .limit(20)
              .get();

      setState(() {
        _recipes = snapshot.docs;
        _isLoading = false;
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error loading recipes: $e')));
      }
      setState(() => _isLoading = false);
    }
  }

  // --- ingredient extraction + matching helpers ---

  List<String> _extractIngredientNames(Map<String, dynamic> recipeData) {
    final raw = recipeData['ingredients'];

    if (raw == null) return [];

    // ingredients: ["Milk", "Eggs"]
    if (raw is List) {
      final out = <String>[];

      for (final item in raw) {
        if (item == null) continue;

        // List<String>
        if (item is String) {
          out.add(item);
          continue;
        }

        // List<Map> like [{name: "Milk"}]
        if (item is Map) {
          final name = item['name'];
          if (name is String) out.add(name);
          continue;
        }
      }

      return out
          .map((e) => e.trim().toLowerCase())
          .where((e) => e.isNotEmpty)
          .toSet()
          .toList();
    }

    return [];
  }

  Set<String> _normalizeInventoryNames(
    List<QueryDocumentSnapshot<Map<String, dynamic>>> invDocs,
  ) {
    return invDocs
        .map((d) => (d.data()['name'] as String?) ?? '')
        .map((s) => s.trim().toLowerCase())
        .where((s) => s.isNotEmpty)
        .toSet();
  }

  ({int total, int have, int missing}) _scoreRecipe({
    required Map<String, dynamic> recipeData,
    required Set<String> inventoryNames,
  }) {
    final ingredients = _extractIngredientNames(recipeData);
    if (ingredients.isEmpty) return (total: 0, have: 0, missing: 0);

    int have = 0;
    for (final ing in ingredients) {
      if (inventoryNames.contains(ing)) have++;
    }

    final total = ingredients.length;
    final missing = total - have;
    return (total: total, have: have, missing: missing);
  }

  List<String> _missingIngredients({
    required Map<String, dynamic> recipeData,
    required Set<String> inventoryNames,
  }) {
    final ingredients = _extractIngredientNames(recipeData);
    if (ingredients.isEmpty) return [];

    return ingredients.where((ing) => !inventoryNames.contains(ing)).toList();
  }

  Future<String?> _pickCategoryDialog(BuildContext context) async {
    const categories = ['General', 'Snacks', 'Drinks', 'Fruits', 'Vegetables'];

    String selected = 'General';

    return showDialog<String>(
      context: context,
      builder:
          (ctx) => AlertDialog(
            title: const Text('Add missing items to Grocery List'),
            content: DropdownButtonFormField<String>(
              value: selected,
              items:
                  categories
                      .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                      .toList(),
              onChanged: (v) => selected = v ?? 'General',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Cancel'),
              ),
              ElevatedButton(
                onPressed: () => Navigator.pop(ctx, selected),
                child: const Text('Add'),
              ),
            ],
          ),
    );
  }

  Widget _buildFabOption({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return Material(
      elevation: 6,
      borderRadius: BorderRadius.circular(14),
      color: Colors.deepPurple,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 20, color: Colors.white),
              const SizedBox(width: 10),
              Text(
                label,
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 15,
                  color: Colors.white,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildFloatingMenu() {
    const animDuration = Duration(milliseconds: 360);

    return SizedBox(
      width: 260,
      height: 280,
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.bottomRight,
        children: [
          AnimatedPositioned(
            duration: animDuration,
            curve: Curves.fastOutSlowIn,
            right: _fabExpanded ? 70 : 0,
            bottom: _fabExpanded ? 210 : 20,
            child: AnimatedOpacity(
              duration: animDuration,
              curve: Curves.easeInOutCubic,
              opacity: _fabExpanded ? 1 : 0,
              child: IgnorePointer(
                ignoring: !_fabExpanded,
                child: _buildFabOption(
                  icon: Icons.auto_awesome,
                  label: "New Glow-Up",
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => const NewGlowUpScreen(),
                      ),
                    ).then((_) {
                      if (!mounted) return;
                      setState(() => _fabExpanded = false);
                    });
                  },
                ),
              ),
            ),
          ),
          AnimatedPositioned(
            duration: animDuration,
            curve: Curves.fastOutSlowIn,
            right: _fabExpanded ? 70 : 0,
            bottom: _fabExpanded ? 150 : 20,
            child: AnimatedOpacity(
              duration: animDuration,
              curve: Curves.easeInOutCubic,
              opacity: _fabExpanded ? 1 : 0,
              child: IgnorePointer(
                ignoring: !_fabExpanded,
                child: _buildFabOption(
                  icon: Icons.movie_creation_outlined,
                  label: "New Reel",
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const NewReelScreen()),
                    ).then((_) {
                      if (!mounted) return;
                      setState(() => _fabExpanded = false);
                    });
                  },
                ),
              ),
            ),
          ),
          AnimatedPositioned(
            duration: animDuration,
            curve: Curves.fastOutSlowIn,
            right: _fabExpanded ? 70 : 0,
            bottom: _fabExpanded ? 90 : 20,
            child: AnimatedOpacity(
              duration: animDuration,
              curve: Curves.easeInOutCubic,
              opacity: _fabExpanded ? 1 : 0,
              child: IgnorePointer(
                ignoring: !_fabExpanded,
                child: _buildFabOption(
                  icon: Icons.restaurant_menu,
                  label: "New Recipe",
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => const NewRecipeScreen(),
                      ),
                    ).then((_) {
                      if (!mounted) return;
                      setState(() => _fabExpanded = false);
                    });
                  },
                ),
              ),
            ),
          ),
          Positioned(
            right: 0,
            bottom: 0,
            child: FloatingActionButton(
              backgroundColor: Colors.deepPurple,
              foregroundColor: Colors.white,
              onPressed: () => setState(() => _fabExpanded = !_fabExpanded),
              child: AnimatedRotation(
                duration: animDuration,
                curve: Curves.easeInOutCubic,
                turns: _fabExpanded ? 0.125 : 0.0,
                child: const Icon(Icons.add),
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final signedIn = FirebaseAuth.instance.currentUser != null;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.deepPurple,
        iconTheme: const IconThemeData(color: Colors.white),
        centerTitle: true,
        title: const Text(
          'Community Recipes',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
        ),
        actions: [
          if (signedIn)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: Center(
                child: Transform.scale(
                  scale: 0.78,
                  child: Switch(
                    value: _cookWithWhatIHave,
                    activeColor: Colors.white,
                    activeTrackColor: Colors.white24,
                    inactiveThumbColor: Colors.white70,
                    inactiveTrackColor: Colors.white24,
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    onChanged: (v) {
                      setState(() => _cookWithWhatIHave = v);
                    },
                  ),
                ),
              ),
            ),
        ],
      ),
      body:
          (!_cookWithWhatIHave || !signedIn)
              ? _buildNormalBody()
              : StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                stream: _inventory.streamInventory(),
                builder: (context, invSnap) {
                  if (invSnap.connectionState == ConnectionState.waiting) {
                    return _buildNormalBody(showOverlayLoader: true);
                  }

                  final invDocs = invSnap.data?.docs ?? const [];
                  final inventoryNames = _normalizeInventoryNames(invDocs);

                  return _buildCookWithWhatIHaveBody(inventoryNames);
                },
              ),
      floatingActionButton: _buildFloatingMenu(),
      floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
    );
  }

  Widget _buildNormalBody({bool showOverlayLoader = false}) {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_recipes.isEmpty) {
      return const Center(child: Text("No recipes found."));
    }

    return Stack(
      children: [
        ListView.builder(
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
        if (showOverlayLoader)
          const Positioned.fill(
            child: IgnorePointer(
              child: Center(child: CircularProgressIndicator()),
            ),
          ),
      ],
    );
  }

  Widget _buildCookWithWhatIHaveBody(Set<String> inventoryNames) {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_recipes.isEmpty) {
      return const Center(child: Text("No recipes found."));
    }

    final scored =
        _recipes.map((doc) {
          final data = doc.data() as Map<String, dynamic>;
          final score = _scoreRecipe(
            recipeData: data,
            inventoryNames: inventoryNames,
          );
          return (doc: doc, data: data, score: score);
        }).toList();

    scored.sort((a, b) {
      final aTotal = a.score.total;
      final bTotal = b.score.total;

      if (aTotal == 0 && bTotal == 0) return 0;
      if (aTotal == 0) return 1;
      if (bTotal == 0) return -1;

      final aRatio = a.score.have / aTotal;
      final bRatio = b.score.have / bTotal;

      final ratioCmp = bRatio.compareTo(aRatio);
      if (ratioCmp != 0) return ratioCmp;

      return a.score.missing.compareTo(b.score.missing);
    });

    return ListView.builder(
      itemCount: scored.length,
      itemBuilder: (context, index) {
        final item = scored[index];
        final data = item.data;
        final s = item.score;

        final missing = _missingIngredients(
          recipeData: data,
          inventoryNames: inventoryNames,
        );

        final matchLine =
            (s.total == 0)
                ? null
                : Padding(
                  padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.check_circle,
                        size: 14,
                        color: Colors.green,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          '${s.have}/${s.total} · Missing ${s.missing}',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade700,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      if (missing.isNotEmpty)
                        TextButton(
                          onPressed: () async {
                            final category = await _pickCategoryDialog(context);
                            if (category == null) return;

                            final added = await _groceryList.addRecipeItems(
                              ingredientNames: missing,
                              category: category,
                              recipeId: item.doc.id,
                              recipeTitle: (data['title'] ?? '').toString(),
                            );

                            if (!mounted) return;

                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  added == 0
                                      ? 'All missing items already in your list'
                                      : 'Added $added missing item(s) to Grocery List',
                                ),
                                behavior: SnackBarBehavior.floating,
                              ),
                            );
                          },
                          child: Text('Add ${missing.length} missing'),
                        ),
                    ],
                  ),
                );

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (matchLine != null) matchLine,
            RecipeCard(
              title: data['title'] ?? 'Untitled',
              description: data['description'] ?? '',
              uid: data['uid'] ?? '',
              recipeId: item.doc.id,
              upvotedBy: List<String>.from(data['upvotedBy'] ?? []),
              imageUrl: data['imageUrl'],
              category: data['category'],
            ),
          ],
        );
      },
    );
  }
}
