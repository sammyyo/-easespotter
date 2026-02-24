import 'package:cloud_firestore/cloud_firestore.dart';

class UserProfile {
  final String uid;
  final String displayName;
  final String avatarUrl;

  UserProfile({
    required this.uid,
    required this.displayName,
    required this.avatarUrl,
  });

  static UserProfile fromDoc(String uid, Map<String, dynamic>? data) {
    final d = data ?? const {};
    return UserProfile(
      uid: uid,
      displayName: (d['displayName'] ?? d['handle'] ?? '') as String? ?? '',
      avatarUrl: (d['avatarUrl'] ?? d['photoURL']) as String? ?? '',
    );
  }
}

class ProfileCache {
  static final Map<String, _Cached<UserProfile>> _cache = {};
  static final Map<String, Future<UserProfile>> _inFlight = {};
  static const Duration _ttl = Duration(minutes: 10);

  static UserProfile? peek(String uid) {
    final c = _cache[uid];
    if (c == null) return null;
    if (DateTime.now().difference(c.storedAt) > _ttl) return null;
    return c.value;
  }

  static List<UserProfile> peekMany(List<String> uids) {
    final out = <UserProfile>[];
    for (final uid in uids) {
      final p = peek(uid);
      if (p != null) out.add(p);
    }
    return out;
  }

  static void putMany(List<UserProfile> profiles) {
    final now = DateTime.now();
    for (final p in profiles) {
      _cache[p.uid] = _Cached(p, now);
    }
  }

  static Future<UserProfile> get(String uid) async {
    final now = DateTime.now();
    final cached = _cache[uid];
    if (cached != null && now.difference(cached.storedAt) < _ttl) {
      return cached.value;
    }
    final existing = _inFlight[uid];
    if (existing != null) return existing;

    final future =
    FirebaseFirestore.instance.collection('users').doc(uid).get().then((doc) {
      final value = UserProfile.fromDoc(uid, doc.data());
      _cache[uid] = _Cached(value, now);
      _inFlight.remove(uid);
      return value;
    }).catchError((_) {
      _inFlight.remove(uid);
      if (cached != null) return cached.value;
      return UserProfile(uid: uid, displayName: '', avatarUrl: '');
    });

    _inFlight[uid] = future;
    return future;
  }

  static Future<List<UserProfile>> getMany(List<String> uids) async {
    if (uids.isEmpty) return [];
    final futures = <Future<UserProfile>>[];
    for (final uid in uids) {
      futures.add(get(uid));
    }
    return Future.wait(futures);
  }

  static void clear() {
    _cache.clear();
    _inFlight.clear();
  }
}

class _Cached<T> {
  final T value;
  final DateTime storedAt;
  _Cached(this.value, this.storedAt);
}
