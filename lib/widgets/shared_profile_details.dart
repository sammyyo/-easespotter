import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../services/profile_details_service.dart';

class SharedProfileDetails extends StatefulWidget {
  const SharedProfileDetails({super.key, required this.uid});
  final String uid;

  @override
  State<SharedProfileDetails> createState() => _SharedProfileDetailsState();
}

class _SharedProfileDetailsState extends State<SharedProfileDetails> {
  late Stream<DocumentSnapshot<Map<String, dynamic>>> _stream;

  void _subscribe() {
    _stream = FirebaseFirestore.instance
        .collection('users')
        .doc(widget.uid)
        .collection('profileDetails')
        .doc('public')
        .snapshots();
  }

  @override
  void initState() {
    super.initState();
    _subscribe();
  }

  @override
  void didUpdateWidget(covariant SharedProfileDetails oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.uid != widget.uid) _subscribe();
  }

  @override
  Widget build(BuildContext context) =>
      StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
        stream: _stream,
        builder: (context, snapshot) => ProfileDetailsSummary(
          values: snapshot.hasError ? const {} : snapshot.data?.data() ?? {},
        ),
      );
}

class ProfileDetailsSummary extends StatelessWidget {
  const ProfileDetailsSummary({super.key, required this.values});
  final Map<String, dynamic> values;

  @override
  Widget build(BuildContext context) {
    final entries = profileDetailFields.entries
        .where(
          (field) =>
              values[field.key] is String &&
              (values[field.key] as String).trim().isNotEmpty,
        )
        .toList();
    if (entries.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final field in entries)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    field.value.label,
                    style: Theme.of(context).textTheme.labelMedium,
                  ),
                  Text((values[field.key] as String).trim()),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
