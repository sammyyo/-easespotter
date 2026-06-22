bool isSuggestableUserProfile(Map<String, dynamic> data) {
  if (data['publicProfile'] != true) return false;
  if (data['isAnonymous'] == true) return false;

  final handle = (data['handle'] ?? data['socialHandle'] ?? '')
      .toString()
      .trim()
      .replaceFirst(RegExp(r'^@+'), '');
  if (handle.isNotEmpty) return true;

  final displayName = (data['displayName'] ?? '').toString().trim();
  if (displayName.isEmpty) return false;

  const placeholders = {'anonymous', 'guest', 'suggested profile', 'user'};

  return !placeholders.contains(displayName.toLowerCase());
}
