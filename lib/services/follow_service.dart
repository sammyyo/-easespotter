import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';

class FollowService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseAuth _auth = FirebaseAuth.instance;

  /// Stream follow state by reading current user's `following` array
  Stream<bool> isFollowing(String targetUid) {
    final currentUser = _auth.currentUser;
    if (currentUser == null) return Stream.value(false);

    return _firestore
        .collection('users')
        .doc(currentUser.uid)
        .snapshots()
        .map((snap) {
      final data = snap.data();
      final list = (data?['following'] as List?) ?? const [];
      return list.map((e) => e.toString()).contains(targetUid);
    });
  }

  /// Follow user by writing ONLY to /users/{myUid}
  /// This avoids permission issues writing into other users' docs/subcollections.
  Future<void> followUser(String targetUid) async {
    final currentUser = _auth.currentUser;
    if (currentUser == null) return;
    if (currentUser.uid == targetUid) return;

    final myUid = currentUser.uid;

    try {
      await _firestore.collection('users').doc(myUid).set({
        'following': FieldValue.arrayUnion([targetUid]),
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    } on FirebaseException catch (e) {
      debugPrint("followUser failed: ${e.code} — ${e.message}");
      rethrow;
    } catch (e) {
      debugPrint("followUser failed: $e");
      rethrow;
    }
  }

  /// Unfollow user by writing ONLY to /users/{myUid}
  Future<void> unfollowUser(String targetUid) async {
    final currentUser = _auth.currentUser;
    if (currentUser == null) return;
    if (currentUser.uid == targetUid) return;

    final myUid = currentUser.uid;

    try {
      await _firestore.collection('users').doc(myUid).set({
        'following': FieldValue.arrayRemove([targetUid]),
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    } on FirebaseException catch (e) {
      debugPrint("unfollowUser failed: ${e.code} — ${e.message}");
      rethrow;
    } catch (e) {
      debugPrint("unfollowUser failed: $e");
      rethrow;
    }
  }
}
