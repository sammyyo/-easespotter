import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../services/safety_service.dart';

class PostSafetyMenu extends StatelessWidget {
  const PostSafetyMenu({
    super.key,
    required this.collection,
    required this.postId,
  });
  final String collection;
  final String postId;
  @override
  Widget build(BuildContext context) =>
      FutureBuilder<DocumentSnapshot<Map<String, dynamic>>>(
        future: FirebaseFirestore.instance
            .collection(collection)
            .doc(postId)
            .get(),
        builder: (context, snapshot) => SafetyMenu(
          uid: SafetyService.ownerOf(snapshot.data?.data() ?? {}),
          collection: collection,
          postId: postId,
        ),
      );
}

class SafetyMenu extends StatelessWidget {
  const SafetyMenu({
    super.key,
    required this.uid,
    this.collection,
    this.postId,
  });
  final String uid;
  final String? collection;
  final String? postId;

  @override
  Widget build(BuildContext context) {
    final me = FirebaseAuth.instance.currentUser;
    if (me == null || uid.isEmpty || me.uid == uid) {
      return const SizedBox.shrink();
    }
    return ListenableBuilder(
      listenable: SafetyService.instance,
      builder: (context, _) {
        final blocked = SafetyService.instance.hides(uid);
        return PopupMenuButton<String>(
          tooltip: 'Report or block',
          icon: const Icon(Icons.more_vert),
          onSelected: (value) async {
            if (value == 'block') {
              await changeBlock(context, uid, !blocked);
            } else {
              await showDialog<void>(
                context: context,
                builder: (_) => _ReportDialog(
                  uid: uid,
                  collection: value == 'post' ? collection : null,
                  postId: value == 'post' ? postId : null,
                ),
              );
            }
          },
          itemBuilder: (_) => [
            if (collection != null && postId != null)
              const PopupMenuItem(value: 'post', child: Text('Report post')),
            const PopupMenuItem(
              value: 'user',
              child: Text('Report harassment'),
            ),
            PopupMenuItem(
              value: 'block',
              child: Text(blocked ? 'Unblock user' : 'Block user'),
            ),
          ],
        );
      },
    );
  }
}

Future<void> changeBlock(BuildContext context, String uid, bool blocked) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(blocked ? 'Block this user?' : 'Unblock this user?'),
      content: Text(
        blocked
            ? 'Their posts will be hidden for you, and neither of you can send direct messages to the other. Blocking does not make your public posts private.'
            : 'Their posts will be visible again. Messaging can resume if you both follow each other and neither user has a block in place.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, true),
          child: Text(blocked ? 'Block' : 'Unblock'),
        ),
      ],
    ),
  );
  if (confirmed != true) return;
  try {
    await SafetyService.instance.setBlocked(uid, blocked);
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(blocked ? 'User blocked.' : 'User unblocked.')),
      );
    }
  } catch (_) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not change the block. Please try again.'),
        ),
      );
    }
  }
}

class _ReportDialog extends StatefulWidget {
  const _ReportDialog({required this.uid, this.collection, this.postId});
  final String uid;
  final String? collection;
  final String? postId;
  @override
  State<_ReportDialog> createState() => _ReportDialogState();
}

class _ReportDialogState extends State<_ReportDialog> {
  final _details = TextEditingController();
  String _reason = 'harassment';
  bool _sending = false;
  String? _error;
  @override
  void dispose() {
    _details.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await SafetyService.instance.report(
        targetUid: widget.uid,
        reason: _reason,
        details: _details.text,
        collection: widget.collection,
        postId: widget.postId,
      );
      if (!mounted) return;
      final messenger = ScaffoldMessenger.of(context);
      Navigator.pop(context);
      messenger.showSnackBar(
        const SnackBar(
          content: Text('Report submitted. Thank you for letting us know.'),
        ),
      );
    } on FirebaseException catch (error) {
      if (mounted) {
        setState(() {
          _error = error.code == 'permission-denied'
              ? 'This report may already have been submitted, or the content is no longer available.'
              : 'Could not submit the report. Please try again.';
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Could not submit the report. Please try again.';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _sending = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_sending,
    child: AlertDialog(
      title: Text(widget.postId == null ? 'Report harassment' : 'Report post'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Your report is private and is not shown to the reported user.',
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              initialValue: _reason,
              decoration: const InputDecoration(labelText: 'Reason'),
              items: const [
                DropdownMenuItem(
                  value: 'harassment',
                  child: Text('Harassment or bullying'),
                ),
                DropdownMenuItem(
                  value: 'hate',
                  child: Text('Hate or discrimination'),
                ),
                DropdownMenuItem(
                  value: 'violence',
                  child: Text('Threats or violence'),
                ),
                DropdownMenuItem(
                  value: 'sexual',
                  child: Text('Sexual content'),
                ),
                DropdownMenuItem(value: 'spam', child: Text('Spam or scam')),
                DropdownMenuItem(value: 'other', child: Text('Other')),
              ],
              onChanged: _sending
                  ? null
                  : (value) => setState(() {
                      _reason = value!;
                    }),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _details,
              enabled: !_sending,
              maxLength: 1000,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: 'Details (optional)',
                hintText: 'Describe what happened.',
              ),
            ),
            if (_error != null)
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _sending ? null : () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _sending ? null : _submit,
          child: Text(_sending ? 'Submitting…' : 'Submit report'),
        ),
      ],
    ),
  );
}

/// Hide content immediately when its author is blocked. Load failures fail closed.
class SafetyContent extends StatelessWidget {
  const SafetyContent({
    super.key,
    required this.uid,
    required this.child,
    this.showNotice = false,
  });
  final String uid;
  final Widget child;
  final bool showNotice;
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: SafetyService.instance,
    builder: (context, _) {
      final safety = SafetyService.instance;
      if (!safety.ready) {
        return showNotice
            ? Center(
                child: safety.failed
                    ? TextButton(
                        onPressed: safety.retry,
                        child: const Text(
                          'Could not load safety settings. Retry',
                        ),
                      )
                    : const Text('Loading safety settings…'),
              )
            : const SizedBox.shrink();
      }
      if (!safety.hides(uid)) return child;
      return showNotice
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('You blocked this user.'),
                  TextButton(
                    onPressed: () => changeBlock(context, uid, false),
                    child: const Text('Unblock user'),
                  ),
                ],
              ),
            )
          : const SizedBox.shrink();
    },
  );
}

class BlockedUsersScreen extends StatelessWidget {
  const BlockedUsersScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Blocked users')),
    body: ListenableBuilder(
      listenable: SafetyService.instance,
      builder: (context, _) {
        final safety = SafetyService.instance;
        if (!safety.ready) {
          return Center(
            child: safety.failed
                ? TextButton(
                    onPressed: safety.retry,
                    child: const Text('Could not load blocked users. Retry'),
                  )
                : const Text('Loading…'),
          );
        }
        final users = safety.blockedUsers.toList()..sort();
        if (users.isEmpty) {
          return const Center(child: Text('You have not blocked anyone.'));
        }
        return ListView.builder(
          itemCount: users.length,
          itemBuilder: (context, index) {
            final uid = users[index];
            return FutureBuilder<DocumentSnapshot<Map<String, dynamic>>>(
              future: FirebaseFirestore.instance
                  .collection('users')
                  .doc(uid)
                  .get(),
              builder: (context, snapshot) => ListTile(
                leading: const Icon(Icons.block),
                title: Text(
                  (snapshot.data?.data()?['displayName'] ?? 'User').toString(),
                ),
                subtitle: Text(uid),
                trailing: TextButton(
                  onPressed: () => changeBlock(context, uid, false),
                  child: const Text('Unblock'),
                ),
              ),
            );
          },
        );
      },
    ),
  );
}
