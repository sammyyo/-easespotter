import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class StoreFollowService {
  /// Follows a store by adding it to the user's `followedStores` subcollection.
  /// Includes `followedAt` to ensure ordering works.
  static Future<void> followStore({
    required String storeId,
    required String storeName,
    String? logoUrl,
  }) async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return;

    await FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .collection('followedStores')
        .doc(storeId)
        .set({
          'storeId': storeId,
          'storeName': storeName,
          'logoUrl': logoUrl ?? '',
          'followedAt': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true));
  }

  /// Unfollows a store by removing it from the subcollection.
  static Future<void> unfollowStore(String storeId) async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return;

    await FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .collection('followedStores')
        .doc(storeId)
        .delete();
  }

  /// Checks if a store is currently followed.
  static Future<bool> isFollowing(String storeId) async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return false;

    final doc = await FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .collection('followedStores')
        .doc(storeId)
        .get();

    return doc.exists;
  }
}
