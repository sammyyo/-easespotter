import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../profile/profile_cache.dart';
import '../../screens/social_profile_screen.dart'; // ✅ Import destination

class AuthorHeader extends StatelessWidget {
  final String uid;
  const AuthorHeader({super.key, required this.uid});

  Stream<UserProfile> _profileStream(String uid) {
    return FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .snapshots()
        .map((doc) => UserProfile.fromDoc(uid, doc.data()));
  }

  Future<void> _navigateToProfile(BuildContext context) async {
    if (uid.isEmpty) return;
    await SocialProfileScreen.open(
      context,
      viewedUid: uid,
    );
  }

  @override
  Widget build(BuildContext context) {
    // Fallback when uid is missing
    if (uid.isEmpty) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircleAvatar(
            radius: 16,
            backgroundColor:
            Theme.of(context).colorScheme.secondary.withOpacity(0.12),
            child: const Text(
              'U',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
          const SizedBox(width: 10),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 180),
            child: const Text(
              'Unknown User',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      );
    }

    final cached = ProfileCache.peek(uid);

    return StreamBuilder<UserProfile>(
      stream: _profileStream(uid),
      initialData: cached,
      builder: (context, snapshot) {
        final p = snapshot.data ??
            UserProfile(uid: uid, displayName: '', avatarUrl: '');
        if (snapshot.hasData) ProfileCache.putMany([p]);

        final name =
        p.displayName.isNotEmpty ? p.displayName : 'Unknown User';
        final hasImage = p.avatarUrl.isNotEmpty;

        // ✅ Wrap in InkWell/GestureDetector for navigation
        return InkWell(
          onTap: () async => _navigateToProfile(context),
          borderRadius: BorderRadius.circular(20),
          child: Padding(
            padding: const EdgeInsets.all(4.0), // Touch target padding
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircleAvatar(
                  radius: 16,
                  backgroundColor: Theme.of(context)
                      .colorScheme
                      .secondary
                      .withOpacity(0.12),
                  backgroundImage: hasImage ? NetworkImage(p.avatarUrl) : null,
                  child: hasImage
                      ? null
                      : Text(
                    (name.isNotEmpty
                        ? name.trim().characters.first
                        : 'U')
                        .toUpperCase(),
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                const SizedBox(width: 10),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 150),
                  child: Text(
                    name,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
