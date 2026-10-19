/* eslint-disable max-len, require-jsdoc */
const {randomBytes} = require("crypto");
const {HttpsError} = require("firebase-functions/v2/https");
const {Timestamp} = require("firebase-admin/firestore");

const WEEK = 7 * 24 * 60 * 60 * 1000;
const token = () => randomBytes(16).toString("hex").toUpperCase();
const fail = (code, message) => {
  throw new HttpsError(code, message);
};
const memberIds = (d) => [...new Set([d.uid, ...(d.participants || []), ...(d.collaborators || [])])].filter((v) => typeof v === "string" && v);
const memberships = (owner, ids) => ({participants: ids, collaborators: ids.filter((v) => v !== owner), participantMap: Object.fromEntries(ids.map((v) => [v, true]))});
const response = (ref, d) => ({docId: ref.id, code: d.code || ref.id, ownerUid: d.uid, list: d.list || [], revision: d.revision || 0});
function validList(list) {
  if (!Array.isArray(list) || list.length > 500 || Buffer.byteLength(JSON.stringify(list)) > 200000 ||
      list.some((item) => !item || typeof item !== "object" || Array.isArray(item) || typeof item.title !== "string" || item.title.length > 500)) {
    fail("invalid-argument", "Use at most 500 grocery items with valid titles.");
  }
  return list;
}
function validId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{6,128}$/.test(value);
}
async function blocked(tx, db, a, b) {
  if (a === b) return false;
  const docs = await tx.getAll(db.doc(`users/${a}/blockedUsers/${b}`), db.doc(`users/${b}/blockedUsers/${a}`));
  return docs.some((d) => d.exists);
}

// All membership changes are server-authorized. Direct Firestore writes are denied.
async function handleGroceryCollaboration(db, request) {
  const auth = request.auth;
  if (!auth || !auth.uid || (auth.token && auth.token.firebase && auth.token.firebase.sign_in_provider === "anonymous")) {
    fail("unauthenticated", "Please sign in to collaborate.");
  }
  const uid = auth.uid;
  const input = request.data || {};
  const action = input.action;
  if (!["create", "join", "open", "update", "leave", "renew"].includes(action)) fail("invalid-argument", "Unknown collaboration action.");
  if (action === "create") {
    const list = validList(input.list);
    const ref = db.collection("grocery_shares").doc();
    const code = token();
    const now = Timestamp.now();
    const data = {uid, creatorUid: uid, code, list, revision: 0, ...memberships(uid, [uid]), createdAt: now, updatedAt: now, updatedBy: uid, expiresAt: Timestamp.fromMillis(now.toMillis() + WEEK)};
    const batch = db.batch();
    batch.create(ref, data);
    // create, never overwrite: even a cryptographic collision cannot replace an invite.
    batch.create(db.doc(`grocery_invites/${code}`), {shareId: ref.id, expiresAt: data.expiresAt});
    await batch.commit();
    return response(ref, data);
  }

  if (action === "join") {
    // Count failed attempts too; use a separate transaction so failures do not roll back the limit.
    const limit = db.doc(`grocery_invite_attempts/${uid}`);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(limit);
      const old = snap.data() || {};
      const now = Date.now();
      const sameWindow = typeof old.start === "number" && now - old.start < 3600000;
      const count = sameWindow ? old.count || 0 : 0;
      if (count >= 30) fail("resource-exhausted", "Too many invite attempts. Try again later.");
      tx.set(limit, {start: sameWindow ? old.start : now, count: count + 1});
    });
  }

  return db.runTransaction(async (tx) => {
    let ref;
    let invitation;
    if (action === "join") {
      const code = typeof input.code === "string" ? input.code.trim().toUpperCase() : "";
      if (!/^(?:[A-Z0-9]{6}|[A-F0-9]{32})$/.test(code)) fail("invalid-argument", "Enter a valid invitation code or link.");
      const invite = await tx.get(db.doc(`grocery_invites/${code}`));
      if (invite.exists) {
        invitation = invite.data();
        ref = db.doc(`grocery_shares/${invitation.shareId}`);
      } else if (code.length === 6) {
        // Existing members can reopen legacy lists. Old low-entropy codes cannot admit new members.
        ref = db.doc(`grocery_shares/${code}`);
      } else {
        fail("not-found", "This invitation is invalid or has been replaced.");
      }
    } else {
      if (!validId(input.shareId)) fail("invalid-argument", "Invalid collaboration.");
      ref = db.doc(`grocery_shares/${input.shareId}`);
    }
    const snap = await tx.get(ref);
    if (!snap.exists) fail("not-found", "This collaboration no longer exists.");
    const data = snap.data();
    const ids = memberIds(data);
    const isMember = ids.includes(uid);
    if (action === "join" && !isMember) {
      if (!invitation || !invitation.expiresAt || invitation.expiresAt.toMillis() <= Date.now()) {
        fail("failed-precondition", "This invitation has expired. Ask the owner for a new link.");
      }
      if (data.code !== input.code.trim().toUpperCase()) fail("not-found", "This invitation has been replaced.");
      if (ids.length >= 50) fail("resource-exhausted", "This collaboration is full.");
      // Do not join a group containing anyone who blocked you or whom you blocked.
      for (const other of ids) {
        if (await blocked(tx, db, uid, other)) fail("permission-denied", "You cannot join this collaboration.");
      }
      const patch = memberships(data.uid, [...ids, uid]);
      tx.update(ref, patch);
      return response(ref, {...data, ...patch});
    }
    if (!isMember) fail("permission-denied", "You are not a member of this collaboration.");
    if (action === "leave") {
      if (data.uid === uid) {
        tx.delete(ref);
        if (/^[A-F0-9]{32}$/.test(data.code || "")) tx.delete(db.doc(`grocery_invites/${data.code}`));
      } else {
        tx.update(ref, memberships(data.uid, ids.filter((v) => v !== uid)));
      }
      return {left: true, deleted: data.uid === uid};
    }
    if (await blocked(tx, db, uid, data.uid)) fail("permission-denied", "This collaboration is unavailable.");
    if (action === "renew") {
      if (data.uid !== uid) fail("permission-denied", "Only the owner can replace an invitation.");
      const code = token();
      const expiresAt = Timestamp.fromMillis(Date.now() + WEEK);
      tx.create(db.doc(`grocery_invites/${code}`), {shareId: ref.id, expiresAt});
      if (/^[A-F0-9]{32}$/.test(data.code || "")) tx.delete(db.doc(`grocery_invites/${data.code}`));
      tx.update(ref, {code, expiresAt});
      return response(ref, {...data, code});
    }
    if (action === "update") {
      if (!Number.isSafeInteger(input.revision) || input.revision !== (data.revision || 0)) {
        fail("aborted", "Another collaborator changed this list. Refresh before saving again.");
      }
      const list = validList(input.list);
      const revision = (data.revision || 0) + 1;
      tx.update(ref, {list, revision, updatedAt: Timestamp.now(), updatedBy: uid});
      return response(ref, {...data, list, revision});
    }
    return response(ref, data);
  });
}
module.exports = {handleGroceryCollaboration};
