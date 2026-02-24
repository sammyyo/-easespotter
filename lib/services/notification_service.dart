import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class NotificationService {
  final _db = FirebaseFirestore.instance;
  final _auth = FirebaseAuth.instance;

  /// Send an in-app notification to [toUid].
  /// If [toUid] == current user, we skip (optional safety).
  Future<void> notifyUser({
    required String toUid,
    required String type,
    required String message,
    String? itemType,
    String? itemId,
    String? actorUid,
    String? actorName,
    String? actorAvatarUrl,
  }) async {
    final me = _auth.currentUser?.uid;
    if (me == null) return;

    // Optional: prevent notifying yourself
    if (toUid == me) return;

    final payload = <String, dynamic>{
      'type': type,
      'message': message,
      'createdAt': FieldValue.serverTimestamp(),
      'isRead': false,

      // actor (who triggered it)
      'actorUid': actorUid ?? me,
      if (actorName != null) 'actorName': actorName,
      if (actorAvatarUrl != null) 'actorAvatarUrl': actorAvatarUrl,

      // what this is about
      if (itemType != null) 'itemType': itemType,
      if (itemId != null) 'itemId': itemId,
    };

    await _db
        .collection('users')
        .doc(toUid)
        .collection('notifications')
        .add(payload);
  }
}
