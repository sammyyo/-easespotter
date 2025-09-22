import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:easespotter/config/api_constants.dart';

class ApiService {
  Future<List<dynamic>> searchItems(String query) async {
    final url = Uri.parse('${ApiConstants.searchEndpoint}?query=$query');

    try {
      final response = await http.get(url);
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      } else {
        throw Exception('Error fetching search results');
      }
    } catch (e) {
      throw Exception('API Error: $e');
    }
  }

  Future<Map<String, dynamic>> getItemDetails(String itemId) async {
    final url = Uri.parse('${ApiConstants.itemDetailsEndpoint}/$itemId');

    try {
      final response = await http.get(url);
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      } else {
        throw Exception('Error fetching item details');
      }
    } catch (e) {
      throw Exception('API Error: $e');
    }
  }
}
