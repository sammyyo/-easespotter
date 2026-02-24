import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../profile/profile_cache.dart';

class AvatarStack extends StatelessWidget {
  final List<String> uids;
  final double size;
  final double overlap;

  const AvatarStack({
    super.key,
    required this.uids,
    this.size = 20,
    this.overlap = 8,
  });

  Stream<List<UserProfile>> _profilesStream(List<String> ids) {
    if (ids.isEmpty) return Stream.value(const <UserProfile>[]);

    final distinct = <String>[];
    for (final id in ids) {
      if (!distinct.contains(id)) distinct.add(id);
    }

    return FirebaseFirestore.instance
        .collection('users')
        .where(FieldPath.documentId, whereIn: distinct) // Firestore limit applies; uids <= 10
        .snapshots()
        .map((snap) {
      final byId = <String, UserProfile>{};
      for (final doc in snap.docs) {
        byId[doc.id] = UserProfile.fromDoc(doc.id, doc.data());
      }
      final ordered = <UserProfile>[];
      for (final id in distinct) {
        final p = byId[id];
        if (p != null) ordered.add(p);
      }
      return ordered;
    });
  }

  void _openProfile(BuildContext context, String uid) {
    try {
      Navigator.of(context).pushNamed('/profile', arguments: {'uid': uid});
      return;
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    if (uids.isEmpty) return const SizedBox.shrink();

    final initial = ProfileCache.peekMany(uids);

    return StreamBuilder<List<UserProfile>>(
      stream: _profilesStream(uids),
      initialData: initial,
      builder: (context, snapshot) {
        final profiles = snapshot.data ?? [];
        final total = profiles.length;
        final width = total > 0 ? size + (total - 1) * (size - overlap) : size;

        if (snapshot.hasData && profiles.isNotEmpty) {
          ProfileCache.putMany(profiles);
        }

        return SizedBox(
          width: width,
          height: size,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              for (int i = 0; i < profiles.length; i++)
                Positioned(
                  left: i * (size - overlap),
                  child: _UserAvatarBubble(
                    profile: profiles[i],
                    size: size,
                    onTap: () => _openProfile(context, profiles[i].uid),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _UserAvatarBubble extends StatelessWidget {
  final UserProfile profile;
  final double size;
  final VoidCallback onTap;

  const _UserAvatarBubble({
    required this.profile,
    this.size = 20,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final scaffoldBg = Theme.of(context).scaffoldBackgroundColor;
    final bg = Theme.of(context).colorScheme.secondary.withOpacity(0.12);
    final hasImage = profile.avatarUrl.isNotEmpty;
    final initial =
    (profile.displayName.isNotEmpty ? profile.displayName.trim().characters.first : 'U')
        .toUpperCase();

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          border: Border.all(color: scaffoldBg, width: 1.5),
          shape: BoxShape.circle,
        ),
        child: CircleAvatar(
          backgroundColor: bg,
          backgroundImage: hasImage ? NetworkImage(profile.avatarUrl) : null,
          child: hasImage
              ? null
              : Text(
            initial,
            style: TextStyle(fontSize: size * 0.55, fontWeight: FontWeight.w700),
          ),
        ),
      ),
    );
  }
}
