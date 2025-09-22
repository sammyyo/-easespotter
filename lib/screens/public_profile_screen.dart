import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:youtube_player_flutter/youtube_player_flutter.dart';

class PublicProfileScreen extends StatelessWidget {
  final String? uid;
  const PublicProfileScreen({super.key, this.uid});

  Future<Map<String, dynamic>?> _loadUserProfile(String uid) async {
    final doc = await FirebaseFirestore.instance.collection('users').doc(uid).get();
    return doc.exists ? doc.data() : null;
  }

  Future<List<Map<String, dynamic>>> _fetchTop8(String uid) async {
    final doc = await FirebaseFirestore.instance.collection('users').doc(uid).get();
    final List<String> ids = List<String>.from(doc.data()?['top8'] ?? []);
    final results = <Map<String, dynamic>>[];

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

    final sorted = countMap.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    final top = sorted.take(3).toList();
    final List<Map<String, dynamic>> result = [];

    for (final entry in top) {
      final userDoc = await FirebaseFirestore.instance.collection('users').doc(entry.key).get();
      if (userDoc.exists) {
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

  Widget _buildMusicWidget(BuildContext context, String url) {
    final videoId = YoutubePlayer.convertUrlToId(url);
    if (videoId != null) {
      return YoutubePlayer(
        controller: YoutubePlayerController(
          initialVideoId: videoId,
          flags: const YoutubePlayerFlags(autoPlay: false),
        ),
        showVideoProgressIndicator: true,
      );
    }

    IconData icon = Icons.music_note;
    String label = 'Listen';

    if (url.contains('spotify.com')) icon = Icons.library_music;
    if (url.contains('soundcloud.com')) icon = Icons.audiotrack;

    return TextButton.icon(
      icon: Icon(icon, color: Colors.deepPurple),
      label: Text(label),
      onPressed: () => launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication),
    );
  }

  @override
  Widget build(BuildContext context) {
    final userId = uid ?? FirebaseAuth.instance.currentUser?.uid;
    if (userId == null) return const Scaffold(body: Center(child: Text("User not found")));

    return Scaffold(
      appBar: AppBar(title: const Text('Public Profile')),
      body: FutureBuilder<Map<String, dynamic>?>(
        future: _loadUserProfile(userId),
        builder: (context, snapshot) {
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
          final data = snapshot.data!;
          final displayName = data['displayName'] ?? '';
          final bio = data['bio'] ?? '';
          final tagline = data['tagline'] ?? '';
          final avatarUrl = data['avatarUrl'];
          final musicUrl = data['moodMusicUrl'];

          return SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Avatar + Info
                Row(
                  children: [
                    CircleAvatar(
                      radius: 40,
                      backgroundImage: avatarUrl != null ? NetworkImage(avatarUrl) : null,
                      backgroundColor: Colors.deepPurple,
                      child: avatarUrl == null
                          ? const Icon(Icons.person, color: Colors.white, size: 40)
                          : null,
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(displayName,
                              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                          if (tagline.isNotEmpty)
                            Text(tagline, style: const TextStyle(color: Colors.grey)),
                          if (bio.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 6),
                              child: Text(bio),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),

                if (musicUrl != null && musicUrl.isNotEmpty) ...[
                  const SizedBox(height: 30),
                  const Text("🎧 My Mood Track", style: TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  _buildMusicWidget(context, musicUrl),
                ],

                const SizedBox(height: 30),
                const Divider(),

                // Top 8 Tastemates
                FutureBuilder<List<Map<String, dynamic>>>(
                  future: _fetchTop8(userId),
                  builder: (context, snap) {
                    if (!snap.hasData || snap.data!.isEmpty) return const SizedBox();
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text("Top 8 Tastemates", style: TextStyle(fontWeight: FontWeight.bold)),
                        const SizedBox(height: 10),
                        Wrap(
                          spacing: 16,
                          runSpacing: 16,
                          children: snap.data!
                              .map((user) => Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              CircleAvatar(
                                radius: 24,
                                backgroundImage: user['avatarUrl'] != null
                                    ? NetworkImage(user['avatarUrl'])
                                    : null,
                                child: user['avatarUrl'] == null
                                    ? const Icon(Icons.person)
                                    : null,
                              ),
                              const SizedBox(height: 4),
                              Text(user['displayName'], style: const TextStyle(fontSize: 12)),
                            ],
                          ))
                              .toList(),
                        ),
                      ],
                    );
                  },
                ),

                const SizedBox(height: 30),

                // Top Collaborators
                FutureBuilder<List<Map<String, dynamic>>>(
                  future: _fetchTopCollaborators(userId),
                  builder: (context, snap) {
                    if (!snap.hasData || snap.data!.isEmpty) return const SizedBox();
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text("Top Collaborators", style: TextStyle(fontWeight: FontWeight.bold)),
                        const SizedBox(height: 10),
                        ...snap.data!.map((user) => ListTile(
                          leading: CircleAvatar(
                            backgroundImage: user['avatarUrl'] != null
                                ? NetworkImage(user['avatarUrl'])
                                : null,
                            child: user['avatarUrl'] == null
                                ? const Icon(Icons.person)
                                : null,
                          ),
                          title: Text(user['displayName']),
                          subtitle: Text('${user['count']} shared lists'),
                        )),
                      ],
                    );
                  },
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
