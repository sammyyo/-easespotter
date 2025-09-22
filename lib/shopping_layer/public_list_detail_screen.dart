import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
// import 'package:easespotter/widgets/public_profile_widget.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:easespotter/widgets/attribution_tag.dart';
import 'dart:convert';

class PublicListDetailScreen extends StatelessWidget {
  final String listId;

  const PublicListDetailScreen({super.key, required this.listId});

  Future<void> _copyListToMyGroceryList(
      List<Map<String, dynamic>> items, BuildContext context) async {
    final prefs = await SharedPreferences.getInstance();

    // Convert items to JSON and store in local key
    final jsonList = jsonEncode(items);
    await prefs.setString('grocery_list', jsonList);

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('List copied to My Grocery List!'),
        backgroundColor: Colors.green,
      ),
    );

    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Shared List'),
        backgroundColor: Colors.deepPurple,
        foregroundColor: Colors.white,
      ),
      body: FutureBuilder<DocumentSnapshot>(
        future: FirebaseFirestore.instance.collection('public_lists').doc(listId).get(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (!snapshot.hasData || !snapshot.data!.exists) {
            return const Center(child: Text('List not found'));
          }

          final data = snapshot.data!.data() as Map<String, dynamic>;
          final title = data['title'] ?? 'Untitled';
          final description = data['description'] ?? '';
          final createdAt = (data['createdAt'] as Timestamp?)?.toDate();
          final items = List<Map<String, dynamic>>.from(data['items'] ?? []);
          final uid = data['uid'] ?? '';

          return Column(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title,
                          style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 10),
                      if (createdAt != null)
                        Text('Shared on ${createdAt.toLocal().toString().split(' ').first}',
                            style: const TextStyle(color: Colors.grey)),
                      const SizedBox(height: 20),
                      AttributionTag(uid: uid, showDate: true),
                      const SizedBox(height: 30),
                      if (description.isNotEmpty)
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Description:',
                                style: TextStyle(fontWeight: FontWeight.bold)),
                            const SizedBox(height: 5),
                            Text(description),
                            const SizedBox(height: 20),
                          ],
                        ),
                      const Text('Items:', style: TextStyle(fontWeight: FontWeight.bold)),
                      const SizedBox(height: 10),
                      ...items.map((item) {
                        final title = item['title'] ?? '';
                        final qty = item['quantity'] ?? 1;
                        final cat = item['category'] ?? 'General';
                        final price = item['price']?.toStringAsFixed(2) ?? '';

                        return Card(
                          margin: const EdgeInsets.only(bottom: 10),
                          child: ListTile(
                            leading: const Icon(Icons.check_circle_outline,
                                color: Colors.deepPurple),
                            title: Text(title),
                            subtitle: Text('Qty: $qty • $cat'),
                            trailing: price.isNotEmpty ? Text('\$$price') : null,
                          ),
                        );
                      }),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(16),
                child: SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () => _copyListToMyGroceryList(items, context),
                    icon: const Icon(Icons.copy),
                    label: const Text('Copy to My Grocery List'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.deepPurple,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
