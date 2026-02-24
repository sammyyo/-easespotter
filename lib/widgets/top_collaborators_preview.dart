import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class TopCollaboratorsPreview extends StatefulWidget {
  final String uid;
  final int limit;
  final int crossAxisCount;

  const TopCollaboratorsPreview({
    super.key,
    required this.uid,
    this.limit = 4,
    this.crossAxisCount = 2,
  });

  @override
  State<TopCollaboratorsPreview> createState() => _TopCollaboratorsPreviewState();
}

class _TopCollaboratorsPreviewState extends State<TopCollaboratorsPreview> {
  Future<List<Map<String, dynamic>>>? _future;

  @override
  void initState() {
    super.initState();
    _future = _fetchTopCollaborators(widget.uid);
  }

  @override
  void didUpdateWidget(covariant TopCollaboratorsPreview oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.uid != widget.uid) {
      _future = _fetchTopCollaborators(widget.uid);
    }
  }

  Future<List<Map<String, dynamic>>> _fetchTopCollaborators(String uid) async {
    final db = FirebaseFirestore.instance;

    // 1) Lists the user created
    final createdSnap = await db
        .collection('grocery_shares')
        .where('creatorUid', isEqualTo: uid)
        .get();

    // 2) Lists the user joined (user is in collaborators)
    final joinedSnap = await db
        .collection('grocery_shares')
        .where('collaborators', arrayContains: uid)
        .get();

    // Merge docs (avoid duplicates if any)
    final allDocsMap = <String, QueryDocumentSnapshot<Map<String, dynamic>>>{};
    for (final d in createdSnap.docs) {
      allDocsMap[d.id] = d;
    }
    for (final d in joinedSnap.docs) {
      allDocsMap[d.id] = d;
    }
    final allDocs = allDocsMap.values.toList();

    // Count collaborator frequency
    final Map<String, int> counts = {};

    for (final doc in allDocs) {
      final data = doc.data();
      final creatorUid = (data['creatorUid'] ?? '').toString().trim();
      final collaborators = List<String>.from(data['collaborators'] ?? []);

      // Make a set of all participants in that share
      final participants = <String>{
        if (creatorUid.isNotEmpty) creatorUid,
        ...collaborators,
      };

      // If this share doesn't include the user, skip it
      if (!participants.contains(uid)) continue;

      // Count everyone else as a collaborator with the user
      for (final other in participants) {
        if (other == uid) continue;
        counts[other] = (counts[other] ?? 0) + 1;
      }
    }

    if (counts.isEmpty) return [];

    final sorted = counts.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    final top = sorted.take(widget.limit).toList();

    // Fetch user docs in parallel
    final futures = top.map((e) => db.collection('users').doc(e.key).get());
    final userDocs = await Future.wait(futures);

    final List<Map<String, dynamic>> result = [];
    for (int i = 0; i < top.length; i++) {
      final uid = top[i].key;
      final count = top[i].value;
      final userDoc = userDocs[i];

      if (!userDoc.exists) continue;
      final u = userDoc.data() as Map<String, dynamic>;

      result.add({
        'uid': uid,
        'displayName': (u['displayName'] ?? 'Anonymous').toString(),
        'handle': (u['handle'] ?? u['socialHandle'] ?? '').toString(),
        'avatarUrl': (u['avatarUrl'] ?? '').toString(),
        'count': count,
      });
    }

    return result;
  }

  Widget _tile(Map<String, dynamic> u) {
    final avatarUrl = (u['avatarUrl'] ?? '').toString();
    final name = (u['displayName'] ?? 'Anonymous').toString();
    final handle = (u['handle'] ?? '').toString();
    final count = (u['count'] ?? 0).toString();

    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () {
        // NOTE: we don't import SocialProfileScreen here to avoid circular imports.
        // We'll navigate from SocialProfileScreen instead (recommended).
      },
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colors.black.withOpacity(0.08)),
        ),
        child: Row(
          children: [
            CircleAvatar(
              radius: 18,
              backgroundImage: avatarUrl.isNotEmpty ? NetworkImage(avatarUrl) : null,
              child: avatarUrl.isEmpty ? const Icon(Icons.person, size: 18) : null,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12),
                  ),
                  if (handle.isNotEmpty)
                    Text(
                      handle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: Colors.grey.shade700, fontSize: 10),
                    ),
                  const SizedBox(height: 2),
                  Text(
                    '$count shared lists',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: Colors.grey.shade600, fontSize: 10),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const Padding(
            padding: EdgeInsets.fromLTRB(12, 10, 12, 0),
            child: LinearProgressIndicator(),
          );
        }

        final users = snap.data ?? [];
        if (users.isEmpty) return const SizedBox.shrink();

        return Padding(
          padding: const EdgeInsets.fromLTRB(10, 12, 10, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Top Collaborators',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w900,
                  color: Colors.deepPurple,
                ),
              ),
              const SizedBox(height: 4),
              GridView.count(
                crossAxisCount: widget.crossAxisCount,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
                childAspectRatio: 2.6,
                children: users.map(_tile).toList(),
              ),
            ],
          ),
        );
      },
    );
  }
}
