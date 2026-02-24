import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

/// Same idea as GlowUpFeedScreen
class GlowTag {
  final String label;
  final String queryValue;
  final IconData icon;
  const GlowTag(this.label, this.queryValue, this.icon);
}

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

  //  Feed-style tags w/ icons + clean query values
  final List<GlowTag> _tags = const [
    GlowTag('Pantry',       'pantry',       Icons.kitchen_rounded),
    GlowTag('Budget',       'budget',       Icons.attach_money_rounded),
    GlowTag('Vegan',        'vegan',        Icons.eco_rounded),
    GlowTag('Snacks',       'snacks',       Icons.fastfood_rounded),
    GlowTag('Before/After', 'before-after', Icons.compare_rounded),
  ];

  // Multi-select storage
  final Set<String> _selectedTagValues = <String>{};

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: ImageSource.gallery);
    if (picked == null) return;

    final croppedFile = await ImageCropper().cropImage(
      sourcePath: picked.path,
      aspectRatio: const CropAspectRatio(ratioX: 4, ratioY: 5),
      uiSettings: [
        AndroidUiSettings(
            toolbarTitle: 'Crop Image',
            toolbarColor: Colors.deepPurple,
            toolbarWidgetColor: Colors.white,
            initAspectRatio: CropAspectRatioPreset.original,
            lockAspectRatio: true),
        IOSUiSettings(
          title: 'Crop Image',
          aspectRatioLockEnabled: true,
        ),
      ],
    );

    if (croppedFile != null) {
      setState(() => _selectedImage = File(croppedFile.path));
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
      final storageRef =
      FirebaseStorage.instance.ref().child('glowup_images/$fileName.jpg');

      final uploadTask = await storageRef.putFile(_selectedImage!);
      if (uploadTask.state != TaskState.success) {
        throw Exception('Image upload failed');
      }

      final imageUrl = await storageRef.getDownloadURL();

      final glowUpDoc = {
        'title': title,
        'description': desc,
        'imageUrl': imageUrl,
        'uid': user.uid,
        'authorUid': user.uid,
        'createdAt': FieldValue.serverTimestamp(),
        'isPublic': _isPublic,
        //  save query values (already lowercase)
        'tags': _selectedTagValues.toList(),
        'updatedAt': FieldValue.serverTimestamp(),
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

  ///  Feed-style chips but wrapped + multi-select
  Widget _buildTagChips() {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _tags.map((tag) {
        final bool selected = _selectedTagValues.contains(tag.queryValue);

        return Semantics(
          button: true,
          selected: selected,
          label: 'Tag: ${tag.label}',
          child: ChoiceChip(
            labelPadding: const EdgeInsets.symmetric(horizontal: 8),
            avatar: Icon(
              tag.icon,
              size: 18,
              color: selected
                  ? Colors.white
                  : Theme.of(context).colorScheme.onSurface.withOpacity(0.7),
            ),
            label: Text(
              tag.label,
              style: TextStyle(
                fontWeight: FontWeight.w600,
                color: selected
                    ? Colors.white
                    : Theme.of(context).colorScheme.onSurface,
              ),
            ),
            selected: selected,
            showCheckmark: false,
            backgroundColor:
            Theme.of(context).colorScheme.surfaceContainerHighest,
            selectedColor: Colors.deepPurple,
            shape: StadiumBorder(
              side: BorderSide(
                color: selected
                    ? Colors.deepPurple
                    : Theme.of(context).dividerColor,
              ),
            ),
            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
            onSelected: (_) {
              setState(() {
                if (selected) {
                  _selectedTagValues.remove(tag.queryValue);
                } else {
                  _selectedTagValues.add(tag.queryValue);
                }
              });
            },
          ),
        );
      }).toList(),
    );
  }

  //  Nicer title field (same vibe as NewRecipeScreen)
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
        labelText: 'Glow-Up title',
        hintText: 'e.g. Pantry',
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

  //  Nicer description field (same vibe as NewRecipeScreen)
  Widget _buildDescriptionField() {
    return TextField(
      controller: _descController,
      textCapitalization: TextCapitalization.sentences,
      maxLines: 6,
      minLines: 4,
      decoration: InputDecoration(
        labelText: 'Story / what changed',
        alignLabelWithHint: true,
        hintText:
        'Description…',
        helperText: 'Tip: Focus on the transformation and 2–4 key details.',
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

  @override
  void dispose() {
    _titleController.dispose();
    _descController.dispose();
    super.dispose();
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
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Section label
            Text(
              'Story details',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: Colors.grey.shade800,
              ),
            ),
            const SizedBox(height: 12),

            // ✏️ Title
            _buildTitleField(),
            const SizedBox(height: 18),

            // 📝 Description
            _buildDescriptionField(),
            const SizedBox(height: 24),

            const Text(
              'Tags',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 6),
            _buildTagChips(),
            const SizedBox(height: 16),

            const Text(
              'Image',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 6),

            _selectedImage == null
                ? OutlinedButton.icon(
              icon: const Icon(Icons.image),
              label: const Text('Pick Image'),
              onPressed: _pickImage,
            )
                : Column(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Image.file(
                    _selectedImage!,
                    height: 180,
                    width: double.infinity,
                    fit: BoxFit.cover,
                  ),
                ),
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
              onChanged: (val) =>
                  setState(() => _isPublic = val),
            ),
            const SizedBox(height: 20),

            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                icon: const Icon(Icons.check),
                label: const Text('Submit'),
                onPressed: _submitGlowUp,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.deepPurple,
                  foregroundColor: Colors.white,
                  minimumSize: const Size.fromHeight(50),
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
          ],
        ),
      ),
    );
  }
}
