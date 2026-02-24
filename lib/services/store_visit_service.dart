import 'package:flutter/foundation.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class StoreVisitService {
  static Future<String?> logStoreVisit({
    required String storeId,
    String? storeName,
    String? logoUrl,
    String source = 'qr',
  }) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return null;

    final uid = user.uid.trim();
    final cleanStoreId = storeId.trim();
    final cleanStoreName = (storeName ?? '').trim();
    final cleanLogo = (logoUrl ?? '').trim();

    if (uid.isEmpty || cleanStoreId.isEmpty) return null;

    try {
      // 1) Write the history visit
      final visitRef =
          await FirebaseFirestore.instance.collection('store_visits').add({
        'userId': uid,
        'storeId': cleanStoreId,
        if (cleanStoreName.isNotEmpty) 'storeName': cleanStoreName,
        if (cleanLogo.isNotEmpty) 'logoUrl': cleanLogo,
        'visitedAt': FieldValue.serverTimestamp(),
        'source': source,
      });

      // 2) Write proof-of-visit (1 doc per store per user)
      await FirebaseFirestore.instance
          .collection('users')
          .doc(uid)
          .collection('visitedStores')
          .doc(cleanStoreId)
          .set({
        'storeId': cleanStoreId,
        if (cleanStoreName.isNotEmpty) 'storeName': cleanStoreName,
        if (cleanLogo.isNotEmpty) 'logoUrl': cleanLogo,
        'lastVisitedAt': FieldValue.serverTimestamp(),
        'visits': FieldValue.increment(1),
        'source': source,
      }, SetOptions(merge: true));

      return visitRef.id;
    } catch (e) {
      debugPrint('Error logging store visit: $e');
      return null;
    }
  }
}
