import 'dart:convert';
import 'package:flutter/services.dart' show rootBundle;

Future<Map<String, List<String>>> loadProductReviews() async {
  final String response = await rootBundle.loadString('assets/data/product_reviews.json');
  final List<dynamic> data = json.decode(response);

  Map<String, List<String>> reviewsMap = {};
  for (var item in data) {
    reviewsMap[item['product_id']] = List<String>.from(item['reviews']);
  }
  return reviewsMap;
}
