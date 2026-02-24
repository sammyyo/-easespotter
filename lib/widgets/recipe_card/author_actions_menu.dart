// lib/widgets/recipe_card/author_actions_menu.dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class AuthorActionsMenu extends StatelessWidget {
  final String authorUid;
  final String recipeId;
  final VoidCallback onRequestDelete;

  const AuthorActionsMenu({
    super.key,
    required this.authorUid,
    required this.recipeId,
    required this.onRequestDelete,
  });

  @override
  Widget build(BuildContext context) {
    final current = FirebaseAuth.instance.currentUser;
    final isOwner = current != null && current.uid == authorUid;
    if (!isOwner) return const SizedBox.shrink();

    // Same behavior, but with a nicer 3-dot button instead of a trash icon.
    return _MoreDotsButton(
      onTap: () async {
        HapticFeedback.lightImpact();
        await _showDeleteSheet(context);
      },
    );
  }

  Future<void> _showDeleteSheet(BuildContext context) async {
    bool understood = false;

    final commentsStream = FirebaseFirestore.instance
        .collection('recipes')
        .doc(recipeId)
        .collection('comments')
        .snapshots();

    await showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      backgroundColor: Theme.of(context).colorScheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setState) {
            return Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // drag handle
                  Container(
                    width: 38,
                    height: 4,
                    decoration: BoxDecoration(
                      color: Theme.of(ctx).dividerColor,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  const SizedBox(height: 14),

                  // header
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: Colors.red.withOpacity(0.08),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.delete_forever_outlined,
                          color: Colors.red,
                          size: 26,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Delete this recipe?',
                              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                            ),
                            const SizedBox(height: 6),
                            StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                              stream: commentsStream,
                              builder: (context, snap) {
                                final count = snap.data?.size ?? 0;
                                return Text(
                                  count > 0
                                      ? 'This will permanently remove the recipe and its $count comment${count == 1 ? '' : 's'}.'
                                      : 'This will permanently remove the recipe.',
                                  style: Theme.of(context).textTheme.bodyMedium,
                                );
                              },
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'This action cannot be undone.',
                              style: Theme.of(context)
                                  .textTheme
                                  .bodySmall
                                  ?.copyWith(color: Colors.red),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 16),

                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    controlAffinity: ListTileControlAffinity.leading,
                    value: understood,
                    onChanged: (v) => setState(() => understood = v ?? false),
                    title: const Text('I understand — delete permanently'),
                  ),

                  const SizedBox(height: 10),

                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => Navigator.of(ctx).maybePop(),
                          child: const Text('Cancel'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: FilledButton(
                          style: FilledButton.styleFrom(
                            backgroundColor:
                            understood ? Colors.red : Colors.red.withOpacity(0.5),
                            foregroundColor: Colors.white,
                          ),
                          onPressed: understood
                              ? () {
                            HapticFeedback.mediumImpact();
                            Navigator.of(ctx).pop(); // close sheet
                            onRequestDelete(); // parent shows spinner + cascade delete
                          }
                              : null,
                          child: const Text('Delete'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }
}

/// 3-dot circular button with subtle hover/focus/press animations.
/// Opens the destructive bottom sheet on tap.
class _MoreDotsButton extends StatefulWidget {
  final VoidCallback onTap;
  const _MoreDotsButton({required this.onTap});

  @override
  State<_MoreDotsButton> createState() => _MoreDotsButtonState();
}

class _MoreDotsButtonState extends State<_MoreDotsButton> {
  bool _hover = false;
  bool _down = false;
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final base = scheme.onSurface; // adaptive to light/dark
    final bg = _down
        ? base.withOpacity(0.14)
        : (_hover || _focused)
        ? base.withOpacity(0.10)
        : base.withOpacity(0.06);
    final iconColor = scheme.onSurfaceVariant;

    return FocusableActionDetector(
      onShowFocusHighlight: (v) => setState(() => _focused = v),
      child: Tooltip(
        message: 'More',
        waitDuration: const Duration(milliseconds: 300),
        child: MouseRegion(
          onEnter: (_) => setState(() => _hover = true),
          onExit: (_) => setState(() => _hover = false),
          child: GestureDetector(
            onTapDown: (_) => setState(() => _down = true),
            onTapCancel: () => setState(() => _down = false),
            onTapUp: (_) => setState(() => _down = false),
            child: Semantics(
              label: 'More actions',
              button: true,
              child: Material(
                type: MaterialType.transparency,
                child: InkWell(
                  customBorder: const CircleBorder(),
                  onTap: widget.onTap,
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 120),
                    width: 40,
                    height: 40,
                    decoration: ShapeDecoration(
                      color: bg,
                      shape: const CircleBorder(),
                    ),
                    child: Center(
                      child: AnimatedScale(
                        scale: _down ? 0.92 : 1.0,
                        duration: const Duration(milliseconds: 120),
                        child: AnimatedRotation(
                          duration: const Duration(milliseconds: 120),
                          turns: _hover ? -0.02 : 0.0, // tiny tilt on hover
                          child: Icon(
                            Icons.more_horiz,
                            color: iconColor,
                            size: 22,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
