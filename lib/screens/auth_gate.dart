import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';

import 'intro_screen.dart';
import 'main_scaffold.dart';

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  Future<void> _signOutAnonymous(User user) async {
    if (user.isAnonymous) {
      await FirebaseAuth.instance.signOut();
    }
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        final user = snap.data;

        // No user -> Intro
        if (user == null) {
          return const IntroScreen();
        }

        // Anonymous user detected -> force sign out -> go Intro
        if (user.isAnonymous) {
          return FutureBuilder(
            future: _signOutAnonymous(user),
            builder: (context, _) {
              return const IntroScreen();
            },
          );
        }

        // Fully signed-in user → enter app
        return const MainScaffold();
      },
    );
  }
}
