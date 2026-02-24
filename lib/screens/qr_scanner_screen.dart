import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:http/http.dart' as http;
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
  final MobileScannerController _controller = MobileScannerController();

  Future<void> _onQRCodeScanned(BarcodeCapture capture) async {
    if (_scanned) return;

    final rawValue = capture.barcodes.isNotEmpty ? capture.barcodes.first.rawValue : null;

    if (rawValue == null || rawValue.trim().isEmpty) {
      debugPrint("QR detected but empty.");
      return;
    }

    _scanned = true;
    debugPrint(' Scanned QR: $rawValue');
    debugPrint(' AUTH UID at scan: ${FirebaseAuth.instance.currentUser?.uid}');

    Map<String, dynamic>? storeData;

    try {
      dynamic decoded;

      if (rawValue.startsWith('http')) {
        final response = await http.get(Uri.parse(rawValue));
        if (response.statusCode != 200) {
          debugPrint(' Fetch failed: ${response.statusCode}');
          return;
        }
        decoded = jsonDecode(response.body);
      } else {
        decoded = jsonDecode(rawValue);
      }

      if (decoded is Map && decoded['success'] == true && decoded['data'] != null) {
        //  SAFE conversion (won’t crash on Map<dynamic,dynamic>)
        storeData = Map<String, dynamic>.from(decoded['data'] as Map);
      } else {
        debugPrint('Invalid JSON structure');
        return;
      }
    } catch (e) {
      debugPrint('Exception decoding QR: $e');
      return;
    }

    // From here on, we ALWAYS navigate (storeData is valid)
    await _controller.stop();

    // Fire-and-forget logging (won’t block storefront)
    try {
      final vendorId = storeData['vendorId']?.toString().trim() ?? '';
      final vendorName = storeData['vendorName']?.toString().trim();
      final logoUrl = storeData['logoUrl']?.toString().trim();

      if (vendorId.isNotEmpty) {
        // Optional cache (do NOT block visit logging if it fails)
        try {
          await FirebaseFirestore.instance.collection('stores').doc(vendorId).set({
            if (vendorName != null && vendorName.isNotEmpty) 'name': vendorName,
            if (logoUrl != null && logoUrl.isNotEmpty) 'logoUrl': logoUrl,
            'updatedAt': FieldValue.serverTimestamp(),
          }, SetOptions(merge: true));
        } catch (e) {
          debugPrint('Store cache write failed (continuing): $e');
        }

        //  Updated: Store returned visitRefId
        final visitId = await StoreVisitService.logStoreVisit(
          storeId: vendorId,
          storeName: vendorName,
          logoUrl: logoUrl,
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

    if (!mounted) return;

    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => StoreConfirmationScreen(storeData: storeData!),
      ),
    );

    // restart camera
    await _controller.start();
    _scanned = false;
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: MobileScanner(
        controller: _controller,
        fit: BoxFit.cover,
        onDetect: _onQRCodeScanned,
      ),
    );
  }
}
