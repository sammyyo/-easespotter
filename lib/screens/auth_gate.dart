import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';

import 'intro_screen.dart';
import 'main_scaffold.dart';
import '../services/user_scoped_prefs.dart';

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  Future<void> _signOutAnonymous(User user) async {
    if (user.isAnonymous) {
      await FirebaseAuth.instance.signOut();
    }
  }

  Future<void> _prepareSignedInUser() async {
    await UserScopedPrefs.migrateLocalDataForCurrentUser();
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

        // Fully signed-in user -> enter app after local data migration.
        return FutureBuilder<void>(
          future: _prepareSignedInUser(),
          builder: (context, migrationSnap) {
            if (migrationSnap.connectionState != ConnectionState.done) {
              return const Scaffold(
                body: Center(child: CircularProgressIndicator()),
              );
            }
            return const MainScaffold();
          },
        );
      },
    );
  }
}
