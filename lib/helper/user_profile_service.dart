// services/user_profile_service.dart
import 'package:cloud_firestore/cloud_firestore.dart';

class UserProfile {
  final String uid;
  final String displayName;
  final String? avatarUrl;
  final String? bio;
  final String? socialHandle;
  final DateTime? createdAt;
  final String? musicUrl;
  final List<String> profileUrls;

  UserProfile({
    required this.uid,
    required this.displayName,
    this.avatarUrl,
    this.bio,
    this.socialHandle,
    this.createdAt,
    this.musicUrl,
    this.profileUrls = const [],
  });

  factory UserProfile.fromMap(String uid, Map<String, dynamic> data) {
    return UserProfile(
      uid: uid,
      displayName: data['displayName'] ?? 'Anonymous',
      avatarUrl: data['avatarUrl'],
      bio: data['bio'],
      socialHandle: data['socialHandle'],
      createdAt: (data['createdAt'] as Timestamp?)?.toDate(),
      musicUrl: data['moodMusicUrl'],
      profileUrls: List<String>.from(data['profileUrls'] ?? const []),
    );
  }

  Map<String, dynamic> toMap() => {
    'uid': uid,
    'displayName': displayName,
    if (avatarUrl != null) 'avatarUrl': avatarUrl,
    if (bio != null) 'bio': bio,
    if (socialHandle != null) 'socialHandle': socialHandle,
    if (musicUrl != null) 'moodMusicUrl': musicUrl,
    if (profileUrls.isNotEmpty) 'profileUrls': profileUrls,
  };
}

class UserProfileService {
  UserProfileService(this._db);
  final FirebaseFirestore _db;

  CollectionReference<Map<String, dynamic>> get _col => _db.collection('users');

  Future<UserProfile?> fetch(String uid) async {
    final doc = await _col.doc(uid).get();
    if (!doc.exists || doc.data() == null) return null;
    return UserProfile.fromMap(doc.id, doc.data()!);
  }

  /// Stream live updates for a profile (great for widgets).
  Stream<UserProfile?> watch(String uid) {
    return _col.doc(uid).snapshots().map((snap) {
      if (!snap.exists || snap.data() == null) return null;
      return UserProfile.fromMap(snap.id, snap.data()!);
    });
  }

  /// Create only if missing (used after login).
  Future<UserProfile> getOrCreate({
    required String uid,
    required String displayName,
    String? avatarUrl,
    bool publicProfile = true,
  }) async {
    final ref = _col.doc(uid);
    final snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        'uid': uid,
        'displayName': displayName,
        'avatarUrl': avatarUrl ?? '',
        'bio': '',
        'publicProfile': publicProfile,
        'createdAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
      final created = await ref.get();
      return UserProfile.fromMap(created.id, created.data()!);
    }
    return UserProfile.fromMap(snap.id, snap.data()!);
  }

  Future<void> update(String uid, Map<String, dynamic> data) {
    return _col.doc(uid).set(data, SetOptions(merge: true));
  }
}

// Legacy helper (keep for backward compatibility)
Future<UserProfile?> fetchUserProfile(String uid) async {
  return UserProfileService(FirebaseFirestore.instance).fetch(uid);
}
