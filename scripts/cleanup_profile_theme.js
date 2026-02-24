// One-time cleanup script to remove profileTheme from all users.
// Usage:
// 1) Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON file.
// 2) npm i firebase-admin
// 3) node scripts/cleanup_profile_theme.js

const admin = require("firebase-admin");

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error(
    "Missing GOOGLE_APPLICATION_CREDENTIALS env var (path to service account JSON)."
  );
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();

async function cleanupProfileTheme() {
  console.log("Starting cleanup of users.profileTheme...");
  let lastDoc = null;
  let total = 0;

  while (true) {
    let query = db.collection("users").orderBy(admin.firestore.FieldPath.documentId()).limit(500);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }
    const snap = await query.get();
    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((doc) => {
      batch.update(doc.ref, { profileTheme: admin.firestore.FieldValue.delete() });
      total += 1;
    });

    await batch.commit();
    lastDoc = snap.docs[snap.docs.length - 1];
    console.log(`Processed ${total} users...`);
  }

  console.log("Cleanup complete.");
}

cleanupProfileTheme()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
