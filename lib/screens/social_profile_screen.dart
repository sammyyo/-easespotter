import 'dart:async';
import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:easespotter/services/store_logo_service.dart';
import 'package:easespotter/shopping_layer/community_recipes_screen.dart';
import 'package:easespotter/shopping_layer/glowup_feed_screen.dart';
import 'package:easespotter/shopping_layer/reels_feed_screen.dart';
import 'package:easespotter/widgets/public_profile_widget.dart';
import '../shopping_layer/notification_feed_screen.dart';
import '../widgets/recipe_card/recipe_card.dart';
import '../shopping_layer/inbox_screen.dart';

class SocialProfileScreen extends StatefulWidget {
  final String? viewedUid;
  final Map<String, dynamic>? initialProfileHint;
  final VoidCallback? onToggleToSettings;
  static bool _openInFlight = false;

  const SocialProfileScreen({
    super.key,
    this.viewedUid,
    this.initialProfileHint,
    this.onToggleToSettings,
  });

  static Future<Map<String, dynamic>?> _hydrateProfileHint(
    String uid,
    Map<String, dynamic>? initialHint,
  ) async {
    final hint = <String, dynamic>{...?initialHint};
    try {
      final snap =
          await FirebaseFirestore.instance.collection('users').doc(uid).get();
      final data = snap.data();
      if (data != null) {
        final displayName = (data['displayName'] ?? '').toString().trim();
        final avatarUrl = (data['avatarUrl'] ?? '').toString().trim();
        final handle =
            (data['handle'] ?? data['socialHandle'] ?? '').toString().trim();

        if ((hint['displayName'] ?? '').toString().trim().isEmpty &&
            displayName.isNotEmpty) {
          hint['displayName'] = displayName;
        }
        if ((hint['avatarUrl'] ?? '').toString().trim().isEmpty &&
            avatarUrl.isNotEmpty) {
          hint['avatarUrl'] = avatarUrl;
        }
        if ((hint['handle'] ?? '').toString().trim().isEmpty &&
            handle.isNotEmpty) {
          hint['handle'] = handle;
        }
        if ((hint['socialHandle'] ?? '').toString().trim().isEmpty &&
            handle.isNotEmpty) {
          hint['socialHandle'] = handle;
        }
      }
    } catch (_) {
      // non-fatal: keep initial hint
    }
    return hint.isEmpty ? null : hint;
  }

  static Future<void> open(
    BuildContext context, {
    required String viewedUid,
    Map<String, dynamic>? initialProfileHint,
    VoidCallback? onToggleToSettings,
  }) async {
    if (_openInFlight) return;
    _openInFlight = true;
    final hydrated = await _hydrateProfileHint(viewedUid, initialProfileHint);
    if (!context.mounted) {
      _openInFlight = false;
      return;
    }

    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        if (!context.mounted) return;
        await Future<void>.delayed(const Duration(milliseconds: 12));
        if (!context.mounted) return;
        await Navigator.of(context).push(
          route(
            viewedUid: viewedUid,
            initialProfileHint: hydrated,
            onToggleToSettings: onToggleToSettings,
          ),
        );
      } finally {
        _openInFlight = false;
      }
    });
  }

  static Route<void> route({
    String? viewedUid,
    Map<String, dynamic>? initialProfileHint,
    VoidCallback? onToggleToSettings,
  }) {
    return PageRouteBuilder<void>(
      transitionDuration: Duration.zero,
      reverseTransitionDuration: Duration.zero,
      pageBuilder:
          (_, __, ___) => SocialProfileScreen(
            viewedUid: viewedUid,
            initialProfileHint: initialProfileHint,
            onToggleToSettings: onToggleToSettings,
          ),
    );
  }

  @override
  State<SocialProfileScreen> createState() => _SocialProfileScreenState();
}

class _PeopleSuggestion {
  final String uid;
  final String displayName;
  final String handle;
  final String avatarUrl;
  final int score;
  final List<String> reasons;

  const _PeopleSuggestion({
    required this.uid,
    required this.displayName,
    required this.handle,
    required this.avatarUrl,
    required this.score,
    required this.reasons,
  });
}

class _SocialProfileScreenState extends State<SocialProfileScreen>
    with AutomaticKeepAliveClientMixin {
  User? _authUser;
  StreamSubscription<User?>? _authSub;
  bool _isFollowing = false;
  bool _isLoading = false;

  String? _currentProfileUid;
  Stream<QuerySnapshot>? _profileRecipesStream;
  List<QueryDocumentSnapshot> _cachedRecipeDocs = [];
  Stream<QuerySnapshot<Map<String, dynamic>>>? _topCollaboratorsStream;
  String? _topCollaboratorsUid;
  List<QueryDocumentSnapshot<Map<String, dynamic>>> _cachedTopCollaboratorDocs =
      [];
  final Map<String, List<QueryDocumentSnapshot>> _recipeCacheByUid = {};
  final Map<String, List<QueryDocumentSnapshot<Map<String, dynamic>>>>
  _topCacheByUid = {};

  // --- Search state ---
  final TextEditingController _searchController = TextEditingController();
  bool _showSearch = false;
  String _query = "";

  // --- Curated Top Collaborators UI cache (prevents flicker) ---
  final Map<String, Map<String, dynamic>> _userCache =
      {}; // otherUid -> user data
  List<String> _myFollowingCache = []; // updated from a single stream
  final Set<String> _queuedWarmUids = {}; // prevents duplicate warm requests
  final Set<String> _missingCollaboratorUids =
      {}; // warm attempted but user doc missing
  bool _warmQueuedThisFrame = false;

  // Avoid re-checking follow status repeatedly
  bool _didCheckFollow = false;
  String? _activeViewedUid;
  Map<String, dynamic>? _activeProfileHint;
  Future<List<_PeopleSuggestion>>? _peopleSuggestionsFuture;
  String? _peopleSuggestionsUid;

  @override
  void initState() {
    super.initState();
    _authUser = FirebaseAuth.instance.currentUser;
    _activeProfileHint = widget.initialProfileHint;

    _authSub = FirebaseAuth.instance.authStateChanges().listen((user) {
      if (!mounted) return;
      if (_authUser?.uid == user?.uid) return;

      setState(() => _authUser = user);
      _didCheckFollow = false;
      _checkFollowStatusOnce();
    });

    _checkFollowStatusOnce();
  }

  @override
  void didUpdateWidget(covariant SocialProfileScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.viewedUid != widget.viewedUid) {
      _activeViewedUid = null;
      _activeProfileHint = widget.initialProfileHint;
      _didCheckFollow = false;
      _checkFollowStatusOnce();
    }
  }

  @override
  bool get wantKeepAlive => true;

  @override
  void dispose() {
    _authSub?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  String _getResolvedUid() {
    final authUid = _authUser?.uid;
    return _activeViewedUid ?? widget.viewedUid ?? authUid ?? 'dev-user';
  }

  Future<void> _checkFollowStatusOnce() async {
    if (_didCheckFollow) return;
    _didCheckFollow = true;
    await _checkFollowStatus();
  }

  Future<void> _checkFollowStatus() async {
    final authUid = _authUser?.uid;
    final resolvedUid = _getResolvedUid();
    if (authUid == null || resolvedUid.isEmpty) return;

    try {
      final snap =
          await FirebaseFirestore.instance
              .collection('users')
              .doc(authUid)
              .get();
      if (!mounted) return;
      final following = List<String>.from(snap.data()?['following'] ?? []);
      setState(() {
        _myFollowingCache = following;
        _isFollowing =
            authUid == resolvedUid ? false : following.contains(resolvedUid);
      });
    } catch (_) {
      // silent
    }
  }

  Future<void> _toggleFollow() async {
    final authUid = _authUser?.uid;
    final resolvedUid = _getResolvedUid();
    if (authUid == null || resolvedUid.isEmpty || authUid == resolvedUid)
      return;

    setState(() => _isLoading = true);

    final userRef = FirebaseFirestore.instance.collection('users');
    try {
      if (_isFollowing) {
        await userRef.doc(authUid).update({
          'following': FieldValue.arrayRemove([resolvedUid]),
        });
        await userRef.doc(resolvedUid).update({
          'followers': FieldValue.arrayRemove([authUid]),
        });
      } else {
        await userRef.doc(authUid).set({
          'following': FieldValue.arrayUnion([resolvedUid]),
        }, SetOptions(merge: true));
        await userRef.doc(resolvedUid).set({
          'followers': FieldValue.arrayUnion([authUid]),
        }, SetOptions(merge: true));
      }
      if (mounted) {
        setState(() {
          _isFollowing = !_isFollowing;
          if (_isFollowing) {
            if (!_myFollowingCache.contains(resolvedUid)) {
              _myFollowingCache = [..._myFollowingCache, resolvedUid];
            }
          } else {
            _myFollowingCache =
                _myFollowingCache.where((u) => u != resolvedUid).toList();
          }
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Failed: $e')));
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // per-card follow/unfollow
  Future<void> _toggleFollowUser(String otherUid) async {
    final authUid = _authUser?.uid;
    if (authUid == null || otherUid.isEmpty || otherUid == authUid) return;

    final userRef = FirebaseFirestore.instance.collection('users');

    try {
      final myDoc = await userRef.doc(authUid).get();
      final following = List<String>.from(myDoc.data()?['following'] ?? []);
      final isFollowing = following.contains(otherUid);

      if (isFollowing) {
        await userRef.doc(authUid).update({
          'following': FieldValue.arrayRemove([otherUid]),
        });
        await userRef.doc(otherUid).update({
          'followers': FieldValue.arrayRemove([authUid]),
        });
      } else {
        await userRef.doc(authUid).set({
          'following': FieldValue.arrayUnion([otherUid]),
        }, SetOptions(merge: true));
        await userRef.doc(otherUid).set({
          'followers': FieldValue.arrayUnion([authUid]),
        }, SetOptions(merge: true));
      }

      if (!mounted) return;
      setState(() {
        if (isFollowing) {
          _myFollowingCache =
              _myFollowingCache.where((u) => u != otherUid).toList();
        } else if (!_myFollowingCache.contains(otherUid)) {
          _myFollowingCache = [..._myFollowingCache, otherUid];
        }
        _peopleSuggestionsFuture = null;
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Failed: $e')));
      }
    }
  }

  // ✅ helper to save Top Collaborator doc from the app
  Future<void> addToTopCollaborators({
    required String profileUid,
    required String otherUid,
    required int rank, // 1..4
  }) async {
    Map<String, dynamic> collaboratorSnapshot = {};
    try {
      final userSnap =
          await FirebaseFirestore.instance
              .collection('users')
              .doc(otherUid)
              .get();
      if (userSnap.exists) {
        final data = userSnap.data() ?? {};
        collaboratorSnapshot = {
          'displayName': (data['displayName'] ?? '').toString(),
          'handle': (data['handle'] ?? '').toString(),
          'socialHandle': (data['socialHandle'] ?? '').toString(),
          'avatarUrl': (data['avatarUrl'] ?? '').toString(),
        };
      }
    } catch (_) {
      // keep write resilient even if snapshot fetch fails
    }

    final ref = FirebaseFirestore.instance
        .collection('users')
        .doc(profileUid)
        .collection('top_collaborators')
        .doc(otherUid);

    await ref.set({
      'rank': rank,
      'createdAt': FieldValue.serverTimestamp(),
      if (collaboratorSnapshot.isNotEmpty) ...collaboratorSnapshot,
    }, SetOptions(merge: true));
  }

  Future<void> _showAddToTopSheet(String otherUid) async {
    final authUid = _authUser?.uid;
    if (authUid == null || otherUid.isEmpty || otherUid == authUid) return;

    final picked = await showModalBottomSheet<int>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (ctx) {
        Widget item(int rank) {
          return ListTile(
            leading: const Icon(Icons.star_rounded, color: Colors.deepPurple),
            title: Text(
              'Add to Top Collaborators (#$rank)',
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
            onTap: () => Navigator.pop(ctx, rank),
          );
        }

        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
              Container(
                height: 5,
                width: 44,
                decoration: BoxDecoration(
                  color: Colors.black12,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              const SizedBox(height: 10),
              const Text(
                'Choose a position',
                style: TextStyle(fontWeight: FontWeight.w900, fontSize: 14),
              ),
              const SizedBox(height: 6),
              item(1),
              item(2),
              item(3),
              item(4),
              const SizedBox(height: 10),
            ],
          ),
        );
      },
    );

    if (picked == null) return;

    try {
      await addToTopCollaborators(
        profileUid: authUid,
        otherUid: otherUid,
        rank: picked,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Added to Top Collaborators (#$picked)')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Failed: $e')));
    }
  }

  Future<Set<String>> _storeIdsForUser(String uid) async {
    try {
      final snap =
          await FirebaseFirestore.instance
              .collection('users')
              .doc(uid)
              .collection('followedStores')
              .limit(40)
              .get();

      return snap.docs
          .map((doc) {
            final data = doc.data();
            return (data['storeId'] ?? data['vendorId'] ?? doc.id)
                .toString()
                .trim();
          })
          .where((id) => id.isNotEmpty)
          .toSet();
    } catch (_) {
      return <String>{};
    }
  }

  Future<List<_PeopleSuggestion>> _loadPeopleSuggestions(String uid) async {
    final precomputed =
        await FirebaseFirestore.instance
            .collection('users')
            .doc(uid)
            .collection('recommendations')
            .orderBy('score', descending: true)
            .limit(8)
            .get();

    if (precomputed.docs.isNotEmpty) {
      return precomputed.docs.map((doc) {
        final data = doc.data();
        return _PeopleSuggestion(
          uid: (data['uid'] ?? doc.id).toString(),
          displayName: (data['displayName'] ?? 'Suggested profile').toString(),
          handle: (data['handle'] ?? '').toString(),
          avatarUrl: (data['avatarUrl'] ?? '').toString(),
          score: (data['score'] is int) ? data['score'] as int : 0,
          reasons:
              (data['reasons'] is List)
                  ? List<String>.from(data['reasons'])
                  : const ['Suggested profile'],
        );
      }).toList();
    }

    final topSnap =
        await FirebaseFirestore.instance
            .collection('users')
            .doc(uid)
            .collection('top_collaborators')
            .limit(20)
            .get();
    final topCollaboratorIds = topSnap.docs.map((doc) => doc.id).toSet();
    final excluded = <String>{uid, ...topCollaboratorIds, ..._myFollowingCache};
    final myStoreIds = await _storeIdsForUser(uid);

    final usersSnap =
        await FirebaseFirestore.instance.collection('users').limit(80).get();
    final candidates = <_PeopleSuggestion>[];

    for (final doc in usersSnap.docs) {
      if (excluded.contains(doc.id)) continue;

      final data = doc.data();
      if (data['publicProfile'] == false) continue;

      final displayName = (data['displayName'] ?? '').toString().trim();
      final handle = (data['handle'] ?? data['socialHandle'] ?? '')
          .toString()
          .trim()
          .replaceFirst(RegExp(r'^@+'), '');
      final avatarUrl = (data['avatarUrl'] ?? '').toString().trim();
      if (displayName.isEmpty && handle.isEmpty) continue;

      int score = 0;
      final reasons = <String>[];

      if (avatarUrl.isNotEmpty) score += 2;
      if (handle.isNotEmpty) score += 1;
      if (displayName.isNotEmpty) score += 1;

      final candidateStoreIds =
          myStoreIds.isEmpty ? <String>{} : await _storeIdsForUser(doc.id);
      final sharedStores = myStoreIds.intersection(candidateStoreIds).length;
      if (sharedStores > 0) {
        score += 3 + sharedStores.clamp(0, 3);
        reasons.add(
          sharedStores == 1 ? 'Shared store' : '$sharedStores shared stores',
        );
      }

      if (reasons.isEmpty) {
        reasons.add(handle.isNotEmpty ? 'Active profile' : 'Suggested profile');
      }

      candidates.add(
        _PeopleSuggestion(
          uid: doc.id,
          displayName: displayName.isNotEmpty ? displayName : '@$handle',
          handle: handle,
          avatarUrl: avatarUrl,
          score: score,
          reasons: reasons,
        ),
      );
    }

    candidates.sort((a, b) {
      final scoreCompare = b.score.compareTo(a.score);
      if (scoreCompare != 0) return scoreCompare;
      return a.displayName.toLowerCase().compareTo(b.displayName.toLowerCase());
    });

    return candidates.take(8).toList();
  }

  Future<List<_PeopleSuggestion>> _peopleSuggestionsFor(String uid) {
    if (_peopleSuggestionsUid != uid || _peopleSuggestionsFuture == null) {
      _peopleSuggestionsUid = uid;
      _peopleSuggestionsFuture = _loadPeopleSuggestions(uid);
    }
    return _peopleSuggestionsFuture!;
  }

  Widget _peopleSuggestionsSection(String uid) {
    return FutureBuilder<List<_PeopleSuggestion>>(
      future: _peopleSuggestionsFor(uid),
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const SizedBox.shrink();
        }

        final suggestions = snap.data ?? [];
        if (suggestions.isEmpty) return const SizedBox.shrink();

        return Padding(
          padding: const EdgeInsets.fromLTRB(10, 18, 10, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'People you might know',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w900,
                  color: Colors.deepPurple,
                  height: 1.0,
                ),
              ),
              const SizedBox(height: 10),
              SizedBox(
                height: 178,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: suggestions.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 10),
                  itemBuilder: (context, index) {
                    return _peopleSuggestionCard(suggestions[index]);
                  },
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _peopleSuggestionCard(_PeopleSuggestion person) {
    return SizedBox(
      width: 138,
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () {
          _openSocialProfile(
            person.uid,
            hint: {
              'displayName': person.displayName,
              'handle': person.handle,
              'socialHandle': person.handle,
              'avatarUrl': person.avatarUrl,
            },
          );
        },
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFE9E4FF)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.04),
                blurRadius: 10,
                offset: const Offset(0, 5),
              ),
            ],
          ),
          child: Column(
            children: [
              _safeAvatarImage(
                size: 54,
                url: person.avatarUrl,
                fallback: const CircleAvatar(
                  radius: 27,
                  backgroundColor: Color(0xFFF3EDFF),
                  child: Icon(Icons.person, color: Colors.deepPurple),
                ),
              ),
              const SizedBox(height: 9),
              Text(
                person.displayName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w900,
                ),
              ),
              if (person.handle.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(
                  '@${person.handle}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 11, color: Colors.black54),
                ),
              ],
              const Spacer(),
              Text(
                person.reasons.first,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 11,
                  color: Colors.deepPurple,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Stream<QuerySnapshot<Map<String, dynamic>>> _profileReelsStream({
    required String uid,
    required bool isOwnerViewing,
  }) {
    Query<Map<String, dynamic>> query = FirebaseFirestore.instance
        .collection('reels')
        .where('uid', isEqualTo: uid);

    if (!isOwnerViewing) {
      query = query.where('isPublic', isEqualTo: true);
    }

    return query.orderBy('createdAt', descending: true).limit(8).snapshots();
  }

  Widget _profileReelsSection({
    required String uid,
    required bool isOwnerViewing,
  }) {
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: _profileReelsStream(uid: uid, isOwnerViewing: isOwnerViewing),
      builder: (context, snapshot) {
        final docs = snapshot.data?.docs ?? [];

        if (snapshot.connectionState == ConnectionState.waiting &&
            docs.isEmpty) {
          return const SizedBox.shrink();
        }

        if (docs.isEmpty) return const SizedBox.shrink();

        return Padding(
          padding: const EdgeInsets.fromLTRB(10, 18, 10, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Text(
                    'Reels',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w900,
                      color: Colors.deepPurple,
                      height: 1.0,
                    ),
                  ),
                  const Spacer(),
                  TextButton.icon(
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder:
                              (_) => ReelsFeedScreen(
                                authorUid: uid,
                                includePrivate: isOwnerViewing,
                              ),
                        ),
                      );
                    },
                    icon: const Icon(Icons.video_collection_outlined, size: 18),
                    label: const Text('View all'),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              SizedBox(
                height: 178,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: docs.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 10),
                  itemBuilder: (context, index) {
                    return _profileReelCard(
                      uid: uid,
                      doc: docs[index],
                      isOwnerViewing: isOwnerViewing,
                    );
                  },
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _profileReelCard({
    required String uid,
    required QueryDocumentSnapshot<Map<String, dynamic>> doc,
    required bool isOwnerViewing,
  }) {
    final data = doc.data();
    final title = (data['title'] ?? 'Untitled reel').toString();
    final isPublic = data['isPublic'] == true;
    final durationSeconds = (data['durationSeconds'] as num?)?.toInt();

    return SizedBox(
      width: 118,
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder:
                  (_) => ReelsFeedScreen(
                    authorUid: uid,
                    initialReelId: doc.id,
                    includePrivate: isOwnerViewing,
                  ),
            ),
          );
        },
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: const Color(0xFFE5DFFF)),
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF2B193D), Color(0xFF6D43B8)],
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.deepPurple.withValues(alpha: 0.10),
                blurRadius: 12,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Stack(
              children: [
                const Positioned.fill(
                  child: Icon(
                    Icons.play_circle_fill,
                    color: Colors.white24,
                    size: 54,
                  ),
                ),
                Positioned(
                  left: 8,
                  right: 8,
                  top: 8,
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 7,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.92),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          isPublic ? 'Public' : 'Private',
                          style: const TextStyle(
                            color: Colors.deepPurple,
                            fontSize: 10,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                      const Spacer(),
                      if (durationSeconds != null)
                        Text(
                          '${durationSeconds}s',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                    ],
                  ),
                ),
                Positioned(
                  left: 8,
                  right: 8,
                  bottom: 10,
                  child: Text(
                    title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      height: 1.15,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _toggleSearch() {
    setState(() {
      _showSearch = !_showSearch;
      if (!_showSearch) {
        _searchController.clear();
        _query = "";
      }
    });
  }

  void _onSearchChanged(String v) {
    setState(() => _query = v.trim().toLowerCase());
  }

  void _clearSearch() {
    setState(() {
      _searchController.clear();
      _query = "";
    });
  }

  bool _matchesRecipe(Map<String, dynamic> data) {
    if (_query.isEmpty) return true;
    final title = (data['title'] ?? '').toString().toLowerCase();
    return title.contains(_query);
  }

  // batch warmup users with one setState
  Future<void> _warmUsersBatch(List<String> uids) async {
    if (!mounted) return;

    final refs =
        uids
            .where((u) => u.trim().isNotEmpty)
            .map(
              (u) =>
                  FirebaseFirestore.instance.collection('users').doc(u.trim()),
            )
            .toList();

    if (refs.isEmpty) return;

    try {
      final snaps = await Future.wait(refs.map((r) => r.get()));

      final Map<String, Map<String, dynamic>> newUsers = {};
      for (final snap in snaps) {
        final uid = snap.id;
        if (!snap.exists) continue;
        final data = (snap.data() ?? {});
        newUsers[uid] = data;
        _missingCollaboratorUids.remove(uid);

        // Keep collaborator docs denormalized for instant render on next loads.
        final profileUid = _currentProfileUid;
        if (profileUid != null && profileUid.isNotEmpty) {
          FirebaseFirestore.instance
              .collection('users')
              .doc(profileUid)
              .collection('top_collaborators')
              .doc(uid)
              .set({
                'displayName': (data['displayName'] ?? '').toString(),
                'handle': (data['handle'] ?? '').toString(),
                'socialHandle': (data['socialHandle'] ?? '').toString(),
                'avatarUrl': (data['avatarUrl'] ?? '').toString(),
              }, SetOptions(merge: true))
              .catchError((_) {});
        }
      }

      // Mark missing user docs so they don't block section rendering forever.
      for (final snap in snaps) {
        if (!snap.exists) {
          _missingCollaboratorUids.add(snap.id);
        }
      }

      if (!mounted) return;

      var changed = false;
      newUsers.forEach((k, v) {
        if (!_userCache.containsKey(k)) {
          _userCache[k] = v;
          changed = true;
        }
      });

      if (changed && mounted) {
        setState(() {});
      }
    } catch (_) {
      // silent
    }
  }

  Widget _safeAvatarImage({
    required double size,
    required String? url,
    required Widget fallback,
  }) {
    final clean = (url ?? '').trim();
    if (clean.isEmpty || !clean.startsWith('http')) return fallback;

    return ClipOval(
      child: SizedBox(
        width: size,
        height: size,
        child: Stack(
          fit: StackFit.expand,
          children: [
            fallback,
            Image.network(
              clean,
              fit: BoxFit.cover,
              gaplessPlayback: true,
              frameBuilder: (context, child, frame, wasSynchronouslyLoaded) {
                if (wasSynchronouslyLoaded || frame != null) return child;
                return const SizedBox.shrink();
              },
              errorBuilder: (_, __, ___) => const SizedBox.shrink(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSliverToolbar() {
    return SliverAppBar(
      pinned: false,
      floating: true,
      snap: true,
      backgroundColor: Colors.deepPurple,
      automaticallyImplyLeading: false,
      titleSpacing: 0,
      title:
          _showSearch
              ? Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10),
                child: Container(
                  height: 38,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.18),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(
                      color: Colors.white.withOpacity(0.20),
                      width: 1,
                    ),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.search, color: Colors.white, size: 18),
                      const SizedBox(width: 8),
                      Expanded(
                        child: TextField(
                          controller: _searchController,
                          autofocus: true,
                          onChanged: _onSearchChanged,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 14.5,
                            fontWeight: FontWeight.w600,
                          ),
                          cursorColor: Colors.white,
                          decoration: InputDecoration(
                            hintText: "Search people, recipes...",
                            hintStyle: TextStyle(
                              color: Colors.white.withOpacity(0.75),
                              fontWeight: FontWeight.w500,
                            ),
                            border: InputBorder.none,
                            isDense: true,
                          ),
                        ),
                      ),
                      if (_query.isNotEmpty)
                        GestureDetector(
                          onTap: _clearSearch,
                          child: const Padding(
                            padding: EdgeInsets.all(6),
                            child: Icon(
                              Icons.close,
                              color: Colors.white,
                              size: 18,
                            ),
                          ),
                        ),
                      GestureDetector(
                        onTap: _toggleSearch,
                        child: const Padding(
                          padding: EdgeInsets.all(6),
                          child: Icon(
                            Icons.search_off,
                            color: Colors.white,
                            size: 18,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              )
              : Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  IconButton(
                    icon: const Icon(Icons.explore, color: Colors.white),
                    tooltip: 'Explore Feed',
                    onPressed:
                        () => Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const CommunityRecipesScreen(),
                          ),
                        ),
                  ),
                  IconButton(
                    icon: const Icon(
                      Icons.local_fire_department_outlined,
                      color: Colors.white,
                    ),
                    tooltip: 'Glow-Up Feed',
                    onPressed:
                        () => Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const GlowUpFeedScreen(),
                          ),
                        ),
                  ),
                  IconButton(
                    icon: const Icon(
                      Icons.video_collection_outlined,
                      color: Colors.white,
                    ),
                    tooltip: 'Reels',
                    onPressed:
                        () => Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const ReelsFeedScreen(),
                          ),
                        ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.forum_outlined, color: Colors.white),
                    tooltip: 'Inbox',
                    onPressed:
                        () => Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const InboxScreen(),
                          ),
                        ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.search, color: Colors.white),
                    tooltip: 'Search',
                    onPressed: _toggleSearch,
                  ),
                  IconButton(
                    icon: _buildNotificationIcon(),
                    tooltip: 'Notifications',
                    onPressed:
                        () => Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const NotificationCenterScreen(),
                          ),
                        ),
                  ),
                ],
              ),
      iconTheme: const IconThemeData(color: Colors.white),
    );
  }

  SliverToBoxAdapter _searchEmptyState() {
    return const SliverToBoxAdapter(
      child: Padding(
        padding: EdgeInsets.all(16),
        child: Text("Type to search…"),
      ),
    );
  }

  Widget _sectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 6),
      child: Text(
        title,
        style: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w900,
          color: Colors.deepPurple,
        ),
      ),
    );
  }

  void _openSocialProfile(String uid, {Map<String, dynamic>? hint}) async {
    if (uid.isEmpty || uid == _getResolvedUid()) return;
    final hydrated = await SocialProfileScreen._hydrateProfileHint(uid, hint);
    final prefetched = await _prefetchProfileContent(uid);
    if (!mounted) return;
    setState(() {
      _activeViewedUid = uid;
      _activeProfileHint = hydrated;
      _didCheckFollow = false;
      _showSearch = false;
      _query = "";
      _searchController.clear();
      if (prefetched.$1.isNotEmpty) {
        _cachedTopCollaboratorDocs = prefetched.$1;
        _topCacheByUid[uid] = prefetched.$1;
      }
      if (prefetched.$2.isNotEmpty) {
        _cachedRecipeDocs = prefetched.$2;
        _recipeCacheByUid[uid] = prefetched.$2;
      }
    });
    _checkFollowStatusOnce();
  }

  Future<
    (
      List<QueryDocumentSnapshot<Map<String, dynamic>>>,
      List<QueryDocumentSnapshot>,
    )
  >
  _prefetchProfileContent(String uid) async {
    try {
      final topFuture =
          FirebaseFirestore.instance
              .collection('users')
              .doc(uid)
              .collection('top_collaborators')
              .orderBy('rank')
              .limit(6)
              .get();
      final recipeFuture =
          FirebaseFirestore.instance
              .collection('recipes')
              .where('uid', isEqualTo: uid)
              .where('isPublic', isEqualTo: true)
              .orderBy('serverCreatedAt', descending: true)
              .get();
      final results = await Future.wait([topFuture, recipeFuture]);
      return (
        (results[0] as QuerySnapshot<Map<String, dynamic>>).docs,
        (results[1] as QuerySnapshot).docs,
      );
    } catch (_) {
      return (
        <QueryDocumentSnapshot<Map<String, dynamic>>>[],
        <QueryDocumentSnapshot>[],
      );
    }
  }

  Widget _buildNotificationIcon() {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) {
      return const Icon(Icons.notifications, color: Colors.white);
    }

    final stream =
        FirebaseFirestore.instance
            .collection('users')
            .doc(uid)
            .collection('notifications')
            .where('isRead', isEqualTo: false)
            .limit(1)
            .snapshots();

    return StreamBuilder<QuerySnapshot>(
      stream: stream,
      builder: (context, snapshot) {
        final hasUnread = snapshot.hasData && snapshot.data!.docs.isNotEmpty;
        return Stack(
          clipBehavior: Clip.none,
          children: [
            const Icon(Icons.notifications, color: Colors.white),
            if (hasUnread)
              Positioned(
                right: -1,
                top: -1,
                child: Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: Colors.blueAccent,
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 1.5),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }

  Future<List<QueryDocumentSnapshot<Map<String, dynamic>>>> _peopleSearch(
    String rawQuery,
  ) async {
    final q = rawQuery.trim().toLowerCase().replaceFirst(RegExp(r'^@+'), '');
    if (q.isEmpty) return [];

    final snap =
        await FirebaseFirestore.instance.collection('users').limit(120).get();

    return snap.docs
        .where((doc) {
          final data = doc.data();
          final displayName =
              (data['displayName'] ?? '').toString().toLowerCase();
          final displayNameLower =
              (data['displayNameLower'] ?? '').toString().toLowerCase();
          final handle =
              (data['handle'] ?? data['socialHandle'] ?? '')
                  .toString()
                  .toLowerCase();
          final handleLower =
              (data['handleLower'] ?? data['socialHandleLower'] ?? '')
                  .toString()
                  .toLowerCase();

          return displayName.contains(q) ||
              displayNameLower.contains(q) ||
              handle.replaceFirst(RegExp(r'^@+'), '').contains(q) ||
              handleLower.replaceFirst(RegExp(r'^@+'), '').contains(q);
        })
        .take(8)
        .toList();
  }

  Stream<QuerySnapshot<Map<String, dynamic>>> _recipesStream(String q) {
    return FirebaseFirestore.instance
        .collection('recipes')
        .where('isPublic', isEqualTo: true)
        .where('titleLower', isGreaterThanOrEqualTo: q)
        .where('titleLower', isLessThan: '$q\uf8ff')
        .limit(6)
        .snapshots();
  }

  List<Widget> _peopleTilesFromDocs(
    List<QueryDocumentSnapshot<Map<String, dynamic>>> docs,
  ) {
    return docs.map((doc) {
      final d = doc.data();
      final avatarUrl = (d['avatarUrl'] ?? '').toString();
      final displayName = (d['displayName'] ?? 'Unknown').toString().trim();
      final handle = (d['handle'] ?? d['socialHandle'] ?? '').toString().trim();

      return ListTile(
        leading: _safeAvatarImage(
          size: 40,
          url: avatarUrl,
          fallback: const CircleAvatar(radius: 20, child: Icon(Icons.person)),
        ),
        title: Text(displayName.isNotEmpty ? displayName : 'Unknown'),
        subtitle: handle.isNotEmpty ? Text(handle) : null,
        trailing:
            FirebaseAuth.instance.currentUser?.uid == _getResolvedUid()
                ? TextButton(
                  onPressed: () => _showAddToTopSheet(doc.id),
                  child: const Text(
                    'Add',
                    style: TextStyle(fontWeight: FontWeight.w900),
                  ),
                )
                : null,
        onTap: () {
          _openSocialProfile(
            doc.id,
            hint: {
              'displayName': displayName,
              'handle': handle,
              'socialHandle': handle,
              'avatarUrl': avatarUrl,
            },
          );
        },
      );
    }).toList();
  }

  // --- TOP COLLABORATORS (CURATED) ---
  Stream<QuerySnapshot<Map<String, dynamic>>> _curatedTopCollaboratorsStream(
    String uid,
  ) {
    return FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .collection('top_collaborators')
        .orderBy('rank')
        .limit(6)
        .snapshots();
  }

  Stream<QuerySnapshot<Map<String, dynamic>>> _getTopCollaboratorsStream(
    String uid,
  ) {
    if (_topCollaboratorsStream != null && _topCollaboratorsUid == uid) {
      return _topCollaboratorsStream!;
    }
    _topCollaboratorsUid = uid;
    _topCollaboratorsStream = _curatedTopCollaboratorsStream(uid);
    return _topCollaboratorsStream!;
  }

  DocumentReference<Map<String, dynamic>> _topRef(
    String profileUid,
    String otherUid,
  ) {
    return FirebaseFirestore.instance
        .collection('users')
        .doc(profileUid)
        .collection('top_collaborators')
        .doc(otherUid);
  }

  Future<void> _swapRank({
    required String profileUid,
    required String movedUid,
    required int newRank,
    required int currentRank,
  }) async {
    final db = FirebaseFirestore.instance;
    final movedRef = _topRef(profileUid, movedUid);

    try {
      final querySnap =
          await db
              .collection('users')
              .doc(profileUid)
              .collection('top_collaborators')
              .where('rank', isEqualTo: newRank)
              .limit(1)
              .get();

      final DocumentReference<Map<String, dynamic>>? occupiedRef =
          querySnap.docs.isNotEmpty ? querySnap.docs.first.reference : null;

      await db.runTransaction((tx) async {
        final movedSnap = await tx.get(movedRef);
        if (!movedSnap.exists) return;

        if (occupiedRef != null && occupiedRef.path != movedRef.path) {
          final occupiedSnap = await tx.get(occupiedRef);
          if (occupiedSnap.exists) {
            tx.set(occupiedRef, {'rank': currentRank}, SetOptions(merge: true));
          }
        }

        tx.set(movedRef, {'rank': newRank}, SetOptions(merge: true));
      });

      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Moved to position $newRank')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Failed: $e')));
      }
    }
  }

  Future<void> _showReorderSheet({
    required String profileUid,
    required String otherUid,
    required int currentRank,
  }) async {
    final picked = await showModalBottomSheet<int>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (ctx) {
        Widget item(int rank) {
          final isSelected = rank == currentRank;
          return ListTile(
            title: Text(
              'Move to position $rank',
              style: TextStyle(
                fontWeight: isSelected ? FontWeight.w900 : FontWeight.w700,
                color: isSelected ? Colors.deepPurple : Colors.black87,
              ),
            ),
            trailing:
                isSelected
                    ? const Icon(Icons.check_circle, color: Colors.deepPurple)
                    : const Icon(Icons.swap_vert, color: Colors.black38),
            onTap: () => Navigator.pop(ctx, rank),
          );
        }

        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
              Container(
                height: 5,
                width: 44,
                decoration: BoxDecoration(
                  color: Colors.black12,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              const SizedBox(height: 10),
              const Text(
                'Reorder Top Collaborators',
                style: TextStyle(fontWeight: FontWeight.w900, fontSize: 14),
              ),
              const SizedBox(height: 8),
              item(1),
              item(2),
              item(3),
              item(4),
              const SizedBox(height: 10),
            ],
          ),
        );
      },
    );

    if (picked == null || picked == currentRank) return;

    await _swapRank(
      profileUid: profileUid,
      movedUid: otherUid,
      newRank: picked,
      currentRank: currentRank,
    );
  }

  static const Color _cardBg = Color(0xFFF4F2FF);
  static const Color _cardBorder = Color(0x1A5E35B1);

  Widget _topCollaboratorCard({
    required String profileUid,
    required String otherUid,
    required Map<String, dynamic> collaboratorData,
    required bool isOwnerViewing,
    required int currentRank,
  }) {
    final authUid = _authUser?.uid;
    final canFollow =
        authUid != null && authUid.isNotEmpty && authUid != otherUid;

    final u = _userCache[otherUid] ?? {};
    final avatarUrl =
        (collaboratorData['avatarUrl'] ?? u['avatarUrl'] ?? '')
            .toString()
            .trim();
    final name =
        (collaboratorData['displayName'] ?? u['displayName'] ?? '')
            .toString()
            .trim();
    final handleRaw =
        (collaboratorData['handle'] ??
                collaboratorData['socialHandle'] ??
                u['handle'] ??
                u['socialHandle'] ??
                '')
            .toString()
            .trim();
    final handle = handleRaw.replaceAll('@', '');

    final isFollowing =
        canFollow ? _myFollowingCache.contains(otherUid) : false;

    return GestureDetector(
      onLongPress:
          isOwnerViewing
              ? () => _showReorderSheet(
                profileUid: profileUid,
                otherUid: otherUid,
                currentRank: currentRank,
              )
              : null,
      child: Container(
        decoration: BoxDecoration(
          color: _cardBg,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: _cardBorder),
        ),
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
        child: Column(
          children: [
            InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: () {
                _openSocialProfile(
                  otherUid,
                  hint: {
                    'displayName': name,
                    'handle': handle,
                    'socialHandle': handle,
                    'avatarUrl': avatarUrl,
                  },
                );
              },
              child: Column(
                children: [
                  _safeAvatarImage(
                    size: 92,
                    url: avatarUrl,
                    fallback: const CircleAvatar(
                      radius: 46,
                      backgroundColor: Colors.white,
                      child: Icon(
                        Icons.person,
                        size: 34,
                        color: Colors.deepPurple,
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  if (name.isNotEmpty)
                    Text(
                      name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.black87,
                        fontWeight: FontWeight.w900,
                        fontSize: 13,
                      ),
                    )
                  else
                    Container(
                      height: 12,
                      width: 90,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                  if (handle.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      '@$handle',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: Colors.grey.shade700,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const Spacer(),
            if (!canFollow)
              SizedBox(
                width: double.infinity,
                height: 34,
                child: ElevatedButton(
                  onPressed: null,
                  style: ElevatedButton.styleFrom(
                    disabledBackgroundColor: Colors.deepPurple.withOpacity(
                      0.35,
                    ),
                    disabledForegroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  child: const Text(
                    'You',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                    ),
                  ),
                ),
              )
            else
              SizedBox(
                width: double.infinity,
                height: 34,
                child: ElevatedButton(
                  onPressed: () => _toggleFollowUser(otherUid),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.deepPurple,
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  child: Text(
                    isFollowing ? 'Following' : 'Follow',
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  // ✅ FIXED: no build-time async calls, no fixed height that clips cards,
  // one following stream, batch warm user cards after frame.
  Widget _topCollaboratorsSectionCurated(
    String profileUid, {
    required bool isOwnerViewing,
  }) {
    const int crossAxisCount = 2;
    const double spacing = 12;
    const double cardAspectRatio = 0.78; // keep in sync with card layout

    return RepaintBoundary(
      child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: _getTopCollaboratorsStream(profileUid),
        builder: (context, snap) {
          if (snap.hasError) {
            return isOwnerViewing
                ? const Padding(
                  padding: EdgeInsets.fromLTRB(10, 10, 10, 0),
                  child: Text(
                    'Top Collaborators couldn’t load (rules/index).',
                    style: TextStyle(color: Colors.black54, fontSize: 12),
                  ),
                )
                : const SizedBox.shrink();
          }

          final liveDocs = snap.data?.docs;
          if (liveDocs != null) {
            _cachedTopCollaboratorDocs = liveDocs;
            _topCacheByUid[profileUid] = liveDocs;
          }
          final docs = liveDocs ?? _cachedTopCollaboratorDocs;

          if (snap.connectionState == ConnectionState.waiting && docs.isEmpty) {
            return const SizedBox.shrink();
          }

          if (docs.isEmpty) return const SizedBox.shrink();

          // stable order
          final sorted =
              docs.toList()..sort((a, b) {
                final ar =
                    (a.data()['rank'] is int) ? a.data()['rank'] as int : 999;
                final br =
                    (b.data()['rank'] is int) ? b.data()['rank'] as int : 999;
                return ar.compareTo(br);
              });

          final otherUids = sorted.map((d) => d.id).toList();

          // schedule warmup AFTER frame (never in build)
          if (!_warmQueuedThisFrame) {
            _warmQueuedThisFrame = true;
            WidgetsBinding.instance.addPostFrameCallback((_) async {
              _warmQueuedThisFrame = false;
              if (!mounted) return;

              final toWarm = <String>[];
              for (final uid in otherUids) {
                if (uid.isEmpty) continue;
                if (_userCache.containsKey(uid)) continue;
                if (_queuedWarmUids.contains(uid)) continue;
                _queuedWarmUids.add(uid);
                toWarm.add(uid);
              }
              if (toWarm.isEmpty) return;
              await _warmUsersBatch(toWarm);
            });
          }

          return Padding(
            padding: const EdgeInsets.fromLTRB(10, 0, 10, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Top Collaborators',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                    color: Colors.deepPurple,
                    height: 1.0,
                  ),
                ),
                const SizedBox(height: 10),
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  padding: EdgeInsets.zero,
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: crossAxisCount,
                    crossAxisSpacing: spacing,
                    mainAxisSpacing: spacing,
                    childAspectRatio: cardAspectRatio,
                  ),
                  itemCount: sorted.length,
                  itemBuilder: (context, i) {
                    final d = sorted[i];
                    final otherUid = d.id;
                    final rank =
                        (d.data()['rank'] is int)
                            ? d.data()['rank'] as int
                            : (i + 1);

                    return KeyedSubtree(
                      key: ValueKey('top_collab_$otherUid'),
                      child: _topCollaboratorCard(
                        profileUid: profileUid,
                        otherUid: otherUid,
                        collaboratorData: d.data(),
                        isOwnerViewing: isOwnerViewing,
                        currentRank: rank,
                      ),
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

  // --- SEARCH / FEED BUILD ---
  @override
  Widget build(BuildContext context) {
    super.build(context);

    final authUid = _authUser?.uid;
    final resolvedUid = _getResolvedUid();
    final isMe = authUid != null && resolvedUid == authUid;

    if (_currentProfileUid != resolvedUid) {
      _currentProfileUid = resolvedUid;
      _cachedRecipeDocs = _recipeCacheByUid[resolvedUid] ?? [];
      _cachedTopCollaboratorDocs = _topCacheByUid[resolvedUid] ?? [];
      _topCollaboratorsStream = null;
      _topCollaboratorsUid = null;
      _userCache.clear();
      _queuedWarmUids.clear();
      _missingCollaboratorUids.clear();
      _warmQueuedThisFrame = false;
      _peopleSuggestionsFuture = null;
      _peopleSuggestionsUid = null;
      _profileRecipesStream =
          FirebaseFirestore.instance
              .collection('recipes')
              .where('uid', isEqualTo: resolvedUid)
              .where('isPublic', isEqualTo: true)
              .orderBy('serverCreatedAt', descending: true)
              .snapshots();
    }

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          _buildSliverToolbar(),
          if (_showSearch) ...[
            if (_query.isEmpty)
              _searchEmptyState()
            else ...[
              SliverToBoxAdapter(
                child: FutureBuilder<
                  List<QueryDocumentSnapshot<Map<String, dynamic>>>
                >(
                  future: _peopleSearch(_query),
                  builder: (context, snap) {
                    if (!snap.hasData || snap.data!.isEmpty) {
                      return const SizedBox.shrink();
                    }
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _sectionHeader("People"),
                        ..._peopleTilesFromDocs(snap.data!),
                      ],
                    );
                  },
                ),
              ),
              SliverToBoxAdapter(
                child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                  stream: _recipesStream(_query),
                  builder: (context, snap) {
                    if (!snap.hasData || snap.data!.docs.isEmpty) {
                      return const SizedBox.shrink();
                    }
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _sectionHeader("Recipes"),
                        ...snap.data!.docs.map((doc) {
                          final d = doc.data();
                          return ListTile(
                            leading: const Icon(Icons.fastfood),
                            title: Text((d['title'] ?? 'Untitled').toString()),
                            subtitle: Text(
                              (d['description'] ?? '').toString(),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            onTap: () {},
                          );
                        }),
                      ],
                    );
                  },
                ),
              ),
              const SliverToBoxAdapter(child: SizedBox(height: 40)),
            ],
          ] else ...[
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 5),
                child: PublicProfileWidget(
                  key: ValueKey(resolvedUid),
                  uid: resolvedUid,
                  initialProfileHint:
                      _activeProfileHint ?? widget.initialProfileHint,
                  showTopCollaborators: false,
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 5),
                child: _topCollaboratorsSectionCurated(
                  resolvedUid,
                  isOwnerViewing: isMe,
                ),
              ),
            ),
            if (isMe)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 5),
                  child: _peopleSuggestionsSection(resolvedUid),
                ),
              ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 5),
                child: _StoreReviewsPreview(uid: resolvedUid),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 5),
                child: _profileReelsSection(
                  uid: resolvedUid,
                  isOwnerViewing: isMe,
                ),
              ),
            ),
            if (_isLoading) const SliverToBoxAdapter(child: SizedBox.shrink()),
            StreamBuilder<QuerySnapshot>(
              stream: _profileRecipesStream,
              builder: (context, snapshot) {
                if (snapshot.hasData) {
                  _cachedRecipeDocs = snapshot.data!.docs;
                  _recipeCacheByUid[resolvedUid] = snapshot.data!.docs;
                }
                if (!snapshot.hasData && _cachedRecipeDocs.isEmpty) {
                  return const SliverToBoxAdapter(
                    child: Padding(
                      padding: EdgeInsets.all(16),
                      child: SizedBox(height: 2),
                    ),
                  );
                }

                if (_cachedRecipeDocs.isEmpty) {
                  return SliverToBoxAdapter(
                    child:
                        isMe
                            ? const Padding(
                              padding: EdgeInsets.all(16),
                              child: Text('No posts yet.'),
                            )
                            : const SizedBox.shrink(),
                  );
                }

                final docs = _cachedRecipeDocs;
                final filtered =
                    docs
                        .where(
                          (d) =>
                              _matchesRecipe(d.data() as Map<String, dynamic>),
                        )
                        .toList();

                if (filtered.isEmpty) {
                  return const SliverToBoxAdapter(
                    child: Padding(
                      padding: EdgeInsets.all(16),
                      child: Text("No results."),
                    ),
                  );
                }

                return SliverList(
                  delegate: SliverChildBuilderDelegate((ctx, i) {
                    final d = filtered[i].data() as Map<String, dynamic>;
                    return RecipeCard(
                      title: d['title'] ?? '',
                      description: d['description'] ?? '',
                      uid: d['uid'] ?? '',
                      recipeId: filtered[i].id,
                      upvotedBy: List<String>.from(d['upvotedBy'] ?? []),
                      imageUrl: d['imageUrl'],
                      category: d['category'],
                    );
                  }, childCount: filtered.length),
                );
              },
            ),
          ],
        ],
      ),
    );
  }
}

class _StoreReviewsPreview extends StatefulWidget {
  final String uid;
  const _StoreReviewsPreview({required this.uid});

  @override
  State<_StoreReviewsPreview> createState() => _StoreReviewsPreviewState();
}

class _StoreReviewsPreviewState extends State<_StoreReviewsPreview> {
  final Set<String> _armedDeleteKeys = {};
  final Map<String, double> _deleteDragProgress = {};

  String _reviewDeleteKey(String reviewId) => 'store-review-$reviewId';

  Widget _deleteBackground(String keyStr) {
    final isArmed = _armedDeleteKeys.contains(keyStr);

    return Container(
      decoration: BoxDecoration(
        color: isArmed ? Colors.red.shade700 : Colors.red.shade500,
        borderRadius: BorderRadius.circular(14),
      ),
      alignment: Alignment.centerRight,
      padding: const EdgeInsets.only(right: 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.end,
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            isArmed ? Icons.delete_forever : Icons.delete_outline,
            color: Colors.white,
          ),
          const SizedBox(width: 8),
          Text(
            isArmed ? 'Release to delete' : 'Swipe again',
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }

  Future<bool?> _confirmReviewDismiss(String keyStr, String storeName) async {
    final isArmed = _armedDeleteKeys.contains(keyStr);
    final progress = _deleteDragProgress[keyStr] ?? 0;
    final isFullSwipe = progress >= 0.85;

    _deleteDragProgress.remove(keyStr);

    if (isArmed || isFullSwipe) {
      _armedDeleteKeys.remove(keyStr);
      return true;
    }

    setState(() => _armedDeleteKeys.add(keyStr));
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Swipe "$storeName" again to delete your review'),
        duration: const Duration(seconds: 2),
        behavior: SnackBarBehavior.floating,
      ),
    );
    return false;
  }

  Widget _safeAvatarImage({
    required double size,
    required String? url,
    required Widget fallback,
  }) {
    final clean = (url ?? '').trim();
    if (clean.isEmpty || !clean.startsWith('http')) return fallback;

    return ClipOval(
      child: SizedBox(
        width: size,
        height: size,
        child: Stack(
          fit: StackFit.expand,
          children: [
            fallback,
            Image.network(
              clean,
              fit: BoxFit.cover,
              gaplessPlayback: true,
              frameBuilder: (context, child, frame, wasSynchronouslyLoaded) {
                if (wasSynchronouslyLoaded || frame != null) return child;
                return const SizedBox.shrink();
              },
              errorBuilder: (_, __, ___) => const SizedBox.shrink(),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _deleteReview(
    BuildContext context, {
    required String reviewId,
    required String storeId,
    required String userId,
  }) async {
    try {
      final db = FirebaseFirestore.instance;
      final batch = db.batch();

      final userRef = db
          .collection('users')
          .doc(userId)
          .collection('store_reviews')
          .doc(reviewId);
      final storeRef = db
          .collection('stores')
          .doc(storeId)
          .collection('reviews')
          .doc(reviewId);

      batch.delete(userRef);
      batch.delete(storeRef);

      await batch.commit();

      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Review deleted')));
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Delete failed: $e')));
      }
    }
  }

  Widget _starsCompact(int rating) {
    final r = rating.clamp(0, 5);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(5, (i) {
        final filled = i < r;
        return Icon(
          filled ? Icons.star_rounded : Icons.star_border_rounded,
          size: 13,
          color: filled ? Colors.amber : Colors.grey.shade400,
        );
      }),
    );
  }

  @override
  Widget build(BuildContext context) {
    final authUid = FirebaseAuth.instance.currentUser?.uid;
    final isMe = authUid != null && authUid == widget.uid;

    final q = FirebaseFirestore.instance
        .collection('users')
        .doc(widget.uid)
        .collection('store_reviews')
        .where('status', isEqualTo: 'published')
        .where('isPublic', isEqualTo: true)
        .orderBy('createdAt', descending: true)
        .limit(6);

    return StreamBuilder<QuerySnapshot>(
      stream: q.snapshots(),
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const Padding(
            padding: EdgeInsets.all(12),
            child: SizedBox(height: 2),
          );
        }

        final docs = snap.data?.docs ?? [];
        if (docs.isEmpty) {
          if (!isMe) return const SizedBox.shrink();
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Text(
              'No store reviews yet. Review a visited store to show it here.',
              style: TextStyle(color: Colors.grey.shade700, fontSize: 12),
            ),
          );
        }

        return Padding(
          padding: const EdgeInsets.fromLTRB(10, 10, 10, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ListView.separated(
                padding: EdgeInsets.zero,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: docs.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (context, i) {
                  final reviewDoc = docs[i];
                  final data = reviewDoc.data() as Map<String, dynamic>;

                  final reviewId = reviewDoc.id;
                  final storeId = (data['storeId'] ?? '').toString().trim();
                  final rating =
                      (data['rating'] ?? 0) is int ? data['rating'] as int : 0;
                  final wentWell = (data['wentWell'] ?? '').toString();
                  final reviewUserId = (data['userId'] ?? '').toString().trim();

                  final canDelete = authUid != null && authUid == reviewUserId;

                  return FutureBuilder<DocumentSnapshot>(
                    future:
                        FirebaseFirestore.instance
                            .collection('stores')
                            .doc(storeId)
                            .get(),
                    builder: (context, storeSnap) {
                      final storeData =
                          storeSnap.data?.data() as Map<String, dynamic>?;
                      final storeName =
                          (storeData?['name'] ??
                                  storeData?['vendorName'] ??
                                  'Store')
                              .toString();

                      final logoUrl = StoreLogoService.resolveFromData(
                        storeData,
                      );

                      final reviewCard = Container(
                        padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade50,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                            color: Colors.black.withOpacity(0.10),
                            width: 1,
                          ),
                          boxShadow: const [],
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.center,
                              children: [
                                _safeAvatarImage(
                                  size: 28,
                                  url: logoUrl,
                                  fallback: CircleAvatar(
                                    radius: 14,
                                    backgroundColor: Colors.white,
                                    child: ClipOval(
                                      child: Image.asset(
                                        StoreLogoService.fallbackAsset,
                                        width: 24,
                                        height: 24,
                                        fit: BoxFit.cover,
                                        errorBuilder:
                                            (_, __, ___) => Text(
                                              storeName.isNotEmpty
                                                  ? storeName[0].toUpperCase()
                                                  : '?',
                                              style: const TextStyle(
                                                fontWeight: FontWeight.bold,
                                                fontSize: 11,
                                              ),
                                            ),
                                      ),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        storeName,
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w800,
                                          fontSize: 13,
                                          height: 1.0,
                                        ),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      const SizedBox(height: 4),
                                      Row(
                                        children: [
                                          _starsCompact(rating),
                                          const SizedBox(width: 6),
                                          Text(
                                            '$rating/5',
                                            style: TextStyle(
                                              fontSize: 11,
                                              height: 1.0,
                                              color: Colors.grey.shade700,
                                              fontWeight: FontWeight.w600,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                                Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 6,
                                        vertical: 2,
                                      ),
                                      decoration: BoxDecoration(
                                        borderRadius: BorderRadius.circular(10),
                                        border: Border.all(
                                          color: Colors.black.withOpacity(0.12),
                                          width: 1,
                                        ),
                                      ),
                                      child: Padding(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 8,
                                          vertical: 4,
                                        ),
                                        child: Text(
                                          "Store Review",
                                          style: TextStyle(
                                            fontSize: 10,
                                            height: 1.0,
                                            color: Colors.grey.shade700,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 6),
                                  ],
                                ),
                              ],
                            ),
                            if (wentWell.trim().isNotEmpty) ...[
                              const SizedBox(height: 6),
                              Text(
                                wentWell,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: Colors.grey.shade800,
                                  fontSize: 12.8,
                                  height: 1.15,
                                ),
                              ),
                            ],
                          ],
                        ),
                      );

                      if (!canDelete) return reviewCard;

                      final deleteKey = _reviewDeleteKey(reviewId);
                      return Dismissible(
                        key: ValueKey(deleteKey),
                        direction: DismissDirection.endToStart,
                        dismissThresholds: const {
                          DismissDirection.endToStart: 0.35,
                        },
                        background: _deleteBackground(deleteKey),
                        confirmDismiss:
                            (_) => _confirmReviewDismiss(deleteKey, storeName),
                        onUpdate: (details) {
                          final current = _deleteDragProgress[deleteKey] ?? 0;
                          if (details.progress > current) {
                            _deleteDragProgress[deleteKey] = details.progress;
                          }
                        },
                        onDismissed:
                            (_) => _deleteReview(
                              context,
                              reviewId: reviewId,
                              storeId: storeId,
                              userId: reviewUserId,
                            ),
                        child: reviewCard,
                      );
                    },
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
