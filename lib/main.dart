import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:easespotter/screens/auth_gate.dart';
import 'package:easespotter/screens/followed_stores_screen.dart';
import 'package:easespotter/screens/intro_screen.dart';
import 'package:easespotter/screens/login_screen.dart';
import 'package:easespotter/screens/promotions_screen.dart';
import 'package:easespotter/screens/signup_screen.dart';
import 'package:easespotter/screens/upgrade_account_screen.dart';
import 'package:easespotter/shopping_layer/glowup_detail_screen.dart';
import 'package:easespotter/shopping_layer/new_wall_post_screen.dart';
import 'package:easespotter/shopping_layer/recipe_detail_screen.dart';
import 'package:easespotter/shopping_layer/reels_feed_screen.dart';
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
      'displayName':
          user.displayName?.trim().isNotEmpty == true
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

  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);

  final user = FirebaseAuth.instance.currentUser;
  if (user != null && !user.isAnonymous) {
    debugPrint("Existing user detected: ${user.uid}");
    await ensureUserProfileExistsForAnyUser(user);
  }

  // Load motivations
  await MotivationService.loadMotivations();

  // Start app
  runApp(const MyApp());
}

class MyApp extends StatefulWidget {
  const MyApp({super.key});

  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> {
  final GlobalKey<NavigatorState> _navigatorKey = GlobalKey<NavigatorState>();
  final AppLinks _appLinks = AppLinks();
  StreamSubscription<Uri>? _linkSubscription;

  @override
  void initState() {
    super.initState();
    _initDeepLinks();
  }

  @override
  void dispose() {
    _linkSubscription?.cancel();
    super.dispose();
  }

  Future<void> _initDeepLinks() async {
    try {
      final initialLink = await _appLinks.getInitialLink();
      if (initialLink != null) {
        _handleIncomingLink(initialLink);
      }
    } catch (e) {
      debugPrint('Failed to read initial app link: $e');
    }

    _linkSubscription = _appLinks.uriLinkStream.listen(
      _handleIncomingLink,
      onError: (Object e) {
        debugPrint('Failed to handle app link: $e');
      },
    );
  }

  String? _shareCodeFromUri(Uri uri) {
    final value = _idFromUri(uri, 'share');
    return value?.toUpperCase();
  }

  String? _idFromUri(Uri uri, String firstPathSegment) {
    final isEaseSpotterHost = uri.host.toLowerCase() == 'easespotter.com';
    final isExpectedPath =
        uri.pathSegments.length >= 2 &&
        uri.pathSegments.first.toLowerCase() == firstPathSegment.toLowerCase();

    if (!isEaseSpotterHost || !isExpectedPath) return null;

    final value = uri.pathSegments[1].trim();
    if (value.isEmpty) return null;
    return value;
  }

  void _handleIncomingLink(Uri uri) {
    final firstSegment =
        uri.pathSegments.isEmpty ? '' : uri.pathSegments.first.toLowerCase();

    void openDeepLink() {
      final navigator = _navigatorKey.currentState;
      if (navigator == null) return;

      switch (firstSegment) {
        case 'share':
          final code = _shareCodeFromUri(uri);
          if (code == null) return;
          navigator.push(
            MaterialPageRoute(
              builder:
                  (_) => GroceryListScreen(
                    showBackButton: true,
                    initialShareCode: code,
                  ),
            ),
          );
          return;
        case 'recipes':
          final recipeId = _idFromUri(uri, 'recipes');
          if (recipeId == null) return;
          navigator.push(
            MaterialPageRoute(
              builder: (_) => RecipeDetailScreen(recipeId: recipeId),
            ),
          );
          return;
        case 'glowup':
          final glowUpId = _idFromUri(uri, 'glowup');
          if (glowUpId == null) return;
          navigator.push(
            MaterialPageRoute(
              builder: (_) => GlowUpDetailScreen(glowUpId: glowUpId),
            ),
          );
          return;
        case 'reels':
          final reelId = _idFromUri(uri, 'reels');
          if (reelId == null) return;
          navigator.push(
            MaterialPageRoute(
              builder:
                  (_) => ReelsFeedScreen(
                    initialReelId: reelId,
                    includePrivate: false,
                  ),
            ),
          );
          return;
      }
    }

    WidgetsBinding.instance.addPostFrameCallback((_) => openDeepLink());
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: _navigatorKey,
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
        '/my-stores':
            (context) => const MyVisitedStoresScreen(), // ✅ Added route
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
    _controller =
        WebViewController()
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
