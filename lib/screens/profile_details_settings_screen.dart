import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../services/profile_details_service.dart';
import '../widgets/shared_profile_details.dart';

class ProfileDetailsSettingsScreen extends StatefulWidget {
  const ProfileDetailsSettingsScreen({super.key});

  @override
  State<ProfileDetailsSettingsScreen> createState() =>
      _ProfileDetailsSettingsScreenState();
}

class _ProfileDetailsSettingsScreenState
    extends State<ProfileDetailsSettingsScreen> {
  final _formKey = GlobalKey<FormState>();
  final _service = ProfileDetailsService(FirebaseFirestore.instance);
  final _controllers = {
    for (final key in profileDetailFields.keys) key: TextEditingController(),
  };
  final _shared = <String>{};
  String? _uid;
  String _baseline = '';
  bool _loading = true;
  bool _saving = false;
  bool _loadFailed = false;

  ProfileDetails get _details => ProfileDetails(
    values: {
      for (final entry in _controllers.entries) entry.key: entry.value.text,
    },
    shared: _shared,
  );
  bool get _dirty =>
      !_loading && !_loadFailed && jsonEncode(_details.toMap()) != _baseline;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadFailed = false;
    });
    try {
      _uid = FirebaseAuth.instance.currentUser?.uid;
      if (_uid == null) throw StateError('Sign in required');
      final details = await _service
          .load(_uid!)
          .timeout(const Duration(seconds: 20));
      if (!mounted) return;
      for (final entry in _controllers.entries) {
        entry.value.text = details.values[entry.key]!;
      }
      _shared
        ..clear()
        ..addAll(details.shared);
      _baseline = jsonEncode(_details.toMap());
    } catch (_) {
      if (mounted) _loadFailed = true;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate() || _uid == null) return;
    if (FirebaseAuth.instance.currentUser?.uid != _uid) return;
    setState(() => _saving = true);
    try {
      await _service.save(_uid!, _details).timeout(const Duration(seconds: 20));
      if (!mounted) return;
      _baseline = jsonEncode(_details.toMap());
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Profile details and sharing choices saved.'),
        ),
      );
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Could not confirm your changes were saved. Check your connection and try again.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _confirmLeave() async {
    if (_saving) return;
    final discard = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Discard changes?'),
        content: const Text(
          'Your profile details and sharing choices have not been saved.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep editing'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Discard'),
          ),
        ],
      ),
    );
    if (discard == true && mounted) {
      setState(() => _baseline = jsonEncode(_details.toMap()));
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) Navigator.pop(context);
      });
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_dirty && !_saving,
    onPopInvokedWithResult: (didPop, _) {
      if (!didPop) _confirmLeave();
    },
    child: Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF006677),
        centerTitle: true,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        title: Text(
          'More about you',
          style: (Theme.of(context).appBarTheme.titleTextStyle ??
                  Theme.of(context).textTheme.titleLarge ??
                  const TextStyle())
              .copyWith(color: Colors.white, fontWeight: FontWeight.w800),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _loadFailed
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('Could not load your profile details.'),
                  TextButton(onPressed: _load, child: const Text('Try again')),
                ],
              ),
            )
          : AbsorbPointer(
              absorbing: _saving,
              child: Form(
                key: _formKey,
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    const Text(
                      'Add a little more about yourself',
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Every field is optional. Only details you choose to show will appear on your public profile. Save to apply your changes.',
                    ),
                    const SizedBox(height: 16),
                    for (final field in profileDetailFields.entries)
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            children: [
                              TextFormField(
                                controller: _controllers[field.key],
                                maxLength: 160,
                                minLines: 1,
                                maxLines: 3,
                                decoration: InputDecoration(
                                  labelText: field.value.label,
                                  hintText: field.value.hint,
                                  alignLabelWithHint: true,
                                ),
                                onChanged: (_) => setState(() {}),
                                validator: (value) =>
                                    (value ?? '').trim().length > 160
                                    ? 'Use 160 characters or fewer.'
                                    : null,
                              ),
                              SwitchListTile.adaptive(
                                contentPadding: EdgeInsets.zero,
                                title: const Text('Show on profile'),
                                subtitle: Text(
                                  _shared.contains(field.key)
                                      ? 'Visible to anyone who views your profile'
                                      : 'Only you can see this detail',
                                ),
                                value: _shared.contains(field.key),
                                onChanged: (value) => setState(() {
                                  if (value) {
                                    _shared.add(field.key);
                                  } else {
                                    _shared.remove(field.key);
                                  }
                                }),
                              ),
                            ],
                          ),
                        ),
                      ),
                    const SizedBox(height: 16),
                    const Text(
                      'Preview of shared details',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 18,
                      ),
                    ),
                    if (_details.publicValues.values.every(
                      (value) => value.isEmpty,
                    ))
                      const Padding(
                        padding: EdgeInsets.only(top: 8),
                        child: Text(
                          'None of these details will be shown on your profile.',
                        ),
                      )
                    else
                      ProfileDetailsSummary(values: _details.publicValues),
                  ],
                ),
              ),
            ),
      bottomNavigationBar: _loading || _loadFailed
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: FilledButton(
                  onPressed: _dirty && !_saving ? _save : null,
                  child: Text(_saving ? 'Saving…' : 'Save details'),
                ),
              ),
            ),
    ),
  );
}
