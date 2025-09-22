import 'dart:io';
import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:image_picker/image_picker.dart';


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

  String? _imageUrl;
  Timestamp? _createdAt;
  Timestamp? _updatedAt;
  bool _isLoading = true;
  bool _isPublic = false;

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    final doc = await FirebaseFirestore.instance.collection('users').doc(user.uid).get();
    if (doc.exists) {
      final data = doc.data()!;
      _nameController.text = data['displayName'] ?? '';
      _bioController.text = data['bio'] ?? '';
      _handleController.text = data['socialHandle'] ?? '';
      _taglineController.text = data['tagline'] ?? '';
      _musicController.text = data['moodMusicUrl'] ?? '';
      _imageUrl = data['avatarUrl'];
      _createdAt = data['createdAt'];
      _updatedAt = data['updatedAt'];
      _isPublic = data['publicProfile'] ?? false;
    }

    if (_createdAt == null) {
      final now = Timestamp.now();
      await FirebaseFirestore.instance.collection('users').doc(user.uid).set({'createdAt': now}, SetOptions(merge: true));
      _createdAt = now;
    }

    setState(() => _isLoading = false);
  }

  Future<void> _pickAndUploadImage() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    final picked = await ImagePicker().pickImage(source: ImageSource.gallery);
    if (picked == null) return;

    final ref = FirebaseStorage.instance.ref().child('avatars/${user.uid}.jpg');
    await ref.putFile(File(picked.path));
    final url = await ref.getDownloadURL();

    await FirebaseFirestore.instance.collection('users').doc(user.uid).set({'avatarUrl': url}, SetOptions(merge: true));
    await _loadProfile();
  }

  Future<void> _saveProfile() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    await FirebaseFirestore.instance.collection('users').doc(user.uid).set({
      'displayName': _nameController.text.trim(),
      'bio': _bioController.text.trim(),
      'socialHandle': _handleController.text.trim(),
      'tagline': _taglineController.text.trim(),
      'moodMusicUrl': _musicController.text.trim(),
      'publicProfile': _isPublic,
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));

    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Profile saved!')));
  }

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;
    final email = user?.email;

    return _isLoading
        ? const Center(child: CircularProgressIndicator())
        : Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.deepPurple,
        centerTitle: true,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text(
          'Profile Settings',
          style: TextStyle(color: Colors.white),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: GestureDetector(
                onTap: _pickAndUploadImage,
                child: CircleAvatar(
                  radius: 50,
                  backgroundImage:
                  _imageUrl != null ? NetworkImage(_imageUrl!) : null,
                  backgroundColor: Colors.deepPurple,
                  child: _imageUrl == null
                      ? const Icon(Icons.person,
                      color: Colors.white, size: 60)
                      : null,
                ),
              ),
            ),
            const SizedBox(height: 30),
            TextField(
              controller: _nameController,
              decoration: const InputDecoration(
                  labelText: 'Display Name',
                  border: OutlineInputBorder()),
            ),
            const SizedBox(height: 20),
            TextField(
              controller: _taglineController,
              decoration: const InputDecoration(
                  labelText: 'Tagline (e.g. "Snack Queen")',
                  border: OutlineInputBorder()),
            ),
            const SizedBox(height: 20),
            TextField(
              controller: _bioController,
              maxLines: 2,
              decoration: const InputDecoration(
                  labelText: 'Bio', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 20),
            TextField(
              controller: _handleController,
              decoration: const InputDecoration(
                  labelText: 'Username / Handle (optional)',
                  border: OutlineInputBorder()),
            ),
            const SizedBox(height: 20),
            TextField(
              controller: _musicController,
              decoration: const InputDecoration(
                  labelText: 'Mood Music URL (Spotify/YouTube)',
                  border: OutlineInputBorder()),
            ),
            const SizedBox(height: 20),
            if (email != null) ...[
              const Text('Email (read-only)',
                  style: TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 5),
              TextField(
                controller: TextEditingController(text: email),
                readOnly: true,
                enabled: false,
                decoration: const InputDecoration(
                    filled: true,
                    fillColor: Color(0xFFF0F0F0),
                    border: OutlineInputBorder()),
                style: const TextStyle(color: Colors.grey),
              ),
              const SizedBox(height: 20),
            ],
            if (_createdAt != null)
              Text(
                  "Joined: ${_createdAt!.toDate().toLocal().toString().split(' ').first}",
                  style: const TextStyle(color: Colors.grey)),
            if (_updatedAt != null)
              Text(
                  "Updated: ${_updatedAt!.toDate().toLocal().toString().split(' ').first}",
                  style: const TextStyle(color: Colors.grey)),
            const Divider(height: 30),
            SwitchListTile(
              title: const Text("Make Profile Public"),
              value: _isPublic,
              onChanged: (val) async {
                setState(() => _isPublic = val);
                final user = FirebaseAuth.instance.currentUser;
                if (user != null) {
                  await FirebaseFirestore.instance
                      .collection('users')
                      .doc(user.uid)
                      .set({'publicProfile': val}, SetOptions(merge: true));
                }
              },
            ),
            ElevatedButton.icon(
              onPressed: _saveProfile,
              icon: const Icon(Icons.save),
              label: const Text('Save'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.deepPurple,
                foregroundColor: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
