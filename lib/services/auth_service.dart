import 'dart:convert';
import 'dart:math';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:crypto/crypto.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

class AuthService {
  static final _auth = FirebaseAuth.instance;
  static final _db = FirebaseFirestore.instance;
  static Future<void>? _googleInitFuture;

  static Future<User?> signInWithEmail(String email, String password) async {
    final cred = await _auth.signInWithEmailAndPassword(
      email: email,
      password: password,
    );
    await _ensureProfile(cred.user);
    return cred.user;
  }

  static Future<User?> signUpWithEmail(
    String email,
    String password,
    String displayName,
  ) async {
    final cred = await _auth.createUserWithEmailAndPassword(
      email: email,
      password: password,
    );
    await cred.user?.updateDisplayName(displayName);
    await _ensureProfile(cred.user);
    return cred.user;
  }

  static Future<User?> signInWithGoogle() async {
    _googleInitFuture ??= GoogleSignIn.instance.initialize();
    await _googleInitFuture;

    final googleUser = await GoogleSignIn.instance.authenticate();
    final googleAuth = googleUser.authentication;
    final idToken = googleAuth.idToken;

    if (idToken == null || idToken.isEmpty) {
      throw FirebaseAuthException(
        code: 'missing-google-id-token',
        message: 'Google did not return an ID token.',
      );
    }

    final credential = GoogleAuthProvider.credential(idToken: idToken);
    final cred = await _signInOrLinkCredential(credential);

    await _ensureProfile(cred.user);
    return cred.user;
  }

  static Future<User?> signInWithApple() async {
    final rawNonce = _generateNonce();
    final hashedNonce = _sha256ofString(rawNonce);

    final appleCredential = await SignInWithApple.getAppleIDCredential(
      scopes: [
        AppleIDAuthorizationScopes.email,
        AppleIDAuthorizationScopes.fullName,
      ],
      nonce: hashedNonce,
    );

    final idToken = appleCredential.identityToken;
    if (idToken == null || idToken.isEmpty) {
      throw FirebaseAuthException(
        code: 'missing-apple-id-token',
        message: 'Apple did not return an ID token.',
      );
    }

    final credential = OAuthProvider(
      'apple.com',
    ).credential(idToken: idToken, rawNonce: rawNonce);

    final cred = await _signInOrLinkCredential(credential);
    final user = cred.user;

    final appleDisplayName =
        [
          appleCredential.givenName,
          appleCredential.familyName,
        ].where((part) => (part ?? '').trim().isNotEmpty).join(' ').trim();

    if (user != null &&
        (user.displayName ?? '').trim().isEmpty &&
        appleDisplayName.isNotEmpty) {
      await user.updateDisplayName(appleDisplayName);
      await user.reload();
    }

    await _ensureProfile(_auth.currentUser ?? user);
    return _auth.currentUser ?? user;
  }

  static Future<UserCredential> _signInOrLinkCredential(
    AuthCredential credential,
  ) async {
    final current = _auth.currentUser;

    if (current != null && current.isAnonymous) {
      try {
        return await current.linkWithCredential(credential);
      } on FirebaseAuthException catch (e) {
        if (e.code == 'credential-already-in-use' ||
            e.code == 'provider-already-linked') {
          return _auth.signInWithCredential(credential);
        }
        rethrow;
      }
    }

    return _auth.signInWithCredential(credential);
  }

  static String _generateNonce([int length = 32]) {
    const charset =
        '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';
    final random = Random.secure();
    return List.generate(
      length,
      (_) => charset[random.nextInt(charset.length)],
    ).join();
  }

  static String _sha256ofString(String input) {
    final bytes = utf8.encode(input);
    final digest = sha256.convert(bytes);
    return digest.toString();
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
        'publicProfile': !user.isAnonymous,
        'isAnonymous': user.isAnonymous,
        'createdAt': FieldValue.serverTimestamp(),
      });
      return;
    }

    final data = snap.data() ?? <String, dynamic>{};
    final existingName = (data['displayName'] ?? '').toString().trim();
    final existingAvatar = (data['avatarUrl'] ?? '').toString().trim();
    final updates = <String, dynamic>{};

    if ((existingName.isEmpty || existingName == 'Guest') &&
        (user.displayName ?? '').trim().isNotEmpty) {
      updates['displayName'] = user.displayName!.trim();
    }
    if (existingAvatar.isEmpty && (user.photoURL ?? '').trim().isNotEmpty) {
      updates['avatarUrl'] = user.photoURL!.trim();
    }
    if (!user.isAnonymous && data['publicProfile'] != true) {
      updates['publicProfile'] = true;
    }
    if (data['isAnonymous'] == true && !user.isAnonymous) {
      updates['isAnonymous'] = false;
    }
    if (updates.isNotEmpty) {
      updates['updatedAt'] = FieldValue.serverTimestamp();
      await ref.set(updates, SetOptions(merge: true));
    }
  }

  static Future<void> signOut() async {
    _googleInitFuture ??= GoogleSignIn.instance.initialize();
    await _googleInitFuture;
    await GoogleSignIn.instance.signOut();
    await _auth.signOut();
  }
}
