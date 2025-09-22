import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class CreateMissionScreen extends StatefulWidget {
  const CreateMissionScreen({super.key});

  @override
  State<CreateMissionScreen> createState() => _CreateMissionScreenState();
}

class _CreateMissionScreenState extends State<CreateMissionScreen> {
  final TextEditingController _titleController = TextEditingController();
  final TextEditingController _goalController = TextEditingController();
  final TextEditingController _storeController = TextEditingController();
  bool _isPublic = true;
  bool _isSubmitting = false;

  Future<void> _submitMission() async {
    final title = _titleController.text.trim();
    final goal = _goalController.text.trim();
    final store = _storeController.text.trim();
    final user = FirebaseAuth.instance.currentUser;

    if (title.isEmpty || goal.isEmpty || user == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please fill in all required fields')),
      );
      return;
    }

    setState(() => _isSubmitting = true);

    await FirebaseFirestore.instance.collection('missions').add({
      'title': title,
      'goal': goal,
      'store': store,
      'isPublic': _isPublic,
      'creatorUid': user.uid,
      'createdAt': FieldValue.serverTimestamp(),
      'items': [],
    });

    setState(() => _isSubmitting = false);
    Navigator.pop(context);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Shopping Mission Created!')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Create Shopping Mission')),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: _titleController,
              decoration: const InputDecoration(labelText: 'Mission Title *'),
            ),
            const SizedBox(height: 15),
            TextField(
              controller: _goalController,
              decoration: const InputDecoration(labelText: 'Goal / Prompt *'),
            ),
            const SizedBox(height: 15),
            TextField(
              controller: _storeController,
              decoration: const InputDecoration(labelText: 'Store / Aisle (optional)'),
            ),
            const SizedBox(height: 15),
            SwitchListTile(
              title: const Text('Make this mission public'),
              value: _isPublic,
              onChanged: (val) => setState(() => _isPublic = val),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                icon: const Icon(Icons.send),
                label: const Text('Create Mission'),
                style: ElevatedButton.styleFrom(backgroundColor: Colors.deepPurple),
                onPressed: _isSubmitting ? null : _submitMission,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
