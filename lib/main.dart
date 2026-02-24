import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:easespotter/screens/auth_gate.dart';
import 'package:easespotter/screens/followed_stores_screen.dart';
import 'package:easespotter/screens/intro_screen.dart';
import 'package:easespotter/screens/login_screen.dart';
import 'package:easespotter/screens/promotions_screen.dart';
import 'package:easespotter/screens/signup_screen.dart';
import 'package:easespotter/screens/upgrade_account_screen.dart';
import 'package:easespotter/shopping_layer/new_wall_post_screen.dart';
import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'firebase_options.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:easespotter/screens/qr_scanner_screen.dart';
import 'package:easespotter/screens/search_screen.dart';
import 'package:easespotter/screens/bookmarks_screen.dart';
import 'package:easespotter/screens/about_screen.dart';
import 'package:easespotter/screens/grocery_list_screen.dart';
import 'package:easespotter/settings/settings_screen.dart';
import 'package:easespotter/discover/discover_screen.dart';
import 'package:easespotter/services/motivation_service.dart';
import 'package:easespotter/screens/my_visited_stores_screen.dart'; 

Future<void> ensureUserProfileExistsForAnyUser(User user) async {
  final ref = FirebaseFirestore.instance.collection('users').doc(user.uid);
  if (!(await ref.get()).exists) {
    await ref.set({
      'uid': user.uid,
      'displayName': user.displayName?.trim().isNotEmpty == true
          ? user.displayName
          : (user.isAnonymous ? 'Guest' : 'User'),
      'avatarUrl': user.photoURL ?? '',
      'bio': '',
      'publicProfile': !user.isAnonymous, // keep guests private by default
      'createdAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }
}


void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );

  // Ensure a single authenticated user ALWAYS exists (anonymous or real)
  User? user = FirebaseAuth.instance.currentUser;

  if (user == null) {
    final cred = await FirebaseAuth.instance.signInAnonymously();
    user = cred.user;
    debugPrint("Signed in anonymously as ${user?.uid}");
  } else {
    debugPrint("Existing user detected: ${user.uid}");
  }

  // Make sure this user has a Firestore profile entry
  await ensureUserProfileExistsForAnyUser(user!);

  // Load motivations
  await MotivationService.loadMotivations();

  // Start app
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'EaseSpotter',
      theme: ThemeData(
        primarySwatch: Colors.indigo,
        scaffoldBackgroundColor: Colors.grey[100],
      ),
      home: const AuthGate(),
      routes: {
        '/scan': (context) => const QRScannerScreen(),
        '/search': (context) => const SearchScreen(),
        '/bookmarks': (context) => BookmarksScreen(),
        '/discover': (context) => const DiscoverScreen(),
        '/followed-stores': (context) => const FollowedStoresScreen(),
        '/promotions': (context) => const PromotionsScreen(),
        '/settings': (context) => const SettingsScreen(),
        '/about': (context) => const AboutScreen(),
        '/grocery-list': (context) => const GroceryListScreen(),
        '/test-webview': (context) => const TestWebViewScreen(),
        '/newWallPost': (_) => const NewWallPostScreen(),
        '/intro': (context) => const IntroScreen(),
        '/login': (context) => const LoginScreen(),
        '/signup': (context) => const SignupScreen(),
        '/upgrade': (context) => const UpgradeAccountScreen(),
        '/my-stores': (context) => const MyVisitedStoresScreen(), // ✅ Added route
      },
    );
  }
}

class TestWebViewScreen extends StatefulWidget {
  const TestWebViewScreen({super.key});

  @override
  State<TestWebViewScreen> createState() => _TestWebViewScreenState();
}

class _TestWebViewScreenState extends State<TestWebViewScreen> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..loadRequest(Uri.parse('https://www.youtube.com/embed/dQw4w9WgXcQ'));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Test WebView')),
      body: WebViewWidget(controller: _controller),
    );
  }
}
