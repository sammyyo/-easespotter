import 'package:flutter/material.dart';
import 'package:easespotter/services/currency_formatting.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final TextEditingController _controller = TextEditingController();
  List<Map<String, dynamic>> _allItems = [];
  List<Map<String, dynamic>> _filteredItems = [];
  Map<String, dynamic> _storeData = const {};

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();

    final Map<String, dynamic> storeData =
        ModalRoute.of(context)!.settings.arguments as Map<String, dynamic>;
    _storeData = storeData;

    final Map<String, dynamic> productsByCategory =
        storeData['productsByCategory'];

    final flattenedItems =
        productsByCategory.entries.expand((entry) {
          final category = entry.key;
          final List items = entry.value;
          return items.map((item) {
            final storeCurrencySymbol = CurrencyFormatting.symbolForData(
              storeData,
              fallback: '',
            );
            final productCurrencySymbol = CurrencyFormatting.symbolForData(
              item is Map ? item : null,
              fallback: '',
            );
            final currencySymbol =
                storeCurrencySymbol.isNotEmpty
                    ? storeCurrencySymbol
                    : productCurrencySymbol;

            return {
              'name': item['name'],
              'price': item['price'],
              'currency': item['currency'] ?? storeData['currency'],
              'currencyCode':
                  item['currencyCode'] ??
                  item['currency_code'] ??
                  storeData['currencyCode'] ??
                  storeData['currency_code'],
              'currencySymbol': currencySymbol,
              'currency_symbol': currencySymbol,
              'category': category,
              'location':
                  'Aisle ${item['location']['aisle']} - Shelf ${item['location']['shelf']}',
            };
          });
        }).toList();

    _allItems = List<Map<String, dynamic>>.from(flattenedItems);
    _filteredItems = _allItems;
  }

  void _search(String query) {
    if (query.isEmpty) {
      setState(() => _filteredItems = _allItems);
    } else {
      final q = query.toLowerCase();
      setState(() {
        _filteredItems =
            _allItems.where((item) {
              return item['name'].toLowerCase().contains(q) ||
                  item['category'].toLowerCase().contains(q);
            }).toList();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Search Products',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              controller: _controller,
              onChanged: _search,
              decoration: InputDecoration(
                hintText: 'Search by name or category...',
                suffixIcon: IconButton(
                  icon: const Icon(Icons.clear),
                  onPressed: () {
                    _controller.clear();
                    _search('');
                  },
                ),
              ),
            ),
          ),
          Expanded(
            child:
                _filteredItems.isEmpty
                    ? const Center(child: Text('No items found'))
                    : ListView.builder(
                      itemCount: _filteredItems.length,
                      itemBuilder: (context, index) {
                        final item = _filteredItems[index];
                        return ListTile(
                          title: Text(item['name']),
                          subtitle: Text(
                            '${item['category']} • ${item['location']}',
                          ),
                          trailing: Text(
                            CurrencyFormatting.formatPrice(
                              item['price'],
                              productData: item,
                              storeData: _storeData,
                            ),
                          ),
                        );
                      },
                    ),
          ),
        ],
      ),
    );
  }
}
