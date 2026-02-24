import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../services/presence_service.dart';
import '../screens/intro_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final PresenceService _presence = PresenceService();
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

  Future<void> _performLogout() async {
    _presence.stopHeartbeat();
    _presence.setOffline();
    await FirebaseAuth.instance.signOut();
  }

  Future<void> _confirmLogout() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Log out?'),
        content: const Text('You will need to sign in again to continue.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Log out', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (ok == true) {
      await _performLogout();
      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const IntroScreen()),
        (route) => false,
      );
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
      {
        'icon': Icons.logout,
        'title': 'Log out',
        'subtitle': 'Sign out of your account',
        'onTap': _confirmLogout,
        'isDanger': true,
      },
    ];

    return Scaffold(
      appBar: AppBar(
        centerTitle: true,
        title: const Text(
          'Settings',
          style: TextStyle(
            fontWeight: FontWeight.w800,
            color: Colors.white,
          ),
        ),
        backgroundColor: Colors.deepPurple,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: settings.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (context, index) {
          final setting = settings[index];
          final isDanger = setting['isDanger'] == true;
          final iconColor = isDanger ? Colors.red : Colors.deepPurple;
          final titleColor = isDanger ? Colors.red : Colors.black87;

          return ListTile(
            onTap: setting['onTap'] as void Function(),
            tileColor: Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            leading: CircleAvatar(
              backgroundColor: iconColor.withValues(alpha: 0.12),
              child: Icon(setting['icon'] as IconData, color: iconColor),
            ),
            title: Text(
              setting['title'] as String,
              style: TextStyle(fontWeight: FontWeight.w700, color: titleColor),
            ),
            subtitle: Text(
              setting['subtitle'] as String,
              style: TextStyle(color: isDanger ? Colors.redAccent : Colors.grey),
            ),
            trailing: Icon(
              Icons.chevron_right,
              color: isDanger ? Colors.redAccent : Colors.grey,
            ),
          );
        },
      ),
    );
  }
}
