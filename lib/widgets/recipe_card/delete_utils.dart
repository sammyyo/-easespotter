import 'package:cloud_firestore/cloud_firestore.dart';
// OPTIONAL: storage deletion
// import 'package:firebase_storage/firebase_storage.dart' as fb_storage;

Future<void> deleteRecipeCascade({required String recipeId, String? imageUrl}) async {
  final recipesRef = FirebaseFirestore.instance.collection('recipes').doc(recipeId);

  // 1) Delete comments (and replies) in batches
  const pageSize = 300;
  while (true) {
    final snap = await recipesRef.collection('comments').limit(pageSize).get();
    if (snap.docs.isEmpty) break;

    // delete replies per comment
    for (final commentDoc in snap.docs) {
      const subPage = 300;
      while (true) {
        final replies = await commentDoc.reference.collection('replies').limit(subPage).get();
        if (replies.docs.isEmpty) break;
        final subBatch = FirebaseFirestore.instance.batch();
        for (final r in replies.docs) {
          subBatch.delete(r.reference);
        }
        await subBatch.commit();
      }
    }

    final batch = FirebaseFirestore.instance.batch();
    for (final d in snap.docs) {
      batch.delete(d.reference);
    }
    await batch.commit();
  }

  // 2) Delete the recipe document
  await recipesRef.delete();

  // 3) OPTIONAL: delete the image file in Storage
  // if (imageUrl != null && imageUrl.isNotEmpty) {
  //   try {
  //     await fb_storage.FirebaseStorage.instance.refFromURL(imageUrl).delete();
  //   } catch (_) {}
  // }
}
