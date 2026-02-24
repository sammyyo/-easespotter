import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../helper/activity_service.dart';

class CommentInputField extends StatefulWidget {
  final String parentPath;
  final String itemOwnerUid;

  const CommentInputField({
    super.key,
    required this.parentPath,
    required this.itemOwnerUid,
  });

  @override
  State<CommentInputField> createState() => _CommentInputFieldState();
}

class _CommentInputFieldState extends State<CommentInputField> {
  final _controller = TextEditingController();
  bool _isSending = false;

  Future<void> _submitComment() async {
    final text = _controller.text.trim();
    final user = FirebaseAuth.instance.currentUser;

    if (text.isEmpty || user == null) return;

    setState(() => _isSending = true);
    debugPrint("Writing to: ${widget.parentPath}/comments");

    // Prefer user profile doc for freshest displayName/avatar; fall back to auth fields.
    String authorName = user.displayName ?? '';
    String authorAvatar = user.photoURL ?? '';

    try {
      final userDoc = await FirebaseFirestore.instance.collection('users').doc(user.uid).get();
      final udata = userDoc.data();
      if (udata != null) {
        authorName = (udata['displayName'] ?? authorName).toString();
        authorAvatar = (udata['avatarUrl'] ?? authorAvatar).toString();
      }
    } catch (_) {
      // non-fatal: we’ll just use auth values
    }

    try {
      await FirebaseFirestore.instance
          .doc(widget.parentPath) // e.g. 'glowups/{glowUpId}'
          .collection('comments')
          .add({
        'uid': user.uid,
        'text': text,
        'createdAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),

        // denormalized fields so CommentList doesn’t need to read /users/*
        'authorDisplayName': authorName,
        'authorAvatarUrl': authorAvatar,
      });

      if (widget.itemOwnerUid != user.uid) {
        await ActivityService.add(
          toUid: widget.itemOwnerUid,
          type: 'comment',
          message: '${authorName.isEmpty ? 'Someone' : authorName} commented on your post',
          actorUid: user.uid,
          actorName: authorName,
          actorAvatarUrl: authorAvatar.isEmpty ? null : authorAvatar,
          itemType: widget.parentPath.split('/').first,
          itemId: widget.parentPath.split('/').last,
        );
      }

      _controller.clear();
    } on FirebaseException catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to comment: ${e.message ?? e.code}')),
      );
    } finally {
      if (mounted) setState(() => _isSending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: TextField(
            controller: _controller,
            minLines: 1,
            maxLines: 3,
            textInputAction: TextInputAction.newline,
            decoration: InputDecoration(
              hintText: 'Leave a comment...',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
              ),
              isDense: true,
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            ),
          ),
        ),
        const SizedBox(width: 8),
        IconButton(
          icon: _isSending
              ? const SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(strokeWidth: 2),
          )
              : const Icon(Icons.send, color: Colors.deepPurple),
          onPressed: _isSending ? null : _submitComment,
        ),
      ],
    );
  }
}
