import 'package:flutter/material.dart';
import 'package:easespotter/services/motivation_service.dart';

class MotivationPreviewScreen extends StatelessWidget {
  final List<String> mockProductIds = const [ // Added const here
    'lipstick_red123',
    'sunscreen_50spf',
    'unknown_product'
  ];

  const MotivationPreviewScreen({super.key});

  //const MotivationPreviewScreen({super.key});


  // uncomment this later and fix it.
  //const MotivationPreviewScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Product Motivations')),
      body: ListView.builder(
        itemCount: mockProductIds.length,
        itemBuilder: (context, index) {
          final productId = mockProductIds[index];
          final motivation = MotivationService.getMotivation(productId);

          return ListTile(
            title: Text('Product ID: $productId'),
            subtitle: motivation != null
                ? Text(motivation)
                : const Text('No motivation found'),
          );
        },
      ),
    );
  }
}
