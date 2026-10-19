import express from "express";
import cors from "cors";
import admin from "firebase-admin";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ---- Firebase Admin init (guarded) ----
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
    ),
  });
}

const db = admin.firestore();

// ---- Simple internal auth for sync endpoints ----
function requireSyncKey(req, res, next) {
  const key = req.header("x-sync-key");
  if (!key || key !== process.env.SYNC_KEY) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  next();
}

/**
 * POST /internal/sync/store
 * Body:
 * {
 *   vendorId: 1,
 *   name: "ShafN",
 *   logoUrl: "https://...",
 *   lat: 50.94,
 *   lng: 6.96
 * }
 */
app.post("/internal/sync/store", requireSyncKey, async (req, res) => {
  try {
    const { vendorId, name, logoUrl, lat, lng } = req.body;

    if (vendorId === undefined || vendorId === null) {
      return res.status(400).json({ success: false, error: "vendorId required" });
    }

    const storeId = String(vendorId);

    const payload = {
      vendorId: Number(vendorId),
      name: String(name ?? "Store"),
      logoUrl: String(logoUrl ?? ""),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Only store geo if valid
    if (typeof lat === "number" && typeof lng === "number") {
      payload.geo = new admin.firestore.GeoPoint(lat, lng);
    }

    await db.collection("stores").doc(storeId).set(payload, { merge: true });
    return res.json({ success: true, storeId });
  } catch (e) {
    return res.status(500).json({ success: false, error: String(e) });
  }
});

/**
 * POST /internal/sync/promotion
 * Body:
 * {
 *   promoId: "promo_123",     // or numeric, but will be string
 *   storeId: 1,              // vendorId
 *   storeName: "ShafN",
 *   title: "...",
 *   description: "...",
 *   imageUrl: "...",
 *   startsAt: "2025-12-20T00:00:00.000Z",
 *   endsAt: "2025-12-30T00:00:00.000Z"
 * }
 */
app.post("/internal/sync/promotion", requireSyncKey, async (req, res) => {
  try {
    const {
      promoId,
      storeId,
      storeName,
      title,
      description,
      imageUrl,
      startsAt,
      endsAt,
    } = req.body;

    if (!promoId) return res.status(400).json({ success: false, error: "promoId required" });
    if (storeId === undefined || storeId === null) {
      return res.status(400).json({ success: false, error: "storeId required" });
    }

    const id = String(promoId);
    const storeIdStr = String(storeId);

    const payload = {
      storeId: storeIdStr,
      storeName: String(storeName ?? ""),
      title: String(title ?? "Promotion"),
      description: String(description ?? ""),
      imageUrl: String(imageUrl ?? ""),
      startsAt: startsAt ? admin.firestore.Timestamp.fromDate(new Date(startsAt)) : null,
      endsAt: endsAt ? admin.firestore.Timestamp.fromDate(new Date(endsAt)) : null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Clean nulls so Firestore queries don't get weird
    Object.keys(payload).forEach((k) => payload[k] === null && delete payload[k]);

    await db.collection("store_promotions").doc(id).set(payload, { merge: true });
    return res.json({ success: true, promoId: id });
  } catch (e) {
    return res.status(500).json({ success: false, error: String(e) });
  }
});

/**
 * DELETE /internal/sync/promotion/:promoId
 */
app.delete("/internal/sync/promotion/:promoId", requireSyncKey, async (req, res) => {
  try {
    const { promoId } = req.params;
    await db.collection("store_promotions").doc(String(promoId)).delete();
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: String(e) });
  }
});

const port = process.env.PORT || 5050;
app.listen(port, () => console.log(`Sync service running on :${port}`));
