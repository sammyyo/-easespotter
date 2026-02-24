import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:easespotter/helper/user_profile_service.dart';
import 'package:easespotter/widgets/public_profile_widget.dart';
import 'package:easespotter/widgets/app_bottom_nav.dart';
import 'main_scaffold.dart';

class PublicProfileScreen extends StatelessWidget {
  final String? uid;
  const PublicProfileScreen({super.key, this.uid});

  // --- Keep your collaborators fetch as-is (reads public aggregate data)
  Future<List<Map<String, dynamic>>> _fetchTopCollaborators(String uid) async {
    final query = await FirebaseFirestore.instance
        .collection('grocery_shares')
        .where('creatorUid', isEqualTo: uid)
        .get();

    final Map<String, int> countMap = {};
    for (var doc in query.docs) {
      final collaborators = List<String>.from(doc['collaborators'] ?? []);
      for (final cid in collaborators) {
        if (cid == uid) continue;
        countMap[cid] = (countMap[cid] ?? 0) + 1;
      }
    }

    final sorted = countMap.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final top = sorted.take(6).toList();

    final List<Map<String, dynamic>> result = [];
    for (final entry in top) {
      final userDoc =
      await FirebaseFirestore.instance.collection('users').doc(entry.key).get();
      if (userDoc.exists && userDoc.data() != null) {
        final data = userDoc.data()!;
        result.add({
          'uid': entry.key,
          'displayName': data['displayName'] ?? 'Anonymous',
          'avatarUrl': data['avatarUrl'],
          'count': entry.value,
        });
      }
    }
    return result;
  }

  // Smaller, cleaner collaborator card (better grid look)
  Widget _buildCollaboratorCard(BuildContext context, Map<String, dynamic> user) {
    final avatarUrl = (user['avatarUrl'] ?? '').toString();
    final name = (user['displayName'] ?? 'Anonymous').toString();
    final count = (user['count'] ?? 0);

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFFEFF2FF), // same soft tint style you liked
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFD9E1FF)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CircleAvatar(
            radius: 18,
            backgroundColor: Colors.white.withOpacity(0.85),
            backgroundImage: avatarUrl.isNotEmpty ? NetworkImage(avatarUrl) : null,
            child: avatarUrl.isEmpty
                ? Icon(Icons.person, size: 18, color: Colors.indigo.shade400)
                : null,
          ),
          const SizedBox(height: 8),
          Text(
            name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w800,
              color: Colors.grey.shade900,
              height: 1.1,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '$count lists',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w600,
              color: Colors.grey.shade700,
            ),
          ),
        ],
      ),
    );
  }

  // Reusable "section card" look
  Widget _sectionCard({
    required Widget child,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.black.withOpacity(0.06)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 14,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: child,
    );
  }

  Widget _sectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 0, 2, 10),
      child: Text(
        title,
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.2,
          color: Colors.grey.shade800,
        ),
      ),
    );
  }

  Future<void> _toggleFollow(
      BuildContext context,
      bool isFollowing,
      String targetUid,
      String currentUid,
      ) async {
    final userRef = FirebaseFirestore.instance.collection('users');
    try {
      if (isFollowing) {
        await userRef.doc(currentUid).update({
          'following': FieldValue.arrayRemove([targetUid])
        });
        await userRef.doc(targetUid).update({
          'followers': FieldValue.arrayRemove([currentUid])
        });
      } else {
        await userRef.doc(currentUid).set({
          'following': FieldValue.arrayUnion([targetUid])
        }, SetOptions(merge: true));
        await userRef.doc(targetUid).set({
          'followers': FieldValue.arrayUnion([currentUid])
        }, SetOptions(merge: true));
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to update follow status: $e')),
        );
      }
    }
  }

  Widget _statChip({
    required BuildContext context,
    required String count,
    required String label,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              count,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: const TextStyle(color: Colors.grey, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final resolvedUid = uid ?? FirebaseAuth.instance.currentUser?.uid;
    if (resolvedUid == null) {
      return const Scaffold(body: Center(child: Text("User not found")));
    }

    final currentUser = FirebaseAuth.instance.currentUser;
    final isMe = currentUser != null && currentUser.uid == resolvedUid;

    final profileService = UserProfileService(FirebaseFirestore.instance);

    return StreamBuilder<UserProfile?>(
      stream: profileService.watch(resolvedUid),
      builder: (context, snapshot) {
        final title = snapshot.data?.displayName.trim();

        return Scaffold(
          backgroundColor: const Color(0xFFF6F7FB),
          appBar: AppBar(
            title: Text(title?.isNotEmpty == true ? title! : 'Profile'),
            centerTitle: true,
            backgroundColor: Colors.deepPurple,
            titleTextStyle: const TextStyle(
              color: Colors.white,
              fontSize: 20,
              fontWeight: FontWeight.w800,
            ),
            iconTheme: const IconThemeData(color: Colors.white),
            elevation: 0,
          ),
          body: Builder(
            builder: (context) {
              if (snapshot.connectionState == ConnectionState.waiting &&
                  !snapshot.hasData) {
                return SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
                  child: const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(height: 2),
                    ],
                  ),
                );
              }
              if (snapshot.hasError) {
                return Center(child: Text("Error: ${snapshot.error}"));
              }
              final profile = snapshot.data;
              if (profile == null) {
                return const Center(child: Text("User profile not found."));
              }

              return SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    PublicProfileWidget(uid: resolvedUid),
                  ],
                ),
              );
            },
          ),
          bottomNavigationBar: currentUser == null
              ? AppBottomNav(
                  currentIndex: 3,
                  avatarUrl: null,
                  onTap: (index) {
                    if (index == 3) return;
                    Navigator.of(context).pushAndRemoveUntil(
                      MaterialPageRoute(
                        builder: (_) => MainScaffold(initialIndex: index),
                      ),
                      (route) => false,
                    );
                  },
                )
              : StreamBuilder<UserProfile?>(
                  stream: profileService.watch(currentUser.uid),
                  builder: (context, meSnapshot) {
                    return AppBottomNav(
                      currentIndex: 3,
                      avatarUrl: meSnapshot.data?.avatarUrl,
                      onTap: (index) {
                        if (index == 3) return;
                        Navigator.of(context).pushAndRemoveUntil(
                          MaterialPageRoute(
                            builder: (_) => MainScaffold(initialIndex: index),
                          ),
                          (route) => false,
                        );
                      },
                    );
                  },
                ),
        );
      },
    );
  }
}
