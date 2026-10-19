import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../services/store_api_service.dart';
import '../services/store_location.dart';

class StoreLocationCard extends StatefulWidget {
  const StoreLocationCard({super.key, required this.storeId});
  final String storeId;
  @override
  State<StoreLocationCard> createState() => _StoreLocationCardState();
}

class _StoreLocationCardState extends State<StoreLocationCard> {
  late Future<List<StoreLocation>> _locations;
  @override
  void initState() {
    super.initState();
    _locations = _load();
  }

  @override
  void didUpdateWidget(covariant StoreLocationCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.storeId != widget.storeId) _locations = _load();
  }

  Future<List<StoreLocation>> _load() async {
    final id = int.tryParse(widget.storeId);
    if (id == null) return [];
    final rows = await StoreApiService.fetchStoreAddresses(id);
    return rows.map(StoreLocation.fromJson).whereType<StoreLocation>().toList();
  }

  Future<void> _directions(StoreLocation location) async {
    final uri = Uri.https('www.google.com', '/maps/dir/', {
      'api': '1',
      'destination': '${location.latitude},${location.longitude}',
    });
    try {
      if (await launchUrl(uri, mode: LaunchMode.externalApplication)) return;
    } catch (_) {
      /* Show the same actionable message for platform failures. */
    }
    if (mounted)
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not open maps. You can copy the address above.'),
        ),
      );
  }

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Store location',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          FutureBuilder<List<StoreLocation>>(
            future: _locations,
            builder: (context, snapshot) {
              if (snapshot.hasError)
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('The store location could not be loaded.'),
                    TextButton(
                      onPressed: () => setState(() => _locations = _load()),
                      child: const Text('Retry'),
                    ),
                  ],
                );
              if (!snapshot.hasData) return const LinearProgressIndicator();
              if (snapshot.data!.isEmpty)
                return const Text(
                  'This store has not published its location yet.',
                );
              final location = snapshot.data!.first;
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SelectableText(location.address),
                  TextButton.icon(
                    onPressed: () => _directions(location),
                    icon: const Icon(Icons.directions),
                    label: const Text('Get directions'),
                  ),
                ],
              );
            },
          ),
        ],
      ),
    ),
  );
}
