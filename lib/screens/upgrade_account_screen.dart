import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../helper/user_profile_service.dart';
import 'intro_screen.dart';
import 'social_profile_screen.dart';

class UpgradeAccountScreen extends StatefulWidget {
  const UpgradeAccountScreen({super.key});

  @override
  State<UpgradeAccountScreen> createState() => _UpgradeAccountScreenState();
}

class _UpgradeAccountScreenState extends State<UpgradeAccountScreen> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _loading = false;
  String? _error;

  Future<void> _linkEmailPassword() async {
    setState(() => _loading = true);
    try {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null || !user.isAnonymous) return;

      // Link instead of sign-in: keeps the SAME UID and all data
      final cred = EmailAuthProvider.credential(
        email: _email.text.trim(),
        password: _password.text.trim(),
      );
      await user.linkWithCredential(cred);

      // Optional: set display name
      if (_name.text.trim().isNotEmpty) {
        await user.updateDisplayName(_name.text.trim());
      }

      // Ensure Firestore profile exists/updated
      await UserProfileService(FirebaseFirestore.instance).getOrCreate(
        uid: user.uid,
        displayName: _name.text.trim().isEmpty ? (user.displayName ?? 'User') : _name.text.trim(),
        avatarUrl: user.photoURL,
        publicProfile: true,
      );

      if (!mounted) return;
      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(builder: (_) => const SocialProfileScreen()),
        (_) => false,
      );
    } on FirebaseAuthException catch (e) {
      setState(() => _error = e.message);
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _signOut() async {
    await FirebaseAuth.instance.signOut();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const IntroScreen()),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Complete Your Account',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
        ),
        backgroundColor: Colors.deepPurple,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            const Text(
              "You're browsing as Guest.\nCreate an account to save and sync everything.",
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            TextField(controller: _name, decoration: const InputDecoration(labelText: 'Full Name')),
            TextField(controller: _email, decoration: const InputDecoration(labelText: 'Email')),
            TextField(controller: _password, obscureText: true, decoration: const InputDecoration(labelText: 'Password')),
            const SizedBox(height: 16),
            if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
            const SizedBox(height: 8),
            ElevatedButton(
              onPressed: _loading ? null : _linkEmailPassword,
              style: ElevatedButton.styleFrom(backgroundColor: Colors.deepPurple, minimumSize: const Size(double.infinity, 48)),
              child: _loading ? const CircularProgressIndicator(color: Colors.white) : const Text('Create Account & Keep My Data'),
            ),
            TextButton(
              onPressed: _signOut,
              child: const Text('Sign out (show login)'),
            ),
          ],
        ),
      ),
    );
  }
}
