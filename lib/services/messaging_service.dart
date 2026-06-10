import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class MessagingService {
  final _db = FirebaseFirestore.instance;
  final _auth = FirebaseAuth.instance;

  static const friendOnlyMessage =
      "You can only message people when you both follow each other.";

  // -----------------------------------
  // Conversation helpers
  // -----------------------------------
  String buildConversationId(String uidA, String uidB) {
    final pair = [uidA, uidB]..sort();
    return "${pair[0]}_${pair[1]}";
  }

  Future<String> ensureConversation({required String otherUid}) async {
    final me = _auth.currentUser;
    if (me == null) throw Exception("Not signed in");
    if (me.uid == otherUid) throw Exception("You cannot message yourself");

    final areFriends = await canMessage(otherUid: otherUid);
    if (!areFriends) throw Exception(friendOnlyMessage);

    final convoId = buildConversationId(me.uid, otherUid);
    final convoRef = _db.collection('conversations').doc(convoId);

    final existing = await convoRef.get();
    if (existing.exists) {
      final data = existing.data() ?? {};
      final pm =
          (data['participantMap'] as Map?)?.cast<String, dynamic>() ?? {};
      final participants =
          (data['participants'] as List?)?.cast<String>() ?? [];

      final needsFix =
          pm[me.uid] != true ||
          pm[otherUid] != true ||
          !participants.contains(me.uid) ||
          !participants.contains(otherUid);

      if (needsFix) {
        await convoRef.set({
          'participants': [me.uid, otherUid],
          'participantMap': {me.uid: true, otherUid: true},
          'updatedAt': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true));
      }

      return convoId;
    }

    final now = FieldValue.serverTimestamp();

    final convoData = {
      "participants": [me.uid, otherUid],
      "participantMap": {me.uid: true, otherUid: true},
      "lastMessage": "",
      "lastSenderId": "",
      "lastMessageAt": now,
      "createdAt": now,
      "updatedAt": now,
    };

    final myInboxRef = _db
        .collection("users")
        .doc(me.uid)
        .collection("inbox")
        .doc(convoId);
    final otherInboxRef = _db
        .collection("users")
        .doc(otherUid)
        .collection("inbox")
        .doc(convoId);

    final batch = _db.batch();
    batch.set(convoRef, convoData, SetOptions(merge: true));

    batch.set(myInboxRef, {
      "conversationId": convoId,
      "otherUid": otherUid,
      "lastMessage": "",
      "lastMessageAt": now,
      "unreadCount": 0,
    }, SetOptions(merge: true));

    batch.set(otherInboxRef, {
      "conversationId": convoId,
      "otherUid": me.uid,
      "lastMessage": "",
      "lastMessageAt": now,
      "unreadCount": 0,
    }, SetOptions(merge: true));

    await batch.commit();
    return convoId;
  }

  // -----------------------------------
  // Send message (WITH seen + reactions init + replyTo)
  // -----------------------------------
  Future<void> sendTextMessage({
    required String convoId,
    required String otherUid,
    required String text,

    // ✅ NEW: reply args
    String? replyToMessageId,
    String? replyToText,
    String? replyToSenderId,
  }) async {
    final me = _auth.currentUser;
    if (me == null) throw Exception("Not logged in");
    final myUid = me.uid;

    if (text.trim().isEmpty) return;

    final areFriends = await canMessage(otherUid: otherUid);
    if (!areFriends) throw Exception(friendOnlyMessage);

    final convoRef = _db.collection('conversations').doc(convoId);
    final doc = await convoRef.get();
    if (!doc.exists) {
      throw Exception(
        "Conversation does not exist. Call ensureConversation() first.",
      );
    }

    final msgRef = convoRef.collection('messages').doc();
    final now = FieldValue.serverTimestamp();

    final myInboxRef = _db
        .collection('users')
        .doc(myUid)
        .collection('inbox')
        .doc(convoId);
    final otherInboxRef = _db
        .collection('users')
        .doc(otherUid)
        .collection('inbox')
        .doc(convoId);

    await _db.runTransaction((tx) async {
      // Conversation summary
      tx.update(convoRef, {
        'updatedAt': now,
        'lastMessage': text.trim(),
        'lastMessageAt': now,
        'lastSenderId': myUid,
      });

      // ✅ Message document (replyTo added per your spec)
      final msgData = <String, dynamic>{
        'senderId': myUid,
        'text': text.trim(),
        'type': 'text',
        'createdAt': now,

        // Seen state
        'seenBy': {myUid: true},

        // Reactions (new)
        'userReactions': {}, // { uid: "❤️" }
        'reactionCounts': {}, // { "❤️": 3 }
      };

      if ((replyToMessageId ?? '').isNotEmpty &&
          (replyToText ?? '').isNotEmpty) {
        msgData['replyTo'] = {
          'messageId': replyToMessageId,
          'text': replyToText,
          'senderId': replyToSenderId ?? '',
        };
      }

      tx.set(msgRef, msgData);

      // My inbox
      tx.set(myInboxRef, {
        'conversationId': convoId,
        'otherUid': otherUid,
        'lastMessage': text.trim(),
        'lastMessageAt': now,
        'unreadCount': 0,
        'updatedAt': now,
      }, SetOptions(merge: true));

      // Other user's inbox
      tx.set(otherInboxRef, {
        'conversationId': convoId,
        'otherUid': myUid,
        'lastMessage': text.trim(),
        'lastMessageAt': now,
        'unreadCount': FieldValue.increment(1),
        'updatedAt': now,
      }, SetOptions(merge: true));
    });
  }

  Future<bool> canMessage({required String otherUid}) async {
    final me = _auth.currentUser;
    if (me == null || otherUid.trim().isEmpty || me.uid == otherUid) {
      return false;
    }

    final myDoc = await _db.collection('users').doc(me.uid).get();
    final otherDoc = await _db.collection('users').doc(otherUid).get();
    final myFollowing = List<String>.from(
      myDoc.data()?['following'] ?? const [],
    );
    final otherFollowing = List<String>.from(
      otherDoc.data()?['following'] ?? const [],
    );

    return myFollowing.contains(otherUid) && otherFollowing.contains(me.uid);
  }

  // -----------------------------------
  // Streams
  // -----------------------------------
  Stream<QuerySnapshot<Map<String, dynamic>>> inboxStream() {
    final me = _auth.currentUser;
    if (me == null) return const Stream.empty();
    return _db
        .collection('users')
        .doc(me.uid)
        .collection('inbox')
        .orderBy('lastMessageAt', descending: true)
        .snapshots();
  }

  Stream<QuerySnapshot<Map<String, dynamic>>> messagesStream(String convoId) {
    return _db
        .collection('conversations')
        .doc(convoId)
        .collection('messages')
        .orderBy('createdAt', descending: false)
        .snapshots();
  }

  // -----------------------------------
  // Seen logic (✓✓)
  // -----------------------------------
  Future<void> markChatRead({required String convoId}) async {
    final me = _auth.currentUser;
    if (me == null) return;

    await _db
        .collection('users')
        .doc(me.uid)
        .collection('inbox')
        .doc(convoId)
        .set({'unreadCount': 0}, SetOptions(merge: true));
  }

  /// Mark recent messages from the other user as seen
  Future<void> markMessagesSeen({
    required String convoId,
    required String otherUid,
    int limit = 60,
  }) async {
    final me = _auth.currentUser;
    if (me == null) return;

    await markChatRead(convoId: convoId);

    final msgsRef = _db
        .collection('conversations')
        .doc(convoId)
        .collection('messages');

    final snap =
        await msgsRef
            .where('senderId', isEqualTo: otherUid)
            .orderBy('createdAt', descending: true)
            .limit(limit)
            .get();

    if (snap.docs.isEmpty) return;

    final batch = _db.batch();

    for (final d in snap.docs) {
      final data = d.data();
      final seenBy = (data['seenBy'] as Map?)?.cast<String, dynamic>() ?? {};
      if (seenBy[me.uid] == true) continue;

      batch.set(d.reference, {
        'seenBy': {me.uid: true},
      }, SetOptions(merge: true));
    }

    await batch.commit();
  }

  // -----------------------------------
  // Reactions (1 per user)
  // -----------------------------------
  Future<void> toggleReaction({
    required String convoId,
    required String messageId,
    required String emoji,
    bool removeOnly = false,
  }) async {
    final me = _auth.currentUser;
    if (me == null) throw Exception("Not logged in");

    final uid = me.uid;

    final msgRef = _db
        .collection('conversations')
        .doc(convoId)
        .collection('messages')
        .doc(messageId);

    await _db.runTransaction((tx) async {
      final snap = await tx.get(msgRef);
      if (!snap.exists) return;

      final data = snap.data() ?? {};
      final userReactions =
          (data['userReactions'] as Map?)?.cast<String, dynamic>() ?? {};
      final current =
          (userReactions[uid] is String)
              ? (userReactions[uid] as String).trim()
              : '';

      // remove if: removeOnly OR tapping same emoji
      final removing = removeOnly || (current.isNotEmpty && current == emoji);

      final updates = <String, dynamic>{};

      if (removing) {
        // IMPORTANT: do NOT delete field; set empty string so userReactions stays a map
        updates['userReactions.$uid'] = '';

        if (current.isNotEmpty) {
          updates['reactionCounts.$current'] = FieldValue.increment(-1);
        }
      } else {
        // switching reaction
        if (current.isNotEmpty && current != emoji) {
          updates['reactionCounts.$current'] = FieldValue.increment(-1);
        }

        // set new reaction
        updates['userReactions.$uid'] = emoji;
        updates['reactionCounts.$emoji'] = FieldValue.increment(1);
      }

      // update satisfies your rules: only userReactions + reactionCounts changed
      tx.update(msgRef, updates);
    });
  }

  // -----------------------------------
  // Repair helper
  // -----------------------------------
  Future<void> repairConversationById({
    required String convoId,
    required String otherUid,
  }) async {
    final me = _auth.currentUser;
    if (me == null) throw Exception("Not signed in");

    final convoRef = _db.collection('conversations').doc(convoId);
    await convoRef.set({
      'participants': [me.uid, otherUid],
      'participantMap': {me.uid: true, otherUid: true},
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }
}
