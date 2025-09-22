import 'dart:convert';
import 'package:flutter/services.dart' show rootBundle;

class MotivationService {
  static Map<String, String> _motivations = {};

  static Future<void> loadMotivations() async {
    final String jsonString =
    await rootBundle.loadString('assets/datafile/product_motivations.json');
    final Map<String, dynamic> jsonMap = json.decode(jsonString);
    _motivations = jsonMap.map((key, value) => MapEntry(key, value.toString()));
  }

  static String? getMotivation(String productId) {
    return _motivations[productId];
  }
}
