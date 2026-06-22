class CurrencyFormatting {
  static const Map<String, String> _symbolsByCode = {
    'USD': r'$',
    'CAD': r'$',
    'AUD': r'$',
    'EUR': '€',
    'GBP': '£',
    'JPY': '¥',
    'NGN': '₦',
    'GHS': '₵',
    'ZAR': 'R',
    'KES': 'KSh',
    'NAIRA': '₦',
    'NIGERIANNAIRA': '₦',
    'DOLLAR': r'$',
    'DOLLARS': r'$',
    'POUND': '£',
    'POUNDS': '£',
    'EURO': '€',
    'EUROS': '€',
  };

  static const List<String> _currencyKeys = [
    'currencySymbol',
    'currency_symbol',
    'currencySign',
    'currency_sign',
    'symbol',
    'moneySymbol',
    'money_symbol',
    'priceCurrency',
    'price_currency',
    'selectedCurrency',
    'selected_currency',
    'currencyType',
    'currency_type',
    'currencyCode',
    'currency_code',
    'currency',
    'defaultCurrency',
    'default_currency',
    'vendorCurrency',
    'vendor_currency',
    'storeCurrency',
    'store_currency',
    'vendorCurrencyCode',
    'vendor_currency_code',
    'storeCurrencyCode',
    'store_currency_code',
    'preferredCurrency',
    'preferred_currency',
    'currencyName',
    'currency_name',
  ];

  static const List<String> _nestedCurrencyKeys = [
    'currency',
    'currencySettings',
    'currency_settings',
    'settings',
    'preferences',
    'locale',
    'vendor',
    'vendorInfo',
    'vendor_info',
    'vendorProfile',
    'vendor_profile',
    'store',
    'storeInfo',
    'store_info',
    'storeProfile',
    'store_profile',
    'business',
    'businessInfo',
    'business_info',
    'businessSettings',
    'business_settings',
    'merchant',
    'merchantInfo',
    'merchant_info',
    'storeSettings',
    'store_settings',
    'vendorSettings',
    'vendor_settings',
    'profile',
    'account',
    'configuration',
    'config',
    'metadata',
    'payload',
    'data',
  ];

  static String symbolForData(
    Map<dynamic, dynamic>? data, {
    String fallback = r'$',
  }) {
    return _symbolForData(
      data,
      fallback: fallback,
      seen: <Map<dynamic, dynamic>>{},
    );
  }

  static String _symbolForData(
    Map<dynamic, dynamic>? data, {
    required String fallback,
    required Set<Map<dynamic, dynamic>> seen,
  }) {
    if (data == null || seen.contains(data)) return fallback;
    seen.add(data);

    for (final key in _currencyKeys) {
      final value = data[key];
      if (value is Map) {
        final nested = _symbolForData(value, fallback: '', seen: seen);
        if (nested.isNotEmpty) return nested;
        continue;
      }

      final raw = value?.toString().trim();
      if (raw == null || raw.isEmpty || raw.toLowerCase() == 'null') {
        continue;
      }

      final directSymbol = _symbolFromRaw(raw);
      if (directSymbol.isNotEmpty) return directSymbol;
    }

    for (final entry in data.entries) {
      final key = entry.key.toString().toLowerCase();
      if (!key.contains('currency') &&
          !key.contains('money') &&
          key != 'symbol') {
        continue;
      }

      final value = entry.value;
      if (value is Map) {
        final nested = _symbolForData(value, fallback: '', seen: seen);
        if (nested.isNotEmpty) return nested;
        continue;
      }

      final raw = value?.toString().trim();
      if (raw == null || raw.isEmpty || raw.toLowerCase() == 'null') {
        continue;
      }

      final directSymbol = _symbolFromRaw(raw);
      if (directSymbol.isNotEmpty) return directSymbol;
    }

    for (final key in _nestedCurrencyKeys) {
      final value = data[key];
      if (value is Map) {
        final nested = _symbolForData(value, fallback: '', seen: seen);
        if (nested.isNotEmpty) return nested;
      }
    }

    return fallback;
  }

  static String formatPrice(
    dynamic rawPrice, {
    Map<dynamic, dynamic>? productData,
    Map<dynamic, dynamic>? storeData,
    String fallbackSymbol = r'$',
  }) {
    final price = rawPrice?.toString().trim() ?? '';
    if (price.isEmpty || price.toLowerCase() == 'null') return '';

    final storeSymbol = symbolForData(storeData, fallback: '');
    final productSymbol = symbolForData(productData, fallback: '');
    final symbol =
        storeSymbol.isNotEmpty
            ? storeSymbol
            : productSymbol.isNotEmpty
            ? productSymbol
            : fallbackSymbol;

    if (_alreadyHasCurrency(price)) {
      final cleanedPrice = _priceWithoutCurrency(price);
      return cleanedPrice.isEmpty ? price : '$symbol$cleanedPrice';
    }

    return '$symbol$price';
  }

  static String _symbolFromRaw(String raw) {
    if (_alreadyHasCurrency(raw) && raw.length <= 4) return raw;

    final upper = raw.toUpperCase();
    final knownCode = RegExp(
      r'\b(USD|CAD|AUD|EUR|GBP|JPY|NGN|GHS|ZAR|KES)\b',
    ).firstMatch(upper);
    if (knownCode != null) {
      return _symbolsByCode[knownCode.group(1)] ?? '';
    }

    final normalized = upper.replaceAll(RegExp(r'[^A-Z]'), '');
    return _symbolsByCode[normalized] ?? '';
  }

  static bool _alreadyHasCurrency(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) return false;
    if (RegExp(r'[€£¥₦₵$]').hasMatch(trimmed)) return true;
    return RegExp(
      r'^(USD|CAD|AUD|EUR|GBP|JPY|NGN|GHS|ZAR|KES)\s+',
    ).hasMatch(trimmed.toUpperCase());
  }

  static String _priceWithoutCurrency(String value) {
    return value
        .replaceAll(RegExp(r'[€£¥₦₵$]'), '')
        .replaceAll(
          RegExp(
            r'\b(USD|CAD|AUD|EUR|GBP|JPY|NGN|GHS|ZAR|KES)\b',
            caseSensitive: false,
          ),
          '',
        )
        .trim();
  }
}
