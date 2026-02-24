import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../services/home_inventory_service.dart';

class InventoryScanScreen extends StatefulWidget {
  const InventoryScanScreen({super.key});

  @override
  State<InventoryScanScreen> createState() => _InventoryScanScreenState();
}

class _InventoryScanScreenState extends State<InventoryScanScreen> {
  bool _scanned = false;
  final MobileScannerController _controller = MobileScannerController();
  final HomeInventoryService _inventory = HomeInventoryService();

  Future<String?> _askName(BuildContext context, String barcode) async {
    final c = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add to Home Inventory'),
        content: TextField(
          controller: c,
          textCapitalization: TextCapitalization.words,
          decoration: InputDecoration(
            hintText: 'e.g. Milk',
            helperText: 'Barcode: $barcode',
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () {
              final v = c.text.trim();
              Navigator.pop(ctx, v.isEmpty ? null : v);
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  Future<void> _onBarcodeScanned(BarcodeCapture capture) async {
    if (_scanned) return;

    final rawValue =
    capture.barcodes.isNotEmpty ? capture.barcodes.first.rawValue : null;

    if (rawValue == null || rawValue.trim().isEmpty) return;

    // Ensure user exists (your app often uses anonymous auth)
    if (FirebaseAuth.instance.currentUser == null) {
      await FirebaseAuth.instance.signInAnonymously();
    }

    _scanned = true;

    final barcode = rawValue.trim();

    try {
      await _controller.stop();

      final name = await _askName(context, barcode);
      if (!mounted) return;

      if (name == null) {
        await _controller.start();
        _scanned = false;
        return;
      }

      await _inventory.increment(
        name: name,
        barcode: barcode,
        source: 'scan',
      );

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Added to Home Inventory: $name'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Scan failed: $e')),
      );
    } finally {
      await _controller.start();
      _scanned = false;
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
      appBar: AppBar(
        backgroundColor: Colors.deepPurple,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text('Scan to Home Inventory',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
      ),
      body: MobileScanner(
        controller: _controller,
        fit: BoxFit.cover,
        onDetect: _onBarcodeScanned,
      ),
    );
  }
}
