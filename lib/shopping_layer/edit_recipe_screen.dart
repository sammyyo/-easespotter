import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'dart:io';
import 'package:image_picker/image_picker.dart';
import 'package:firebase_storage/firebase_storage.dart';

class EditRecipeScreen extends StatefulWidget {
  final String recipeId;
  final Map<String, dynamic> initialData;

  const EditRecipeScreen({
    super.key,
    required this.recipeId,
    required this.initialData,
  });

  @override
  State<EditRecipeScreen> createState() => _EditRecipeScreenState();
}

class _EditRecipeScreenState extends State<EditRecipeScreen> {
  late TextEditingController _titleController;
  late TextEditingController _descriptionController;
  late bool _isPublic;

  bool _isSaving = false;
  File? _imageFile;
  String? _existingImageUrl;

  final List<String> _categories = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dessert'];
  String? _selectedCategory;

  @override
  void initState() {
    super.initState();
    _titleController = TextEditingController(text: widget.initialData['title']);
    _descriptionController = TextEditingController(text: widget.initialData['description']);
    _isPublic = widget.initialData['isPublic'] ?? true;
    _existingImageUrl = widget.initialData['imageUrl'];
    _selectedCategory = widget.initialData['category'] ?? 'Dinner';
  }

  Future<void> _pickImage() async {
    final picked = await ImagePicker().pickImage(source: ImageSource.gallery);
    if (picked != null) {
      setState(() => _imageFile = File(picked.path));
    }
  }

  Future<String?> _uploadImage(String recipeId) async {
    if (_imageFile == null) return _existingImageUrl;

    final ref = FirebaseStorage.instance.ref().child('recipe_images/$recipeId.jpg');
    await ref.putFile(_imageFile!);
    return await ref.getDownloadURL();
  }

  Future<void> _updateRecipe() async {
    setState(() => _isSaving = true);

    final imageUrl = await _uploadImage(widget.recipeId);

    await FirebaseFirestore.instance.collection('recipes').doc(widget.recipeId).update({
      'title': _titleController.text.trim(),
      'description': _descriptionController.text.trim(),
      'isPublic': _isPublic,
      'imageUrl': imageUrl,
      'updatedAt': FieldValue.serverTimestamp(),
      'category': _selectedCategory,
    });

    setState(() => _isSaving = false);
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Edit Recipe')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            if (_imageFile != null)
              Image.file(_imageFile!, height: 150, fit: BoxFit.cover)
            else if (_existingImageUrl != null && _existingImageUrl!.isNotEmpty)
              Image.network(_existingImageUrl!, height: 150, fit: BoxFit.cover),

            TextButton.icon(
              onPressed: _pickImage,
              icon: const Icon(Icons.image),
              label: const Text("Pick a new image"),
            ),

            const SizedBox(height: 20),
            TextField(
              controller: _titleController,
              decoration: const InputDecoration(
                labelText: 'Title',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 20),
            TextField(
              controller: _descriptionController,
              decoration: const InputDecoration(
                labelText: 'Description',
                border: OutlineInputBorder(),
              ),
              maxLines: 4,
            ),
            const SizedBox(height: 20),
            DropdownButtonFormField<String>(
              value: _selectedCategory,
              decoration: const InputDecoration(labelText: 'Category', border: OutlineInputBorder()),
              items: _categories.map((cat) => DropdownMenuItem(value: cat, child: Text(cat))).toList(),
              onChanged: (val) => setState(() => _selectedCategory = val),
            ),
            const SizedBox(height: 20),
            SwitchListTile(
              title: const Text('Make recipe public'),
              value: _isPublic,
              onChanged: (val) => setState(() => _isPublic = val),
            ),
            const SizedBox(height: 20),
            ElevatedButton.icon(
              onPressed: _isSaving ? null : _updateRecipe,
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
