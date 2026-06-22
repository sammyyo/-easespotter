import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:easespotter/services/user_scoped_prefs.dart';

class RemixMissionScreen extends StatefulWidget {
  final String missionId;
  final String missionTitle;
  final List<Map<String, dynamic>> originalItems;

  const RemixMissionScreen({
    super.key,
    required this.missionId,
    required this.missionTitle,
    required this.originalItems,
  });

  @override
  State<RemixMissionScreen> createState() => _RemixMissionScreenState();
}

class _RemixMissionScreenState extends State<RemixMissionScreen> {
  final TextEditingController _listTitleController = TextEditingController();
  late List<Map<String, dynamic>> _editableItems;

  @override
  void initState() {
    super.initState();
    _listTitleController.text = "Remix: ${widget.missionTitle}";
    _editableItems =
        widget.originalItems.map((item) {
          return {
            'title': item['title'] ?? '',
            'quantity': 1,
            'category': 'General',
            'checked': false,
            'source': 'remix:${widget.missionId}',
          };
        }).toList();
  }

  void _updateItemTitle(int index, String value) {
    setState(() {
      _editableItems[index]['title'] = value;
    });
  }

  void _updateQuantity(int index, int change) {
    setState(() {
      final current = _editableItems[index]['quantity'] ?? 1;
      final updated = (current + change).clamp(1, 99);
      _editableItems[index]['quantity'] = updated;
    });
  }

  Future<void> _saveRemixedList() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    // Save to SharedPreferences (existing logic)
    final prefs = await SharedPreferences.getInstance();
    final stored = prefs.getString(UserScopedPrefs.key('grocery_list')) ?? '[]';
    final existing = List<Map<String, dynamic>>.from(jsonDecode(stored));
    final updated = [...existing, ..._editableItems];
    await prefs.setString(
      UserScopedPrefs.key('grocery_list'),
      jsonEncode(updated),
    );

    // 🔁 Create minimal Firestore log
    final remixDoc = await FirebaseFirestore.instance
        .collection('remixed_lists')
        .add({
          'title': _listTitleController.text.trim(),
          'originalMissionId': widget.missionId,
          'createdBy': user.uid,
          'createdAt': FieldValue.serverTimestamp(),
        });

    // 🔔 Notify original mission creator
    final originalMissionDoc =
        await FirebaseFirestore.instance
            .collection('missions')
            .doc(widget.missionId)
            .get();

    final originalOwnerId = originalMissionDoc.data()?['createdBy'];

    if (originalOwnerId != null && originalOwnerId != user.uid) {
      await FirebaseFirestore.instance
          .collection('users')
          .doc(originalOwnerId)
          .collection('notifications')
          .add({
            'type': 'remix',
            'message': 'remixed your mission: ${widget.missionTitle}',
            'sourceUid': user.uid,
            'relatedId': remixDoc.id,
            'createdAt': FieldValue.serverTimestamp(),
            'isRead': false,
          });
    }

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Remixed list added to your Grocery List!')),
    );

    Navigator.popUntil(context, (route) => route.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Remix This List',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: _listTitleController,
              decoration: const InputDecoration(labelText: 'Custom List Title'),
            ),
            const SizedBox(height: 20),
            const Text(
              'Review & Edit Items:',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 10),
            Expanded(
              child: ListView.builder(
                itemCount: _editableItems.length,
                itemBuilder: (context, index) {
                  final item = _editableItems[index];
                  return Card(
                    child: ListTile(
                      title: TextFormField(
                        initialValue: item['title'],
                        onChanged: (val) => _updateItemTitle(index, val),
                        decoration: const InputDecoration(
                          border: InputBorder.none,
                        ),
                      ),
                      subtitle: Row(
                        children: [
                          Text('Qty: ${item['quantity']}'),
                          IconButton(
                            icon: const Icon(Icons.remove),
                            onPressed: () => _updateQuantity(index, -1),
                          ),
                          IconButton(
                            icon: const Icon(Icons.add),
                            onPressed: () => _updateQuantity(index, 1),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _saveRemixedList,
                icon: const Icon(Icons.save),
                label: const Text('Save to My Grocery List'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.deepPurple,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
