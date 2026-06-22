import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../services/auth_service.dart';
import '../widgets/google_logo.dart';
import 'main_scaffold.dart';
import './signup_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  static const _backgroundImagePath = 'assets/images/Intro.png';

  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _emailNode = FocusNode();
  final _passwordNode = FocusNode();

  bool _loading = false;
  bool _obscure = true;
  bool _rememberMe = true;

  bool get _supportsAppleSignIn =>
      defaultTargetPlatform == TargetPlatform.iOS ||
      defaultTargetPlatform == TargetPlatform.macOS;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _emailNode.dispose();
    _passwordNode.dispose();
    super.dispose();
  }

  void _showSnack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..clearSnackBars()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  String _mapAuthError(FirebaseAuthException e) {
    switch (e.code) {
      case 'user-not-found':
        return 'No account found for that email.';
      case 'wrong-password':
        return 'Incorrect password. Try again.';
      case 'invalid-email':
        return 'That email looks invalid.';
      case 'user-disabled':
        return 'This account has been disabled.';
      case 'account-exists-with-different-credential':
        return 'An account already exists with this email. Try another sign-in method.';
      default:
        return e.message ?? 'Login failed. Please try again.';
    }
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      await AuthService.signInWithEmail(
        _email.text.trim(),
        _password.text.trim(),
      );
      if (!mounted) return;
      _goToHome();
    } on FirebaseAuthException catch (e) {
      _showSnack(_mapAuthError(e));
    } catch (_) {
      _showSnack('Something went wrong. Please try again.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _forgotPassword() async {
    final email = _email.text.trim();
    if (email.isEmpty || !RegExp(r'^[^@]+@[^@]+\.[^@]+').hasMatch(email)) {
      _showSnack('Enter a valid email first to receive a reset link.');
      return;
    }
    try {
      await FirebaseAuth.instance.sendPasswordResetEmail(email: email);
      _showSnack('Password reset link sent to $email');
    } on FirebaseAuthException catch (e) {
      _showSnack(e.message ?? 'Could not send reset link.');
    }
  }

  Future<void> _signInWithGoogle() async {
    setState(() => _loading = true);
    try {
      await AuthService.signInWithGoogle();
      if (!mounted) return;
      _goToHome();
    } on FirebaseAuthException catch (e) {
      _showSnack(_mapAuthError(e));
    } catch (e) {
      _showSnack('Google sign-in failed: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _signInWithApple() async {
    setState(() => _loading = true);
    try {
      await AuthService.signInWithApple();
      if (!mounted) return;
      _goToHome();
    } on FirebaseAuthException catch (e) {
      _showSnack(_mapAuthError(e));
    } catch (_) {
      _showSnack('Apple sign-in failed. Please try again.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String? _validateEmail(String? v) {
    final value = (v ?? '').trim();
    if (value.isEmpty) return 'Email is required';
    if (!RegExp(r'^[^@]+@[^@]+\.[^@]+').hasMatch(value)) {
      return 'Enter a valid email';
    }
    return null;
  }

  String? _validatePassword(String? v) {
    final value = (v ?? '').trim();
    if (value.isEmpty) return 'Password is required';
    if (value.length < 6) return 'Use at least 6 characters';
    return null;
  }

  Widget _googleLogo({double size = 18}) {
    return GoogleLogo(size: size);
  }

  void _goToHome() {
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const MainScaffold(initialIndex: 0)),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return GestureDetector(
      onTap: () => FocusScope.of(context).unfocus(),
      child: Scaffold(
        body: Stack(
          fit: StackFit.expand,
          children: [
            Image.asset(
              _backgroundImagePath,
              fit: BoxFit.cover,
              errorBuilder:
                  (_, __, ___) => Container(color: const Color(0xFFE7EDF3)),
            ),
            Container(color: Colors.black.withValues(alpha: 0.45)),
            Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Color(0x990D1A2A), Color(0x660D1A2A)],
                ),
              ),
            ),
            SafeArea(
              child: Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 24,
                  ),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 500),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(24),
                      child: BackdropFilter(
                        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
                        child: Container(
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.86),
                            border: Border.all(
                              color: Colors.white.withValues(alpha: 0.5),
                            ),
                            borderRadius: BorderRadius.circular(24),
                          ),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 20,
                              vertical: 24,
                            ),
                            child: Theme(
                              data: theme.copyWith(
                                inputDecorationTheme: theme.inputDecorationTheme
                                    .copyWith(
                                      filled: true,
                                      fillColor: Colors.white.withValues(
                                        alpha: 0.9,
                                      ),
                                      border: OutlineInputBorder(
                                        borderRadius: BorderRadius.circular(14),
                                        borderSide: BorderSide.none,
                                      ),
                                      enabledBorder: OutlineInputBorder(
                                        borderRadius: BorderRadius.circular(14),
                                        borderSide: BorderSide.none,
                                      ),
                                      focusedBorder: OutlineInputBorder(
                                        borderRadius: BorderRadius.circular(14),
                                        borderSide: const BorderSide(
                                          color: Color(0xFF2A5B84),
                                          width: 1.4,
                                        ),
                                      ),
                                    ),
                              ),
                              child: Form(
                                key: _formKey,
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                    Column(
                                      children: [
                                        Container(
                                          height: 56,
                                          width: 56,
                                          decoration: const BoxDecoration(
                                            color: Color(0x1A2A5B84),
                                            shape: BoxShape.circle,
                                          ),
                                          child: const Icon(
                                            Icons.lock_open_rounded,
                                            size: 30,
                                            color: Color(0xFF1D3E59),
                                          ),
                                        ),
                                        const SizedBox(height: 12),
                                        Text(
                                          'Welcome back',
                                          style: theme.textTheme.headlineSmall
                                              ?.copyWith(
                                                fontWeight: FontWeight.w700,
                                                color: const Color(0xFF0D1A2A),
                                              ),
                                          textAlign: TextAlign.center,
                                        ),
                                        const SizedBox(height: 6),
                                        Text(
                                          'Sign in to continue with Easespotter.',
                                          style: theme.textTheme.bodyMedium
                                              ?.copyWith(
                                                color: const Color(0xFF3A4B5D),
                                              ),
                                          textAlign: TextAlign.center,
                                        ),
                                        const SizedBox(height: 20),
                                      ],
                                    ),
                                    TextFormField(
                                      controller: _email,
                                      focusNode: _emailNode,
                                      enabled: !_loading,
                                      keyboardType: TextInputType.emailAddress,
                                      textInputAction: TextInputAction.next,
                                      autofillHints: const [
                                        AutofillHints.email,
                                      ],
                                      decoration: const InputDecoration(
                                        labelText: 'Email',
                                        hintText: 'you@example.com',
                                        prefixIcon: Icon(Icons.email_outlined),
                                      ),
                                      validator: _validateEmail,
                                      onFieldSubmitted:
                                          (_) => _passwordNode.requestFocus(),
                                    ),
                                    const SizedBox(height: 14),
                                    TextFormField(
                                      controller: _password,
                                      focusNode: _passwordNode,
                                      enabled: !_loading,
                                      obscureText: _obscure,
                                      textInputAction: TextInputAction.done,
                                      autofillHints: const [
                                        AutofillHints.password,
                                      ],
                                      decoration: InputDecoration(
                                        labelText: 'Password',
                                        prefixIcon: const Icon(
                                          Icons.lock_outline,
                                        ),
                                        suffixIcon: IconButton(
                                          onPressed:
                                              _loading
                                                  ? null
                                                  : () => setState(
                                                    () => _obscure = !_obscure,
                                                  ),
                                          icon: Icon(
                                            _obscure
                                                ? Icons.visibility_off
                                                : Icons.visibility,
                                          ),
                                          tooltip:
                                              _obscure
                                                  ? 'Show password'
                                                  : 'Hide password',
                                        ),
                                      ),
                                      validator: _validatePassword,
                                      onFieldSubmitted: (_) => _login(),
                                    ),
                                    const SizedBox(height: 6),
                                    Row(
                                      children: [
                                        Checkbox(
                                          value: _rememberMe,
                                          onChanged:
                                              _loading
                                                  ? null
                                                  : (v) => setState(
                                                    () =>
                                                        _rememberMe = v ?? true,
                                                  ),
                                        ),
                                        Text(
                                          'Remember me',
                                          style: theme.textTheme.bodyMedium
                                              ?.copyWith(
                                                color: const Color(0xFF243447),
                                              ),
                                        ),
                                        const Spacer(),
                                        TextButton(
                                          onPressed:
                                              _loading ? null : _forgotPassword,
                                          child: const Text('Forgot password?'),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 8),
                                    SizedBox(
                                      height: 50,
                                      child: ElevatedButton(
                                        onPressed: _loading ? null : _login,
                                        style: ElevatedButton.styleFrom(
                                          elevation: 0,
                                          backgroundColor: const Color(
                                            0xFF1D4E73,
                                          ),
                                          foregroundColor: Colors.white,
                                          shape: RoundedRectangleBorder(
                                            borderRadius: BorderRadius.circular(
                                              14,
                                            ),
                                          ),
                                        ),
                                        child: AnimatedSwitcher(
                                          duration: const Duration(
                                            milliseconds: 200,
                                          ),
                                          child:
                                              _loading
                                                  ? const SizedBox(
                                                    height: 22,
                                                    width: 22,
                                                    child:
                                                        CircularProgressIndicator(
                                                          strokeWidth: 2.2,
                                                          color: Colors.white,
                                                        ),
                                                  )
                                                  : const Text('Sign in'),
                                        ),
                                      ),
                                    ),
                                    const SizedBox(height: 14),
                                    Row(
                                      children: [
                                        Expanded(
                                          child: Divider(
                                            color: Colors.grey.shade400,
                                          ),
                                        ),
                                        Padding(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 8,
                                          ),
                                          child: Text(
                                            'or',
                                            style: theme.textTheme.labelMedium
                                                ?.copyWith(
                                                  color: const Color(
                                                    0xFF4F6074,
                                                  ),
                                                ),
                                          ),
                                        ),
                                        Expanded(
                                          child: Divider(
                                            color: Colors.grey.shade400,
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 12),
                                    SizedBox(
                                      height: 46,
                                      child: OutlinedButton.icon(
                                        onPressed:
                                            _loading ? null : _signInWithGoogle,
                                        icon: _googleLogo(),
                                        label: const Text(
                                          'Sign in with Google',
                                          style: TextStyle(
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                        style: OutlinedButton.styleFrom(
                                          foregroundColor: const Color(
                                            0xFF1F3042,
                                          ),
                                          backgroundColor: Colors.white
                                              .withValues(alpha: 0.75),
                                          side: BorderSide(
                                            color: Colors.grey.shade300,
                                          ),
                                          shape: RoundedRectangleBorder(
                                            borderRadius: BorderRadius.circular(
                                              14,
                                            ),
                                          ),
                                        ),
                                      ),
                                    ),
                                    if (_supportsAppleSignIn) ...[
                                      const SizedBox(height: 10),
                                      SizedBox(
                                        height: 46,
                                        child: ElevatedButton.icon(
                                          onPressed:
                                              _loading
                                                  ? null
                                                  : _signInWithApple,
                                          icon: const Icon(Icons.apple),
                                          label: const Text(
                                            'Sign in with Apple',
                                            style: TextStyle(
                                              fontWeight: FontWeight.w600,
                                            ),
                                          ),
                                          style: ElevatedButton.styleFrom(
                                            elevation: 0,
                                            backgroundColor: Colors.black,
                                            foregroundColor: Colors.white,
                                            disabledBackgroundColor: Colors
                                                .black
                                                .withValues(alpha: 0.45),
                                            shape: RoundedRectangleBorder(
                                              borderRadius:
                                                  BorderRadius.circular(14),
                                            ),
                                          ),
                                        ),
                                      ),
                                    ],
                                    const SizedBox(height: 10),
                                    Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.center,
                                      children: [
                                        Text(
                                          'New here?',
                                          style: theme.textTheme.bodyMedium
                                              ?.copyWith(
                                                color: const Color(0xFF243447),
                                              ),
                                        ),
                                        TextButton(
                                          onPressed:
                                              _loading
                                                  ? null
                                                  : () {
                                                    Navigator.push(
                                                      context,
                                                      MaterialPageRoute(
                                                        builder:
                                                            (_) =>
                                                                const SignupScreen(),
                                                      ),
                                                    );
                                                  },
                                          child: const Text(
                                            'Create an account',
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
