import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../services/messaging_service.dart';

class ChatScreen extends StatefulWidget {
  final String conversationId;
  final String otherUid;
  final String? otherDisplayName;

  const ChatScreen({
    super.key,
    required this.conversationId,
    required this.otherUid,
    this.otherDisplayName,
  });

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final MessagingService _messaging = MessagingService();
  final TextEditingController _controller = TextEditingController();
  final ScrollController _scroll = ScrollController();

  String? _otherAvatarUrl;
  String? _myAvatarUrl;

  // ---- Typing indicator state ----
  Timer? _typingDebounce;
  Timer? _typingDotsTimer;
  int _dotPhase = 0;
  bool _sentTypingTrue = false;

  // ---- Seen batching / debounce ----
  Timer? _seenDebounce;

  // ---- Sticky day header ----
  String _stickyDayLabel = '';
  Timer? _stickyThrottle;
  final Map<String, GlobalKey> _dayHeaderKeys = {}; // dateKey -> key
  List<String> _dayKeysInOrder = []; // same order as in list (top->bottom)

  // ---- Reply state (swipe-to-reply OR menu reply) ----
  String? _replyToMessageId;
  String? _replyToText;
  String? _replyToSenderId;

  String? get _myUid => FirebaseAuth.instance.currentUser?.uid;

  DocumentReference<Map<String, dynamic>> get _convoRef => FirebaseFirestore
      .instance
      .collection('conversations')
      .doc(widget.conversationId);

  // -------------------------
  // Reply helpers
  // -------------------------
  void _startReplyTo({
    required String messageId,
    required String text,
    required String senderId,
  }) {
    setState(() {
      _replyToMessageId = messageId;
      _replyToText = text;
      _replyToSenderId = senderId;
    });
  }

  void _clearReply() {
    setState(() {
      _replyToMessageId = null;
      _replyToText = null;
      _replyToSenderId = null;
    });
  }

  // -------------------------
  // Reactions → avatars helpers
  // -------------------------

  /// Build: emoji -> list of userIds who reacted with that emoji
  Map<String, List<String>> _uidsByEmoji(Map<String, dynamic> msg) {
    final ur = (msg['userReactions'] as Map?)?.cast<String, dynamic>() ?? {};
    final out = <String, List<String>>{};

    for (final e in ur.entries) {
      final uid = e.key;
      final emoji = (e.value is String) ? (e.value as String).trim() : '';
      if (uid.trim().isEmpty) continue;
      if (emoji.isEmpty) continue;

      out.putIfAbsent(emoji, () => <String>[]);
      out[emoji]!.add(uid);
    }

    // Sort deterministically (optional)
    for (final k in out.keys) {
      out[k]!.sort();
    }

    return out;
  }

  /// Fetch user docs for the given uids and return uid -> data
  Future<Map<String, Map<String, dynamic>>> _fetchUserProfiles(
    List<String> uids,
  ) async {
    final clean = uids.where((u) => u.trim().isNotEmpty).toSet().toList();
    if (clean.isEmpty) return {};

    final futures =
        clean.map((uid) async {
          final doc =
              await FirebaseFirestore.instance
                  .collection('users')
                  .doc(uid)
                  .get();
          final data = doc.data() ?? <String, dynamic>{};
          return MapEntry(uid, data);
        }).toList();

    final entries = await Future.wait(futures);
    return Map<String, Map<String, dynamic>>.fromEntries(entries);
  }

  /// UI: row of avatars for a given emoji
  Widget _buildReactionAvatarRow({
    required String emoji,
    required List<String> uids,
    required Map<String, Map<String, dynamic>> profiles,
    int maxShown = 12,
  }) {
    if (uids.isEmpty) return const SizedBox.shrink();

    final shown = uids.take(maxShown).toList();
    final remaining = uids.length - shown.length;

    return SizedBox(
      height: 40,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: shown.length + (remaining > 0 ? 1 : 0),
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          if (remaining > 0 && i == shown.length) {
            return CircleAvatar(
              radius: 18,
              backgroundColor: Colors.grey.shade300,
              child: Text(
                "+$remaining",
                style: const TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 12,
                ),
              ),
            );
          }

          final uid = shown[i];
          final data = profiles[uid] ?? {};
          final avatarUrl = (data['avatarUrl'] as String?)?.trim();
          final displayName = (data['displayName'] as String?)?.trim();
          final handle = (data['handle'] as String?)?.trim();

          final label =
              (displayName?.isNotEmpty == true)
                  ? displayName!
                  : (handle?.isNotEmpty == true)
                  ? handle!
                  : 'User';

          return Tooltip(
            message: "$emoji  $label",
            child: CircleAvatar(
              radius: 18,
              backgroundColor: Colors.grey.shade200,
              backgroundImage:
                  (avatarUrl != null && avatarUrl.isNotEmpty)
                      ? NetworkImage(avatarUrl)
                      : null,
              child:
                  (avatarUrl == null || avatarUrl.isEmpty)
                      ? const Icon(
                        Icons.person,
                        size: 18,
                        color: Colors.black54,
                      )
                      : null,
            ),
          );
        },
      ),
    );
  }

  /// Small avatar pill used instead of the "You" label
  Widget _myReactionAvatarPill() {
    final url = (_myAvatarUrl ?? '').trim();

    return Container(
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: Colors.deepPurple.withOpacity(0.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.deepPurple.withOpacity(0.25)),
      ),
      child: CircleAvatar(
        radius: 12,
        backgroundColor: Colors.grey.shade200,
        backgroundImage: url.isNotEmpty ? NetworkImage(url) : null,
        child:
            url.isEmpty
                ? const Icon(Icons.person, size: 14, color: Colors.black54)
                : null,
      ),
    );
  }

  void _openReactionDetailsSheet({
    required Map<String, dynamic> msg,
    required String messageId,
  }) {
    final counts = _reactionCounts(msg);
    if (counts.isEmpty) return;

    final entries =
        counts.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    final my = _myReaction(msg);

    // emoji -> [uids]
    final byEmoji = _uidsByEmoji(msg);

    // fetch all involved uids once
    final allUids = byEmoji.values.expand((x) => x).toSet().toList();

    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      builder: (_) {
        return SafeArea(
          child: FutureBuilder<Map<String, Map<String, dynamic>>>(
            future: _fetchUserProfiles(allUids),
            builder: (context, snap) {
              final profiles = snap.data ?? {};

              return Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text(
                      "Reactions",
                      style: TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 12),
                    if (snap.connectionState == ConnectionState.waiting)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(
                          children: const [
                            SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                            SizedBox(width: 10),
                            Text("Loading people…"),
                          ],
                        ),
                      ),

                    // Emoji sections
                    ...entries.map((e) {
                      final emoji = e.key;
                      final count = e.value;

                      final rawUids = byEmoji[emoji] ?? const <String>[];
                      // ✅ If I reacted with this emoji, hide my uid from the row to avoid duplicates
                      final uids =
                          (my == emoji && _myUid != null)
                              ? rawUids.where((id) => id != _myUid).toList()
                              : rawUids;

                      return Container(
                        margin: const EdgeInsets.only(bottom: 10),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade100,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: Colors.grey.shade200),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // Header row: emoji + count + (my avatar pill) if you picked it
                            InkWell(
                              borderRadius: BorderRadius.circular(12),
                              onTap: () async {
                                Navigator.pop(context);
                                try {
                                  await _messaging.toggleReaction(
                                    convoId: widget.conversationId,
                                    messageId: messageId,
                                    emoji: emoji,
                                  );
                                } catch (err) {
                                  if (!mounted) return;
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content: Text("Reaction failed: $err"),
                                    ),
                                  );
                                }
                              },
                              child: Row(
                                children: [
                                  Text(
                                    emoji,
                                    style: const TextStyle(fontSize: 22),
                                  ),
                                  const SizedBox(width: 10),
                                  Text(
                                    "$count",
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w900,
                                      fontSize: 14,
                                    ),
                                  ),
                                  const Spacer(),
                                  if (my == emoji) _myReactionAvatarPill(),
                                ],
                              ),
                            ),

                            // Avatars
                            if (uids.isNotEmpty) ...[
                              const SizedBox(height: 10),
                              _buildReactionAvatarRow(
                                emoji: emoji,
                                uids: uids,
                                profiles: profiles,
                              ),
                            ],
                          ],
                        ),
                      );
                    }),

                    const SizedBox(height: 6),

                    if (my != null)
                      TextButton.icon(
                        onPressed: () async {
                          Navigator.pop(context);
                          try {
                            await _messaging.toggleReaction(
                              convoId: widget.conversationId,
                              messageId: messageId,
                              emoji: my,
                              removeOnly: true,
                            );
                          } catch (err) {
                            if (!mounted) return;
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text("Remove failed: $err")),
                            );
                          }
                        },
                        icon: const Icon(Icons.remove_circle_outline),
                        label: const Text("Remove my reaction"),
                      ),

                    TextButton(
                      onPressed: () {
                        Navigator.pop(context);
                        _openReactionPicker(messageId: messageId, current: my);
                      },
                      child: const Text("Add / Change reaction"),
                    ),
                  ],
                ),
              );
            },
          ),
        );
      },
    );
  }

  Widget _animatedReactionChip(
    Map<String, dynamic> msg, {
    required String messageId,
  }) {
    final counts = _reactionCounts(msg);
    if (counts.isEmpty) return const SizedBox.shrink();

    final keys = counts.keys.toList()..sort();
    final signature = keys.map((k) => '$k:${counts[k]}').join('|');

    return TweenAnimationBuilder<double>(
      key: ValueKey('rx_$signature'),
      tween: Tween<double>(begin: 0.85, end: 1.0),
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOutBack,
      builder: (context, scale, child) {
        return AnimatedOpacity(
          opacity: 1.0,
          duration: const Duration(milliseconds: 120),
          child: Transform.scale(scale: scale, child: child),
        );
      },
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap:
              () => _openReactionDetailsSheet(msg: msg, messageId: messageId),
          child: _buildWhatsAppReactionChip(msg),
        ),
      ),
    );
  }

  // -------------------------
  // Message actions (react/copy/delete/reply)
  // -------------------------
  void _showMessageActions({
    required String messageId,
    required String text,
    required String senderId,
    required bool isMe,
    required String? myReaction,
  }) {
    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      builder: (_) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.emoji_emotions_outlined),
                title: const Text("React"),
                onTap: () {
                  Navigator.pop(context);
                  _openReactionPicker(
                    messageId: messageId,
                    current: myReaction,
                  );
                },
              ),
              ListTile(
                leading: const Icon(Icons.reply),
                title: const Text("Reply"),
                onTap: () {
                  Navigator.pop(context);
                  _startReplyTo(
                    messageId: messageId,
                    text: text,
                    senderId: senderId,
                  );
                },
              ),
              ListTile(
                leading: const Icon(Icons.copy),
                title: const Text("Copy"),
                onTap: () {
                  Clipboard.setData(ClipboardData(text: text));
                  Navigator.pop(context);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text("Copied to clipboard")),
                  );
                },
              ),
              if (isMe)
                ListTile(
                  leading: const Icon(Icons.delete, color: Colors.red),
                  title: const Text(
                    "Delete",
                    style: TextStyle(color: Colors.red),
                  ),
                  onTap: () async {
                    Navigator.pop(context);
                    await FirebaseFirestore.instance
                        .collection('conversations')
                        .doc(widget.conversationId)
                        .collection('messages')
                        .doc(messageId)
                        .delete();
                  },
                ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
  }

  // -------------------------
  // Time + day grouping helpers
  // -------------------------
  String _formatMessageTime(Timestamp? ts) {
    if (ts == null) return '';
    final dt = ts.toDate();
    final h = dt.hour.toString().padLeft(2, '0');
    final m = dt.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }

  String _weekday(int w) =>
      const ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][w - 1];

  String _month(int m) =>
      const [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ][m - 1];

  String _dayLabel(DateTime dt) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final msgDay = DateTime(dt.year, dt.month, dt.day);

    final diff = today.difference(msgDay).inDays;
    if (diff == 0) return 'Today';
    if (diff == 1) return 'Yesterday';
    return '${_weekday(dt.weekday)}, ${_month(dt.month)} ${dt.day}';
  }

  bool _isSameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  String _dayKey(DateTime dt) {
    final y = dt.year.toString().padLeft(4, '0');
    final m = dt.month.toString().padLeft(2, '0');
    final d = dt.day.toString().padLeft(2, '0');
    return '$y-$m-$d';
  }

  // -------------------------
  // Seen + ticks helpers
  // -------------------------
  bool _hasSeenBy(Map<String, dynamic> msg, String uid) {
    final seenBy = (msg['seenBy'] as Map?)?.cast<String, dynamic>();
    return seenBy?[uid] == true;
  }

  Widget _buildSeenTicks({
    required bool isMe,
    required Map<String, dynamic> msg,
    required Color color,
  }) {
    if (!isMe) return const SizedBox.shrink();
    final otherSeen = _hasSeenBy(msg, widget.otherUid);
    return Icon(
      otherSeen ? Icons.done_all : Icons.done,
      size: 14,
      color: otherSeen ? color : color.withOpacity(0.85),
    );
  }

  // -------------------------
  // Reactions helpers
  // -------------------------
  Map<String, int> _reactionCounts(Map<String, dynamic> msg) {
    final rc = (msg['reactionCounts'] as Map?)?.cast<String, dynamic>() ?? {};
    final out = <String, int>{};
    for (final e in rc.entries) {
      final k = e.key;
      final v = e.value;
      out[k] = (v is int) ? v : int.tryParse(v.toString()) ?? 0;
    }
    out.removeWhere((k, v) => v <= 0);
    return out;
  }

  String? _myReaction(Map<String, dynamic> msg) {
    final ur = (msg['userReactions'] as Map?)?.cast<String, dynamic>();
    final uid = _myUid;
    if (uid == null) return null;
    final v = ur?[uid];
    if (v is String && v.trim().isNotEmpty) return v.trim();
    return null;
  }

  Future<void> _openReactionPicker({
    required String messageId,
    required String? current,
  }) async {
    const emojis = ['❤️', '🔥', '👍', '😂', '😮', '😢'];

    final chosen = await showDialog<String>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.18),
      builder: (dialogContext) {
        return Dialog(
          elevation: 10,
          insetPadding: const EdgeInsets.symmetric(horizontal: 18),
          backgroundColor: Colors.transparent,
          child: Align(
            alignment: Alignment.center,
            child: Container(
              constraints: const BoxConstraints(maxWidth: 360),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(999),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.18),
                    blurRadius: 18,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (final e in emojis)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 2),
                      child: InkWell(
                        customBorder: const CircleBorder(),
                        onTap: () => Navigator.pop(dialogContext, e),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 140),
                          curve: Curves.easeOut,
                          width: 42,
                          height: 42,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color:
                                current == e
                                    ? Colors.deepPurple.withValues(alpha: 0.12)
                                    : Colors.transparent,
                            border:
                                current == e
                                    ? Border.all(
                                      color: Colors.deepPurple.withValues(
                                        alpha: 0.35,
                                      ),
                                    )
                                    : null,
                          ),
                          child: Text(
                            e,
                            style: const TextStyle(fontSize: 24, height: 1),
                          ),
                        ),
                      ),
                    ),
                  if (current != null) ...[
                    Container(
                      width: 1,
                      height: 26,
                      margin: const EdgeInsets.symmetric(horizontal: 4),
                      color: Colors.grey.shade200,
                    ),
                    InkWell(
                      customBorder: const CircleBorder(),
                      onTap: () => Navigator.pop(dialogContext, '__remove__'),
                      child: Container(
                        width: 34,
                        height: 34,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: Colors.grey.shade100,
                        ),
                        child: Icon(
                          Icons.close,
                          size: 20,
                          color: Colors.grey.shade700,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        );
      },
    );

    if (chosen == null) return;

    try {
      if (chosen == '__remove__') {
        await _messaging.toggleReaction(
          convoId: widget.conversationId,
          messageId: messageId,
          emoji: current ?? '',
          removeOnly: true,
        );
      } else {
        await _messaging.toggleReaction(
          convoId: widget.conversationId,
          messageId: messageId,
          emoji: chosen,
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text("Reaction failed: $e")));
    }
  }

  // WhatsApp-style reaction chip (emoji + total)
  Widget _buildWhatsAppReactionChip(Map<String, dynamic> msg) {
    final counts = _reactionCounts(msg);
    if (counts.isEmpty) return const SizedBox.shrink();

    final entries =
        counts.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    final topEmoji = entries.first.key;
    final total = entries.fold<int>(0, (s, e) => s + e.value);
    final showCount = total > 1;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.grey.shade300),
        boxShadow: [
          BoxShadow(
            blurRadius: 6,
            offset: const Offset(0, 2),
            color: Colors.black.withOpacity(0.06),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(topEmoji, style: const TextStyle(fontSize: 14)),
          if (showCount) ...[
            const SizedBox(width: 4),
            Text(
              total.toString(),
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: Colors.grey.shade800,
              ),
            ),
          ],
        ],
      ),
    );
  }

  // -------------------------
  // Sticky header mechanics
  // -------------------------
  void _scheduleStickyUpdate() {
    if (_stickyThrottle?.isActive == true) return;
    _stickyThrottle = Timer(
      const Duration(milliseconds: 80),
      _updateStickyLabelFromHeaderPositions,
    );
  }

  void _updateStickyLabelFromHeaderPositions() {
    if (!mounted) return;
    if (_dayKeysInOrder.isEmpty) return;

    const topThreshold = 110.0;
    String? bestKey;
    double bestY = -double.infinity;

    for (final k in _dayKeysInOrder) {
      final key = _dayHeaderKeys[k];
      final ctx = key?.currentContext;
      if (ctx == null) continue;

      final box = ctx.findRenderObject();
      if (box is! RenderBox) continue;

      final pos = box.localToGlobal(Offset.zero);
      final y = pos.dy;

      if (y <= topThreshold && y > bestY) {
        bestY = y;
        bestKey = k;
      }
    }

    bestKey ??= _dayKeysInOrder.first;

    final parts = bestKey.split('-');
    if (parts.length == 3) {
      final y = int.tryParse(parts[0]);
      final m = int.tryParse(parts[1]);
      final d = int.tryParse(parts[2]);
      if (y != null && m != null && d != null) {
        final dt = DateTime(y, m, d);
        final label = _dayLabel(dt);
        if (label != _stickyDayLabel) {
          setState(() => _stickyDayLabel = label);
        }
      }
    }
  }

  // -------------------------
  // Lifecycle
  // -------------------------
  @override
  void initState() {
    super.initState();
    _loadProfiles();
    _repairLegacyConversation();
    _messaging.markChatRead(convoId: widget.conversationId);

    _scroll.addListener(_scheduleStickyUpdate);
    _controller.addListener(_onTextChanged);

    _typingDotsTimer = Timer.periodic(const Duration(milliseconds: 350), (_) {
      if (!mounted) return;
      setState(() => _dotPhase = (_dotPhase + 1) % 4);
    });
  }

  Future<void> _loadProfiles() async {
    try {
      final otherDoc =
          await FirebaseFirestore.instance
              .collection('users')
              .doc(widget.otherUid)
              .get();
      if (mounted && otherDoc.exists) {
        setState(() => _otherAvatarUrl = otherDoc.data()?['avatarUrl']);
      }
    } catch (_) {}

    try {
      final me = FirebaseAuth.instance.currentUser;
      if (me != null) {
        final myDoc =
            await FirebaseFirestore.instance
                .collection('users')
                .doc(me.uid)
                .get();
        if (mounted && myDoc.exists) {
          setState(() => _myAvatarUrl = myDoc.data()?['avatarUrl']);
        }
      }
    } catch (_) {}
  }

  Future<void> _repairLegacyConversation() async {
    try {
      await _messaging.repairConversationById(
        convoId: widget.conversationId,
        otherUid: widget.otherUid,
      );
    } catch (_) {}
  }

  @override
  void dispose() {
    _typingDebounce?.cancel();
    _typingDotsTimer?.cancel();
    _seenDebounce?.cancel();
    _stickyThrottle?.cancel();

    _setTyping(false);

    _controller.removeListener(_onTextChanged);
    _scroll.removeListener(_scheduleStickyUpdate);

    _controller.dispose();
    _scroll.dispose();
    super.dispose();
  }

  // -------------------------
  // Typing indicator behavior
  // -------------------------
  void _onTextChanged() {
    final text = _controller.text.trim();

    if (text.isNotEmpty) {
      _typingDebounce?.cancel();
      _typingDebounce = Timer(
        const Duration(milliseconds: 250),
        () => _setTyping(true),
      );

      _typingDebounce = Timer(const Duration(milliseconds: 1500), () {
        if (_controller.text.trim().isEmpty) return;
        _setTyping(false);
      });
    } else {
      _typingDebounce?.cancel();
      _setTyping(false);
    }
  }

  Future<void> _setTyping(bool isTyping) async {
    final uid = _myUid;
    if (uid == null) return;

    if (isTyping && _sentTypingTrue) return;
    if (!isTyping && !_sentTypingTrue) return;

    _sentTypingTrue = isTyping;

    try {
      await _convoRef.set({
        'typing': {uid: isTyping},
        'typingUpdatedAt': {uid: FieldValue.serverTimestamp()},
      }, SetOptions(merge: true));
    } catch (_) {}
  }

  bool _otherIsTyping(Map<String, dynamic>? convoData) {
    if (convoData == null) return false;

    final typing = (convoData['typing'] as Map?)?.cast<String, dynamic>();
    final updatedAt =
        (convoData['typingUpdatedAt'] as Map?)?.cast<String, dynamic>();

    final isTyping = typing?[widget.otherUid] == true;
    if (!isTyping) return false;

    final ts = updatedAt?[widget.otherUid];
    if (ts is Timestamp) {
      final last = ts.toDate();
      final age = DateTime.now().difference(last);
      if (age.inSeconds > 8) return false;
    }

    return true;
  }

  String _typingDots() => _dotPhase == 0 ? "" : "." * _dotPhase;

  // -------------------------
  // Send
  // -------------------------
  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;

    final replyId = _replyToMessageId;
    final replyText = _replyToText;
    final replySender = _replyToSenderId;

    _controller.clear();
    _clearReply();
    await _setTyping(false);

    try {
      await _messaging.sendTextMessage(
        convoId: widget.conversationId,
        otherUid: widget.otherUid,
        text: text,
        replyToMessageId: replyId,
        replyToText: replyText,
        replyToSenderId: replySender,
      );

      await Future.delayed(const Duration(milliseconds: 120));
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    } catch (e) {
      if (!mounted) return;
      final message = e.toString().replaceFirst('Exception: ', '');
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(message)));
    }
  }

  // -------------------------
  // Mark messages as seen (debounced)
  // -------------------------
  void _debouncedMarkSeen() {
    _seenDebounce?.cancel();
    _seenDebounce = Timer(const Duration(milliseconds: 350), () async {
      try {
        await _messaging.markMessagesSeen(
          convoId: widget.conversationId,
          otherUid: widget.otherUid,
        );
      } catch (_) {}
    });
  }

  // -------------------------
  // UI
  // -------------------------
  @override
  Widget build(BuildContext context) {
    final title = widget.otherDisplayName ?? "Chat";

    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.deepPurple,
        centerTitle: true,
        iconTheme: const IconThemeData(color: Colors.white),
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircleAvatar(
              radius: 16,
              backgroundImage:
                  _otherAvatarUrl != null
                      ? NetworkImage(_otherAvatarUrl!)
                      : null,
              backgroundColor:
                  _otherAvatarUrl == null
                      ? Colors.white.withOpacity(0.25)
                      : null,
              child:
                  _otherAvatarUrl == null
                      ? const Icon(Icons.person, size: 16, color: Colors.white)
                      : null,
            ),
            const SizedBox(width: 10),
            Flexible(
              child: Text(
                title,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          if (_stickyDayLabel.isNotEmpty)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 8),
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border(bottom: BorderSide(color: Colors.grey.shade200)),
              ),
              child: Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    _stickyDayLabel,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: Colors.black87,
                    ),
                  ),
                ),
              ),
            ),
          Expanded(
            child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
              stream: _messaging.messagesStream(widget.conversationId),
              builder: (context, snap) {
                if (snap.hasError)
                  return Center(child: Text("Error: ${snap.error}"));
                if (!snap.hasData)
                  return const Center(child: CircularProgressIndicator());

                final docs = snap.data!.docs;

                _dayHeaderKeys.clear();
                _dayKeysInOrder = [];

                _debouncedMarkSeen();

                WidgetsBinding.instance.addPostFrameCallback(
                  (_) => _scheduleStickyUpdate(),
                );

                return NotificationListener<ScrollNotification>(
                  onNotification: (_) {
                    _scheduleStickyUpdate();
                    return false;
                  },
                  child: ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 10,
                    ),
                    itemCount: docs.length,
                    itemBuilder: (context, i) {
                      final m = docs[i].data();
                      final prev = i > 0 ? docs[i - 1].data() : null;

                      final text = (m['text'] as String?) ?? '';
                      final senderId = (m['senderId'] as String?) ?? '';
                      final messageId = docs[i].id;

                      final uid = _myUid;
                      final isMe = uid != null && senderId == uid;

                      final ts = m['createdAt'] as Timestamp?;
                      final prevTs = prev?['createdAt'] as Timestamp?;
                      final dt = ts?.toDate();
                      final prevDt = prevTs?.toDate();

                      final showDayHeader =
                          dt != null &&
                          (prevDt == null || !_isSameDay(dt, prevDt));
                      final timeLabel = _formatMessageTime(ts);

                      final dayKey = dt != null ? _dayKey(dt) : null;
                      if (showDayHeader && dayKey != null) {
                        _dayHeaderKeys[dayKey] = GlobalKey();
                        _dayKeysInOrder.add(dayKey);
                      }

                      final myReaction = _myReaction(m);

                      final bubbleColor =
                          isMe ? Colors.blue.shade600 : Colors.grey.shade200;
                      final bubbleTextColor =
                          isMe ? Colors.white : Colors.black87;
                      final metaColor =
                          isMe ? Colors.white70 : Colors.grey.shade600;

                      final replyTo =
                          (m['replyTo'] as Map?)?.cast<String, dynamic>();
                      final replyText = (replyTo?['text'] as String?)?.trim();
                      final replySender =
                          (replyTo?['senderId'] as String?)?.trim();
                      final hasReply =
                          (replyText != null && replyText.isNotEmpty);

                      Widget bubble = Stack(
                        clipBehavior: Clip.none,
                        children: [
                          Container(
                            padding: const EdgeInsets.fromLTRB(12, 8, 10, 6),
                            constraints: BoxConstraints(
                              maxWidth:
                                  MediaQuery.of(context).size.width * 0.78,
                            ),
                            decoration: BoxDecoration(
                              color: bubbleColor,
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                if (hasReply) ...[
                                  Container(
                                    width: double.infinity,
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 10,
                                      vertical: 8,
                                    ),
                                    decoration: BoxDecoration(
                                      color:
                                          isMe
                                              ? Colors.white.withOpacity(0.16)
                                              : Colors.grey.shade300
                                                  .withOpacity(0.65),
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          (replySender == _myUid)
                                              ? "You"
                                              : "Reply",
                                          style: TextStyle(
                                            fontSize: 11,
                                            fontWeight: FontWeight.w900,
                                            color:
                                                isMe
                                                    ? Colors.white
                                                    : Colors.black87,
                                          ),
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          replyText,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(
                                            fontSize: 12,
                                            color:
                                                isMe
                                                    ? Colors.white70
                                                    : Colors.black87,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                ],
                                Align(
                                  alignment: Alignment.centerLeft,
                                  child: Text(
                                    text,
                                    style: TextStyle(
                                      color: bubbleTextColor,
                                      fontSize: 14,
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      timeLabel,
                                      style: TextStyle(
                                        fontSize: 11,
                                        color: metaColor,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    if (isMe) ...[
                                      const SizedBox(width: 6),
                                      _buildSeenTicks(
                                        isMe: isMe,
                                        msg: m,
                                        color: metaColor,
                                      ),
                                    ],
                                  ],
                                ),
                              ],
                            ),
                          ),
                          Positioned(
                            right: isMe ? 8 : null,
                            left: isMe ? null : 8,
                            bottom: -26,
                            child: _animatedReactionChip(
                              m,
                              messageId: messageId,
                            ),
                          ),
                        ],
                      );

                      bubble = GestureDetector(
                        onLongPress:
                            () => _showMessageActions(
                              messageId: messageId,
                              text: text,
                              senderId: senderId,
                              isMe: isMe,
                              myReaction: myReaction,
                            ),
                        child: bubble,
                      );

                      bubble = Dismissible(
                        key: ValueKey("msg_$messageId"),
                        direction:
                            isMe
                                ? DismissDirection.endToStart
                                : DismissDirection.startToEnd,
                        confirmDismiss: (_) async {
                          _startReplyTo(
                            messageId: messageId,
                            text: text,
                            senderId: senderId,
                          );
                          return false;
                        },
                        background: Container(
                          alignment:
                              isMe
                                  ? Alignment.centerRight
                                  : Alignment.centerLeft,
                          padding: const EdgeInsets.symmetric(horizontal: 18),
                          child: Icon(Icons.reply, color: Colors.grey.shade600),
                        ),
                        child: bubble,
                      );

                      return Column(
                        children: [
                          if (showDayHeader && dayKey != null)
                            Padding(
                              key: _dayHeaderKeys[dayKey],
                              padding: const EdgeInsets.symmetric(vertical: 10),
                              child: Center(
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 12,
                                    vertical: 6,
                                  ),
                                  decoration: BoxDecoration(
                                    color: Colors.grey.shade300,
                                    borderRadius: BorderRadius.circular(20),
                                  ),
                                  child: Text(
                                    _dayLabel(dt),
                                    style: const TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                      color: Colors.black87,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 4),
                            child: Row(
                              mainAxisAlignment:
                                  isMe
                                      ? MainAxisAlignment.end
                                      : MainAxisAlignment.start,
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                if (!isMe) ...[
                                  CircleAvatar(
                                    radius: 14,
                                    backgroundImage:
                                        _otherAvatarUrl != null
                                            ? NetworkImage(_otherAvatarUrl!)
                                            : null,
                                    child:
                                        _otherAvatarUrl == null
                                            ? const Icon(Icons.person, size: 14)
                                            : null,
                                  ),
                                  const SizedBox(width: 8),
                                ],
                                Flexible(child: bubble),
                              ],
                            ),
                          ),
                          const SizedBox(height: 10),
                        ],
                      );
                    },
                  ),
                );
              },
            ),
          ),

          // Typing indicator
          StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
            stream: _convoRef.snapshots(),
            builder: (context, snap) {
              final data = snap.data?.data();
              final isTyping = _otherIsTyping(data);
              if (!isTyping) return const SizedBox.shrink();

              return Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 6),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    "Typing${_typingDots()}",
                    style: TextStyle(
                      color: Colors.grey.shade600,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              );
            },
          ),

          // Reply preview bar
          if (_replyToMessageId != null &&
              (_replyToText ?? '').trim().isNotEmpty)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                border: Border(top: BorderSide(color: Colors.grey.shade200)),
              ),
              child: Row(
                children: [
                  Container(
                    width: 4,
                    height: 40,
                    decoration: BoxDecoration(
                      color: Colors.deepPurple,
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          (_replyToSenderId == _myUid)
                              ? "Replying to you"
                              : "Replying",
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 12,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          _replyToText!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: Colors.grey.shade800,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: _clearReply,
                    icon: const Icon(Icons.close),
                    splashRadius: 18,
                  ),
                ],
              ),
            ),

          SafeArea(
            top: false,
            child: Container(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _send(),
                      decoration: InputDecoration(
                        hintText: "Message…",
                        prefixIcon: Padding(
                          padding: const EdgeInsets.all(6.0),
                          child: CircleAvatar(
                            radius: 14,
                            backgroundImage:
                                _myAvatarUrl != null
                                    ? NetworkImage(_myAvatarUrl!)
                                    : null,
                            child:
                                _myAvatarUrl == null
                                    ? const Icon(Icons.person, size: 14)
                                    : null,
                          ),
                        ),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(30),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 12,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton(onPressed: _send, icon: const Icon(Icons.send)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
