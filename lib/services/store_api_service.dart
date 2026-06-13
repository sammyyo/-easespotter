import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter/foundation.dart';

class StoreApiService {
  static const String baseUrl = 'https://easespotter-production.up.railway.app';

  /// Store payload (includes productsByCategory, productsByAisle, etc.)
  static Future<Map<String, dynamic>> fetchStoreById(int storeId) async {
    debugPrint('USING StoreApiService from store_api_service.dart ($baseUrl)');

    final uri = Uri.parse('$baseUrl/api/stores/$storeId');
    debugPrint('StoreApiService: fetching $uri');

    try {
      final res = await http
          .get(uri, headers: {'Content-Type': 'application/json'})
          .timeout(const Duration(seconds: 15));

      debugPrint('StoreApiService: Response ${res.statusCode} ${res.body}');

      if (res.statusCode < 200 || res.statusCode >= 300) {
        throw Exception('API error ${res.statusCode}: ${res.body}');
      }

      final decoded = jsonDecode(res.body);

      if (decoded is Map<String, dynamic>) {
        if (decoded['success'] == true &&
            decoded['data'] is Map<String, dynamic>) {
          return decoded['data'] as Map<String, dynamic>;
        }
        return decoded;
      }

      throw Exception('Malformed API response: expected JSON object');
    } catch (e) {
      debugPrint('StoreApiService Exception: $e');
      rethrow;
    }
  }

  /// Store addresses from the Neon-backed website data.
  static Future<List<Map<String, dynamic>>> fetchStoreAddresses(
    int storeId,
  ) async {
    final uri = Uri.parse('$baseUrl/api/stores/$storeId/addresses');
    debugPrint('StoreApiService: fetching addresses $uri');

    try {
      final res = await http
          .get(uri, headers: {'Content-Type': 'application/json'})
          .timeout(const Duration(seconds: 15));

      debugPrint(
        'StoreApiService Addresses: Response ${res.statusCode} ${res.body}',
      );

      if (res.statusCode < 200 || res.statusCode >= 300) {
        throw Exception('API error ${res.statusCode}: ${res.body}');
      }

      final decoded = jsonDecode(res.body);

      if (decoded is Map<String, dynamic>) {
        final data = decoded['data'];
        if (data is List) {
          return data
              .whereType<Map>()
              .map((item) => Map<String, dynamic>.from(item))
              .toList();
        }
      }

      if (decoded is List) {
        return decoded
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList();
      }

      throw Exception('Malformed API response: expected address list');
    } catch (e) {
      debugPrint('StoreApiService Addresses Exception: $e');
      rethrow;
    }
  }

  /// Directory payload (all products with locations)
  static Future<Map<String, dynamic>> fetchStoreDirectory(int storeId) async {
    final uri = Uri.parse('$baseUrl/api/qr/store-directory?storeId=$storeId');
    debugPrint('StoreApiService: fetching directory $uri');

    try {
      final res = await http
          .get(uri, headers: {'Content-Type': 'application/json'})
          .timeout(const Duration(seconds: 15));

      debugPrint(
        'StoreApiService Directory: Response ${res.statusCode} ${res.body}',
      );

      if (res.statusCode < 200 || res.statusCode >= 300) {
        throw Exception('API error ${res.statusCode}: ${res.body}');
      }

      final decoded = jsonDecode(res.body);
      if (decoded is Map<String, dynamic>) return decoded;

      throw Exception('Malformed API response: expected JSON object');
    } catch (e) {
      debugPrint('StoreApiService Directory Exception: $e');
      rethrow;
    }
  }
}
