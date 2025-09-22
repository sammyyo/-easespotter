import 'package:easespotter/shopping_layer/new_wall_post_screen.dart';
import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'firebase_options.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:easespotter/screens/qr_scanner_screen.dart';
import 'package:easespotter/screens/search_screen.dart';
import 'package:easespotter/screens/bookmarks_screen.dart';
import 'package:easespotter/screens/main_scaffold.dart';
import 'package:easespotter/screens/placeholder_screen.dart';
import 'package:easespotter/screens/grocery_list_screen.dart';
import 'package:easespotter/settings/settings_screen.dart';
import 'package:easespotter/discover/discover_screen.dart';
import 'package:easespotter/services/motivation_service.dart';
import 'package:easespotter/motivation/motivation_preview_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  await FirebaseAuth.instance.signInAnonymously();
  await MotivationService.loadMotivations();
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
      home: const FirebaseInitializer(),
      routes: {
        '/scan': (context) => const QRScannerScreen(),
        '/search': (context) => const SearchScreen(),
        '/bookmarks': (context) => BookmarksScreen(),
        '/discover': (context) => const DiscoverScreen(),
        '/followed-stores': (context) => const PlaceholderScreen(title: 'Followed Stores'),
        '/promotions': (context) => const PlaceholderScreen(title: 'Promotions'),
        '/settings': (context) => const SettingsScreen(),
        '/about': (context) => const PlaceholderScreen(title: 'About'),
        '/grocery-list': (context) => const GroceryListScreen(),
        '/motivation-preview': (context) => MotivationPreviewScreen(), 
        '/test-webview': (context) => const TestWebViewScreen(),
        '/newWallPost': (_) => const NewWallPostScreen(),
      },
    );
  }
}

class FirebaseInitializer extends StatefulWidget {
  const FirebaseInitializer({super.key});

  @override
  State<FirebaseInitializer> createState() => _FirebaseInitializerState();
}

class _FirebaseInitializerState extends State<FirebaseInitializer>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder(
      future: Firebase.initializeApp(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return Scaffold(
            body: Center(
              child: RotationTransition(
                turns: _controller,
                child: Image.asset(
                  'assets/images/easespotter.png',
                  height: 100,
                ),
              ),
            ),
          );
        } else if (snapshot.hasError) {
          return Scaffold(
            body: Center(
              child: Text('Firebase Init Error: ${snapshot.error}'),
            ),
          );
        } else {
          return const MainScaffold();
        }
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
