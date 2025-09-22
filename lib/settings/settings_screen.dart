import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  String _selectedCurrency = 'USD';
  final List<String> _currencies = ['USD', 'EUR', 'GBP', 'JPY', 'NGN'];

  final Map<String, String> _currencyFlags = {
    'USD': '🇺🇸',
    'EUR': '🇪🇺',
    'GBP': '🇬🇧',
    'JPY': '🇯🇵',
    'NGN': '🇳🇬',
  };

  final Map<String, String> _currencySymbols = {
    'USD': '\$',
    'EUR': '€',
    'GBP': '£',
    'JPY': '¥',
    'NGN': '₦',
  };

  @override
  void initState() {
    super.initState();
    _loadCurrency();
  }

  Future<void> _loadCurrency() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString('selected_currency');
    if (saved != null) {
      setState(() {
        _selectedCurrency = saved;
      });
    }
  }

  Future<void> _selectCurrency() async {
    final selected = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => Padding(
        padding: const EdgeInsets.only(top: 16, bottom: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Select Currency',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            const Divider(),
            ..._currencies.map((code) {
              return ListTile(
                leading: Text(_currencyFlags[code] ?? '', style: const TextStyle(fontSize: 24)),
                title: Text('$code  (${_currencySymbols[code]})'),
                onTap: () => Navigator.pop(context, code),
              );
            }),
          ],
        ),
      ),
    );

    if (selected != null && selected != _selectedCurrency) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('selected_currency', selected);
      setState(() {
        _selectedCurrency = selected;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final settings = [
      {
        'icon': Icons.currency_exchange,
        'title': 'Currency',
        'subtitle': '$_selectedCurrency (${_currencySymbols[_selectedCurrency]})',
        'onTap': _selectCurrency,
      },
      {
        'icon': Icons.notifications,
        'title': 'Notifications',
        'subtitle': 'Manage notifications',
        'onTap': () {},
      },
      {
        'icon': Icons.lock,
        'title': 'Privacy',
        'subtitle': 'Privacy preferences',
        'onTap': () {},
      },
      {
        'icon': Icons.info_outline,
        'title': 'About',
        'subtitle': 'App version & info',
        'onTap': () {},
      },
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Settings', style: TextStyle(color: Colors.white)),
        backgroundColor: Colors.deepPurple,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: GridView.count(
        crossAxisCount: 2,
        padding: const EdgeInsets.all(16),
        crossAxisSpacing: 16,
        mainAxisSpacing: 16,
        children: settings.map((setting) {
          return GestureDetector(
            onTap: setting['onTap'] as void Function(),
            child: Card(
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
              elevation: 3,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(setting['icon'] as IconData, size: 40, color: Colors.deepPurple),
                    const SizedBox(height: 10),
                    Text(setting['title'] as String,
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                    const SizedBox(height: 6),
                    Text(
                      setting['subtitle'] as String,
                      style: const TextStyle(fontSize: 14, color: Colors.grey),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}
