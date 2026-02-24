import 'dart:async';
import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../screens/follow_list_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _bioController = TextEditingController();
  final TextEditingController _handleController = TextEditingController();
  final TextEditingController _taglineController = TextEditingController();
  final TextEditingController _musicController = TextEditingController();
  final List<TextEditingController> _urlControllers = [];
  final List<String?> _urlErrors = [];
  String? _musicErrorText;
  int _activeUrlIndex = 0;
  static const int _maxUrls = 3;

  String? _imageUrl;
  Timestamp? _createdAt;
  Timestamp? _updatedAt;

  bool _isLoading = true;
  bool _saving = false;
  bool _isPublic = false;

  // Dirty tracking
  bool _dirty = false;

  // Baseline
  String _initialName = '';
  String _initialBio = '';
  String _initialHandle = '';
  String _initialTagline = '';
  String _initialMusic = '';
  List<String> _initialUrls = [];
  String? _initialImageUrl;
  bool _initialPublic = false;
  // Handle validation
  Timer? _handleDebounce;
  bool _checkingHandle = false;
  bool _handleTaken = false;
  String? _handleErrorText;

  // Soft styling
  static const Color _pageBg = Color(0xFFF6F7FB);
  static const Color _cardBg = Color(0xFFFFFFFF);
  static const Color _tint = Color(0xFFEFF2FF);
  static const Color _tintBorder = Color(0xFFD9E1FF);

  @override
  void initState() {
    super.initState();
    _setUrls(const []);
    _loadProfile();

    _nameController.addListener(_recomputeDirty);
    _bioController.addListener(_recomputeDirty);
    _taglineController.addListener(_recomputeDirty);
    _musicController.addListener(_recomputeDirty);
    _handleController.addListener(_onHandleChanged);
    _musicController.addListener(_validateMusicUrl);
  }

  @override
  void dispose() {
    _handleDebounce?.cancel();
    _nameController.dispose();
    _bioController.dispose();
    _handleController.dispose();
    _taglineController.dispose();
    _musicController.dispose();
    for (final c in _urlControllers) {
      c.dispose();
    }
    super.dispose();
  }

  void _validateMusicUrl() {
    final value = _musicController.text.trim().toLowerCase();
    String? error;

    if (value.isNotEmpty) {
      final isSpotify = value.contains('spotify.com');
      if (!isSpotify) {
        error = 'Only Spotify links are supported.';
      }
    }

    if (mounted) {
      setState(() => _musicErrorText = error);
    }
  }

  Future<void> _loadProfile() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      if (mounted) setState(() => _isLoading = false);
      return;
    }

    try {
      final doc =
          await FirebaseFirestore.instance.collection('users').doc(user.uid).get();

      if (doc.exists) {
        final data = doc.data()!;
        _nameController.text = (data['displayName'] ?? '').toString();
        _bioController.text = (data['bio'] ?? '').toString();
        _handleController.text = (data['socialHandle'] ?? '').toString();
        _taglineController.text = (data['tagline'] ?? '').toString();
        _musicController.text = (data['moodMusicUrl'] ?? '').toString();
        final urls = List<String>.from(data['profileUrls'] ?? const []);
        _setUrls(urls);

        _imageUrl = data['avatarUrl'];
        _createdAt = data['createdAt'];
        _updatedAt = data['updatedAt'];
        _isPublic = (data['publicProfile'] ?? false) as bool;
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to load profile: $e')),
        );
      }
    }

    if (_createdAt == null) {
      final now = Timestamp.now();
      await FirebaseFirestore.instance
          .collection('users')
          .doc(user.uid)
          .set({'createdAt': now}, SetOptions(merge: true));
      _createdAt = now;
    }

    // If no doc exists, _setUrls already defaults to a single empty field.

    _initialName = _nameController.text;
    _initialBio = _bioController.text;
    _initialHandle = _handleController.text;
    _initialTagline = _taglineController.text;
    _initialMusic = _musicController.text;
    _initialUrls = _currentUrls();
    _initialImageUrl = _imageUrl;
    _initialPublic = _isPublic;

    _dirty = false;
    _handleTaken = false;
    _handleErrorText = null;

    if (mounted) setState(() => _isLoading = false);

    if (_handleController.text.trim().isNotEmpty) {
      _scheduleHandleCheck(_handleController.text);
    }
  }

  void _setUrls(List<String> urls) {
    for (final c in _urlControllers) {
      c.dispose();
    }
    _urlControllers.clear();
    _urlErrors.clear();
    final normalized = urls.take(_maxUrls).map((e) => e.toString()).toList();
    if (normalized.isEmpty) {
      _urlControllers.add(TextEditingController());
      _urlErrors.add(null);
      _activeUrlIndex = 0;
      return;
    }
    for (final u in normalized) {
      _urlControllers.add(TextEditingController(text: u));
      _urlErrors.add(_validateUrl(u));
    }
    if (_activeUrlIndex >= _urlControllers.length) {
      _activeUrlIndex = _urlControllers.length - 1;
    }
  }

  List<String> _currentUrls() {
    final raw = _urlControllers.map((c) => c.text.trim()).toList();
    return raw.where((u) => u.isNotEmpty).take(_maxUrls).toList();
  }

  void _addUrlField() {
    if (_urlControllers.length >= _maxUrls) return;
    setState(() {
      _urlControllers.add(TextEditingController());
      _urlErrors.add(null);
      _activeUrlIndex = _urlControllers.length - 1;
      _recomputeDirty();
    });
  }

  void _removeCurrentUrl() {
    if (_urlControllers.isEmpty) return;
    setState(() {
      _urlControllers[_activeUrlIndex].dispose();
      _urlControllers.removeAt(_activeUrlIndex);
      _urlErrors.removeAt(_activeUrlIndex);
      if (_urlControllers.isEmpty) {
        _urlControllers.add(TextEditingController());
        _urlErrors.add(null);
        _activeUrlIndex = 0;
      } else if (_activeUrlIndex >= _urlControllers.length) {
        _activeUrlIndex = _urlControllers.length - 1;
      }
      _recomputeDirty();
    });
  }

  void _goToUrlIndex(int delta) {
    if (_urlControllers.isEmpty) return;
    final next = (_activeUrlIndex + delta).clamp(0, _urlControllers.length - 1);
    if (next != _activeUrlIndex) {
      setState(() => _activeUrlIndex = next);
    }
  }

  String? _validateUrl(String raw) {
    final value = raw.trim();
    if (value.isEmpty) return null;
    final uri = Uri.tryParse(value);
    if (uri == null) return 'Enter a valid URL.';
    final hasHttpScheme = uri.scheme == 'http' || uri.scheme == 'https';
    final hasWwwPrefix = value.toLowerCase().startsWith('www.');
    if (!hasHttpScheme && !hasWwwPrefix) {
      return 'Use http(s):// or start with www.';
    }
    return null;
  }

  void _onUrlChanged(int index, String value) {
    if (index < 0 || index >= _urlErrors.length) return;
    final err = _validateUrl(value);
    if (_urlErrors[index] != err) {
      setState(() => _urlErrors[index] = err);
    } else {
      _recomputeDirty();
    }
  }

  Future<void> _pickAndUploadImage() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    final picked = await ImagePicker().pickImage(source: ImageSource.gallery);
    if (picked == null) return;

    try {
      setState(() => _saving = true);

      final ref =
      FirebaseStorage.instance.ref().child('avatars/${user.uid}.jpg');
      await ref.putFile(File(picked.path));
      final url = await ref.getDownloadURL();

      await FirebaseFirestore.instance
          .collection('users')
          .doc(user.uid)
          .set(
        {
          'avatarUrl': url,
          'updatedAt': FieldValue.serverTimestamp(),
        },
        SetOptions(merge: true),
      );

      _imageUrl = url;
      _recomputeDirty();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to upload image: $e')),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _togglePublicProfile() async {
    if (_saving) return;

    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    setState(() => _isPublic = !_isPublic);
    _recomputeDirty();

    await FirebaseFirestore.instance
        .collection('users')
        .doc(user.uid)
        .set({'publicProfile': _isPublic}, SetOptions(merge: true));
  }

  Future<void> _saveProfile() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    if (!_canSave) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please fix errors before saving.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    try {
      setState(() => _saving = true);

      final handleRaw = _handleController.text.trim();
      final handleNormalized = _normalizeHandle(handleRaw);

      await FirebaseFirestore.instance.collection('users').doc(user.uid).set(
        {
          'displayName': _nameController.text.trim(),
          'bio': _bioController.text.trim(),
          'socialHandle': handleRaw,
          'socialHandleLower': handleNormalized.isEmpty ? null : handleNormalized,
          'tagline': _taglineController.text.trim(),
          'moodMusicUrl': _musicController.text.trim(),
          'profileUrls': _currentUrls(),
          'publicProfile': _isPublic,
          'updatedAt': FieldValue.serverTimestamp(),
        },
        SetOptions(merge: true),
      );

      _initialName = _nameController.text;
      _initialBio = _bioController.text;
      _initialHandle = _handleController.text;
      _initialTagline = _taglineController.text;
      _initialMusic = _musicController.text;
      _initialUrls = _currentUrls();
      _initialImageUrl = _imageUrl;
      _initialPublic = _isPublic;

      _dirty = false;

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Profile saved!'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      setState(() {});
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to save: $e')),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _recomputeDirty() {
    final nowDirty =
        _nameController.text != _initialName ||
            _bioController.text != _initialBio ||
            _handleController.text != _initialHandle ||
            _taglineController.text != _initialTagline ||
            _musicController.text != _initialMusic ||
            _currentUrls().join('|') != _initialUrls.join('|') ||
            _imageUrl != _initialImageUrl ||
            _isPublic != _initialPublic;

    if (nowDirty != _dirty && mounted) {
      setState(() => _dirty = nowDirty);
    }
  }

  Future<bool> _confirmDiscardIfNeeded() async {
    if (!_dirty || _saving) return true;

    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Discard changes?'),
        content: const Text(
          'You have unsaved changes. If you leave now, they will be lost.',
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Stay'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.deepPurple,
              foregroundColor: Colors.white,
            ),
            child: const Text('Discard'),
          ),
        ],
      ),
    );

    return result ?? false;
  }

  void _onHandleChanged() {
    _recomputeDirty();
    final raw = _handleController.text;
    _scheduleHandleCheck(raw);
  }

  void _scheduleHandleCheck(String raw) {
    _handleDebounce?.cancel();

    final localError = _validateHandleFormat(raw);
    if (mounted) {
      setState(() {
        _handleErrorText = localError;
        _handleTaken = false;
      });
    }

    if (raw.trim().isEmpty) {
      if (mounted) {
        setState(() {
          _checkingHandle = false;
          _handleTaken = false;
        });
      }
      return;
    }

    if (localError != null) {
      if (mounted) setState(() => _checkingHandle = false);
      return;
    }

    _handleDebounce = Timer(const Duration(milliseconds: 450), () {
      _checkHandleUnique(raw);
    });
  }

  String _normalizeHandle(String raw) {
    var s = raw.trim();
    if (s.startsWith('@')) s = s.substring(1);
    s = s.toLowerCase();
    final cleaned = s.replaceAll(RegExp(r'[^a-z0-9_.]'), '');
    return cleaned;
  }

  String? _validateHandleFormat(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return null;

    final norm = _normalizeHandle(trimmed);

    if (norm.isEmpty) return 'Handle must include letters or numbers.';
    if (norm.length < 3) return 'Handle must be at least 3 characters.';
    if (norm.length > 20) return 'Handle can’t be longer than 20 characters.';

    if (!RegExp(r'^[a-z0-9]').hasMatch(norm)) {
      return 'Handle must start with a letter or number.';
    }

    if (!RegExp(r'^[a-z0-9][a-z0-9_.]*$').hasMatch(norm)) {
      return 'Only letters, numbers, _ and . are allowed.';
    }

    return null;
  }

  Future<void> _checkHandleUnique(String raw) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    final normalized = _normalizeHandle(raw);
    if (normalized.isEmpty) return;

    if (mounted) {
      setState(() {
        _checkingHandle = true;
        _handleTaken = false;
      });
    }

    try {
      final snap = await FirebaseFirestore.instance
          .collection('users')
          .where('socialHandleLower', isEqualTo: normalized)
          .limit(2)
          .get();

      bool taken = false;
      for (final d in snap.docs) {
        if (d.id != user.uid) {
          taken = true;
          break;
        }
      }

      if (!mounted) return;
      setState(() {
        _handleTaken = taken;
        _handleErrorText = taken ? 'That handle is already taken.' : null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _handleTaken = false;
        _handleErrorText = 'Couldn’t verify handle right now.';
      });
    } finally {
      if (mounted) setState(() => _checkingHandle = false);
    }
  }

  bool get _canSave {
    if (_saving) return false;
    if (!_dirty) return false;
    if (_handleErrorText != null) return false;
    if (_checkingHandle) return false;
    if (_urlErrors.any((e) => e != null)) return false;
    if (_musicErrorText != null) return false;
    return true;
  }

  String _fmtDate(Timestamp? ts) {
    if (ts == null) return '';
    final d = ts.toDate().toLocal();
    final y = d.year.toString().padLeft(4, '0');
    final m = d.month.toString().padLeft(2, '0');
    final day = d.day.toString().padLeft(2, '0');
    return '$y-$m-$day';
  }

  Widget _sectionCard({required Widget child}) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _cardBg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.black.withOpacity(0.06)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 14,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: child,
    );
  }

  InputDecoration _inputDec({
    required String label,
    String? hint,
    Widget? prefix,
    String? errorText,
    Widget? suffix,
  }) {
    return InputDecoration(
      labelText: label,
      hintText: hint,
      prefixIcon: prefix,
      suffixIcon: suffix,
      errorText: errorText,
      filled: true,
      fillColor: _tint,
      labelStyle: TextStyle(
        color: Colors.grey.shade800,
        fontWeight: FontWeight.w700,
      ),
      hintStyle: TextStyle(color: Colors.grey.shade600),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: _tintBorder),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: _tintBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(
          color: Colors.deepPurple.withOpacity(0.6),
          width: 1.4,
        ),
      ),
    );
  }

  Widget _metaPill({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: _tint,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _tintBorder),
      ),
      child: Row(
        children: [
          Icon(icon, size: 16, color: Colors.deepPurple),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w800,
                    color: Colors.grey.shade700,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  value,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                    color: Colors.grey.shade900,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _publicChip() {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: _togglePublicProfile,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.deepPurple.withOpacity(0.08),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.deepPurple.withOpacity(0.18)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                _isPublic ? Icons.public : Icons.lock,
                size: 16,
                color: Colors.deepPurple,
              ),
              const SizedBox(width: 8),
              Text(
                _isPublic ? 'Public profile ON' : 'Public profile OFF',
                style: const TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w800,
                  color: Colors.deepPurple,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }


  // UPDATED helper to use new FollowListScreen API and Arrays
  Widget _buildStatItem(String label, String fieldName, int tabIndex) {
    return StreamBuilder<DocumentSnapshot>(
      stream: FirebaseFirestore.instance
          .collection('users')
          .doc(FirebaseAuth.instance.currentUser!.uid)
          .snapshots(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) return const SizedBox();
        final data = snapshot.data!.data() as Map<String, dynamic>?;
        final list = List<dynamic>.from(data?[fieldName] ?? []);
        final count = list.length;

        return InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (context) => FollowListScreen(
                  userId: FirebaseAuth.instance.currentUser!.uid,
                  initialTabIndex: tabIndex,
                ),
              ),
            );
          },
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Column(
              children: [
                Text(
                  '$count',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  label,
                  style: const TextStyle(
                    color: Colors.grey,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _stickySaveBar() {
    final show = _dirty;
    final bg = Colors.white.withOpacity(0.92);

    return AnimatedSlide(
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOut,
      offset: show ? Offset.zero : const Offset(0, 0.25),
      child: AnimatedOpacity(
        duration: const Duration(milliseconds: 180),
        opacity: show ? 1 : 0,
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
          decoration: BoxDecoration(
            color: bg,
            border: Border(
              top: BorderSide(color: Colors.black.withOpacity(0.06)),
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.06),
                blurRadius: 14,
                offset: const Offset(0, -6),
              ),
            ],
          ),
          child: SafeArea(
            top: false,
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    _canSave
                        ? 'You have unsaved changes'
                        : (_checkingHandle
                        ? 'Checking handle...'
                        : (_handleErrorText ?? 'Fix errors to save')),
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: _canSave
                          ? Colors.grey.shade800
                          : Colors.grey.shade700,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                ElevatedButton.icon(
                  onPressed: _canSave ? _saveProfile : null,
                  icon: _saving
                      ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                      : const Icon(Icons.save),
                  label: Text(_saving ? 'Saving...' : 'Save'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.deepPurple,
                    foregroundColor: Colors.white,
                    disabledBackgroundColor:
                    Colors.deepPurple.withOpacity(0.35),
                    disabledForegroundColor: Colors.white70,
                    padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                    elevation: 0,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;
    final email = user?.email;
    final appBarTitleStyle =
        Theme.of(context).appBarTheme.titleTextStyle ??
        Theme.of(context).textTheme.titleLarge;

    if (_isLoading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return PopScope(
      canPop: false,
      onPopInvoked: (didPop) async {
        if (didPop) return;
        final ok = await _confirmDiscardIfNeeded();
        if (ok && mounted) Navigator.pop(context);
      },
      child: Scaffold(
        backgroundColor: _pageBg,
        appBar: AppBar(
          backgroundColor: Colors.deepPurple,
          centerTitle: true,
          elevation: 0,
          iconTheme: const IconThemeData(color: Colors.white),
          title: Text(
            'Profile Settings',
            style: (appBarTitleStyle ?? const TextStyle()).copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w800,
            ),
          ),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () async {
              final ok = await _confirmDiscardIfNeeded();
              if (ok && mounted) Navigator.pop(context);
            },
          ),
        ),

        bottomNavigationBar: _stickySaveBar(),

        body: Stack(
          children: [
            SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 110),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _sectionCard(
                    child: Column(
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: [
                            Stack(
                              children: [
                                GestureDetector(
                                  onTap: _saving ? null : _pickAndUploadImage,
                                  child: CircleAvatar(
                                    radius: 36,
                                    backgroundImage: (_imageUrl != null &&
                                        _imageUrl!.isNotEmpty)
                                        ? NetworkImage(_imageUrl!)
                                        : null,
                                    backgroundColor: Colors.deepPurple,
                                    child: (_imageUrl == null || _imageUrl!.isEmpty)
                                        ? const Icon(
                                      Icons.person,
                                      color: Colors.white,
                                      size: 34,
                                    )
                                        : null,
                                  ),
                                ),
                                Positioned(
                                  right: 0,
                                  bottom: 0,
                                  child: Container(
                                    width: 28,
                                    height: 28,
                                    decoration: BoxDecoration(
                                      color: _tint,
                                      borderRadius: BorderRadius.circular(12),
                                      border: Border.all(color: _tintBorder),
                                    ),
                                    child: Icon(
                                      Icons.edit,
                                      size: 16,
                                      color: Colors.indigo.shade400,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    _nameController.text.trim().isEmpty
                                        ? 'Your profile'
                                        : _nameController.text.trim(),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w900,
                                      height: 1.1,
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    'Tap the avatar to change your photo',
                                    style: TextStyle(
                                      fontSize: 12.5,
                                      color: Colors.grey.shade700,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  const SizedBox(height: 10),
                                  _publicChip(),
                                ],
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 20),
                        const SizedBox.shrink(),
                      ],
                    ),
                  ),

                  const SizedBox(height: 14),

                  _sectionCard(
                    child: Column(
                      children: [
                        TextField(
                          controller: _nameController,
                          textInputAction: TextInputAction.next,
                          decoration: _inputDec(
                            label: 'Display Name',
                            hint: 'e.g. Sam',
                            prefix: const Icon(Icons.badge_outlined, size: 20),
                          ),
                        ),
                        const SizedBox(height: 12),

                        TextField(
                          controller: _handleController,
                          textInputAction: TextInputAction.next,
                          decoration: _inputDec(
                            label: 'Username / Handle',
                            hint: '@samuel',
                            prefix: const Icon(Icons.alternate_email, size: 20),
                            errorText: _handleErrorText,
                            suffix: _checkingHandle
                                ? const Padding(
                              padding: EdgeInsets.all(12.0),
                              child: SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              ),
                            )
                                : (_handleController.text.trim().isEmpty
                                ? null
                                : Icon(
                              _handleErrorText == null
                                  ? Icons.check_circle
                                  : Icons.error,
                              color: _handleErrorText == null
                                  ? Colors.green
                                  : Colors.redAccent,
                            )),
                          ),
                        ),

                        const SizedBox(height: 12),
                        TextField(
                          controller: _taglineController,
                          textInputAction: TextInputAction.next,
                          decoration: _inputDec(
                            label: 'Tagline',
                            hint: 'e.g. “Snack Queen”',
                            prefix:
                            const Icon(Icons.auto_awesome_outlined, size: 20),
                          ),
                        ),
                        const SizedBox(height: 12),
                        TextField(
                          controller: _bioController,
                          maxLines: 3,
                          decoration: _inputDec(
                            label: 'Bio',
                            hint: 'A short intro about you...',
                            prefix: const Icon(Icons.notes_outlined, size: 20),
                          ),
                        ),
                        const SizedBox(height: 12),
                        TextField(
                          controller: _musicController,
                          decoration: _inputDec(
                            label: 'Mood Music URL',
                            hint: 'Spotify link (open.spotify.com)',
                            prefix:
                            const Icon(Icons.music_note_outlined, size: 20),
                            errorText: _musicErrorText,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'Spotify link only',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade600,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            TextField(
                              controller: _urlControllers[_activeUrlIndex],
                              onChanged: (v) => _onUrlChanged(_activeUrlIndex, v),
                              decoration: _inputDec(
                                label: 'Link ${_activeUrlIndex + 1}',
                                hint: 'https://',
                                prefix: const Icon(Icons.link_outlined, size: 20),
                                errorText: _urlErrors[_activeUrlIndex],
                              ),
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 6,
                              runSpacing: 6,
                              children: [
                                OutlinedButton.icon(
                                  onPressed: _activeUrlIndex > 0
                                      ? () => _goToUrlIndex(-1)
                                      : null,
                                  icon: const Icon(Icons.chevron_left),
                                  label: const Text('Prev'),
                                ),
                                OutlinedButton.icon(
                                  onPressed: _activeUrlIndex <
                                          _urlControllers.length - 1
                                      ? () => _goToUrlIndex(1)
                                      : null,
                                  icon: const Icon(Icons.chevron_right),
                                  label: const Text('Next'),
                                ),
                                OutlinedButton.icon(
                                  onPressed: _urlControllers.length > 1 ||
                                          _urlControllers.first.text.trim().isNotEmpty
                                      ? _removeCurrentUrl
                                      : null,
                                  icon: const Icon(Icons.delete_outline),
                                  label: const Text('Remove'),
                                ),
                                OutlinedButton.icon(
                                  onPressed: _urlControllers.length >= _maxUrls
                                      ? null
                                      : _addUrlField,
                                  icon: const Icon(Icons.add_circle_outline),
                                  label: const Text('Add link'),
                                ),
                              ],
                            ),
                          ],
                        ),
                        if (_urlControllers.length > 1)
                          Padding(
                            padding: const EdgeInsets.only(top: 6),
                            child: Row(
                              children: List.generate(_urlControllers.length, (i) {
                                final active = i == _activeUrlIndex;
                                return Container(
                                  width: active ? 20 : 8,
                                  height: 6,
                                  margin: const EdgeInsets.only(right: 6),
                                  decoration: BoxDecoration(
                                    color: active
                                        ? Colors.deepPurple
                                        : Colors.deepPurple.withOpacity(0.2),
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                );
                              }),
                            ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 14),

                  if (email != null)
                    _sectionCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Account',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w900,
                              color: Colors.grey.shade800,
                              letterSpacing: 0.2,
                            ),
                          ),
                          const SizedBox(height: 10),
                          TextField(
                            controller: TextEditingController(text: email),
                            readOnly: true,
                            enabled: false,
                            decoration: InputDecoration(
                              filled: true,
                              fillColor: const Color(0xFFF1F3F8),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(14),
                              ),
                              disabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(14),
                                borderSide: BorderSide(
                                  color: Colors.black.withOpacity(0.06),
                                ),
                              ),
                            ),
                            style: const TextStyle(color: Colors.grey),
                          ),
                        ],
                      ),
                    ),

                  const SizedBox(height: 14),

                  _sectionCard(
                    child: Row(
                      children: [
                        if (_createdAt != null)
                          Expanded(
                            child: _metaPill(
                              icon: Icons.event_available,
                              label: 'Joined',
                              value: _fmtDate(_createdAt),
                            ),
                          ),
                        if (_createdAt != null && _updatedAt != null)
                          const SizedBox(width: 10),
                        if (_updatedAt != null)
                          Expanded(
                            child: _metaPill(
                              icon: Icons.update,
                              label: 'Updated',
                              value: _fmtDate(_updatedAt),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            if (_saving)
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: LinearProgressIndicator(
                  minHeight: 2,
                  backgroundColor: Colors.transparent,
                  valueColor: AlwaysStoppedAnimation<Color>(
                    Colors.deepPurple.withOpacity(0.45),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
