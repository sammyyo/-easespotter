import 'package:easespotter/services/grocery_list_service.dart';
import 'package:easespotter/services/currency_formatting.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ReceiptReviewScreen extends StatefulWidget {
  final List<Map<String, dynamic>> detectedItems;
  final String rawText;
  final String? storeName;
  final double? total;
  final String? currency;

  const ReceiptReviewScreen({
    super.key,
    required this.detectedItems,
    this.rawText = '',
    this.storeName,
    this.total,
    this.currency,
  });

  @override
  State<ReceiptReviewScreen> createState() => _ReceiptReviewScreenState();
}

class _ReceiptReviewScreenState extends State<ReceiptReviewScreen> {
  final GroceryListService _groceryListService = GroceryListService();
  late final List<Map<String, dynamic>> _items;
  late final Set<int> _selectedIndexes;
  String _currencySymbol = r'$';
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _items = List<Map<String, dynamic>>.from(widget.detectedItems);
    _selectedIndexes = Set<int>.from(Iterable<int>.generate(_items.length));
    _loadCurrencySymbol();
  }

  Future<void> _loadCurrencySymbol() async {
    final detectedCurrency =
        widget.currency?.trim().isNotEmpty == true
            ? widget.currency!.trim()
            : _items
                .map((item) => item['currency']?.toString().trim())
                .where((currency) => currency != null && currency.isNotEmpty)
                .firstOrNull;

    if (detectedCurrency != null) {
      setState(() {
        _currencySymbol = CurrencyFormatting.symbolForData({
          'currency': detectedCurrency,
        });
      });
      return;
    }

    final prefs = await SharedPreferences.getInstance();
    final selectedCurrency = prefs.getString('selected_currency');
    if (!mounted || selectedCurrency == null || selectedCurrency.isEmpty) {
      return;
    }

    setState(() {
      _currencySymbol = CurrencyFormatting.symbolForData({
        'currency': selectedCurrency,
      });
    });
  }

  Future<void> _addSelectedItems() async {
    if (_saving) return;

    final selectedItems = _selectedIndexes
        .map((index) => _items[index])
        .toList(growable: false);

    if (selectedItems.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select at least one receipt item.')),
      );
      return;
    }

    setState(() => _saving = true);
    final added = await _groceryListService.addReceiptItems(selectedItems);

    if (!mounted) return;
    setState(() => _saving = false);

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          added == 0
              ? 'Those items are already in your Grocery List.'
              : 'Added $added receipt item${added == 1 ? '' : 's'} to your Grocery List.',
        ),
      ),
    );

    Navigator.of(context).pop(true);
  }

  void _toggleItem(int index, bool? selected) {
    setState(() {
      if (selected == true) {
        _selectedIndexes.add(index);
      } else {
        _selectedIndexes.remove(index);
      }
    });
  }

  double get _selectedItemsTotal {
    return _selectedIndexes.fold<double>(0, (sum, index) {
      final item = _items[index];
      final price =
          double.tryParse(item['price']?.toString() ?? '') ??
          double.tryParse(item['unitPrice']?.toString() ?? '') ??
          0.0;
      return sum + price;
    });
  }

  double get _displayedReceiptTotal {
    final allItemsSelected = _selectedIndexes.length == _items.length;
    if (allItemsSelected && widget.total != null) return widget.total!;
    return _selectedItemsTotal;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        centerTitle: true,
        title: const Text(
          'Review Receipt',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
        ),
        backgroundColor: Colors.deepPurple,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body:
          _items.isEmpty
              ? Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.receipt_long,
                        color: Colors.deepPurple,
                        size: 44,
                      ),
                      const SizedBox(height: 14),
                      const Text(
                        'No grocery items were detected.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        widget.rawText.trim().isEmpty
                            ? 'OCR did not read text from this photo. Try filling the frame with the receipt, improving lighting, and keeping the receipt flat.'
                            : 'OCR read text, but it could not confidently match item names to prices.',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: Colors.black54,
                        ),
                      ),
                      if (widget.rawText.trim().isNotEmpty) ...[
                        const SizedBox(height: 18),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.grey.shade100,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: Colors.black12),
                          ),
                          child: SelectableText(
                            widget.rawText.trim(),
                            style: const TextStyle(
                              fontFamily: 'monospace',
                              fontSize: 12,
                              height: 1.25,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              )
              : Column(
                children: [
                  if (widget.storeName != null || _items.isNotEmpty)
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
                      color: Colors.white,
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          Expanded(
                            child: Text(
                              widget.storeName ?? 'Receipt',
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w900,
                                color: Colors.deepPurple,
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              const Text(
                                'Receipt Total',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.black54,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                '$_currencySymbol${_displayedReceiptTotal.toStringAsFixed(2)}',
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w900,
                                  color: Colors.black87,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(16),
                    color: Colors.deepPurple.withValues(alpha: 0.08),
                    child: Text(
                      '${_selectedIndexes.length} of ${_items.length} selected',
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        color: Colors.deepPurple,
                      ),
                    ),
                  ),
                  Expanded(
                    child: ListView.separated(
                      itemCount: _items.length,
                      separatorBuilder: (_, __) => const Divider(height: 1),
                      itemBuilder: (context, index) {
                        final item = _items[index];
                        final price =
                            (item['unitPrice'] as num?)?.toDouble() ?? 0.0;

                        return CheckboxListTile(
                          value: _selectedIndexes.contains(index),
                          onChanged: (selected) => _toggleItem(index, selected),
                          title: Text(
                            (item['title'] ?? '').toString(),
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          subtitle: Text(
                            '$_currencySymbol${price.toStringAsFixed(2)}',
                          ),
                          controlAffinity: ListTileControlAffinity.leading,
                        );
                      },
                    ),
                  ),
                ],
              ),
      bottomNavigationBar:
          _items.isEmpty
              ? null
              : SafeArea(
                minimum: const EdgeInsets.fromLTRB(16, 16, 16, 28),
                child: SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: _saving ? null : _addSelectedItems,
                    icon:
                        _saving
                            ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                            : const Icon(Icons.playlist_add_check),
                    label: const Text('Add to Grocery List'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.deepPurple,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                  ),
                ),
              ),
    );
  }
}
