import 'package:flutter/material.dart';

class GoogleLogo extends StatelessWidget {
  final double size;

  const GoogleLogo({super.key, this.size = 18});

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      'assets/images/google_g_logo.png',
      height: size,
      width: size,
      fit: BoxFit.contain,
    );
  }
}
