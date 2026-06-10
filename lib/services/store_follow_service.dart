import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class StoreFollowService {
  /// Follows a store by adding it to the user's `followedStores` subcollection.
  /// Includes `followedAt` to ensure ordering works.
  static Future<void> followStore({
    required String storeId,
    required String storeName,
    String? logoUrl,
    Map<String, dynamic>? storeData,
  }) async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return;

    final safeStoreData =
        storeData == null ? null : _safeStoreCacheData(storeData);
    final safeProductsByCategory =
        storeData == null ? null : _safeProductsByCategory(storeData);

    await FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .collection('followedStores')
        .doc(storeId)
        .set({
          'storeId': storeId,
          'storeName': storeName,
          'logoUrl': logoUrl ?? '',
          if (safeStoreData != null) 'payload': safeStoreData,
          if (safeProductsByCategory != null)
            'productsByCategory': safeProductsByCategory,
          if (storeData?['totalProducts'] != null)
            'totalProducts': storeData!['totalProducts'],
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

    final doc =
        await FirebaseFirestore.instance
            .collection('users')
            .doc(uid)
            .collection('followedStores')
            .doc(storeId)
            .get();

    return doc.exists;
  }

  static Map<String, dynamic> _safeStoreCacheData(
    Map<String, dynamic> storeData,
  ) {
    final safe = Map<String, dynamic>.from(storeData);
    final safeProducts = _safeProductsByCategory(storeData);
    if (safeProducts != null) {
      safe['productsByCategory'] = safeProducts;
    }
    safe.remove('productsByAisle');
    return safe;
  }

  static Map<String, dynamic>? _safeProductsByCategory(
    Map<String, dynamic> storeData,
  ) {
    final productsByCategory = storeData['productsByCategory'];
    if (productsByCategory is! Map) return null;

    final safe = <String, dynamic>{};
    for (final entry in productsByCategory.entries) {
      final rawProducts = entry.value;
      if (rawProducts is! List) continue;

      safe[entry.key.toString()] =
          rawProducts.whereType<Map>().map((product) {
            final safeProduct = Map<String, dynamic>.from(product);
            safeProduct.remove('image');
            safeProduct.remove('imageUrl');
            safeProduct.remove('imageURL');
            safeProduct.remove('image_url');
            safeProduct.remove('productImageUrl');
            safeProduct.remove('productImageURL');
            safeProduct.remove('product_image_url');
            safeProduct.remove('productImage');
            safeProduct.remove('thumbnail');
            safeProduct.remove('thumbnailUrl');
            safeProduct.remove('thumbnail_url');
            return safeProduct;
          }).toList();
    }

    return safe;
  }
}
