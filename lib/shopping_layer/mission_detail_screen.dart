import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'remix_mission_screen.dart';

class MissionDetailScreen extends StatefulWidget {
  final String missionId;
  const MissionDetailScreen({super.key, required this.missionId});

  @override
  State<MissionDetailScreen> createState() => _MissionDetailScreenState();
}

class _MissionDetailScreenState extends State<MissionDetailScreen> {
  final TextEditingController _itemController = TextEditingController();
  List<Map<String, dynamic>> _items = [];

  Future<void> _submitItem(String title) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null || title.trim().isEmpty) return;

    await FirebaseFirestore.instance
        .collection('missions')
        .doc(widget.missionId)
        .update({
      'items': FieldValue.arrayUnion([
        {
          'title': title.trim(),
          'submittedBy': user.uid,
          'createdAt': FieldValue.serverTimestamp(),
          'upvotes': [],
        }
      ])
    });

    _itemController.clear();
  }

  Future<void> _toggleUpvote(int index, String uid, List<dynamic> currentItems) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    final item = Map<String, dynamic>.from(currentItems[index]);
    final upvotes = List<String>.from(item['upvotes'] ?? []);
    final userId = user.uid;

    if (upvotes.contains(userId)) {
      upvotes.remove(userId);
    } else {
      upvotes.add(userId);
    }

    item['upvotes'] = upvotes;
    currentItems[index] = item;

    await FirebaseFirestore.instance
        .collection('missions')
        .doc(widget.missionId)
        .update({'items': currentItems});
  }

  void _navigateToRemixScreen(String title) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => RemixMissionScreen(
          missionId: widget.missionId,
          missionTitle: title,
          originalItems: _items,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mission Details',
        style: TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.bold,
        ),
      )),
      body: StreamBuilder<DocumentSnapshot>(
        stream: FirebaseFirestore.instance.collection('missions').doc(widget.missionId).snapshots(),
        builder: (context, snapshot) {
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }

          final data = snapshot.data!.data() as Map<String, dynamic>;
          final title = data['title'] ?? '';
          final goal = data['goal'] ?? '';
          _items = List<Map<String, dynamic>>.from(data['items'] ?? []);

          return Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Text(goal),
                const SizedBox(height: 20),
                ElevatedButton.icon(
                  onPressed: () => _navigateToRemixScreen(title),
                  icon: const Icon(Icons.copy),
                  label: const Text("Remix This List"),
                  style: ElevatedButton.styleFrom(backgroundColor: Colors.deepPurple),
                ),
                const Divider(height: 30),
                TextField(
                  controller: _itemController,
                  decoration: InputDecoration(
                    hintText: 'Add item to this mission...',
                    suffixIcon: IconButton(
                      icon: const Icon(Icons.send),
                      onPressed: () => _submitItem(_itemController.text),
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                const Text('Submitted Items:', style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 10),
                Expanded(
                  child: ListView.builder(
                    itemCount: _items.length,
                    itemBuilder: (context, index) {
                      final item = _items[index];
                      final itemTitle = item['title'] ?? '';
                      final upvotes = List<String>.from(item['upvotes'] ?? []);
                      final isUpvoted = FirebaseAuth.instance.currentUser != null && upvotes.contains(FirebaseAuth.instance.currentUser!.uid);

                      return Card(
                        child: ListTile(
                          title: Text(itemTitle),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text('${upvotes.length}'),
                              IconButton(
                                icon: Icon(
                                  isUpvoted ? Icons.favorite : Icons.favorite_border,
                                  color: isUpvoted ? Colors.red : Colors.grey,
                                ),
                                onPressed: () => _toggleUpvote(index, item['submittedBy'], _items),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
