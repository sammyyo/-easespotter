import 'package:flutter/material.dart';
import 'package:easespotter/helper/user_profile_service.dart' as ups;
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:easespotter/screens/follow_list_screen.dart';
import 'package:easespotter/shopping_layer/profile_screen.dart';
import 'package:easespotter/widgets/user_handle.dart';
import 'package:easespotter/services/messaging_service.dart';
import 'package:easespotter/shopping_layer/chat_screen.dart';
import 'package:easespotter/services/notification_service.dart';

class PublicProfileWidget extends StatefulWidget {
  final String uid;
  final bool showTopCollaborators;
  final Map<String, dynamic>? initialProfileHint;

  const PublicProfileWidget({
    super.key,
    required this.uid,
    this.showTopCollaborators = true,
    this.initialProfileHint,
  });

  @override
  State<PublicProfileWidget> createState() => _PublicProfileWidgetState();
}

class _PublicProfileWidgetState extends State<PublicProfileWidget> {
  final currentUser = FirebaseAuth.instance.currentUser;

  late Future<ups.UserProfile?> _profileFuture;
  ups.UserProfile? _cachedProfile;

  late Stream<DocumentSnapshot> _userDocStream;
  late Stream<_FollowStats> _followStatsStream;

  // Top collaborators cache
  List<Map<String, dynamic>> _cachedTopCollaborators = [];
  bool _topLoading = true;

  // Profile avatar cache
  String? _lastAvatarUrl;
  ImageProvider? _avatarProvider;

  // Collaborator avatar cache
  final Map<String, ImageProvider> _collabAvatarProviders = {};
  final Map<String, String> _collabAvatarUrls = {};

  // Sticky widget cache to stop flicker on rebuilds
  late Widget _topSectionWidget;

  @override
  void initState() {
    super.initState();
    _topSectionWidget = const SizedBox.shrink();
    _initForUid(widget.uid);
  }

  @override
  void didUpdateWidget(covariant PublicProfileWidget oldWidget) {
    super.didUpdateWidget(oldWidget);

    if (oldWidget.uid != widget.uid) {
      _initForUid(widget.uid);
      return;
    }

    if (!oldWidget.showTopCollaborators &&
        widget.showTopCollaborators &&
        _cachedTopCollaborators.isEmpty &&
        _topLoading) {
      _loadTopCollaborators();
    }
  }

  void _initForUid(String uid) {
    _cachedProfile =
        _profileFromHint(uid, widget.initialProfileHint) ??
        ups.UserProfile(uid: uid, displayName: 'User');
    _lastAvatarUrl = null;
    _avatarProvider = null;

    _collabAvatarProviders.clear();
    _collabAvatarUrls.clear();

    _userDocStream =
        FirebaseFirestore.instance.collection('users').doc(uid).snapshots();
    _followStatsStream = _userDocStream
        .map((snap) {
          final data = (snap.data() as Map<String, dynamic>?) ?? {};
          return _FollowStats(
            followers: List<String>.from(data['followers'] ?? const []),
            following: List<String>.from(data['following'] ?? const []),
          );
        })
        .distinct(
          (a, b) =>
              _sameStringList(a.followers, b.followers) &&
              _sameStringList(a.following, b.following),
        );

    _profileFuture = ups.fetchUserProfile(uid);
    _profileFuture.then((profile) async {
      if (!mounted || profile == null) return;
      _cachedProfile = profile;
      await _maybePrecacheAvatar(profile.avatarUrl);
      if (mounted) setState(() {});
    });

    _cachedTopCollaborators = [];
    _topLoading = widget.showTopCollaborators;

    // Immediately set a stable placeholder widget (same height always)
    _rebuildTopSectionWidget();

    if (widget.showTopCollaborators) {
      _loadTopCollaborators();
    }
  }

  ups.UserProfile? _profileFromHint(String uid, Map<String, dynamic>? hint) {
    if (hint == null) return null;
    final displayName = (hint['displayName'] ?? '').toString().trim();
    final avatarUrl = (hint['avatarUrl'] ?? '').toString().trim();
    final handle =
        ((hint['socialHandle'] ?? hint['handle']) ?? '').toString().trim();
    if (displayName.isEmpty && avatarUrl.isEmpty && handle.isEmpty) return null;
    return ups.UserProfile(
      uid: uid,
      displayName: displayName.isNotEmpty ? displayName : 'User',
      avatarUrl: avatarUrl.isNotEmpty ? avatarUrl : null,
      socialHandle: handle.isNotEmpty ? handle : null,
    );
  }

  bool _sameStringList(List<String> a, List<String> b) {
    if (a.length != b.length) return false;
    for (int i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }

  void _rebuildTopSectionWidget() {
    // This creates the widget ONCE and reuses it until we call this again.
    // That stops flicker when build() is called repeatedly.
    if (!widget.showTopCollaborators) {
      _topSectionWidget = const SizedBox.shrink();
      return;
    }

    _topSectionWidget = RepaintBoundary(
      child: _TopCollaboratorsSection(
        key: const PageStorageKey('top_collaborators_grid'),
        loading: _topLoading,
        cached: _cachedTopCollaborators,
        buildTile: _buildGridTile,
      ),
    );
  }

  Future<void> _maybePrecacheAvatar(String? avatarUrl) async {
    final url = (avatarUrl ?? '').trim();
    if (url.isEmpty || url.toLowerCase() == 'null' || !url.startsWith('http')) {
      _avatarProvider = null;
      _lastAvatarUrl = null;
      return;
    }

    if (_lastAvatarUrl == url && _avatarProvider != null) return;

    _lastAvatarUrl = url;
    final provider = NetworkImage(url);
    _avatarProvider = provider;

    try {
      await precacheImage(provider, context);
    } catch (_) {}
  }

  Future<void> _loadTopCollaborators() async {
    if (!widget.showTopCollaborators) return;

    // Only flip to loading if we truly have nothing yet (avoids flashing)
    if (_cachedTopCollaborators.isEmpty) {
      setState(() {
        _topLoading = true;
        _rebuildTopSectionWidget();
      });
    }

    try {
      final users = await _fetchTopCollaborators();
      await _precacheCollaboratorAvatars(users);

      if (!mounted) return;

      // If data didn’t change, do nothing (prevents rebuild churn)
      final same = _sameCollaborators(_cachedTopCollaborators, users);
      if (same) {
        setState(() {
          _topLoading = false;
          _rebuildTopSectionWidget();
        });
        return;
      }

      setState(() {
        _cachedTopCollaborators = users;
        _topLoading = false;
        _rebuildTopSectionWidget();
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _topLoading = false;
        _rebuildTopSectionWidget();
      });
    }
  }

  bool _sameCollaborators(
    List<Map<String, dynamic>> a,
    List<Map<String, dynamic>> b,
  ) {
    if (a.length != b.length) return false;
    for (int i = 0; i < a.length; i++) {
      final auid = (a[i]['uid'] ?? '').toString();
      final buid = (b[i]['uid'] ?? '').toString();
      if (auid != buid) return false;

      final ac = (a[i]['count'] ?? 0).toString();
      final bc = (b[i]['count'] ?? 0).toString();
      if (ac != bc) return false;

      final aurl = (a[i]['avatarUrl'] ?? '').toString();
      final burl = (b[i]['avatarUrl'] ?? '').toString();
      if (aurl != burl) return false;

      final an = (a[i]['displayName'] ?? '').toString();
      final bn = (b[i]['displayName'] ?? '').toString();
      if (an != bn) return false;
    }
    return true;
  }

  Future<void> _precacheCollaboratorAvatars(
    List<Map<String, dynamic>> users,
  ) async {
    if (!mounted || users.isEmpty) return;

    final futures = <Future<void>>[];
    for (final user in users) {
      final uid = (user['uid'] ?? '').toString();
      if (uid.isEmpty) continue;

      final rawUrl = (user['avatarUrl'] ?? '').toString().trim();
      final url = (rawUrl.toLowerCase() == 'null') ? '' : rawUrl;

      if (url.isEmpty || !url.startsWith('http')) continue;

      if (_collabAvatarUrls[uid] == url && _collabAvatarProviders[uid] != null)
        continue;

      _collabAvatarUrls[uid] = url;
      final provider = NetworkImage(url);
      _collabAvatarProviders[uid] = provider;

      futures.add(precacheImage(provider, context).catchError((_) {}));
    }

    if (futures.isNotEmpty) {
      await Future.wait(futures);
    }
  }

  Future<void> _toggleFollow(bool isFollowing) async {
    if (currentUser == null) return;

    final userRef = FirebaseFirestore.instance.collection('users');

    try {
      if (isFollowing) {
        await userRef.doc(currentUser!.uid).update({
          'following': FieldValue.arrayRemove([widget.uid]),
        });
        await userRef.doc(widget.uid).update({
          'followers': FieldValue.arrayRemove([currentUser!.uid]),
        });
      } else {
        await userRef.doc(currentUser!.uid).set({
          'following': FieldValue.arrayUnion([widget.uid]),
        }, SetOptions(merge: true));
        await userRef.doc(widget.uid).set({
          'followers': FieldValue.arrayUnion([currentUser!.uid]),
        }, SetOptions(merge: true));

        // Follow write succeeded. Notification failure should not surface as
        // follow failure because the follow state is already persisted.
        try {
          await NotificationService().notifyUser(
            toUid: widget.uid,
            type: "follow",
            message: " ${currentUser!.displayName ?? 'Someone'} followed you",
            itemType: "profile",
            itemId: currentUser!.uid,
            actorUid: currentUser!.uid,
            actorName: currentUser!.displayName ?? 'Someone',
            actorAvatarUrl: currentUser!.photoURL,
          );
        } catch (_) {}
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to update follow status: ${e.toString()}'),
          ),
        );
      }
    }
  }

  Stream<int> _ownedCollectionCount({
    required String collection,
    required String uid,
    bool publicOnly = false,
  }) {
    Query<Map<String, dynamic>> query = FirebaseFirestore.instance
        .collection(collection)
        .where('uid', isEqualTo: uid);

    if (publicOnly) {
      query = query.where('isPublic', isEqualTo: true);
    }

    return query.snapshots().map((snap) => snap.size);
  }

  Widget _buildMusicWidget(BuildContext context, String url) {
    final cleaned = url.trim();
    return Padding(
      padding: const EdgeInsets.only(top: 16),
      child: TextButton.icon(
        icon: const Icon(Icons.library_music, color: Colors.deepPurple),
        label: const Text('Listen on Spotify'),
        onPressed: () async {
          final uri = Uri.parse(cleaned);
          if (await canLaunchUrl(uri)) {
            await launchUrl(uri, mode: LaunchMode.externalApplication);
          } else {
            if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Could not launch URL')),
              );
            }
          }
        },
      ),
    );
  }

  Future<List<Map<String, dynamic>>> _fetchTopCollaborators() async {
    final query =
        await FirebaseFirestore.instance
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

    final sorted =
        countMap.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    final top = sorted.take(6);

    final List<Map<String, dynamic>> result = [];
    for (final entry in top) {
      final userDoc =
          await FirebaseFirestore.instance
              .collection('users')
              .doc(entry.key)
              .get();
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

  Widget _buildGridTile(Map<String, dynamic> user, {String? subtitle}) {
    final uid = (user['uid'] ?? '').toString();
    final provider = _collabAvatarProviders[uid];

    return RepaintBoundary(
      key: ValueKey('collab_tile_$uid'),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipOval(
            child: SizedBox(
              width: 48,
              height: 48,
              child:
                  provider != null
                      ? Image(
                        image: provider,
                        fit: BoxFit.cover,
                        gaplessPlayback: true,
                      )
                      : const Icon(Icons.person, size: 20, color: Colors.grey),
            ),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  (user['displayName'] ?? 'Anonymous').toString(),
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                  ),
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
    );
  }

  Widget _buildAvatar(double radius, bool hasAvatar) {
    if (!hasAvatar || _avatarProvider == null) {
      return CircleAvatar(
        radius: radius,
        backgroundColor: Colors.deepPurple,
        child: Icon(Icons.person, size: radius, color: Colors.white),
      );
    }

    return ClipOval(
      child: SizedBox(
        width: radius * 2,
        height: radius * 2,
        child: Image(
          image: _avatarProvider!,
          fit: BoxFit.cover,
          gaplessPlayback: true,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isOwner = currentUser != null && currentUser!.uid == widget.uid;

    // Root key makes Flutter keep the same element tree when parent rebuilds
    return KeyedSubtree(
      key: ValueKey('public_profile_${widget.uid}'),
      child: FutureBuilder<ups.UserProfile?>(
        future: _profileFuture,
        initialData: _cachedProfile,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return Center(
              child: Text("Error fetching profile: ${snapshot.error}"),
            );
          }

          final profile =
              snapshot.data ??
              _cachedProfile ??
              ups.UserProfile(uid: widget.uid, displayName: 'User');

          final hasAvatar = (profile.avatarUrl ?? '').trim().isNotEmpty;
          final accentColor = Colors.deepPurple;

          final firstLink =
              (() {
                for (final u in profile.profileUrls) {
                  final trimmed = u.trim();
                  if (trimmed.isNotEmpty) return trimmed;
                }
                return '';
              })();

          return Padding(
            padding: const EdgeInsets.only(
              top: 0,
              left: 5,
              right: 5,
              bottom: 0,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.only(top: 5),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildAvatar(40, hasAvatar),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    profile.displayName,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontSize: 20,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                                if (isOwner)
                                  IconButton(
                                    tooltip: 'Edit profile',
                                    visualDensity: VisualDensity.compact,
                                    icon: const Icon(
                                      Icons.edit_outlined,
                                      size: 20,
                                      color: Colors.deepPurple,
                                    ),
                                    onPressed:
                                        () => Navigator.push(
                                          context,
                                          MaterialPageRoute(
                                            builder:
                                                (_) => const ProfileScreen(),
                                          ),
                                        ),
                                  ),
                              ],
                            ),
                            if (profile.socialHandle?.isNotEmpty ?? false)
                              Padding(
                                padding: const EdgeInsets.only(top: 2),
                                child: UserHandle(
                                  handle: profile.socialHandle!,
                                  uid: widget.uid,
                                ),
                              ),

                            // Followers/following stream stays small
                            StreamBuilder<_FollowStats>(
                              stream: _followStatsStream,
                              builder: (context, snap) {
                                final followers =
                                    snap.data?.followers ?? const <String>[];
                                final following =
                                    snap.data?.following ?? const <String>[];
                                final isFollowing =
                                    currentUser != null &&
                                    followers.contains(currentUser!.uid);

                                return Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Padding(
                                      padding: const EdgeInsets.only(top: 10),
                                      child: _ProfileCountsRow(
                                        uid: widget.uid,
                                        followers: followers,
                                        following: following,
                                        reelsStream: _ownedCollectionCount(
                                          collection: 'reels',
                                          uid: widget.uid,
                                          publicOnly: !isOwner,
                                        ),
                                      ),
                                    ),

                                    if (profile.bio?.isNotEmpty ?? false)
                                      Padding(
                                        padding: const EdgeInsets.only(top: 6),
                                        child: Text(
                                          profile.bio!,
                                          style: const TextStyle(
                                            color: Colors.black87,
                                          ),
                                        ),
                                      ),

                                    if (firstLink.isNotEmpty)
                                      Padding(
                                        padding: const EdgeInsets.only(top: 8),
                                        child: OutlinedButton.icon(
                                          onPressed: () async {
                                            final link =
                                                firstLink.startsWith('http')
                                                    ? firstLink
                                                    : 'https://$firstLink';
                                            final uri = Uri.parse(link);
                                            if (await canLaunchUrl(uri)) {
                                              await launchUrl(
                                                uri,
                                                mode:
                                                    LaunchMode
                                                        .externalApplication,
                                              );
                                            } else {
                                              if (mounted) {
                                                ScaffoldMessenger.of(
                                                  context,
                                                ).showSnackBar(
                                                  const SnackBar(
                                                    content: Text(
                                                      'Could not open link',
                                                    ),
                                                  ),
                                                );
                                              }
                                            }
                                          },
                                          icon: const Icon(
                                            Icons.link,
                                            size: 16,
                                          ),
                                          label: Text(
                                            firstLink,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                          style: OutlinedButton.styleFrom(
                                            foregroundColor: accentColor,
                                            side: BorderSide(
                                              color: accentColor.withOpacity(
                                                0.35,
                                              ),
                                            ),
                                            padding: const EdgeInsets.symmetric(
                                              vertical: 10,
                                              horizontal: 12,
                                            ),
                                            shape: RoundedRectangleBorder(
                                              borderRadius:
                                                  BorderRadius.circular(14),
                                            ),
                                          ),
                                        ),
                                      ),

                                    if (currentUser != null &&
                                        currentUser!.uid != widget.uid)
                                      Padding(
                                        padding: const EdgeInsets.only(
                                          top: 12.0,
                                        ),
                                        child: Row(
                                          children: [
                                            Expanded(
                                              child: ElevatedButton.icon(
                                                onPressed:
                                                    () => _toggleFollow(
                                                      isFollowing,
                                                    ),
                                                icon: Icon(
                                                  isFollowing
                                                      ? Icons.person_remove
                                                      : Icons.person_add,
                                                ),
                                                label: Text(
                                                  isFollowing
                                                      ? 'Following'
                                                      : 'Follow',
                                                ),
                                                style: ElevatedButton.styleFrom(
                                                  backgroundColor:
                                                      isFollowing
                                                          ? Colors.grey[300]
                                                          : accentColor,
                                                  foregroundColor:
                                                      isFollowing
                                                          ? Colors.black
                                                          : Colors.white,
                                                  padding:
                                                      const EdgeInsets.symmetric(
                                                        vertical: 12,
                                                      ),
                                                  shape: RoundedRectangleBorder(
                                                    borderRadius:
                                                        BorderRadius.circular(
                                                          22,
                                                        ),
                                                  ),
                                                  elevation: 0,
                                                ),
                                              ),
                                            ),
                                            const SizedBox(width: 12),
                                            Expanded(
                                              child: OutlinedButton.icon(
                                                onPressed: () async {
                                                  try {
                                                    final convoId =
                                                        await MessagingService()
                                                            .ensureConversation(
                                                              otherUid:
                                                                  widget.uid,
                                                            );
                                                    if (!context.mounted) {
                                                      return;
                                                    }

                                                    Navigator.push(
                                                      context,
                                                      MaterialPageRoute(
                                                        builder:
                                                            (_) => ChatScreen(
                                                              conversationId:
                                                                  convoId,
                                                              otherUid:
                                                                  widget.uid,
                                                              otherDisplayName:
                                                                  profile
                                                                      .displayName,
                                                            ),
                                                      ),
                                                    );
                                                  } catch (e) {
                                                    if (context.mounted) {
                                                      final message = e
                                                          .toString()
                                                          .replaceFirst(
                                                            'Exception: ',
                                                            '',
                                                          );
                                                      ScaffoldMessenger.of(
                                                        context,
                                                      ).showSnackBar(
                                                        SnackBar(
                                                          content: Text(
                                                            message,
                                                          ),
                                                        ),
                                                      );
                                                    }
                                                  }
                                                },
                                                icon: const Icon(
                                                  Icons.mail_outline,
                                                  size: 18,
                                                ),
                                                label: const Text("Message"),
                                                style: OutlinedButton.styleFrom(
                                                  foregroundColor: accentColor,
                                                  side: BorderSide(
                                                    color: accentColor
                                                        .withOpacity(0.5),
                                                  ),
                                                  padding:
                                                      const EdgeInsets.symmetric(
                                                        vertical: 12,
                                                      ),
                                                  shape: RoundedRectangleBorder(
                                                    borderRadius:
                                                        BorderRadius.circular(
                                                          22,
                                                        ),
                                                  ),
                                                ),
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                  ],
                                );
                              },
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                if ((profile.musicUrl ?? '').trim().contains(
                  'spotify.com',
                )) ...[
                  const SizedBox(height: 12),
                  const Text(
                    '🎧 My Mood Track',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  ),
                  const SizedBox(height: 4),
                  _buildMusicWidget(context, profile.musicUrl!),
                ],

                // Use the sticky cached widget (this is the main flicker fix)
                if (widget.showTopCollaborators) ...[
                  const SizedBox(height: 8),
                  const Divider(height: 1, thickness: 1, color: Colors.black12),
                  const SizedBox(height: 6),
                  _topSectionWidget,
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _FollowStats {
  final List<String> followers;
  final List<String> following;

  const _FollowStats({required this.followers, required this.following});
}

class _ProfileCountsRow extends StatelessWidget {
  final String uid;
  final List<String> followers;
  final List<String> following;
  final Stream<int> reelsStream;

  const _ProfileCountsRow({
    required this.uid,
    required this.followers,
    required this.following,
    required this.reelsStream,
  });

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<int>(
      stream: reelsStream,
      initialData: 0,
      builder: (context, reelsSnap) {
        return Row(
          children: [
            _ProfileCountItem(label: 'Reels', count: reelsSnap.data ?? 0),
            _ProfileCountItem(
              label: 'Followers',
              count: followers.length,
              onTap:
                  () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder:
                          (_) =>
                              FollowListScreen(userId: uid, initialTabIndex: 0),
                    ),
                  ),
            ),
            _ProfileCountItem(
              label: 'Following',
              count: following.length,
              onTap:
                  () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder:
                          (_) =>
                              FollowListScreen(userId: uid, initialTabIndex: 1),
                    ),
                  ),
            ),
          ],
        );
      },
    );
  }
}

class _ProfileCountItem extends StatelessWidget {
  final String label;
  final int count;
  final VoidCallback? onTap;

  const _ProfileCountItem({
    required this.label,
    required this.count,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final content = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            fontSize: 11,
            color: Colors.black54,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 3),
        Text(
          count.toString(),
          style: const TextStyle(
            fontSize: 14,
            color: Colors.black87,
            fontWeight: FontWeight.w900,
          ),
        ),
      ],
    );

    return Expanded(
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: content,
        ),
      ),
    );
  }
}

class _ProfileSkeleton extends StatelessWidget {
  const _ProfileSkeleton();

  @override
  Widget build(BuildContext context) {
    final boxColor = Colors.grey.shade200;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(radius: 40, backgroundColor: boxColor),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      height: 18,
                      width: 160,
                      decoration: BoxDecoration(
                        color: boxColor,
                        borderRadius: BorderRadius.circular(6),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Container(
                      height: 12,
                      width: 120,
                      decoration: BoxDecoration(
                        color: boxColor,
                        borderRadius: BorderRadius.circular(6),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Container(
                      height: 12,
                      width: double.infinity,
                      decoration: BoxDecoration(
                        color: boxColor,
                        borderRadius: BorderRadius.circular(6),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Container(
                      height: 12,
                      width: 220,
                      decoration: BoxDecoration(
                        color: boxColor,
                        borderRadius: BorderRadius.circular(6),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: Container(
                  height: 40,
                  decoration: BoxDecoration(
                    color: boxColor,
                    borderRadius: BorderRadius.circular(20),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Container(
                  height: 40,
                  decoration: BoxDecoration(
                    color: boxColor,
                    borderRadius: BorderRadius.circular(20),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _TopCollaboratorsSection extends StatelessWidget {
  final bool loading;
  final List<Map<String, dynamic>> cached;
  final Widget Function(Map<String, dynamic> user, {String? subtitle})
  buildTile;

  const _TopCollaboratorsSection({
    super.key,
    required this.loading,
    required this.cached,
    required this.buildTile,
  });

  @override
  Widget build(BuildContext context) {
    const double reservedHeight = 156;

    if (cached.isNotEmpty) {
      return SizedBox(
        height: reservedHeight,
        child: GridView.builder(
          physics: const NeverScrollableScrollPhysics(),
          padding: EdgeInsets.zero,
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 3,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: 2.7,
          ),
          itemCount: cached.length,
          itemBuilder: (context, i) {
            final user = cached[i];
            final uid = (user['uid'] ?? '').toString();
            return KeyedSubtree(
              key: ValueKey('top_collab_$uid'),
              child: buildTile(user, subtitle: '${user['count']} shared lists'),
            );
          },
        ),
      );
    }

    if (loading) {
      return SizedBox(
        height: reservedHeight,
        child: GridView.builder(
          physics: const NeverScrollableScrollPhysics(),
          padding: EdgeInsets.zero,
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 3,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: 2.7,
          ),
          itemCount: 6,
          itemBuilder: (context, i) {
            return Container(
              decoration: BoxDecoration(
                color: const Color(0xFFEFF2FF),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: const Color(0xFFD9E1FF)),
              ),
            );
          },
        ),
      );
    }

    return const SizedBox(
      height: reservedHeight,
      child: Center(
        child: Text(
          'No collaborators yet.',
          style: TextStyle(fontSize: 12, color: Colors.grey),
        ),
      ),
    );
  }
}
