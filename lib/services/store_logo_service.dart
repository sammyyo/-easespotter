import 'package:easespotter/services/store_api_service.dart';

class StoreLogoService {
  static const fallbackAsset = 'assets/images/easespotter.png';

  static const _logoKeys = [
    'logoUrl',
    'vendorLogoUrl',
    'storeLogoUrl',
    'logoURL',
    'logo_url',
    'vendor_logo_url',
    'store_logo_url',
    'logo',
  ];

  static const _nestedKeys = [
    'vendor',
    'store',
    'merchant',
    'brand',
    'business',
  ];

  static String resolveFromData(Map<dynamic, dynamic>? data) {
    if (data == null) return '';

    for (final key in _logoKeys) {
      final value = _resolveCandidate(data[key]);
      if (value.isNotEmpty) return value;
    }

    for (final key in _nestedKeys) {
      final nested = data[key];
      if (nested is Map) {
        final value = resolveFromData(nested);
        if (value.isNotEmpty) return value;
      }
    }

    return '';
  }

  static String resolveUrl(String? rawUrl) => _absoluteUrl(rawUrl);

  static String _resolveCandidate(dynamic candidate) {
    if (candidate is Map) {
      for (final key in const ['url', 'src', 'href', ..._logoKeys]) {
        final value = _absoluteUrl(candidate[key]?.toString());
        if (value.isNotEmpty) return value;
      }
      return '';
    }

    return _absoluteUrl(candidate?.toString());
  }

  static String _absoluteUrl(String? rawUrl) {
    final value = rawUrl?.trim() ?? '';
    if (value.isEmpty || _isBrokenPlaceholderImage(value)) return '';

    final uri = Uri.tryParse(value);
    if (uri != null && uri.hasScheme) return value;

    if (value.startsWith('//')) return 'https:$value';
    if (value.startsWith('/')) return '${StoreApiService.baseUrl}$value';

    return '${StoreApiService.baseUrl}/$value';
  }

  static bool _isBrokenPlaceholderImage(String value) {
    final lower = value.toLowerCase();
    return lower.endsWith('/logos/default-vendor.png') ||
        RegExp(r'(^|/)logos/vendor-\d+\.png$').hasMatch(lower) ||
        lower == 'logos/default-vendor.png' ||
        lower == '/logos/default-vendor.png';
  }
}
