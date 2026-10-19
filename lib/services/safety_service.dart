import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';

/// Account-scoped block state. Firestore rules enforce message restrictions;
/// this cache only controls what the current user sees in the app.
class SafetyService extends ChangeNotifier {
  SafetyService._() {
    _bind(FirebaseAuth.instance.currentUser);
    FirebaseAuth.instance.authStateChanges().listen(_bind);
  }

  static final instance = SafetyService._();
  final _db = FirebaseFirestore.instance;
  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? _subscription;
  String? _uid;
  Set<String> _blocked = {};
  bool ready = false;
  bool failed = false;

  Set<String> get blockedUsers => Set.unmodifiable(_blocked);
  bool hides(String uid) => _blocked.contains(uid);
  void retry() {
    _subscription?.cancel();
    _subscription = null;
    _uid = null;
    ready = false;
    _bind(FirebaseAuth.instance.currentUser);
  }

  static String ownerOf(Map<String, dynamic> data) =>
      (data['uid'] ?? data['authorUid'] ?? data['creatorUid'] ?? '').toString();

  void _bind(User? user) {
    if (_uid == user?.uid && (ready || _subscription != null)) return;
    _subscription?.cancel();
    _subscription = null;
    _uid = user?.uid;
    _blocked = {};
    ready = user == null;
    failed = false;
    notifyListeners();
    if (user == null) return;
    final uid = user.uid;
    _subscription = _db
        .collection('users')
        .doc(uid)
        .collection('blockedUsers')
        .snapshots()
        .listen(
          (snapshot) {
            if (_uid != uid) return;
            _blocked = snapshot.docs.map((doc) => doc.id).toSet();
            ready = true;
            failed = false;
            notifyListeners();
          },
          onError: (Object error) {
            if (_uid != uid) return;
            ready = false;
            failed = true;
            notifyListeners();
          },
        );
  }

  String _requireUser() {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) throw StateError('Sign in to use safety controls.');
    return uid;
  }

  Future<bool> isBlockedEitherWay(String otherUid) async {
    final uid = _requireUser();
    final docs = await Future.wait([
      _db
          .doc('users/$uid/blockedUsers/$otherUid')
          .get(const GetOptions(source: Source.server)),
      _db
          .doc('users/$otherUid/blockedUsers/$uid')
          .get(const GetOptions(source: Source.server)),
    ]);
    return docs.any((doc) => doc.exists);
  }

  Future<void> setBlocked(String otherUid, bool blocked) async {
    final uid = _requireUser();
    if (otherUid.isEmpty || otherUid == uid) {
      throw ArgumentError('Choose another user.');
    }
    final ref = _db.doc('users/$uid/blockedUsers/$otherUid');
    if (blocked) {
      await ref.set({
        'uid': otherUid,
        'createdAt': FieldValue.serverTimestamp(),
      });
    } else {
      await ref.delete();
    }
  }

  /// One immutable report per reporter and target prevents repeated submissions.
  Future<void> report({
    required String targetUid,
    required String reason,
    required String details,
    String? collection,
    String? postId,
  }) async {
    final uid = _requireUser();
    final isPost = collection != null && postId != null;
    if (targetUid.isEmpty || uid == targetUid || details.trim().length > 1000) {
      throw ArgumentError('Invalid report.');
    }
    final targetType = isPost ? collection : 'user';
    final targetId = isPost ? postId : targetUid;
    final id = '${uid}_${targetType}_$targetId';
    await _db.collection('abuseReports').doc(id).set({
      'reporterUid': uid,
      'targetUid': targetUid,
      'targetType': targetType,
      'targetId': targetId,
      'reason': reason,
      'details': details.trim(),
      'status': 'pending',
      'createdAt': FieldValue.serverTimestamp(),
    });
  }
}
