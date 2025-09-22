import 'package:cloud_firestore/cloud_firestore.dart';

class ActivityService {
  static Future<void> add({
    required String toUid,
    required String type,
    required String message,
    String? actorUid,
    String? actorName,
    String? actorAvatarUrl,
    String? itemType,
    String? itemId,
  }) async {
    final activity = {
      'type': type,
      'message': message,
      'createdAt': FieldValue.serverTimestamp(),
      if (actorUid != null) 'actorUid': actorUid,
      if (actorName != null) 'actorName': actorName,
      if (actorAvatarUrl != null) 'actorAvatarUrl': actorAvatarUrl,
      if (itemType != null) 'itemType': itemType,
      if (itemId != null) 'itemId': itemId,
    };

    await FirebaseFirestore.instance
        .collection('users')
        .doc(toUid)
        .collection('activity_feed')
        .add(activity);
  }
}
