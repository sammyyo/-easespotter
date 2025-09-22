import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class NewGlowUpScreen extends StatefulWidget {
  const NewGlowUpScreen({super.key});

  @override
  State<NewGlowUpScreen> createState() => _NewGlowUpScreenState();
}

class _NewGlowUpScreenState extends State<NewGlowUpScreen> {
  final _titleController = TextEditingController();
  final _descController = TextEditingController();
  bool _isPublic = true;
  File? _selectedImage;
  bool _isLoading = false;

  final List<String> _availableTags = ['Pantry', 'Budget', 'Vegan', 'Snacks', 'Before/After'];
  final List<String> _selectedTags = [];

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: ImageSource.gallery);
    if (picked != null) {
      setState(() => _selectedImage = File(picked.path));
    }
  }

  Future<void> _submitGlowUp() async {
    final user = FirebaseAuth.instance.currentUser;
    final title = _titleController.text.trim();
    final desc = _descController.text.trim();

    if (user == null || title.isEmpty || _selectedImage == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please complete all required fields.')),
      );
      return;
    }

    setState(() => _isLoading = true);

    try {
      final fileName = '${user.uid}_${DateTime.now().millisecondsSinceEpoch}';
      final storageRef = FirebaseStorage.instance.ref().child('glowup_images/$fileName.jpg');

      // Upload image
      final uploadTask = await storageRef.putFile(_selectedImage!);
      if (uploadTask.state != TaskState.success) {
        throw Exception('Image upload failed');
      }

      final imageUrl = await storageRef.getDownloadURL();

      // Firestore write
      final glowUpDoc = {
        'title': title,
        'description': desc,
        'imageUrl': imageUrl,
        'authorUid': user.uid,
        'createdAt': FieldValue.serverTimestamp(),
        'isPublic': _isPublic,
        'tags': _selectedTags.map((t) => t.toLowerCase()).toList(),
      };

      await FirebaseFirestore.instance.collection('glowups').add(glowUpDoc);

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Glow-Up submitted!')),
      );
      Navigator.pop(context);
    } catch (e) {
      debugPrint('Glow-Up submission error: $e');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Submission failed: ${e.toString()}')),
      );
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }


  Widget _buildTagChips() {
    return Wrap(
      spacing: 10,
      children: _availableTags.map((tag) {
        final isSelected = _selectedTags.contains(tag);
        return FilterChip(
          label: Text(tag),
          selected: isSelected,
          selectedColor: Colors.deepPurple.shade100,
          onSelected: (selected) {
            setState(() {
              if (selected) {
                _selectedTags.add(tag);
              } else {
                _selectedTags.remove(tag);
              }
            });
          },
        );
      }).toList(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.deepPurple,
        centerTitle: true,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text(
          'New Glow-Up Story',
          style: TextStyle(color: Colors.white),
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: _titleController,
              decoration: const InputDecoration(labelText: 'Title'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _descController,
              maxLines: 3,
              decoration: const InputDecoration(labelText: 'Description'),
            ),
            const SizedBox(height: 16),
            const Text('Tags', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 6),
            _buildTagChips(),
            const SizedBox(height: 16),
            const Text('Image', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 6),
            _selectedImage == null
                ? OutlinedButton.icon(
              icon: const Icon(Icons.image),
              label: const Text('Pick Image'),
              onPressed: _pickImage,
            )
                : Column(
              children: [
                Image.file(_selectedImage!, height: 180),
                TextButton(
                  onPressed: _pickImage,
                  child: const Text('Change Image'),
                ),
              ],
            ),
            const SizedBox(height: 12),
            SwitchListTile(
              title: const Text('Make this Glow-Up Public'),
              value: _isPublic,
              onChanged: (val) => setState(() => _isPublic = val),
            ),
            const SizedBox(height: 20),
            ElevatedButton.icon(
              icon: const Icon(Icons.check),
              label: const Text('Submit'),
              onPressed: _submitGlowUp,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.deepPurple,
                foregroundColor: Colors.white,
                minimumSize: const Size.fromHeight(50),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
