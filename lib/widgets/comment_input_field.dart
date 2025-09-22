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
    print("🧪 Writing to: ${widget.parentPath}/comments");

    await FirebaseFirestore.instance
        .collection('${widget.parentPath}/comments')
        .add({
      'uid': user.uid,
      'text': text,
      'createdAt': FieldValue.serverTimestamp(),
    });

    // Optional: Add to activity feed
    if (widget.itemOwnerUid != user.uid) {
      await ActivityService.add(
        toUid: widget.itemOwnerUid,
        type: 'comment',
        message: '${user.displayName ?? 'Someone'} commented on your post',
        actorUid: user.uid,
        actorName: user.displayName ?? '',
        actorAvatarUrl: user.photoURL,
        itemType: widget.parentPath.split('/').first,
        itemId: widget.parentPath.split('/').last,
      );
    }

    setState(() {
      _controller.clear();
      _isSending = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: TextField(
            controller: _controller,
            decoration: const InputDecoration(
              hintText: 'Leave a comment...',
              border: OutlineInputBorder(),
            ),
          ),
        ),
        IconButton(
          icon: const Icon(Icons.send),
          onPressed: _isSending ? null : _submitComment,
        ),
      ],
    );
  }
}
