import 'dart:convert';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:http/http.dart' as http;
import 'package:easespotter/screens/receipt_camera_capture_screen.dart';
import 'package:easespotter/screens/receipt_review_screen.dart';
import 'package:easespotter/services/receipt_parser_service.dart';
import 'package:easespotter/services/store_api_service.dart';
import 'package:easespotter/services/store_logo_service.dart';
import 'package:easespotter/services/store_visit_service.dart';

import 'store_confirmation_screen.dart';

// Firebase
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

//  Removed inline StoreVisitService to use the updated shared service

enum ScanMode { storeQr, receipt }

class QRScannerScreen extends StatefulWidget {
  final ScanMode initialMode;
  final bool returnAfterReceiptAdd;

  const QRScannerScreen({
    super.key,
    this.initialMode = ScanMode.storeQr,
    this.returnAfterReceiptAdd = false,
  });

  @override
  State<QRScannerScreen> createState() => _QRScannerScreenState();
}

class _QRScannerScreenState extends State<QRScannerScreen> {
  bool _scanned = false;
  bool _isOpeningStore = false;
  bool _isProcessingReceipt = false;
  ScanMode _scanMode = ScanMode.storeQr;
  final ImagePicker _imagePicker = ImagePicker();
  final ReceiptParserService _receiptParser = ReceiptParserService();
  final MobileScannerController _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
    formats: const [BarcodeFormat.qrCode],
  );

  @override
  void initState() {
    super.initState();
    _scanMode = widget.initialMode;
  }

  Future<void> _onQRCodeScanned(BarcodeCapture capture) async {
    if (_scanMode != ScanMode.storeQr) return;
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
      final storeData = _extractStoreData(decoded);
      if (_hasProducts(storeData)) {
        return storeData;
      }
      debugPrint('QR directory fetch for store $storeId returned no products');
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

  bool _hasProducts(Map<String, dynamic> storeData) {
    final totalProducts = storeData['totalProducts'];
    if (totalProducts is num && totalProducts > 0) return true;

    final productsByCategory = storeData['productsByCategory'];
    if (productsByCategory is Map) {
      return productsByCategory.values.any(
        (items) => items is List && items.isNotEmpty,
      );
    }

    final productsByAisle = storeData['productsByAisle'];
    if (productsByAisle is Map) {
      return productsByAisle.values.any(
        (items) => items is List && items.isNotEmpty,
      );
    }

    return false;
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
    if (!mounted || _scanMode != ScanMode.storeQr) return;
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
            return safeProduct;
          }).toList();
    }

    return safe;
  }

  Future<void> _setScanMode(ScanMode mode) async {
    if (_scanMode == mode) return;

    setState(() {
      _scanMode = mode;
      _scanned = false;
      _isOpeningStore = false;
    });

    try {
      if (mode == ScanMode.receipt) {
        await _controller.stop();
      } else {
        await _controller.start();
      }
    } catch (e) {
      debugPrint('Scan mode camera update failed: $e');
    }
  }

  Future<void> _pickReceiptImage(ImageSource source) async {
    if (_isProcessingReceipt) return;

    final navigator = Navigator.of(context);
    setState(() => _isProcessingReceipt = true);

    try {
      final imagePath =
          source == ImageSource.camera
              ? await navigator.push<String>(
                MaterialPageRoute(
                  builder: (_) => const ReceiptCameraCaptureScreen(),
                ),
              )
              : (await _imagePicker.pickImage(
                source: ImageSource.gallery,
                imageQuality: 92,
              ))?.path;

      if (imagePath == null) {
        if (mounted) setState(() => _isProcessingReceipt = false);
        return;
      }

      final inputImage = InputImage.fromFilePath(imagePath);
      final textRecognizer = TextRecognizer(
        script: TextRecognitionScript.latin,
      );

      try {
        final recognizedText = await textRecognizer.processImage(inputImage);
        final receipt = _receiptParser.parseReceipt(recognizedText);
        final detectedItems = List<Map<String, dynamic>>.from(
          receipt['items'] as List? ?? const [],
        );

        if (!mounted) return;

        final added = await Navigator.of(context).push<bool>(
          MaterialPageRoute(
            builder:
                (_) => ReceiptReviewScreen(
                  detectedItems: detectedItems,
                  rawText: recognizedText.text,
                  storeName: receipt['storeName']?.toString(),
                  total: receipt['total'] as double?,
                  currency: receipt['currency']?.toString(),
                ),
          ),
        );

        if (added == true && widget.returnAfterReceiptAdd && mounted) {
          Navigator.of(context).pop(true);
        }
      } finally {
        await textRecognizer.close();
      }
    } catch (e) {
      debugPrint('Receipt scan failed: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Receipt scan failed. Try a clearer photo.'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isProcessingReceipt = false);
    }
  }

  Widget _buildModeToggle() {
    return SafeArea(
      child: Align(
        alignment: Alignment.topCenter,
        child: Container(
          margin: const EdgeInsets.fromLTRB(18, 12, 18, 0),
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: 0.55),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.white24),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              _ScanModeButton(
                icon: Icons.qr_code_scanner,
                label: 'Store QR',
                selected: _scanMode == ScanMode.storeQr,
                onTap: () => _setScanMode(ScanMode.storeQr),
              ),
              _ScanModeButton(
                icon: Icons.receipt_long,
                label: 'Receipt',
                selected: _scanMode == ScanMode.receipt,
                onTap: () => _setScanMode(ScanMode.receipt),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildQrCamera() {
    return Stack(
      children: [
        MobileScanner(
          controller: _controller,
          fit: BoxFit.cover,
          onDetect: _onQRCodeScanned,
        ),
        Center(
          child: Container(
            width: 250,
            height: 250,
            decoration: BoxDecoration(
              border: Border.all(color: Colors.white, width: 3),
              borderRadius: BorderRadius.circular(20),
            ),
          ),
        ),
        Positioned(
          left: 24,
          right: 24,
          bottom: 42,
          child: Text(
            'Point your camera at an EaseSpotter store QR code.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.92),
              fontWeight: FontWeight.w700,
              fontSize: 15,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildReceiptScanner() {
    return Container(
      width: double.infinity,
      height: double.infinity,
      color: const Color(0xFF18151F),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(22, 92, 22, 28),
          child: Column(
            children: [
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(
                      Icons.receipt_long,
                      color: Colors.white,
                      size: 74,
                    ),
                    const SizedBox(height: 18),
                    const Text(
                      'Scan Receipt',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 28,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      'Capture a clear receipt photo to detect item names and prices.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.76),
                        fontSize: 15,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
              if (_isProcessingReceipt) ...[
                const CircularProgressIndicator(color: Colors.white),
                const SizedBox(height: 16),
                const Text(
                  'Reading receipt...',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ] else ...[
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () => _pickReceiptImage(ImageSource.camera),
                    icon: const Icon(Icons.photo_camera),
                    label: const Text('Take Receipt Photo'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: Colors.deepPurple,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: () => _pickReceiptImage(ImageSource.gallery),
                    icon: const Icon(Icons.photo_library_outlined),
                    label: const Text('Choose Existing Photo'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.white,
                      side: const BorderSide(color: Colors.white70),
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
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
          if (_scanMode == ScanMode.storeQr)
            _buildQrCamera()
          else
            _buildReceiptScanner(),
          _buildModeToggle(),
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

class _ScanModeButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _ScanModeButton({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? Colors.white : Colors.transparent,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                size: 18,
                color: selected ? Colors.deepPurple : Colors.white,
              ),
              const SizedBox(width: 7),
              Text(
                label,
                style: TextStyle(
                  color: selected ? Colors.deepPurple : Colors.white,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
