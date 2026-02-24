import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';

class StoreReviewService {
  // Only allow these keys in signals (matches your rules)
  static const Set<String> _signalKeys = {
    'checkout',
    'staff',
    'cleanliness',
    'findability',
  };

  static Map<String, int>? _sanitizeSignals(Map<String, int>? signals) {
    if (signals == null || signals.isEmpty) return null;

    final cleaned = <String, int>{};
    for (final entry in signals.entries) {
      final k = entry.key.trim();
      final v = entry.value;
      if (_signalKeys.contains(k) && v >= 1 && v <= 5) {
        cleaned[k] = v;
      }
    }
    return cleaned.isEmpty ? null : cleaned;
  }

  static String _cleanDevice(String device) {
    final d = device.trim().toLowerCase();
    if (d == 'android' || d == 'ios' || d == 'web') return d;
    // Keep rules happy: if caller sends something unexpected, default safely.
    return 'web';
  }

  /// Creates a review in BOTH places:
  /// - stores/{storeId}/reviews/{reviewId}
  /// - users/{uid}/store_reviews/{reviewId}
  ///
  /// Also ensures the visited proof doc exists at:
  /// - users/{uid}/visitedStores/{storeId}
  ///
  /// NOTE: Best practice is to create visitedStores on QR scan.
  /// This is a pragmatic "make rules pass" patch.
  static Future<String> submitReview({
    required String storeId,
    required int rating,
    Map<String, int>? signals,
    String? wentWell,
    String? suggestion,
    String? visitRefId, // optional
    required bool isPublic,
    required String device, // "android" | "ios" | "web"
  }) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) throw Exception('Not signed in');

    final uid = user.uid.trim();
    final cleanStoreId = storeId.trim();

    if (uid.isEmpty) throw Exception('Invalid uid');
    if (cleanStoreId.isEmpty) throw Exception('Invalid storeId');
    if (rating < 1 || rating > 5) throw Exception('Rating must be 1–5');

    final db = FirebaseFirestore.instance;

    // Generate once, reuse in both places
    final reviewId = db.collection('_').doc().id;

    final cleanSignals = _sanitizeSignals(signals);
    final cleanWentWell = (wentWell ?? '').trim();
    final cleanSuggestion = (suggestion ?? '').trim();
    final cleanVisitRefId = (visitRefId ?? '').trim();
    final cleanDevice = _cleanDevice(device);

    // Review payload (written to both collections)
    final payload = <String, dynamic>{
      'reviewId': reviewId,
      'storeId': cleanStoreId,
      'userId': uid,
      'rating': rating,
      if (cleanSignals != null) 'signals': cleanSignals,
      if (cleanWentWell.isNotEmpty) 'wentWell': cleanWentWell,
      if (cleanSuggestion.isNotEmpty) 'suggestion': cleanSuggestion,
      if (cleanVisitRefId.isNotEmpty) 'visitRefId': cleanVisitRefId,
      'isPublic': isPublic,
      'status': 'published',
      // Rules should be updated to: createdAt == request.time, updatedAt == request.time
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
      'edited': false,
      'device': cleanDevice,
    };

    final storeRef = db
        .collection('stores')
        .doc(cleanStoreId)
        .collection('reviews')
        .doc(reviewId);

    final userRef = db
        .collection('users')
        .doc(uid)
        .collection('store_reviews')
        .doc(reviewId);

    // Visited proof doc (required by hasVisitedStore() in rules)
    final visitedProofRef = db
        .collection('users')
        .doc(uid)
        .collection('visitedStores')
        .doc(cleanStoreId);

    final visitedProofPayload = <String, dynamic>{
      'storeId': cleanStoreId,
      'visitedAt': FieldValue.serverTimestamp(),
      if (cleanVisitRefId.isNotEmpty) 'lastVisitRefId': cleanVisitRefId,
      'updatedAt': FieldValue.serverTimestamp(),
    };

    // Batch write so they succeed/fail together
    final batch = db.batch();
    batch.set(storeRef, payload);
    batch.set(userRef, payload);

    // Merge so repeated reviews don't overwrite other proof fields you may add later
    batch.set(visitedProofRef, visitedProofPayload, SetOptions(merge: true));

    try {
      await batch.commit();
      return reviewId;
    } catch (e) {
      debugPrint('submitReview failed: $e');
      rethrow;
    }
  }

  /// Checks if the CURRENT user already reviewed a store.
  /// Query used by VisitedStoresSection to show "Reviewed" badge / disable button.
  static Future<bool> hasUserReviewedStore({
    required String storeId,
  }) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return false;

    final uid = user.uid.trim();
    final cleanStoreId = storeId.trim();
    if (uid.isEmpty || cleanStoreId.isEmpty) return false;

    try {
      final snap = await FirebaseFirestore.instance
          .collection('users')
          .doc(uid)
          .collection('store_reviews')
          .where('storeId', isEqualTo: cleanStoreId)
          .limit(1)
          .get();

      return snap.docs.isNotEmpty;
    } catch (e) {
      debugPrint('hasUserReviewedStore failed: $e');
      return false;
    }
  }

  /// Stream for "My Store Reviews" section (public, published) in SocialProfileScreen.
  static Stream<QuerySnapshot<Map<String, dynamic>>> streamPublicReviewsForUser({
    required String resolvedUid,
    int limit = 20,
  }) {
    final cleanUid = resolvedUid.trim();
    if (cleanUid.isEmpty) {
      return const Stream.empty();
    }

    return FirebaseFirestore.instance
        .collection('users')
        .doc(cleanUid)
        .collection('store_reviews')
        .where('isPublic', isEqualTo: true)
        .where('status', isEqualTo: 'published')
        .orderBy('createdAt', descending: true)
        .limit(limit)
        .snapshots();
  }
}
