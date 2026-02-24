// lib/services/home_inventory_service.dart
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class HomeInventoryService {
  HomeInventoryService({
    FirebaseAuth? auth,
    FirebaseFirestore? firestore,
  })  : _auth = auth ?? FirebaseAuth.instance,
        _db = firestore ?? FirebaseFirestore.instance;

  final FirebaseAuth _auth;
  final FirebaseFirestore _db;

  String get _uid {
    final u = _auth.currentUser;
    if (u == null) {
      throw StateError('HomeInventoryService: user not signed in');
    }
    return u.uid;
  }

  CollectionReference<Map<String, dynamic>> get _col =>
      _db.collection('users').doc(_uid).collection('home_inventory');

  /// Stream the user's home inventory (latest first).
  Stream<QuerySnapshot<Map<String, dynamic>>> streamInventory() {
    return _col.orderBy('updatedAt', descending: true).snapshots();
  }

  /// Add or update an inventory item.
  /// If barcode is provided, it will be used as the document id (stable key).
  Future<void> upsertItem({
    required String name,
    String? barcode,
    num quantity = 1,
    String? unit,
    String source = 'manual', // scan | manual | list
  }) async {
    final docId = _docIdFrom(barcode: barcode, name: name);

    await _col.doc(docId).set({
      'name': name.trim(),
      'barcode': (barcode == null || barcode.trim().isEmpty) ? null : barcode.trim(),
      'quantity': quantity,
      'unit': unit,
      'source': source,
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }

  /// Convenience: increment quantity for an item (most useful for barcode scans).
  Future<void> increment({
    required String name,
    required String barcode,
    num by = 1,
    String? unit,
    String source = 'scan',
  }) async {
    final docRef = _col.doc(barcode.trim());

    await _db.runTransaction((tx) async {
      final snap = await tx.get(docRef);
      final currentQty = (snap.data()?['quantity'] as num?) ?? 0;

      tx.set(docRef, {
        'name': name.trim(),
        'barcode': barcode.trim(),
        'quantity': currentQty + by,
        'unit': unit,
        'source': source,
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    });
  }

  /// Decrement quantity; if it reaches <= 0, deletes the item.
  Future<void> decrement({
    required String docId,
    num by = 1,
  }) async {
    final docRef = _col.doc(docId);

    await _db.runTransaction((tx) async {
      final snap = await tx.get(docRef);
      if (!snap.exists) return;

      final currentQty = (snap.data()?['quantity'] as num?) ?? 0;
      final nextQty = currentQty - by;

      if (nextQty <= 0) {
        tx.delete(docRef);
      } else {
        tx.update(docRef, {
          'quantity': nextQty,
          'updatedAt': FieldValue.serverTimestamp(),
        });
      }
    });
  }

  /// Optional helper: remove an item entirely.
  Future<void> deleteItem(String docId) async {
    await _col.doc(docId).delete();
  }

  // If barcode exists, we want stable IDs by barcode.
  // If not, we create a fallback deterministic-ish id from the name.
  String _docIdFrom({String? barcode, required String name}) {
    final b = barcode?.trim();
    if (b != null && b.isNotEmpty) return b;

    final cleaned = name.trim().toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '_');
    return cleaned.isEmpty ? _col.doc().id : cleaned;
  }
}
