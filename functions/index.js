/**
 * Cloud Functions (2nd gen) for EaseSpotter
 * Handles notifications for Messages, Comments, and Reactions.
 */

const {
  onDocumentCreated,
  onDocumentUpdated,
} = require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

// --- Helpers ---

/**
 * Create a short preview of text.
 * @param {string} text - The message text.
 * @param {number} max - Maximum length.
 * @return {string} Preview.
 */
function preview(text, max) {
  const raw = String(text || "").trim();
  if (raw.length <= max) return raw;
  return raw.slice(0, max - 1) + "…";
}

/**
 * Fetch a user's display info.
 * @param {string} uid - The user ID.
 * @return {Promise<Object>} { name, avatarUrl }
 */
async function getActorInfo(uid) {
  try {
    const snap = await db.collection("users").doc(uid).get();
    if (!snap.exists) {
      return {name: "Someone", avatarUrl: null};
    }
    const data = snap.data() || {};
    let name = "Someone";

    if (data.handle) {
      name = "@" + data.handle.replace("@", "");
    } else if (data.displayName) {
      name = data.displayName;
    }

    return {
      name: name,
      avatarUrl: data.avatarUrl || null,
    };
  } catch (e) {
    console.error("Error fetching user info:", e);
    return {name: "Someone", avatarUrl: null};
  }
}

/**
 * Write a notification to a user's subcollection.
 * @param {string} recipientUid - Target user.
 * @param {Object} payload - Notification data.
 * @return {Promise<void>}
 */
async function sendNotification(recipientUid, payload) {
  if (!recipientUid) return;
  try {
    await db.collection("users")
        .doc(recipientUid)
        .collection("notifications")
        .add({
          ...payload,
          createdAt: FieldValue.serverTimestamp(),
          isRead: false,
        });
  } catch (e) {
    console.error("Error sending notification:", e);
  }
}

/**
 * Read followed store IDs for a user.
 * @param {string} uid User ID.
 * @return {Promise<Set<string>>} Followed store IDs.
 */
async function getFollowedStoreIds(uid) {
  try {
    const snap = await db.collection("users")
        .doc(uid)
        .collection("followedStores")
        .limit(40)
        .get();

    return new Set(snap.docs
        .map((doc) => {
          const data = doc.data() || {};
          return String(data.storeId || data.vendorId || doc.id).trim();
        })
        .filter((id) => id));
  } catch (e) {
    console.error("Error fetching followed stores:", uid, e);
    return new Set();
  }
}

/**
 * Read top collaborator IDs for a user.
 * @param {string} uid User ID.
 * @return {Promise<Set<string>>} Top collaborator IDs.
 */
async function getTopCollaboratorIds(uid) {
  try {
    const snap = await db.collection("users")
        .doc(uid)
        .collection("top_collaborators")
        .limit(20)
        .get();
    return new Set(snap.docs.map((doc) => doc.id));
  } catch (e) {
    console.error("Error fetching top collaborators:", uid, e);
    return new Set();
  }
}

/**
 * Build and store people recommendations for one user.
 * @param {string} uid User ID.
 * @param {Array<FirebaseFirestore.QueryDocumentSnapshot>} userDocs Users.
 * @return {Promise<void>}
 */
async function rebuildRecommendationsForUser(uid, userDocs) {
  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists) return;

  const userData = userSnap.data() || {};
  const following = new Set(Array.isArray(userData.following) ?
    userData.following : []);
  const topCollaborators = await getTopCollaboratorIds(uid);
  const myStoreIds = await getFollowedStoreIds(uid);
  const excluded = new Set([uid, ...following, ...topCollaborators]);

  const candidates = [];

  for (const doc of userDocs) {
    if (excluded.has(doc.id)) continue;

    const data = doc.data() || {};
    if (data.publicProfile === false) continue;

    const displayName = String(data.displayName || "").trim();
    const rawHandle = String(data.handle || data.socialHandle || "").trim();
    const handle = rawHandle.replace(/^@+/, "");
    const avatarUrl = String(data.avatarUrl || "").trim();
    if (!displayName && !handle) continue;

    let score = 0;
    const reasons = [];

    if (avatarUrl) score += 2;
    if (handle) score += 1;
    if (displayName) score += 1;

    if (myStoreIds.size > 0) {
      // eslint-disable-next-line no-await-in-loop
      const candidateStores = await getFollowedStoreIds(doc.id);
      let sharedStores = 0;
      for (const storeId of myStoreIds) {
        if (candidateStores.has(storeId)) sharedStores++;
      }
      if (sharedStores > 0) {
        score += 3 + Math.min(sharedStores, 3);
        reasons.push(sharedStores === 1 ?
          "Shared store" :
          `${sharedStores} shared stores`);
      }
    }

    if (reasons.length === 0) {
      reasons.push(handle ? "Active profile" : "Suggested profile");
    }

    candidates.push({
      uid: doc.id,
      displayName: displayName || `@${handle}`,
      handle: handle,
      avatarUrl: avatarUrl,
      score: score,
      reasons: reasons,
    });
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.displayName.toLowerCase()
        .localeCompare(b.displayName.toLowerCase());
  });

  const top = candidates.slice(0, 10);
  const recRef = db.collection("users").doc(uid).collection("recommendations");
  const existing = await recRef.get();
  const batch = db.batch();

  existing.docs.forEach((doc) => batch.delete(doc.ref));
  top.forEach((item) => {
    batch.set(recRef.doc(item.uid), {
      ...item,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();
}

/**
 * Scheduled version-two people recommendation rebuild.
 */
exports.rebuildPeopleRecommendations = onSchedule(
    "every 24 hours",
    async () => {
      const usersSnap = await db.collection("users").limit(200).get();
      const userDocs = usersSnap.docs;

      for (const doc of userDocs) {
        // eslint-disable-next-line no-await-in-loop
        await rebuildRecommendationsForUser(doc.id, userDocs);
      }
    },
);

// --- Messages ---

/**
 * Trigger: New Message in Conversation
 */
exports.onMessageCreateNotifyRecipient = onDocumentCreated(
    "conversations/{conversationId}/messages/{messageId}",
    async (event) => {
      const snap = event.data;
      if (!snap) return;

      const message = snap.data() || {};
      const conversationId = event.params.conversationId;
      const senderId = message.senderId;
      const text = message.text;

      if (!senderId) return;

      // Get Conversation to find recipients
      const convoSnap = await db.collection("conversations")
          .doc(conversationId)
          .get();
      if (!convoSnap.exists) return;

      const convo = convoSnap.data();
      let participants = [];

      if (Array.isArray(convo.participants)) {
        participants = convo.participants;
      } else if (convo.participantMap) {
        participants = Object.keys(convo.participantMap);
      }

      // Filter out sender
      const recipients = participants.filter((uid) => uid !== senderId);
      if (recipients.length === 0) return;

      // Get Sender Info
      const actor = await getActorInfo(senderId);
      const msgPreview = preview(text, 140);
      const notifMessage = msgPreview ?
      `New message: ${msgPreview}` :
      "New message";

      // Send to all recipients
      const batch = db.batch();
      recipients.forEach((uid) => {
        const ref = db.collection("users")
            .doc(uid)
            .collection("notifications")
            .doc();
        batch.set(ref, {
          type: "message",
          actorUid: senderId,
          actorName: actor.name,
          actorAvatarUrl: actor.avatarUrl,
          itemType: "conversation",
          itemId: conversationId,
          message: notifMessage,
          createdAt: FieldValue.serverTimestamp(),
          isRead: false,
        });
      });

      await batch.commit();
    },
);

// --- Comments ---

/**
 * Trigger: New Comment on Glow-Up
 */
exports.onGlowUpComment = onDocumentCreated(
    "glowups/{glowUpId}/comments/{commentId}",
    async (event) => {
      const snap = event.data;
      if (!snap) return;

      const comment = snap.data();
      const glowUpId = event.params.glowUpId;
      const authorUid = comment.uid; // Commenter

      // Get Parent Glow-Up
      const glowSnap = await db.collection("glowups").doc(glowUpId).get();
      if (!glowSnap.exists) return;

      const glowData = glowSnap.data();
      // GlowUps usually use 'uid' or 'authorUid' for the owner
      const ownerUid = glowData.authorUid || glowData.uid;

      if (!ownerUid || ownerUid === authorUid) return;

      const actor = await getActorInfo(authorUid);
      const textPreview = preview(comment.text, 50);

      await sendNotification(ownerUid, {
        type: "comment",
        actorUid: authorUid,
        actorName: actor.name,
        actorAvatarUrl: actor.avatarUrl,
        itemType: "glowup",
        itemId: glowUpId,
        message: `${actor.name} commented on your glow-up: "${textPreview}"`,
      });
    },
);

/**
 * Trigger: New Comment on Recipe
 */
exports.onRecipeComment = onDocumentCreated(
    "recipes/{recipeId}/comments/{commentId}",
    async (event) => {
      const snap = event.data;
      if (!snap) return;

      const comment = snap.data();
      const recipeId = event.params.recipeId;
      const authorUid = comment.uid;

      const recipeSnap = await db.collection("recipes").doc(recipeId).get();
      if (!recipeSnap.exists) return;

      const recipeData = recipeSnap.data();
      const ownerUid = recipeData.uid; // Recipes usually use 'uid'

      if (!ownerUid || ownerUid === authorUid) return;

      const actor = await getActorInfo(authorUid);
      const textPreview = preview(comment.text, 50);

      await sendNotification(ownerUid, {
        type: "comment",
        actorUid: authorUid,
        actorName: actor.name,
        actorAvatarUrl: actor.avatarUrl,
        itemType: "recipe",
        itemId: recipeId,
        message: `${actor.name} commented on your recipe: "${textPreview}"`,
      });
    },
);

/**
 * Trigger: New Comment on Reel
 */
exports.onReelComment = onDocumentCreated(
    "reels/{reelId}/comments/{commentId}",
    async (event) => {
      const snap = event.data;
      if (!snap) return;

      const comment = snap.data();
      const reelId = event.params.reelId;
      const authorUid = comment.uid;

      const reelSnap = await db.collection("reels").doc(reelId).get();
      if (!reelSnap.exists) return;

      const reelData = reelSnap.data();
      const ownerUid = reelData.authorUid || reelData.uid;

      if (!ownerUid || ownerUid === authorUid) return;

      const actor = await getActorInfo(authorUid);
      const textPreview = preview(comment.text, 50);

      await sendNotification(ownerUid, {
        type: "comment",
        actorUid: authorUid,
        actorName: actor.name,
        actorAvatarUrl: actor.avatarUrl,
        itemType: "reel",
        itemId: reelId,
        message: `${actor.name} commented on your reel: "${textPreview}"`,
      });
    },
);

/**
 * Trigger: New Comment on Shopping Wall Post
 */
exports.onShoppingWallComment = onDocumentCreated(
    "shopping_wall/{postId}/comments/{commentId}",
    async (event) => {
      const snap = event.data;
      if (!snap) return;

      const comment = snap.data();
      const postId = event.params.postId;
      const authorUid = comment.uid;

      const postSnap = await db.collection("shopping_wall").doc(postId).get();
      if (!postSnap.exists) return;

      const postData = postSnap.data();
      // Shopping wall items usually use 'creatorUid' or 'uid'
      const ownerUid = postData.creatorUid || postData.uid;

      if (!ownerUid || ownerUid === authorUid) return;

      const actor = await getActorInfo(authorUid);
      const textPreview = preview(comment.text, 50);

      await sendNotification(ownerUid, {
        type: "comment",
        actorUid: authorUid,
        actorName: actor.name,
        actorAvatarUrl: actor.avatarUrl,
        itemType: "shopping_wall",
        itemId: postId,
        message: `${actor.name} commented on your post: "${textPreview}"`,
      });
    },
);

// --- Reactions ---

/**
 * Trigger: Glow-Up Reaction (Update on likedBy array)
 */
exports.onGlowUpReaction = onDocumentUpdated(
    "glowups/{glowUpId}",
    async (event) => {
      const beforeData = event.data.before.data() || {};
      const afterData = event.data.after.data() || {};

      const beforeLikes = new Set(beforeData.likedBy || []);
      const afterLikes = afterData.likedBy || [];

      // Find who was added
      const addedUids = afterLikes.filter((uid) => !beforeLikes.has(uid));

      if (addedUids.length === 0) return;

      const ownerUid = afterData.authorUid || afterData.uid;
      // If no owner or owner is the one reacting (unlikely but possible), skip
      if (!ownerUid) return;

      // Notify for each new like
      // (Usually only 1 at a time, but batch logic is safer)
      const batch = db.batch();
      let hasWrites = false;

      for (const actorUid of addedUids) {
        if (actorUid === ownerUid) continue;

        // eslint-disable-next-line no-await-in-loop
        const actor = await getActorInfo(actorUid);

        const ref = db.collection("users")
            .doc(ownerUid)
            .collection("notifications")
            .doc();

        batch.set(ref, {
          type: "reaction",
          actorUid: actorUid,
          actorName: actor.name,
          actorAvatarUrl: actor.avatarUrl,
          itemType: "glowup",
          itemId: event.params.glowUpId,
          message: `${actor.name} liked your glow-up`,
          createdAt: FieldValue.serverTimestamp(),
          isRead: false,
        });
        hasWrites = true;
      }

      if (hasWrites) {
        await batch.commit();
      }
    },
);
