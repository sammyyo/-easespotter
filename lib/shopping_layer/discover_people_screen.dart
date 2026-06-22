import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:easespotter/services/profile_visibility.dart';
import '../widgets/public_profile_widget.dart';

class DiscoverPeopleScreen extends StatefulWidget {
  const DiscoverPeopleScreen({super.key});

  @override
  State<DiscoverPeopleScreen> createState() => _DiscoverPeopleScreenState();
}

class _DiscoverPeopleScreenState extends State<DiscoverPeopleScreen> {
  final TextEditingController _searchController = TextEditingController();
  List<Map<String, dynamic>> _results = [];
  List<Map<String, dynamic>> _filteredResults = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadUsers();
  }

  Future<void> _loadUsers() async {
    final currentUid = FirebaseAuth.instance.currentUser?.uid;
    final query =
        await FirebaseFirestore.instance
            .collection('users')
            .where('publicProfile', isEqualTo: true)
            .orderBy('createdAt', descending: true)
            .limit(50)
            .get();

    final users =
        query.docs
            .map((doc) {
              final data = doc.data();
              if (!isSuggestableUserProfile(data)) return null;
              return {
                'id': doc.id,
                'displayName': data['displayName'] ?? '',
                'avatarUrl': data['avatarUrl'],
                'socialHandle': data['socialHandle'] ?? '',
                'bio': data['bio'] ?? '',
                'followers': List<String>.from(data['followers'] ?? []),
              };
            })
            .whereType<Map<String, dynamic>>()
            .where((user) => user['id'] != currentUid)
            .toList();

    setState(() {
      _results = users;
      _filteredResults = users;
      _isLoading = false;
    });
  }

  void _search(String keyword) {
    final lower = keyword.toLowerCase();
    setState(() {
      _filteredResults =
          _results.where((user) {
            final name = (user['displayName'] ?? '').toLowerCase();
            final handle = (user['socialHandle'] ?? '').toLowerCase();
            final bio = (user['bio'] ?? '').toLowerCase();
            return name.contains(lower) ||
                handle.contains(lower) ||
                bio.contains(lower);
          }).toList();
    });
  }

  Widget _buildUserTile(Map<String, dynamic> user) {
    final currentUserId = FirebaseAuth.instance.currentUser?.uid;
    final userId = user['id'];
    final isFollowing = user['followers'].contains(currentUserId);

    return ListTile(
      leading: CircleAvatar(
        backgroundImage:
            user['avatarUrl'] != null ? NetworkImage(user['avatarUrl']) : null,
        child: user['avatarUrl'] == null ? const Icon(Icons.person) : null,
      ),
      title: Text(user['displayName']),
      subtitle: Text(user['socialHandle'] ?? ''),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextButton(
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => PublicProfileWidget(uid: userId),
                ),
              );
            },
            child: const Text('View'),
          ),
          const SizedBox(width: 8),
          ElevatedButton(
            onPressed: () async {
              final userRef = FirebaseFirestore.instance.collection('users');
              if (isFollowing) {
                // Unfollow
                await userRef.doc(currentUserId).update({
                  'following': FieldValue.arrayRemove([userId]),
                });
                await userRef.doc(userId).update({
                  'followers': FieldValue.arrayRemove([currentUserId]),
                });
              } else {
                // Follow
                await userRef.doc(currentUserId).set({
                  'following': FieldValue.arrayUnion([userId]),
                }, SetOptions(merge: true));
                await userRef.doc(userId).set({
                  'followers': FieldValue.arrayUnion([currentUserId]),
                }, SetOptions(merge: true));
              }
              await _loadUsers(); // Refresh state
            },
            style: ElevatedButton.styleFrom(
              backgroundColor:
                  isFollowing ? Colors.grey.shade300 : Colors.deepPurple,
              foregroundColor: isFollowing ? Colors.black : Colors.white,
            ),
            child: Text(isFollowing ? 'Unfollow' : 'Follow'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Discover People',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
        ),
      ),
      body:
          _isLoading
              ? const Center(child: CircularProgressIndicator())
              : Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: TextField(
                      controller: _searchController,
                      onChanged: _search,
                      decoration: InputDecoration(
                        hintText: 'Search by name, handle, or bio',
                        prefixIcon: const Icon(Icons.search),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    child: ListView.separated(
                      itemCount: _filteredResults.length,
                      separatorBuilder: (_, __) => const Divider(),
                      itemBuilder:
                          (_, i) => _buildUserTile(_filteredResults[i]),
                    ),
                  ),
                ],
              ),
    );
  }
}
