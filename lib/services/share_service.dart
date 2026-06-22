import 'dart:math';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

class ShareService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  /// Generate a 6-letter random alphanumeric code
  String _generateShareCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    Random random = Random();
    return List.generate(
      6,
      (index) => chars[random.nextInt(chars.length)],
    ).join();
  }

  /// Share a grocery list and return the generated code
  Future<String> shareGroceryList(
    List<Map<String, dynamic>> groceryItems, {
    required String creatorUid,
  }) async {
    if (creatorUid.trim().isEmpty) {
      throw ArgumentError.value(creatorUid, 'creatorUid', 'Must not be empty');
    }

    final String code = _generateShareCode();
    final Timestamp now = Timestamp.now();
    final Timestamp expiresAt = Timestamp.fromMillisecondsSinceEpoch(
      now.millisecondsSinceEpoch + (7 * 24 * 60 * 60 * 1000), // 7 days later
    );

    try {
      await _firestore.collection('grocery_shares').doc(code).set({
        'code': code,
        'uid': creatorUid,
        'creatorUid': creatorUid,
        'collaborators': <String>[],
        'list': groceryItems,
        'createdAt': now,
        'updatedAt': now,
        'expiresAt': expiresAt,
      });
    } catch (e) {
      debugPrint('Error sharing grocery list: $e');
      rethrow;
    }

    return code;
  }

  /// Fetch a grocery list by code
  Future<List<Map<String, dynamic>>?> fetchGroceryList(String code) async {
    try {
      final DocumentSnapshot doc =
          await _firestore.collection('grocery_shares').doc(code).get();

      if (!doc.exists) {
        return null;
      }

      final data = doc.data() as Map<String, dynamic>;
      final Timestamp expiresAt = data['expiresAt'];

      if (expiresAt.toDate().isBefore(DateTime.now())) {
        // List expired
        await _firestore
            .collection('grocery_shares')
            .doc(code)
            .delete(); // Clean up
        return null;
      }

      List<dynamic> rawList = data['list'];
      return rawList.map((item) => Map<String, dynamic>.from(item)).toList();
    } catch (e) {
      debugPrint('Error fetching grocery list: $e');
      return null;
    }
  }
}
