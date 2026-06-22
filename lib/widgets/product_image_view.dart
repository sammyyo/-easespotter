import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_avif/flutter_avif.dart';

class ProductImageView extends StatelessWidget {
  final String image;
  final BoxFit fit;
  final Widget fallback;

  const ProductImageView({
    super.key,
    required this.image,
    this.fit = BoxFit.contain,
    this.fallback = const Icon(Icons.shopping_bag, color: Colors.deepPurple),
  });

  @override
  Widget build(BuildContext context) {
    final clean = image.trim();
    if (clean.isEmpty) return fallback;

    final dataImage = _decodeDataImage(clean);
    if (dataImage != null) {
      if (dataImage.isAvif) {
        return AvifImage.memory(
          dataImage.bytes,
          fit: fit,
          alignment: Alignment.center,
          gaplessPlayback: true,
          errorBuilder: (_, __, ___) => fallback,
        );
      }

      return Image.memory(
        dataImage.bytes,
        fit: fit,
        alignment: Alignment.center,
        gaplessPlayback: true,
        errorBuilder: (_, __, ___) => fallback,
      );
    }

    final uri = Uri.tryParse(_normalizeImageUrl(clean));
    if (uri != null && (uri.scheme == 'http' || uri.scheme == 'https')) {
      if (uri.path.toLowerCase().endsWith('.avif')) {
        return AvifImage.network(
          uri.toString(),
          fit: fit,
          alignment: Alignment.center,
          gaplessPlayback: true,
          errorBuilder: (_, __, ___) => fallback,
        );
      }

      return Image.network(
        uri.toString(),
        fit: fit,
        alignment: Alignment.center,
        gaplessPlayback: true,
        errorBuilder: (_, __, ___) => fallback,
      );
    }

    return fallback;
  }

  String _normalizeImageUrl(String value) {
    return value;
  }

  _DecodedDataImage? _decodeDataImage(String value) {
    if (!value.toLowerCase().startsWith('data:image/')) return null;

    final commaIndex = value.indexOf(',');
    if (commaIndex < 0) return null;

    final header = value.substring(0, commaIndex).toLowerCase();
    final payload = value.substring(commaIndex + 1);

    try {
      final bytes =
          header.contains(';base64')
              ? base64Decode(payload)
              : Uint8List.fromList(utf8.encode(Uri.decodeComponent(payload)));

      return _DecodedDataImage(
        bytes: bytes,
        mimeType: header.substring(5).split(';').first,
      );
    } catch (_) {
      return null;
    }
  }
}

class _DecodedDataImage {
  final Uint8List bytes;
  final String mimeType;

  const _DecodedDataImage({required this.bytes, required this.mimeType});

  bool get isAvif => mimeType == 'image/avif';
}
