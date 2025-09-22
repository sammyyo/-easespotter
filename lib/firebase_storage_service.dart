import 'package:firebase_storage/firebase_storage.dart';

class FirebaseStorageService {
  final FirebaseStorage _storage = FirebaseStorage.instance;

  // 🔹 Used to get a single overlay image by exact path
  Future<String> getOverlayUrl(String path) async {
    try {
      final ref = _storage.ref(path);
      return await ref.getDownloadURL();
    } catch (e) {
      print('Error getting overlay URL: $e');
      return '';
    }
  }

  // 🔸 NEW: Used to list all overlays in a folder (like 'tryon_assets/hat')
  Future<List<String>> listOverlays(String folderPath) async {
    try {
      final ListResult result = await _storage.ref(folderPath).listAll();
      return Future.wait(result.items.map((ref) => ref.getDownloadURL()));
    } catch (e) {
      print('Error listing overlays in $folderPath: $e');
      return [];
    }
  }
}
