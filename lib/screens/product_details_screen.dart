import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import 'package:easespotter/services/currency_formatting.dart';
import 'package:easespotter/services/store_api_service.dart';
import 'package:easespotter/services/store_logo_service.dart';
import 'package:easespotter/widgets/product_image_view.dart';

class ProductDetailsScreen extends StatelessWidget {
  final Map<String, dynamic> product;

  const ProductDetailsScreen({super.key, required this.product});

  @override
  Widget build(BuildContext context) {
    final name = _stringValue(const [
      'name',
      'title',
      'productName',
      'itemName',
    ], fallback: 'Product');
    final brand = _stringValue(const [
      'brand',
      'brandName',
      'manufacturer',
      'vendorBrand',
    ]);
    final description = _stringValue(const [
      'description',
      'desc',
      'details',
      'productDescription',
      'summary',
    ]);
    final category = _stringValue(const ['category', 'department']);
    final price = _stringValue(const ['price', 'unitPrice']);
    final formattedPrice = CurrencyFormatting.formatPrice(
      price,
      productData: product,
    );
    final barcode = _stringValue(const ['barcode', 'upc', 'ean', 'sku']);
    final storeName = _stringValue(const [
      'storeName',
      'vendorName',
      'vendor',
      'businessName',
    ]);
    final imageUrl = _imageUrlFromProduct();
    final logoUrl = _logoUrlFromProduct();
    final storeId = _storeIdFromProduct();
    final location = _locationText();

    return Scaffold(
      backgroundColor: const Color(0xFFF7F5FF),
      appBar: AppBar(
        title: const Text(
          'Product Details',
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
        centerTitle: true,
        backgroundColor: Colors.deepPurple,
        foregroundColor: Colors.white,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: [
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.06),
                  blurRadius: 14,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AspectRatio(
                  aspectRatio: 1.25,
                  child: ClipRRect(
                    borderRadius: const BorderRadius.vertical(
                      top: Radius.circular(16),
                    ),
                    child: Container(
                      color: Colors.deepPurple.shade50,
                      child: ProductImageView(image: imageUrl),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (storeName.isNotEmpty ||
                          logoUrl.isNotEmpty ||
                          storeId.isNotEmpty) ...[
                        FutureBuilder<String>(
                          future: _resolvedStoreLogoUrl(logoUrl, storeId),
                          builder: (context, snapshot) {
                            final resolvedLogo = snapshot.data ?? logoUrl;

                            return Row(
                              children: [
                                _storeAvatar(storeName, resolvedLogo),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    storeName.isEmpty ? 'Store' : storeName,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      color: Colors.black54,
                                      fontSize: 13,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                              ],
                            );
                          },
                        ),
                        const SizedBox(height: 12),
                      ],
                      Text(
                        name,
                        style: const TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w900,
                          height: 1.08,
                        ),
                      ),
                      if (brand.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(
                          brand,
                          style: const TextStyle(
                            fontSize: 14,
                            color: Colors.deepPurple,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                      const SizedBox(height: 14),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          if (formattedPrice.isNotEmpty)
                            _infoPill(
                              formattedPrice,
                              const Color(0xFFFFF3E0),
                              const Color(0xFFB45F06),
                            ),
                          if (location.isNotEmpty)
                            _infoPill(
                              location,
                              const Color(0xFFF3F0FF),
                              Colors.deepPurple,
                            ),
                          if (category.isNotEmpty)
                            _infoPill(
                              category,
                              const Color(0xFFEFF7F5),
                              Colors.teal.shade700,
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          if (description.isNotEmpty) ...[
            const SizedBox(height: 16),
            _sectionCard(
              title: 'Description',
              child: Text(
                description,
                style: const TextStyle(
                  fontSize: 14.5,
                  height: 1.45,
                  color: Colors.black87,
                ),
              ),
            ),
          ],
          const SizedBox(height: 16),
          _sectionCard(
            title: 'Product Info',
            child: Column(
              children: [
                _detailRow('Brand', brand),
                _detailRow('Category', category),
                _detailRow('Location', location),
                _detailRow('Barcode', barcode),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _storeAvatar(String storeName, String logoUrl) {
    final resolvedLogo = StoreLogoService.resolveUrl(logoUrl);

    return CircleAvatar(
      radius: 16,
      backgroundColor: Colors.deepPurple.shade50,
      child:
          resolvedLogo.isNotEmpty
              ? ClipOval(
                child: Image.network(
                  resolvedLogo,
                  width: 32,
                  height: 32,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => _fallbackStoreIcon(storeName),
                ),
              )
              : _fallbackStoreIcon(storeName),
    );
  }

  String _logoUrlFromProduct() {
    return StoreLogoService.resolveFromData(product);
  }

  String _storeIdFromProduct() {
    return _stringValue(const [
      'storeId',
      'vendorId',
      'vendorid',
      'store_id',
      'vendor_id',
      'storeID',
      'vendorID',
    ]);
  }

  Future<String> _resolvedStoreLogoUrl(
    String currentLogo,
    String storeId,
  ) async {
    if (currentLogo.isNotEmpty || storeId.isEmpty) return currentLogo;

    try {
      final doc =
          await FirebaseFirestore.instance
              .collection('stores')
              .doc(storeId)
              .get();
      return StoreLogoService.resolveFromData(doc.data());
    } catch (_) {
      return '';
    }
  }

  Widget _fallbackStoreIcon(String storeName) {
    return Text(
      storeName.trim().isEmpty ? '?' : storeName.trim()[0].toUpperCase(),
      style: const TextStyle(
        color: Colors.deepPurple,
        fontWeight: FontWeight.w900,
      ),
    );
  }

  Widget _infoPill(String text, Color background, Color foreground) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: foreground,
          fontSize: 12,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }

  Widget _sectionCard({required String title, required Widget child}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 10),
          child,
        ],
      ),
    );
  }

  Widget _detailRow(String label, String value) {
    if (value.trim().isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 92,
            child: Text(
              label,
              style: const TextStyle(
                color: Colors.black54,
                fontSize: 13,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                color: Colors.black87,
                fontSize: 13.5,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _stringValue(List<String> keys, {String fallback = ''}) {
    for (final key in keys) {
      final value = product[key];
      if (value == null) continue;
      final text = value.toString().trim();
      if (text.isNotEmpty && text.toLowerCase() != 'null') return text;
    }
    return fallback;
  }

  String _imageUrlFromProduct() {
    for (final key in const [
      'thumbnailUrl',
      'thumbnail_url',
      'productImageUrl',
      'productImageURL',
      'product_image_url',
      'imageUrl',
      'imageURL',
      'image_url',
      'image',
      'productImage',
      'product_image',
      'photoUrl',
      'photoURL',
      'photo_url',
      'thumbnail',
      'url',
    ]) {
      final url = _imageUrlFromCandidate(product[key]);
      if (url.isNotEmpty) return url;
    }

    final images = product['images'];
    if (images is List) {
      for (final image in images) {
        final url = _imageUrlFromCandidate(image);
        if (url.isNotEmpty) return url;
      }
    }

    return '';
  }

  String _imageUrlFromCandidate(dynamic candidate) {
    if (candidate == null) return '';

    if (candidate is Map) {
      for (final key in const [
        'url',
        'src',
        'href',
        'imageUrl',
        'imageURL',
        'image_url',
        'productImageUrl',
        'productImageURL',
        'product_image_url',
        'photoUrl',
        'photo_url',
        'thumbnailUrl',
        'thumbnail_url',
      ]) {
        final value = candidate[key]?.toString().trim() ?? '';
        final url = _absoluteUrl(value);
        if (url.isNotEmpty) return url;
      }
      return '';
    }

    return _absoluteUrl(candidate?.toString());
  }

  String _absoluteUrl(String? rawUrl) {
    final value = rawUrl?.trim() ?? '';
    if (value.isEmpty || value.toLowerCase() == 'null') return '';

    final uri = Uri.tryParse(value);
    if (uri != null && uri.hasScheme) return value;
    if (uri == null) return value;
    if (value.startsWith('//')) return 'https:$value';
    if (value.startsWith('/')) return '${StoreApiService.baseUrl}$value';
    return '${StoreApiService.baseUrl}/$value';
  }

  String _locationText() {
    final location = product['location'];
    if (location is Map) {
      final aisle = location['aisle']?.toString().trim() ?? '';
      final shelf = location['shelf']?.toString().trim() ?? '';
      if (aisle.isNotEmpty && shelf.isNotEmpty) {
        return 'Aisle $aisle - Shelf $shelf';
      }
      if (aisle.isNotEmpty) return 'Aisle $aisle';
      if (shelf.isNotEmpty) return 'Shelf $shelf';
    }

    final direct = _stringValue(const [
      'location',
      'locationText',
      'location_text',
      'aisleLocation',
      'aisle_location',
    ]);
    if (direct.isNotEmpty) return direct;

    final aisle = _stringValue(const ['aisle']);
    final shelf = _stringValue(const ['shelf']);
    if (aisle.isNotEmpty && shelf.isNotEmpty) {
      return 'Aisle $aisle - Shelf $shelf';
    }
    if (aisle.isNotEmpty) return 'Aisle $aisle';
    if (shelf.isNotEmpty) return 'Shelf $shelf';
    return '';
  }
}
