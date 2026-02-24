import 'package:flutter/material.dart';
import 'package:easespotter/services/follow_service.dart';
import 'package:easespotter/screens/social_profile_screen.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class UserListItem extends StatefulWidget {
  final Map<String, dynamic> userData;
  final String uid;

  /// Optional extra action (e.g. Add/Top Collaborator button)
  final Widget? extraAction;

  const UserListItem({
    super.key,
    required this.userData,
    required this.uid,
    this.extraAction,
  });

  @override
  State<UserListItem> createState() => _UserListItemState();
}

class _UserListItemState extends State<UserListItem> {
  final FollowService _followService = FollowService();
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final avatarUrl = (widget.userData['avatarUrl'] ?? '').toString();
    final displayName = (widget.userData['displayName'] ?? 'Anonymous').toString();

    return ListTile(
      leading: CircleAvatar(
        backgroundImage: avatarUrl.isNotEmpty ? NetworkImage(avatarUrl) : null,
        child: avatarUrl.isEmpty ? const Icon(Icons.person) : null,
      ),
      title: Text(displayName),

      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (widget.extraAction != null) widget.extraAction!,
          if (widget.extraAction != null) const SizedBox(width: 8),

          StreamBuilder<bool>(
            stream: _followService.isFollowing(widget.uid),
            builder: (context, snapshot) {
              final isFollowing = snapshot.data ?? false;

              return ElevatedButton(
                onPressed: _busy
                    ? null
                    : () async {
                  setState(() => _busy = true);
                  try {
                    if (isFollowing) {
                      await _followService.unfollowUser(widget.uid);
                    } else {
                      await _followService.followUser(widget.uid);
                    }
                  } on FirebaseException catch (e) {
                    if (!mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text("Follow failed: ${e.code}")),
                    );
                  } catch (e) {
                    if (!mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text("Follow failed: $e")),
                    );
                  } finally {
                    if (mounted) setState(() => _busy = false);
                  }
                },
                child: _busy
                    ? const SizedBox(
                  height: 16,
                  width: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
                    : Text(isFollowing ? 'Following' : 'Follow'),
              );
            },
          ),
        ],
      ),

      onTap: () async {
        await SocialProfileScreen.open(
          context,
          viewedUid: widget.uid,
          initialProfileHint: {
            'displayName': displayName,
            'avatarUrl': avatarUrl,
          },
        );
      },
    );
  }
}
