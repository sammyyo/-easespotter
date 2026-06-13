import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import 'store_api_service.dart';

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
            final imageUrl = _imageUrlFromItem(safeProduct);
            if (imageUrl.isNotEmpty) {
              safeProduct['imageUrl'] = imageUrl;
              safeProduct['image'] = imageUrl;
              safeProduct['productImageUrl'] = imageUrl;
              safeProduct['thumbnailUrl'] = imageUrl;
            }
            return safeProduct;
          }).toList();
    }

    return safe;
  }

  static String _imageUrlFromItem(Map<String, dynamic> item) {
    final images = item['images'];
    if (images is List) {
      for (final image in images) {
        final url = _imageUrlFromCandidate(image);
        if (url.isNotEmpty) return url;
      }
    }

    return _absoluteUrl(
      _firstStringValue(item, const [
        'imageUrl',
        'imageURL',
        'image_url',
        'image',
        'photoUrl',
        'photoURL',
        'photo_url',
        'productImageUrl',
        'productImageURL',
        'product_image_url',
        'productImage',
        'product_image',
        'thumbnail',
        'thumbnailUrl',
        'thumbnail_url',
        'url',
      ]),
    );
  }

  static String _imageUrlFromCandidate(dynamic candidate) {
    if (candidate is Map) {
      return _absoluteUrl(
        _firstStringValue(candidate, const [
          'url',
          'src',
          'href',
          'imageUrl',
          'imageURL',
          'image_url',
          'productImageUrl',
          'productImageURL',
          'product_image_url',
          'photoUrl',
          'photo_url',
          'thumbnailUrl',
          'thumbnail_url',
        ]),
      );
    }

    return _absoluteUrl(candidate?.toString());
  }

  static String _firstStringValue(
    Map<dynamic, dynamic> data,
    List<String> keys,
  ) {
    for (final key in keys) {
      final value = data[key]?.toString().trim();
      if (value != null && value.isNotEmpty) return value;
    }
    return '';
  }

  static String _absoluteUrl(String? rawUrl) {
    final value = rawUrl?.trim() ?? '';
    if (value.isEmpty) return '';
    if (_isBrokenPlaceholderImage(value)) return '';

    final uri = Uri.tryParse(value);
    if (uri != null && uri.hasScheme) return _normalizeProductImageUrl(uri);

    if (value.startsWith('//')) return 'https:$value';
    if (value.startsWith('/')) return '${StoreApiService.baseUrl}$value';

    return '${StoreApiService.baseUrl}/$value';
  }

  static String _normalizeProductImageUrl(Uri uri) {
    return uri.toString();
  }

  static bool _isBrokenPlaceholderImage(String value) {
    final lower = value.toLowerCase();
    return lower.endsWith('/logos/default-vendor.png') ||
        RegExp(r'(^|/)logos/vendor-\d+\.png$').hasMatch(lower) ||
        lower == 'logos/default-vendor.png' ||
        lower == '/logos/default-vendor.png';
  }
}
