import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:video_player/video_player.dart';

class NewReelScreen extends StatefulWidget {
  const NewReelScreen({super.key});

  @override
  State<NewReelScreen> createState() => _NewReelScreenState();
}

class _NewReelScreenState extends State<NewReelScreen> {
  static const int _maxDurationSeconds = 60;

  final _titleController = TextEditingController();
  final _captionController = TextEditingController();
  final _picker = ImagePicker();

  File? _selectedVideo;
  VideoPlayerController? _previewController;
  Duration? _duration;
  bool _isPublic = true;
  bool _isSaving = false;
  bool _isPreparingVideo = false;

  Future<void> _pickVideo() async {
    final picked = await _picker.pickVideo(source: ImageSource.gallery);
    if (picked == null) return;

    setState(() => _isPreparingVideo = true);

    VideoPlayerController? controller;
    try {
      controller = VideoPlayerController.file(File(picked.path));
      await controller.initialize();

      final duration = controller.value.duration;
      if (duration.inSeconds > _maxDurationSeconds) {
        await controller.dispose();
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Please choose a video under 1 minute.'),
          ),
        );
        return;
      }

      await _previewController?.dispose();
      controller
        ..setLooping(true)
        ..setVolume(0)
        ..play();

      if (!mounted) {
        await controller.dispose();
        return;
      }

      setState(() {
        _selectedVideo = File(picked.path);
        _previewController = controller;
        _duration = duration;
      });
    } catch (e) {
      await controller?.dispose();
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Could not prepare video: $e')));
    } finally {
      if (mounted) setState(() => _isPreparingVideo = false);
    }
  }

  Future<void> _submitReel() async {
    final user = FirebaseAuth.instance.currentUser;
    final title = _titleController.text.trim();
    final caption = _captionController.text.trim();
    final video = _selectedVideo;
    final duration = _duration;

    if (user == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please sign in to post a reel.')),
      );
      return;
    }

    if (video == null || title.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Add a title and choose a video.')),
      );
      return;
    }

    if (duration != null && duration.inSeconds > _maxDurationSeconds) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Videos must be under 1 minute.')),
      );
      return;
    }

    setState(() => _isSaving = true);

    try {
      final reelRef = FirebaseFirestore.instance.collection('reels').doc();
      final storagePath = 'reel_videos/${user.uid}/${reelRef.id}.mp4';
      final storageRef = FirebaseStorage.instance.ref().child(storagePath);
      final upload = await storageRef.putFile(
        video,
        SettableMetadata(contentType: 'video/mp4'),
      );

      if (upload.state != TaskState.success) {
        throw Exception('Video upload failed');
      }

      final videoUrl = await storageRef.getDownloadURL();

      await reelRef.set({
        'title': title,
        'caption': caption,
        'videoUrl': videoUrl,
        'storagePath': storagePath,
        'durationSeconds': duration?.inSeconds,
        'uid': user.uid,
        'authorUid': user.uid,
        'isPublic': _isPublic,
        'likedBy': <String>[],
        'likesCount': 0,
        'commentsCount': 0,
        'createdAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });

      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Reel posted.')));
      Navigator.pop(context);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Could not post reel: $e')));
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  void dispose() {
    _titleController.dispose();
    _captionController.dispose();
    _previewController?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final saving = _isSaving || _isPreparingVideo;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.deepPurple,
        iconTheme: const IconThemeData(color: Colors.white),
        centerTitle: true,
        title: const Text(
          'New Reel',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
        ),
      ),
      body:
          saving && _isSaving
              ? const Center(child: CircularProgressIndicator())
              : SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    TextField(
                      controller: _titleController,
                      maxLength: 60,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: InputDecoration(
                        labelText: 'Reel title',
                        counterText: '',
                        prefixIcon: const Icon(Icons.movie_creation_outlined),
                        filled: true,
                        fillColor: Colors.white,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(
                            color: Colors.deepPurple,
                            width: 2,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _captionController,
                      maxLength: 180,
                      maxLines: 4,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: InputDecoration(
                        labelText: 'Caption',
                        alignLabelWithHint: true,
                        counterText: '',
                        filled: true,
                        fillColor: const Color(0xFFF8F7FF),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(
                            color: Colors.deepPurple,
                            width: 2,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),
                    const Text(
                      'Video',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 8),
                    _videoPicker(),
                    const SizedBox(height: 14),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Make this Reel Public'),
                      value: _isPublic,
                      onChanged:
                          saving
                              ? null
                              : (value) => setState(() => _isPublic = value),
                    ),
                    const SizedBox(height: 18),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        icon: const Icon(Icons.publish),
                        label: const Text('Post Reel'),
                        onPressed: saving ? null : _submitReel,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.deepPurple,
                          foregroundColor: Colors.white,
                          minimumSize: const Size.fromHeight(50),
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

  Widget _videoPicker() {
    final controller = _previewController;

    if (_isPreparingVideo) {
      return Container(
        height: 260,
        width: double.infinity,
        decoration: BoxDecoration(
          color: const Color(0xFFF4F1FF),
          borderRadius: BorderRadius.circular(14),
        ),
        child: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_selectedVideo == null ||
        controller == null ||
        !controller.value.isInitialized) {
      return OutlinedButton.icon(
        icon: const Icon(Icons.video_library_outlined),
        label: const Text('Choose Video'),
        onPressed: _pickVideo,
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: AspectRatio(
            aspectRatio: controller.value.aspectRatio,
            child: VideoPlayer(controller),
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Icon(Icons.timer_outlined, size: 16, color: Colors.grey.shade700),
            const SizedBox(width: 6),
            Text(
              '${_duration?.inSeconds ?? 0}s / $_maxDurationSeconds s',
              style: TextStyle(
                color: Colors.grey.shade700,
                fontWeight: FontWeight.w700,
              ),
            ),
            const Spacer(),
            TextButton.icon(
              onPressed: _pickVideo,
              icon: const Icon(Icons.swap_horiz),
              label: const Text('Change'),
            ),
          ],
        ),
      ],
    );
  }
}
