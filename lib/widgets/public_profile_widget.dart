import 'package:flutter/material.dart';
import 'package:easespotter/helper/user_profile_service.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:youtube_player_flutter/youtube_player_flutter.dart';
import 'package:easespotter/shopping_layer/profile_screen.dart';


class PublicProfileWidget extends StatefulWidget {
  final String uid;

  const PublicProfileWidget({super.key, required this.uid});

  @override
  State<PublicProfileWidget> createState() => _PublicProfileWidgetState();
}

class _PublicProfileWidgetState extends State<PublicProfileWidget> {
  bool _isFollowing = false;
  bool _loadingFollowStatus = true;

  final currentUser = FirebaseAuth.instance.currentUser;

  Future<void> _checkFollowStatus() async {
    if (currentUser == null) return;

    if (currentUser!.uid == widget.uid) {
      setState(() => _loadingFollowStatus = false);
      return;
    }

    final userDoc = await FirebaseFirestore.instance.collection('users').doc(currentUser!.uid).get();
    final following = List<String>.from(userDoc.data()?['following'] ?? []);
    setState(() {
      _isFollowing = following.contains(widget.uid);
      _loadingFollowStatus = false;
    });
  }

  Future<void> _toggleFollow() async {
    if (currentUser == null) return;
    final userRef = FirebaseFirestore.instance.collection('users');

    if (_isFollowing) {
      await userRef.doc(currentUser!.uid).update({
        'following': FieldValue.arrayRemove([widget.uid])
      });
      await userRef.doc(widget.uid).update({
        'followers': FieldValue.arrayRemove([currentUser!.uid])
      });
    } else {
      await userRef.doc(currentUser!.uid).set({
        'following': FieldValue.arrayUnion([widget.uid])
      }, SetOptions(merge: true));
      await userRef.doc(widget.uid).set({
        'followers': FieldValue.arrayUnion([currentUser!.uid])
      }, SetOptions(merge: true));
    }

    setState(() => _isFollowing = !_isFollowing);
  }

  @override
  void initState() {
    super.initState();
    _checkFollowStatus();
  }

  Widget _buildMusicWidget(BuildContext context, String url) {
    final videoId = YoutubePlayer.convertUrlToId(url);

    if (videoId != null) {
      return YoutubePlayer(
        controller: YoutubePlayerController(
          initialVideoId: videoId,
          flags: const YoutubePlayerFlags(autoPlay: false),
        ),
        showVideoProgressIndicator: true,
        width: double.infinity,
      );
    }

    IconData icon = Icons.music_note;
    String label = 'Listen to Mood Music';

    if (url.contains('spotify.com')) {
      icon = Icons.library_music;
      label = 'Listen on Spotify';
    } else if (url.contains('soundcloud.com')) {
      icon = Icons.audiotrack;
      label = 'Listen on SoundCloud';
    }

    return Padding(
      padding: const EdgeInsets.only(top: 16),
      child: TextButton.icon(
        icon: Icon(icon, color: Colors.deepPurple),
        label: Text(label),
        onPressed: () async {
          final uri = Uri.parse(url);
          if (await canLaunchUrl(uri)) {
            await launchUrl(uri, mode: LaunchMode.externalApplication);
          } else {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Could not launch URL')),
            );
          }
        },
      ),
    );
  }

  Future<List<Map<String, dynamic>>> _fetchTopCollaborators() async {
    final query = await FirebaseFirestore.instance
        .collection('grocery_shares')
        .where('creatorUid', isEqualTo: widget.uid)
        .get();

    final Map<String, int> countMap = {};
    for (var doc in query.docs) {
      final collaborators = List<String>.from(doc['collaborators'] ?? []);
      for (final cid in collaborators) {
        if (cid == widget.uid) continue;
        countMap[cid] = (countMap[cid] ?? 0) + 1;
      }
    }

    final sorted = countMap.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    final top = sorted.take(3);

    final List<Map<String, dynamic>> result = [];
    for (final entry in top) {
      final userDoc = await FirebaseFirestore.instance.collection('users').doc(entry.key).get();
      if (userDoc.exists) {
        final userData = userDoc.data()!;
        result.add({
          'uid': entry.key,
          'displayName': userData['displayName'] ?? 'Anonymous',
          'avatarUrl': userData['avatarUrl'],
          'count': entry.value,
        });
      }
    }
    return result;
  }


  Future<List<Map<String, dynamic>>> _fetchTop8() async {
    final doc = await FirebaseFirestore.instance.collection('users').doc(widget.uid).get();
    final List<String> ids = List<String>.from(doc.data()?['top8'] ?? []);
    final List<Map<String, dynamic>> results = [];
    for (final id in ids) {
      final userDoc = await FirebaseFirestore.instance.collection('users').doc(id).get();
      if (userDoc.exists) {
        final data = userDoc.data()!;
        results.add({
          'uid': id,
          'displayName': data['displayName'] ?? 'Anonymous',
          'avatarUrl': data['avatarUrl'],
        });
      }
    }
    return results;
  }

  Widget _buildGridTile(Map<String, dynamic> user, {String? subtitle}) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start, // Align top
          children: [
            CircleAvatar(
              radius: 24,
              backgroundImage: user['avatarUrl'] != null
                  ? NetworkImage(user['avatarUrl'])
                  : null,
              child: user['avatarUrl'] == null
                  ? const Icon(Icons.person, size: 20)
                  : null,
            ),
            const SizedBox(width: 6),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    user['displayName'],
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (subtitle != null)
                    Text(
                      subtitle,
                      style: const TextStyle(fontSize: 10, color: Colors.grey),
                      overflow: TextOverflow.ellipsis,
                    ),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }


  @override
  Widget build(BuildContext context) {
    final isOwner = currentUser != null && currentUser!.uid == widget.uid;

    return FutureBuilder<UserProfile?>(
      future: fetchUserProfile(widget.uid),
      builder: (context, snapshot) {
        if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
        final profile = snapshot.data!;
        return Padding(
          padding: const EdgeInsets.only(top: 0, left: 5, right: 5, bottom: 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 5),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    CircleAvatar(
                      radius: 40,
                      backgroundColor: Colors.deepPurple,
                      backgroundImage: profile.avatarUrl != null
                          ? NetworkImage(profile.avatarUrl!)
                          : null,
                      child: profile.avatarUrl == null
                          ? const Icon(Icons.person, size: 40, color: Colors.white)
                          : null,
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(profile.displayName, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                              if (profile.socialHandle?.isNotEmpty ?? false)
                                Padding(
                                  padding: const EdgeInsets.only(top: 2),
                                  child: Text('@${profile.socialHandle!.toLowerCase()}', style: const TextStyle(fontSize: 14, color: Colors.grey)),
                                ),
                            ],
                          ),
                          if (profile.bio?.isNotEmpty ?? false)
                            Padding(
                              padding: const EdgeInsets.only(top: 6),
                              child: Text(profile.bio!, style: const TextStyle(color: Colors.black87)),
                            ),
                          if (profile.createdAt != null)
                            Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Text(
                                'Joined: ${profile.createdAt!.toLocal().toString().split(' ').first}',
                                style: const TextStyle(color: Colors.grey),
                              ),
                            ),
                          FutureBuilder<DocumentSnapshot>(
                            future: FirebaseFirestore.instance.collection('users').doc(widget.uid).get(),
                            builder: (context, snap) {
                              if (!snap.hasData) return const SizedBox();
                              final data = snap.data!.data() as Map<String, dynamic>;
                              final followers = List<String>.from(data['followers'] ?? []);
                              final following = List<String>.from(data['following'] ?? []);
                              return Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Text(
                                  '${followers.length} Followers • ${following.length} Following',
                                  style: const TextStyle(fontSize: 12, color: Colors.grey),
                                ),
                              );
                            },
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              if (!_loadingFollowStatus)
                Row(
                  children: [
                    ElevatedButton.icon(
                      onPressed: _toggleFollow,
                      icon: Icon(_isFollowing ? Icons.person_remove : Icons.person_add),
                      label: Text(_isFollowing ? 'Unfollow' : 'Follow'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _isFollowing ? Colors.grey.shade300 : Colors.deepPurple,
                        foregroundColor: _isFollowing ? Colors.black : Colors.white,
                      ),
                    ),
                    const SizedBox(width: 12),
                    if (isOwner)
                      ElevatedButton.icon(
                        onPressed: () => Navigator.push(
                          context,
                          MaterialPageRoute(builder: (_) => const ProfileScreen()),
                        ),
                        icon: const Icon(Icons.edit, size: 18),
                        label: const Text('Edit Profile'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.grey.shade200,
                          foregroundColor: Colors.black,
                        ),
                      ),
                  ],
                ),


              if (profile.musicUrl?.isNotEmpty ?? false) ...[
                const SizedBox(height: 30),
                const Text('🎧 My Mood Track', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                const SizedBox(height: 10),
                _buildMusicWidget(context, profile.musicUrl!),
              ],

              const SizedBox(height: 15),
              const Divider(height: 1, thickness: 1, color: Colors.black12),
              const SizedBox(height: 10),


              FutureBuilder<List<Map<String, dynamic>>>(
                future: _fetchTopCollaborators(),
                builder: (context, snap) {
                  if (!snap.hasData) return const CircularProgressIndicator();
                  final users = snap.data!;

                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Top Collaborators', style: TextStyle(fontWeight: FontWeight.bold)),
                      const SizedBox(height: 10),
                      GridView.count(
                        crossAxisCount: 3,
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        crossAxisSpacing: 12,
                        mainAxisSpacing: 12,
                        children: users.isEmpty
                            ? List.generate(
                          3,
                              (i) => Container(
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(12),
                              color: Colors.grey.shade100,
                            ),
                            height: 80,
                            width: 80,
                            child: const Center(child: Text('—')),
                          ),
                        )
                            : users.map((user) => _buildGridTile(user, subtitle: '${user['count']} shared')).toList(),
                      ),
                    ],
                  );
                },
              ),


              const SizedBox(height: 15),
              const Divider(height: 1, thickness: 1, color: Colors.black12),
              const SizedBox(height: 10),


              FutureBuilder<List<Map<String, dynamic>>>(
                future: _fetchTop8(),
                builder: (context, snap) {
                  if (!snap.hasData) return const CircularProgressIndicator();
                  final tastemates = snap.data!.take(6).toList();


                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Top 6 Tastemates', style: TextStyle(fontWeight: FontWeight.bold)),
                      const SizedBox(height: 10),
                      GridView.count(
                        crossAxisCount: 3,
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        crossAxisSpacing: 12,
                        mainAxisSpacing: 12,
                        children: tastemates.isEmpty
                            ? List.generate(
                          3,
                              (i) => Container(
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(12),
                              color: Colors.grey.shade100,
                            ),
                            height: 80,
                            width: 80,
                            child: const Center(child: Text('—')),
                          ),
                        )
                            : tastemates.map((user) => _buildGridTile(user)).toList(),
                      ),
                    ],
                  );
                },
              ),

            ],
          ),
        );
      },
    );
  }
}
