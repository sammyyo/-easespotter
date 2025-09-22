import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'store_confirmation_screen.dart';
import 'package:http/http.dart' as http;


class QRScannerScreen extends StatefulWidget {
  const QRScannerScreen({super.key});

  @override
  State<QRScannerScreen> createState() => _QRScannerScreenState();
}

class _QRScannerScreenState extends State<QRScannerScreen> {
  bool _scanned = false;
  final MobileScannerController _controller = MobileScannerController();




  void _onQRCodeScanned(BarcodeCapture capture) async {
    if (_scanned) return;

    final Barcode barcode = capture.barcodes.first;
    final String? rawValue = barcode.rawValue;

    if (rawValue == null || rawValue.trim().isEmpty) {
      debugPrint("QR code detected but content is empty or whitespace.");
      return;
    }

    _scanned = true;
    debugPrint('Scanned QR content: $rawValue');

    try {
      dynamic decoded;

      if (rawValue.startsWith('http')) {
        debugPrint('Fetching JSON from URL...');
        final uri = Uri.parse(rawValue);
        final response = await http.get(uri);

        if (response.statusCode != 200) {
          debugPrint('Failed to fetch. Status code: ${response.statusCode}');
          _scanned = false;
          return;
        }

        decoded = jsonDecode(response.body);
      } else {
        decoded = jsonDecode(rawValue);
      }

      if (decoded is Map &&
          decoded['success'] == true &&
          decoded['data'] != null) {
        await _controller.stop();

        if (!mounted) return;
        await Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => StoreConfirmationScreen(storeData: decoded['data']),
          ),
        );

        await _controller.start();
      } else {
        debugPrint('Invalid JSON structure');
      }
    } catch (e) {
      debugPrint('Exception during scan: $e');
    } finally {
      if (mounted) setState(() => _scanned = false);
    }
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
