import 'dart:io';
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:image_picker/image_picker.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:uuid/uuid.dart';

class NewWallPostScreen extends StatefulWidget {
  const NewWallPostScreen({super.key});

  @override
  State<NewWallPostScreen> createState() => _NewWallPostScreenState();
}

class _NewWallPostScreenState extends State<NewWallPostScreen> {
  final TextEditingController _titleController = TextEditingController();
  final TextEditingController _descController = TextEditingController();
  final TextEditingController _tagController = TextEditingController();
  String _selectedType = 'tip';
  String _selectedEmoji = '💡';
  final List<String> _tags = [];
  File? _imageFile;

  Future<void> _pickImage() async {
    final picked = await ImagePicker().pickImage(source: ImageSource.gallery);
    if (picked != null) {
      setState(() => _imageFile = File(picked.path));
    }
  }

  Future<void> _submitPost() async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return;

    final postId = const Uuid().v4();
    String? imageUrl;

    if (_imageFile != null) {
      final ref = FirebaseStorage.instance.ref().child('wall_images/$postId.jpg');
      await ref.putFile(_imageFile!);
      imageUrl = await ref.getDownloadURL();
    }

    await FirebaseFirestore.instance.collection('shopping_wall').doc(postId).set({
      'title': _titleController.text.trim(),
      'description': _descController.text.trim(),
      'tags': _tags,
      'type': _selectedType,
      'emoji': _selectedEmoji,
      'imageUrl': imageUrl ?? '',
      'uid': uid,
      'createdAt': FieldValue.serverTimestamp(),
      'likedBy': [],
    });

    Navigator.pop(context);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Post submitted!')),
    );
  }

  void _addTag() {
    final tag = _tagController.text.trim();
    if (tag.isNotEmpty && !_tags.contains(tag)) {
      setState(() {
        _tags.add(tag);
        _tagController.clear();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('New ShoppingWall Post')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: SingleChildScrollView(
          child: Column(
            children: [
              TextField(controller: _titleController, decoration: const InputDecoration(labelText: 'Title')),
              const SizedBox(height: 10),
              TextField(controller: _descController, decoration: const InputDecoration(labelText: 'Description'), maxLines: 3),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _tagController,
                      decoration: const InputDecoration(labelText: 'Add Tag'),
                    ),
                  ),
                  IconButton(icon: const Icon(Icons.add), onPressed: _addTag),
                ],
              ),
              Wrap(
                spacing: 8,
                children: _tags.map((tag) => Chip(label: Text(tag), onDeleted: () {
                  setState(() => _tags.remove(tag));
                })).toList(),
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                value: _selectedType,
                items: const [
                  DropdownMenuItem(value: 'tip', child: Text('Tip')),
                  DropdownMenuItem(value: 'deal', child: Text('Deal')),
                  DropdownMenuItem(value: 'review', child: Text('Review')),
                  DropdownMenuItem(value: 'find', child: Text('Find')),
                ],
                onChanged: (val) => setState(() => _selectedType = val!),
                decoration: const InputDecoration(labelText: 'Type'),
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                value: _selectedEmoji,
                items: const [
                  DropdownMenuItem(value: '💡', child: Text('💡 Tip')),
                  DropdownMenuItem(value: '🔥', child: Text('🔥 Deal')),
                  DropdownMenuItem(value: '🛍️', child: Text('🛍️ Find')),
                  DropdownMenuItem(value: '⭐', child: Text('⭐ Review')),
                ],
                onChanged: (val) => setState(() => _selectedEmoji = val!),
                decoration: const InputDecoration(labelText: 'Emoji'),
              ),
              const SizedBox(height: 20),
              _imageFile != null
                  ? Image.file(_imageFile!, height: 120)
                  : TextButton.icon(
                icon: const Icon(Icons.image),
                label: const Text('Upload Image'),
                onPressed: _pickImage,
              ),
              const SizedBox(height: 20),
              ElevatedButton.icon(
                onPressed: _submitPost,
                icon: const Icon(Icons.send),
                label: const Text('Post'),
                style: ElevatedButton.styleFrom(backgroundColor: Colors.deepPurple),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
