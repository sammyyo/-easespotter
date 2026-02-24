import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import 'store_profile_screen.dart';

class FollowedStoresScreen extends StatelessWidget {
  const FollowedStoresScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser?.uid;

    if (uid == null) {
      return const Scaffold(
        body: Center(child: Text('You must be logged in.')),
      );
    }

    final query = FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .collection('followedStores')
        .orderBy('followedAt', descending: true);

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Followed Stores',
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
        centerTitle: true,
        backgroundColor: Colors.deepPurple,
        foregroundColor: Colors.white,
      ),
      body: StreamBuilder<QuerySnapshot>(
        stream: query.snapshots(),
        builder: (context, snap) {
          if (snap.hasError) {
            return Center(child: Text('Error: ${snap.error}'));
          }
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (!snap.hasData || snap.data!.docs.isEmpty) {
            return const Center(
              child: Text('No followed stores yet.'),
            );
          }

          final docs = snap.data!.docs;

          return ListView.separated(
            padding: const EdgeInsets.all(12),
            itemCount: docs.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (context, i) {
              final data = docs[i].data() as Map<String, dynamic>;

              final storeId = (data['storeId'] ?? docs[i].id).toString();
              final storeName = (data['storeName'] ?? 'Unknown Store').toString();
              final logoUrl = data['logoUrl']?.toString() ?? '';

              return Card(
                elevation: 2,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: Colors.deepPurple.shade50,
                    child: logoUrl.isNotEmpty
                        ? ClipOval(
                            child: Image.network(
                              logoUrl,
                              width: 40,
                              height: 40,
                              fit: BoxFit.cover,
                              errorBuilder: (context, error, stackTrace) {
                                return const Icon(Icons.store, color: Colors.deepPurple);
                              },
                            ),
                          )
                        : const Icon(Icons.store, color: Colors.deepPurple),
                  ),
                  title: Text(storeName),
                  subtitle: const Text('Tap to view store'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => StoreProfileScreen(
                          storeId: storeId,
                          storeName: storeName,
                          logoUrl: logoUrl,
                        ),
                      ),
                    );
                  },
                ),
              );
            },
          );
        },
      ),
    );
  }
}
