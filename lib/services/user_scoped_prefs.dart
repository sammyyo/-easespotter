import 'package:firebase_auth/firebase_auth.dart';

class UserScopedPrefs {
  static String key(String baseKey) {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null || uid.isEmpty) {
      return 'guest_$baseKey';
    }
    return 'user_${uid}_$baseKey';
  }
}
