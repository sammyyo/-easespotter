import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:easespotter/widgets/user_list_item.dart';

class FollowListScreen extends StatefulWidget {
  final String userId;
  final int initialTabIndex;

  const FollowListScreen({
    super.key,
    required this.userId,
    this.initialTabIndex = 0,
  });

  @override
  State<FollowListScreen> createState() => _FollowListScreenState();
}

class _FollowListScreenState extends State<FollowListScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(
      length: 2,
      vsync: this,
      initialIndex: widget.initialTabIndex,
    );
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final myUid = widget.userId;

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Connections',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
        ),
        backgroundColor: Colors.deepPurple,
        centerTitle: true,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: Column(
        children: [
          TabBar(
            controller: _tabController,
            labelColor: Colors.deepPurple,
            unselectedLabelColor: Colors.grey,
            indicatorColor: Colors.deepPurple,
            tabs: const [
              Tab(text: 'Followers'),
              Tab(text: 'Following'),
            ],
          ),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _UserListView(
                  myUid: myUid,
                  query: FirebaseFirestore.instance
                      .collection('users')
                  // People who follow me: their "following" contains my uid
                      .where('following', arrayContains: myUid),
                ),
                _FollowingListView(userId: myUid),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _UserListView extends StatelessWidget {
  final Query query;
  final String myUid;

  const _UserListView({
    required this.query,
    required this.myUid,
  });

  DocumentReference<Map<String, dynamic>> _topRef(String otherUid) {
    // Doc id MUST be the other user's UID
    return FirebaseFirestore.instance
        .collection('users')
        .doc(myUid)
        .collection('top_collaborators')
        .doc(otherUid);
  }

  Future<void> _addToTop(BuildContext context, String otherUid) async {
    try {
      // Matches your rules: keys only [createdAt, addedBy]
      await _topRef(otherUid).set({
        'createdAt': FieldValue.serverTimestamp(),
        'addedBy': myUid,
      });
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e')),
        );
      }
    }
  }

  Future<void> _removeFromTop(BuildContext context, String otherUid) async {
    try {
      await _topRef(otherUid).delete();
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e')),
        );
      }
    }
  }

  Future<void> _toggleTop(
      BuildContext context, {
        required String otherUid,
        required bool isTop,
      }) async {
    if (isTop) {
      await _removeFromTop(context, otherUid);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Removed from Top Collaborators')),
        );
      }
    } else {
      await _addToTop(context, otherUid);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Added to Top Collaborators')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<QuerySnapshot>(
      stream: query.snapshots(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }

        final docs = snapshot.data!.docs;
        if (docs.isEmpty) {
          return const Center(child: Text('No users found.'));
        }

        return ListView.builder(
          itemCount: docs.length,
          itemBuilder: (context, index) {
            final userDoc = docs[index];
            final otherUid = userDoc.id;
            final userData = userDoc.data() as Map<String, dynamic>;
            final isMe = otherUid == myUid;

            return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
              stream: _topRef(otherUid).snapshots(),
              builder: (context, topSnap) {
                final isTop = topSnap.data?.exists ?? false;

                return UserListItem(
                  userData: userData,
                  uid: otherUid,
                  extraAction: isMe
                      ? null
                      : TextButton.icon(
                    icon: Icon(isTop ? Icons.star : Icons.star_border),
                    label: Text(isTop ? 'Top' : 'Add'),
                    onPressed: () => _toggleTop(
                      context,
                      otherUid: otherUid,
                      isTop: isTop,
                    ),
                  ),
                );
              },
            );
          },
        );
      },
    );
  }
}

class _FollowingListView extends StatelessWidget {
  final String userId;

  const _FollowingListView({required this.userId});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<DocumentSnapshot>(
      stream: FirebaseFirestore.instance.collection('users').doc(userId).snapshots(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }

        final data = snapshot.data!.data() as Map<String, dynamic>?;
        final following = List<String>.from(data?['following'] ?? []);

        if (following.isEmpty) {
          return const Center(child: Text('Not following anyone.'));
        }

        // Firestore whereIn has a limit of 10
        final subset = following.take(10).toList();

        return _UserListView(
          myUid: userId,
          query: FirebaseFirestore.instance
              .collection('users')
              .where(FieldPath.documentId, whereIn: subset),
        );
      },
    );
  }
}
