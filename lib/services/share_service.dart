import 'package:cloud_functions/cloud_functions.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ShareService {
  Future<Map<String, dynamic>> call(
    String action,
    Map<String, dynamic> data,
  ) async {
    final result = await FirebaseFunctions.instanceFor(region: 'us-central1')
        .httpsCallable(
          'groceryCollaboration',
          options: HttpsCallableOptions(timeout: const Duration(seconds: 35)),
        )
        .call<dynamic>({'action': action, ...data});
    return Map<String, dynamic>.from(result.data as Map);
  }

  static String parseCode(String input) {
    var value = input.trim();
    final uri = Uri.tryParse(value);
    if (uri != null && uri.hasScheme) {
      if (uri.scheme != 'https' ||
          !['easespotter.com', 'www.easespotter.com'].contains(uri.host) ||
          uri.pathSegments.length != 2 ||
          uri.pathSegments.first != 'share') {
        return '';
      }
      value = uri.pathSegments.last;
    }
    value = value.toUpperCase();
    return RegExp(r'^(?:[A-Z0-9]{6}|[A-F0-9]{32})$').hasMatch(value)
        ? value
        : '';
  }

  static Future<void> rememberInvite(String code) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('pending_grocery_invite', code);
  }

  static Future<String?> takeInvite() async {
    final prefs = await SharedPreferences.getInstance();
    final code = prefs.getString('pending_grocery_invite');
    await prefs.remove('pending_grocery_invite');
    return code;
  }
}
