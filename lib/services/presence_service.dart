import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class PresenceService {
  final _db = FirebaseFirestore.instance;
  final _auth = FirebaseAuth.instance;

  Timer? _heartbeat;

  String? get _uid => _auth.currentUser?.uid;

  Future<void> setOnline() async {
    final uid = _uid;
    if (uid == null) return;

    try {
      await _db.collection('users').doc(uid).set({
        'isOnline': true,
        'lastActive': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    } catch (_) {}
  }

  Future<void> setOffline() async {
    final uid = _uid;
    if (uid == null) return;

    try {
      await _db.collection('users').doc(uid).set({
        'isOnline': false,
        'lastActive': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    } catch (_) {}
  }

  void startHeartbeat({Duration every = const Duration(seconds: 45)}) {
    _heartbeat?.cancel();
    _heartbeat = Timer.periodic(every, (_) async {
      final uid = _uid;
      if (uid == null) return;

      try {
        // Only update lastActive (less noisy)
        await _db.collection('users').doc(uid).set({
          'lastActive': FieldValue.serverTimestamp(),
          'isOnline': true,
        }, SetOptions(merge: true));
      } catch (_) {}
    });
  }

  void stopHeartbeat() {
    _heartbeat?.cancel();
    _heartbeat = null;
  }
}
