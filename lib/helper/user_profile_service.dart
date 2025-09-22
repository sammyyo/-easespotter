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

  UserProfile({
    required this.uid,
    required this.displayName,
    this.avatarUrl,
    this.bio,
    this.socialHandle,
    this.createdAt,
    this.musicUrl,
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
    );
  }
}

Future<UserProfile?> fetchUserProfile(String uid) async {
  final doc = await FirebaseFirestore.instance.collection('users').doc(uid).get();
  if (!doc.exists) return null;
  return UserProfile.fromMap(uid, doc.data()!);
}
