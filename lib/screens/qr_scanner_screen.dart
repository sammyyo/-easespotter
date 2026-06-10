import 'dart:convert';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:http/http.dart' as http;
import 'package:easespotter/services/store_api_service.dart';
import 'package:easespotter/services/store_logo_service.dart';
import 'package:easespotter/services/store_visit_service.dart';

import 'store_confirmation_screen.dart';

// Firebase
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

//  Removed inline StoreVisitService to use the updated shared service

class QRScannerScreen extends StatefulWidget {
  const QRScannerScreen({super.key});

  @override
  State<QRScannerScreen> createState() => _QRScannerScreenState();
}

class _QRScannerScreenState extends State<QRScannerScreen> {
  bool _scanned = false;
  bool _isOpeningStore = false;
  final MobileScannerController _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
    formats: const [BarcodeFormat.qrCode],
  );

  Future<void> _onQRCodeScanned(BarcodeCapture capture) async {
    if (_scanned) return;

    final rawValue =
        capture.barcodes
            .map((barcode) => barcode.rawValue?.trim())
            .whereType<String>()
            .where((value) => value.isNotEmpty)
            .firstOrNull;

    if (rawValue == null) {
      debugPrint("QR detected but empty.");
      return;
    }

    _scanned = true;
    if (mounted) {
      setState(() => _isOpeningStore = true);
    }
    debugPrint(' Scanned QR: $rawValue');
    debugPrint(' AUTH UID at scan: ${FirebaseAuth.instance.currentUser?.uid}');

    Map<String, dynamic>? storeData;

    try {
      await _controller.stop();
      storeData = await _storeDataFromQrValue(rawValue);
    } catch (e) {
      debugPrint('Exception decoding QR: $e');
      await _rejectScan('That QR code is not a valid EaseSpotter store QR.');
      return;
    }

    if (!mounted) return;

    unawaited(_cacheAndLogStoreVisit(storeData));

    setState(() => _isOpeningStore = false);

    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => StoreConfirmationScreen(storeData: storeData!),
      ),
    );

    await _resumeScanning();
  }

  Future<void> _cacheAndLogStoreVisit(Map<String, dynamic> storeData) async {
    try {
      final vendorId = storeData['vendorId']?.toString().trim() ?? '';
      final vendorName = storeData['vendorName']?.toString().trim();
      final logoUrl = StoreLogoService.resolveFromData(storeData);

      if (vendorId.isNotEmpty) {
        // Optional cache (do NOT block visit logging if it fails)
        try {
          await FirebaseFirestore.instance
              .collection('stores')
              .doc(vendorId)
              .set({
                'storeId': vendorId,
                'vendorId': vendorId,
                if (vendorName != null && vendorName.isNotEmpty)
                  'name': vendorName,
                if (vendorName != null && vendorName.isNotEmpty)
                  'vendorName': vendorName,
                if (logoUrl.isNotEmpty) 'logoUrl': logoUrl,
                if (_safeProductsByCategory(storeData) != null)
                  'productsByCategory': _safeProductsByCategory(storeData),
                if (storeData['totalProducts'] != null)
                  'totalProducts': storeData['totalProducts'],
                'updatedAt': FieldValue.serverTimestamp(),
              }, SetOptions(merge: true));
        } catch (e) {
          debugPrint('Store cache write failed (continuing): $e');
        }

        //  Updated: Store returned visitRefId
        final visitId = await StoreVisitService.logStoreVisit(
          storeId: vendorId,
          storeName: vendorName,
          logoUrl: logoUrl.isEmpty ? null : logoUrl,
          source: 'qr',
        );

        // Pass visitId forward if returned (for review creation later)
        if (visitId != null) {
          storeData['visitRefId'] = visitId;
        }
      } else {
        debugPrint('vendorId missing → skip visit log');
      }
    } catch (e) {
      debugPrint(' Visit log failed (but navigating anyway): $e');
    }
  }

  Future<Map<String, dynamic>> _storeDataFromQrValue(String rawValue) async {
    final uri = Uri.tryParse(rawValue);
    if (uri != null && uri.hasScheme) {
      if (uri.isScheme('http') || uri.isScheme('https')) {
        try {
          final response = await http
              .get(uri)
              .timeout(const Duration(seconds: 15));
          if (response.statusCode >= 200 && response.statusCode < 300) {
            return _extractStoreData(jsonDecode(response.body));
          }
          debugPrint('QR URL fetch failed: ${response.statusCode}');
        } catch (e) {
          debugPrint('QR URL parse/fetch failed: $e');
        }
      }

      final storeId = _storeIdFromUri(uri);
      if (storeId != null) {
        return _fetchStoreDataById(storeId);
      }

      for (final candidate in _payloadCandidatesFromUri(uri)) {
        try {
          return await _storeDataFromQrValue(candidate);
        } catch (_) {
          // Keep trying other encoded query/fragment payloads.
        }
      }
    }

    final storeId = _storeIdFromText(rawValue);
    if (storeId != null) {
      return _fetchStoreDataById(storeId);
    }

    for (final candidate in _decodedTextCandidates(rawValue)) {
      try {
        return _extractStoreData(jsonDecode(candidate));
      } catch (_) {
        // Keep trying decoded variants before rejecting the QR.
      }
    }

    return _extractStoreData(jsonDecode(rawValue));
  }

  Future<Map<String, dynamic>> _fetchStoreDataById(int storeId) async {
    try {
      final decoded = await StoreApiService.fetchStoreDirectory(storeId);
      return _extractStoreData(decoded);
    } catch (directoryError) {
      debugPrint(
        'QR directory fetch failed for store $storeId: $directoryError',
      );
    }

    try {
      final decoded = await StoreApiService.fetchStoreById(storeId);
      return _extractStoreData(decoded);
    } catch (storeError) {
      debugPrint('QR store fetch failed for store $storeId: $storeError');
    }

    throw Exception('No store data found for store ID $storeId');
  }

  int? _storeIdFromUri(Uri uri) {
    const queryKeys = [
      'storeId',
      'vendorId',
      'store_id',
      'vendor_id',
      'storeID',
      'vendorID',
      'id',
    ];

    for (final key in queryKeys) {
      final value = uri.queryParameters[key]?.trim();
      final id = _storeIdFromText(value ?? '');
      if (id != null) return id;
    }

    for (var index = uri.pathSegments.length - 1; index >= 0; index--) {
      final segment = uri.pathSegments[index];
      final previousSegment =
          index > 0 ? uri.pathSegments[index - 1].toLowerCase() : '';

      if (const {
        'store',
        'stores',
        'vendor',
        'vendors',
      }.contains(previousSegment)) {
        final id = int.tryParse(segment.trim());
        if (id != null) return id;
      }
    }

    final hostId = int.tryParse(uri.host.trim());
    if (hostId != null) return hostId;

    return null;
  }

  Iterable<String> _payloadCandidatesFromUri(Uri uri) sync* {
    const payloadKeys = [
      'payload',
      'data',
      'qr',
      'code',
      'value',
      'store',
      'storeData',
    ];

    for (final key in payloadKeys) {
      final value = uri.queryParameters[key]?.trim();
      if (value != null && value.isNotEmpty) {
        yield value;
        yield* _decodedTextCandidates(value);
      }
    }

    if (uri.fragment.trim().isNotEmpty) {
      yield uri.fragment.trim();
      yield* _decodedTextCandidates(uri.fragment.trim());
    }
  }

  Iterable<String> _decodedTextCandidates(String value) sync* {
    try {
      final decoded = Uri.decodeFull(value);
      if (decoded != value) yield decoded;
    } catch (_) {
      // Not URI encoded.
    }

    try {
      final decodedBytes = base64.decode(base64.normalize(value));
      final decoded = utf8.decode(decodedBytes).trim();
      if (decoded.isNotEmpty && decoded != value) yield decoded;
    } catch (_) {
      // Not base64 encoded.
    }
  }

  int? _storeIdFromText(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) return null;

    final exact = int.tryParse(trimmed);
    if (exact != null) return exact;

    final labelledMatch = RegExp(
      r'(?:store|vendor)[_\s-]*id["\s:=/]+(\d+)',
      caseSensitive: false,
    ).firstMatch(trimmed);
    if (labelledMatch != null) {
      return int.tryParse(labelledMatch.group(1) ?? '');
    }

    return null;
  }

  Map<String, dynamic> _extractStoreData(dynamic decoded) {
    if (decoded is Map) {
      final map = Map<String, dynamic>.from(decoded);
      final data = map['data'];

      if (map['success'] == true && data is Map) {
        return _normalizeStoreData(data);
      }

      return _normalizeStoreData(map);
    }

    throw const FormatException('Invalid store QR payload');
  }

  Map<String, dynamic> _normalizeStoreData(Map<dynamic, dynamic> rawData) {
    final storeData = Map<String, dynamic>.from(rawData);
    final storeId =
        storeData['vendorId'] ??
        storeData['storeId'] ??
        storeData['vendor_id'] ??
        storeData['store_id'] ??
        storeData['vendorID'] ??
        storeData['storeID'] ??
        storeData['id'];

    final cleanStoreId = storeId?.toString().trim();
    if (cleanStoreId == null || cleanStoreId.isEmpty) {
      throw const FormatException('Store QR payload missing store ID');
    }

    storeData['vendorId'] = cleanStoreId;
    storeData['storeId'] ??= cleanStoreId;
    final logoUrl = StoreLogoService.resolveFromData(storeData);
    if (logoUrl.isNotEmpty) {
      storeData['logoUrl'] = logoUrl;
    } else {
      storeData.remove('logoUrl');
    }
    return storeData;
  }

  Future<void> _rejectScan(String message) async {
    if (mounted) {
      setState(() => _isOpeningStore = false);
    }
    if (mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(message)));
    }
    await _resumeScanning();
  }

  Future<void> _resumeScanning() async {
    if (!mounted) return;
    try {
      await _controller.start();
    } catch (e) {
      debugPrint('Camera restart failed: $e');
    } finally {
      if (mounted) {
        setState(() => _isOpeningStore = false);
      }
      _scanned = false;
    }
  }

  Map<String, dynamic>? _safeProductsByCategory(
    Map<String, dynamic> storeData,
  ) {
    final productsByCategory = storeData['productsByCategory'];
    if (productsByCategory is! Map) return null;

    final safe = <String, dynamic>{};
    for (final entry in productsByCategory.entries) {
      final rawProducts = entry.value;
      if (rawProducts is! List) continue;

      safe[entry.key.toString()] =
          rawProducts.whereType<Map>().map((product) {
            final safeProduct = Map<String, dynamic>.from(product);
            safeProduct.remove('image');
            safeProduct.remove('imageUrl');
            safeProduct.remove('imageURL');
            safeProduct.remove('image_url');
            safeProduct.remove('productImageUrl');
            safeProduct.remove('productImageURL');
            safeProduct.remove('product_image_url');
            safeProduct.remove('productImage');
            safeProduct.remove('thumbnail');
            safeProduct.remove('thumbnailUrl');
            safeProduct.remove('thumbnail_url');
            return safeProduct;
          }).toList();
    }

    return safe;
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          MobileScanner(
            controller: _controller,
            fit: BoxFit.cover,
            onDetect: _onQRCodeScanned,
          ),
          if (_isOpeningStore)
            Container(
              color: Colors.black54,
              child: const Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircularProgressIndicator(color: Colors.white),
                    SizedBox(height: 14),
                    Text(
                      'Opening store...',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
