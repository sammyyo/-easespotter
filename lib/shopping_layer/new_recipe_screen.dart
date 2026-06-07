import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'dart:io';
import 'package:image_picker/image_picker.dart';
import 'package:firebase_storage/firebase_storage.dart';

class NewRecipeScreen extends StatefulWidget {
  const NewRecipeScreen({super.key});

  @override
  State<NewRecipeScreen> createState() => _NewRecipeScreenState();
}

class _NewRecipeScreenState extends State<NewRecipeScreen> {
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  bool _isPublic = true;
  bool _isSaving = false;

  File? _imageFile;

  final List<String> _categories = [
    'Breakfast',
    'Lunch',
    'Dinner',
    'Snack',
    'Dessert'
  ];
  String _selectedCategory = 'Dinner';

  final GlobalKey _categoryFieldKey = GlobalKey();

  // NEW: ingredients
  final _ingredientController = TextEditingController();
  final List<Map<String, dynamic>> _ingredients = [];

  @override
  void initState() {
    super.initState();
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    _ingredientController.dispose();
    super.dispose();
  }

  //  Updated to store both display and normalized names
  void _addIngredient() {
    final raw = _ingredientController.text.trim();
    if (raw.isEmpty) return;

    final normalized = raw.toLowerCase().trim();

    final exists = _ingredients.any((i) =>
        (i['normalized'] ?? '').toString().trim().toLowerCase() == normalized);

    if (exists) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Ingredient already added')),
      );
      return;
    }

    setState(() {
      _ingredients.add({
        'name': raw,
        'normalized': normalized,
      });
      _ingredientController.clear();
    });
  }

  void _removeIngredientAt(int index) {
    setState(() => _ingredients.removeAt(index));
  }

  Future<void> _pickImage() async {
    final picked =
    await ImagePicker().pickImage(source: ImageSource.gallery);
    if (picked != null) {
      setState(() => _imageFile = File(picked.path));
    }
  }

  Future<String?> _uploadImage(String recipeId) async {
    if (_imageFile == null) return null;

    final ref =
    FirebaseStorage.instance.ref().child('recipe_images/$recipeId.jpg');
    await ref.putFile(_imageFile!);
    return await ref.getDownloadURL();
  }

  Future<void> _submitRecipe() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    final title = _titleController.text.trim();
    final description = _descriptionController.text.trim();

    if (title.isEmpty || description.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Title and Description are required')),
      );
      return;
    }

    if (_ingredients.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please add at least 1 ingredient')),
      );
      return;
    }

    if (_imageFile == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please add an image')),
      );
      return;
    }

    setState(() => _isSaving = true);

    try {
      final docRef =
      FirebaseFirestore.instance.collection('recipes').doc();
      final imageUrl = await _uploadImage(docRef.id);

      await docRef.set({
        'title': title,
        'description': description,
        'uid': user.uid,
        'serverCreatedAt': FieldValue.serverTimestamp(),
        'upvotedBy': [],
        'upvotesCount': 0,
        'isPublic': _isPublic,
        'category': _selectedCategory,
        'imageUrl': imageUrl,

        //  Updated to save the normalized name for matching
        'ingredients': _ingredients
            .map((i) => {
                  'name': (i['name'] ?? '').toString(),
                  'normalized': (i['normalized'] ?? '').toString(),
                })
            .where((i) => (i['name'] ?? '').toString().isNotEmpty)
            .toList(),
      });

      if (!mounted) return;
      Navigator.pop(context);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error submitting recipe: $e')),
      );
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  Future<void> _openCategoryMenu() async {
    final RenderBox box =
    _categoryFieldKey.currentContext!.findRenderObject() as RenderBox;
    final RenderBox overlay =
    Overlay.of(context).context.findRenderObject() as RenderBox;

    final Offset offset = box.localToGlobal(Offset.zero);
    final Size overlaySize = overlay.size;

    final double popupWidth = overlaySize.width - (20.0 * 2);
    final double left = 20.0;
    final double top = offset.dy + box.size.height + 8.0;
    final double right = 20.0;

    final selected = await showMenu<String>(
      context: context,
      color: Colors.white,
      elevation: 8,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      constraints: BoxConstraints.tightFor(width: popupWidth),
      position: RelativeRect.fromLTRB(
        left,
        top,
        right,
        overlaySize.height - top,
      ),
      items: _categories.asMap().entries.map((entry) {
        final i = entry.key;
        final cat = entry.value;
        final isLast = i == _categories.length - 1;
        final isSelected = cat == _selectedCategory;

        return PopupMenuItem<String>(
          value: cat,
          padding: EdgeInsets.zero,
          child: Container(
            width: popupWidth,
            padding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            decoration: BoxDecoration(
              color:
              isSelected ? const Color(0xFFF3EDFF) : Colors.transparent,
              border: isLast
                  ? null
                  : const Border(
                bottom:
                BorderSide(color: Color(0xFFE6E6E6), width: 1),
              ),
            ),
            child: Text(
              cat,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: isSelected ? Colors.deepPurple : Colors.black87,
              ),
            ),
          ),
        );
      }).toList(),
    );

    if (selected != null && selected != _selectedCategory) {
      setState(() => _selectedCategory = selected);
    }
  }

  Widget _buildCategoryDropdown() {
    return SizedBox(
      width: double.infinity,
      child: GestureDetector(
        key: _categoryFieldKey,
        onTap: _openCategoryMenu,
        child: InputDecorator(
          decoration: InputDecoration(
            labelText: 'Category',
            labelStyle: const TextStyle(color: Colors.deepPurple),
            filled: true,
            fillColor: Colors.white,
            border:
            OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            contentPadding:
            const EdgeInsets.symmetric(horizontal: 15, vertical: 14),
            suffixIcon: const Icon(
              Icons.keyboard_arrow_down_rounded,
              color: Colors.deepPurple,
              size: 28,
            ),
          ),
          child: Text(
            _selectedCategory,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTitleField() {
    return TextField(
      controller: _titleController,
      textCapitalization: TextCapitalization.words,
      maxLength: 60,
      style: const TextStyle(
        fontSize: 20,
        fontWeight: FontWeight.w600,
      ),
      decoration: InputDecoration(
        labelText: 'Recipe title',
        hintText: 'e.g. Creamy Garlic Pasta',
        filled: true,
        fillColor: Colors.white,
        counterText: '',
        prefixIcon: const Icon(Icons.edit_outlined),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(
            color: Color(0xFFE0E0E0),
            width: 1.2,
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(
            color: Colors.deepPurple,
            width: 2,
          ),
        ),
        contentPadding:
        const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      ),
    );
  }

  Widget _buildDescriptionField() {
    return TextField(
      controller: _descriptionController,
      textCapitalization: TextCapitalization.sentences,
      maxLines: 6,
      minLines: 4,
      decoration: InputDecoration(
        labelText: 'Description / steps',
        alignLabelWithHint: true,
        hintText:
        'Share what makes this recipe special and add the key steps or tips…',
        helperText: 'Tip: 3–6 short sentences work best.',
        helperStyle: const TextStyle(
          fontSize: 12,
          color: Colors.black54,
        ),
        filled: true,
        fillColor: const Color(0xFFF8F7FF),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(
            color: Color(0xFFE0E0E0),
            width: 1.2,
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(
            color: Colors.deepPurple,
            width: 2,
          ),
        ),
        contentPadding:
        const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      ),
    );
  }

  Widget _buildIngredientsSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: Text(
            'Ingredients',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: Colors.grey.shade800,
            ),
          ),
        ),
        const SizedBox(height: 10),

        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _ingredientController,
                textCapitalization: TextCapitalization.words,
                onSubmitted: (_) => _addIngredient(),
                decoration: InputDecoration(
                  hintText: 'e.g. Milk',
                  filled: true,
                  fillColor: Colors.white,
                  prefixIcon: const Icon(Icons.local_grocery_store_outlined),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(
                      color: Color(0xFFE0E0E0),
                      width: 1.2,
                    ),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(
                      color: Colors.deepPurple,
                      width: 2,
                    ),
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 14,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 10),
            SizedBox(
              height: 50,
              child: ElevatedButton(
                onPressed: _addIngredient,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.deepPurple,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text('Add'),
              ),
            ),
          ],
        ),

        const SizedBox(height: 12),

        if (_ingredients.isEmpty)
          Text(
            'Add at least 1 ingredient so “Cook With What I Have” can match recipes.',
            style: TextStyle(
              color: Colors.grey.shade700,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          )
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: List.generate(_ingredients.length, (index) {
              final name = (_ingredients[index]['name'] ?? '').toString();
              return Chip(
                label: Text(
                  name,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                deleteIcon: const Icon(Icons.close, size: 18),
                onDeleted: () => _removeIngredientAt(index),
              );
            }),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.deepPurple,
        iconTheme: const IconThemeData(color: Colors.white),
        centerTitle: true,
        title: const Text(
          'New Recipe',
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
      body: Stack(
        children: [
          SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              children: [
                Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'Recipe details',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: Colors.grey.shade800,
                    ),
                  ),
                ),
                const SizedBox(height: 12),

                _buildTitleField(),
                const SizedBox(height: 18),

                _buildDescriptionField(),
                const SizedBox(height: 18),

                _buildCategoryDropdown(),
                const SizedBox(height: 22),

                // ✅ NEW: Ingredients UI
                _buildIngredientsSection(),

                const SizedBox(height: 24),

                if (_imageFile != null)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.file(
                      _imageFile!,
                      height: 150,
                      fit: BoxFit.cover,
                    ),
                  ),
                TextButton.icon(
                  onPressed: _pickImage,
                  icon: const Icon(Icons.image),
                  label: const Text("Pick an image"),
                ),
                const SizedBox(height: 20),

                SwitchListTile(
                  title: const Text('Make recipe public'),
                  value: _isPublic,
                  onChanged: (val) => setState(() => _isPublic = val),
                ),
                const SizedBox(height: 20),

                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: _isSaving ? null : _submitRecipe,
                    icon: const Icon(Icons.send),
                    label: const Text('Submit'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.deepPurple,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(
                        vertical: 14,
                        horizontal: 16,
                      ),
                      textStyle: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 40),
              ],
            ),
          ),
          if (_isSaving)
            Container(
              color: Colors.black45,
              child: const Center(
                child: CircularProgressIndicator(color: Colors.white),
              ),
            ),
        ],
      ),
    );
  }
}
