import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class AuthService {
  static final _auth = FirebaseAuth.instance;
  static final _db = FirebaseFirestore.instance;

  static Future<User?> signInWithEmail(String email, String password) async {
    final cred = await _auth.signInWithEmailAndPassword(email: email, password: password);
    await _ensureProfile(cred.user);
    return cred.user;
  }

  static Future<User?> signUpWithEmail(String email, String password, String displayName) async {
    final cred = await _auth.createUserWithEmailAndPassword(email: email, password: password);
    await cred.user?.updateDisplayName(displayName);
    await _ensureProfile(cred.user);
    return cred.user;
  }

  static Future<User?> signInWithGoogle() async {
    // You can integrate GoogleSignIn here later
    return _auth.currentUser;
  }

  static Future<void> _ensureProfile(User? user) async {
    if (user == null) return;
    final ref = _db.collection('users').doc(user.uid);
    final snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        'uid': user.uid,
        'displayName': user.displayName ?? 'User',
        'avatarUrl': user.photoURL ?? '',
        'bio': '',
        'publicProfile': true,
        'createdAt': FieldValue.serverTimestamp(),
      });
    }
  }

  static Future<void> signOut() => _auth.signOut();
}
