class StockDisplay {
  static String? textFor(Map<dynamic, dynamic> data) {
    final showStockCount = _boolValue(data['showStockCount']);
    final threshold = _intValue(data['stockDisplayThreshold']) ?? 50;
    final stockValues =
        [
          _intValue(data['stock']),
          _intValue(data['currentStock']),
        ].whereType<int>().toList();

    if (stockValues.isEmpty) return null;
    if (showStockCount == false) return null;

    final positiveStock = stockValues.where((value) => value > 0).toList();
    if (positiveStock.isNotEmpty) {
      final visibleStock = positiveStock.reduce((a, b) => a > b ? a : b);
      if (showStockCount != true && visibleStock > threshold) return null;
      if (visibleStock <= threshold) return '$visibleStock in stock';
      return null;
    }

    return stockValues.any((value) => value == 0) ? 'Out of stock' : null;
  }

  static int? _intValue(dynamic value) {
    if (value == null) return null;
    if (value is num) return value.round();
    final text = value.toString().trim();
    if (text.isEmpty || text.toLowerCase() == 'null') return null;
    return int.tryParse(text) ?? double.tryParse(text)?.round();
  }

  static bool? _boolValue(dynamic value) {
    if (value is bool) return value;
    if (value is num) return value != 0;
    if (value is String) {
      final lower = value.trim().toLowerCase();
      if (lower == 'true' || lower == 'yes' || lower == '1') return true;
      if (lower == 'false' || lower == 'no' || lower == '0') return false;
    }
    return null;
  }
}
