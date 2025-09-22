import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:easespotter/shopping_layer/community_recipes_screen.dart';
import 'package:easespotter/shopping_layer/my_recipes_screen.dart';
import 'package:easespotter/shopping_layer/new_glowup_screen.dart';
import 'package:easespotter/shopping_layer/glowup_feed_screen.dart';
import 'package:easespotter/widgets/public_profile_widget.dart';
//import 'package:easespotter/shopping_layer/new_recipe_screen.dart';
import 'package:easespotter/widgets/inline_recipe_composer.dart';
import '../shopping_layer/notification_feed_screen.dart';
import '../widgets/recipe_card.dart';

class SocialProfileScreen extends StatefulWidget {
  final String? viewedUid;
  final VoidCallback? onToggleToSettings;

  const SocialProfileScreen({super.key, this.viewedUid, this.onToggleToSettings});

  @override
  State<SocialProfileScreen> createState() => _SocialProfileScreenState();
}

class _SocialProfileScreenState extends State<SocialProfileScreen> {
  bool _isFollowing = false;
  bool _isLoading = false;

  String? currentUid;
  String? viewedUid;

  @override
  void initState() {
    super.initState();
    currentUid = FirebaseAuth.instance.currentUser?.uid;
    viewedUid = widget.viewedUid ?? currentUid;
    _checkFollowStatus();
  }

  Future<void> _checkFollowStatus() async {
    if (currentUid == null || viewedUid == null || currentUid == viewedUid) return;
    final snap = await FirebaseFirestore.instance.collection('users').doc(currentUid).get();
    final following = List<String>.from(snap.data()?['following'] ?? []);
    setState(() => _isFollowing = following.contains(viewedUid));
  }

  Future<List<DocumentSnapshot>> _fetchUserRecipes() async {
    final snapshot = await FirebaseFirestore.instance
        .collection('recipes')
        .where('uid', isEqualTo: viewedUid)
        .where('isPublic', isEqualTo: true)
        .orderBy('createdAt', descending: true)
        .get();

    return snapshot.docs;
  }


  Future<void> _toggleFollow() async {
    if (currentUid == null || viewedUid == null || currentUid == viewedUid) return;
    setState(() => _isLoading = true);

    final userRef = FirebaseFirestore.instance.collection('users');
    if (_isFollowing) {
      await userRef.doc(currentUid).update({
        'following': FieldValue.arrayRemove([viewedUid])
      });
      await userRef.doc(viewedUid!).update({
        'followers': FieldValue.arrayRemove([currentUid])
      });
    } else {
      await userRef.doc(currentUid).set({
        'following': FieldValue.arrayUnion([viewedUid])
      }, SetOptions(merge: true));
      await userRef.doc(viewedUid!).set({
        'followers': FieldValue.arrayUnion([currentUid])
      }, SetOptions(merge: true));
    }

    setState(() {
      _isFollowing = !_isFollowing;
      _isLoading = false;
    });
  }

  Widget _buildSliverToolbar() {
    return SliverAppBar(
      pinned: false,
      floating: true,
      snap: true,
      backgroundColor: Colors.deepPurple,
      title: const Text('My Social Profile', style: TextStyle(color: Colors.white)),
      iconTheme: const IconThemeData(color: Colors.white),
      actions: [
        Expanded(
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              IconButton(
                icon: const Icon(Icons.book),
                tooltip: 'My Recipes',
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const MyRecipesScreen())),
              ),
              IconButton(
                icon: const Icon(Icons.explore),
                tooltip: 'Explore Feed',
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const CommunityRecipesScreen())),
              ),
              IconButton(
                icon: const Icon(Icons.flash_on),
                tooltip: 'Submit Glow-Up',
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const NewGlowUpScreen())),
              ),
              IconButton(
                icon: const Icon(Icons.auto_awesome),
                tooltip: 'Glow-Up Feed',
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const GlowUpFeedScreen())),
              ),
              IconButton(
                icon: const Icon(Icons.notifications),
                tooltip: 'Notifications',
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const NotificationCenterScreen())),
              ),
            ],
          ),
        )
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final isOwnProfile = viewedUid == currentUid;

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          _buildSliverToolbar(),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 5),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (viewedUid != null) ...[
                    PublicProfileWidget(uid: viewedUid!),
                    const SizedBox(height: 20),
                  ],
                  if (isOwnProfile) ...[
                    //const Text('Quick Post Recipe', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                    const SizedBox(height: 8),
                    InlineRecipeComposer(onSubmitted: () => setState(() {})),
                    const SizedBox(height: 20),
                  ],
                  if (_isLoading)
                    const Center(child: CircularProgressIndicator()),
                ],
              ),

            ),

          ),
          SliverToBoxAdapter(
            child: StreamBuilder<QuerySnapshot>(
              stream: FirebaseFirestore.instance
                  .collection('recipes')
                  .where('uid', isEqualTo: viewedUid)
                  .where('isPublic', isEqualTo: true)
                  .orderBy('createdAt', descending: true)
                  .snapshots(),
              builder: (context, snapshot) {
                if (!snapshot.hasData) {
                  return const Center(
                    child: Padding(
                      padding: EdgeInsets.all(16),
                      child: CircularProgressIndicator(),
                    ),
                  );
                }

                final docs = snapshot.data!.docs;
                if (docs.isEmpty) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16, vertical: 20),
                    child: Text('No posts yet.'),
                  );
                }

                return ListView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: docs.length,
                  itemBuilder: (context, index) {
                    final data = docs[index].data() as Map<String, dynamic>;
                    return RecipeCard(
                      title: data['title'] ?? '',
                      description: data['description'] ?? '',
                      uid: data['uid'] ?? '',
                      recipeId: docs[index].id,
                      upvotedBy: List<String>.from(data['upvotedBy'] ?? []),
                      imageUrl: data['imageUrl'],
                      category: data['category'],
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
