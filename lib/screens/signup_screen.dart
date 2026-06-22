import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import '../services/auth_service.dart';
import '../helper/user_profile_service.dart';
import '../widgets/google_logo.dart';
import 'main_scaffold.dart';

class SignupScreen extends StatefulWidget {
  const SignupScreen({super.key});

  @override
  State<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends State<SignupScreen> {
  static const _backgroundImagePath = 'assets/images/Intro.png';

  final _formKey = GlobalKey<FormState>();

  final _displayName = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirmPassword = TextEditingController();

  final _nameNode = FocusNode();
  final _emailNode = FocusNode();
  final _passwordNode = FocusNode();
  final _confirmNode = FocusNode();

  bool _loading = false;
  bool _obscure = true;
  bool _obscureConfirm = true;
  bool _agreeTos = true; // default on; toggle if you prefer

  bool get _supportsAppleSignIn =>
      defaultTargetPlatform == TargetPlatform.iOS ||
      defaultTargetPlatform == TargetPlatform.macOS;

  @override
  void dispose() {
    _displayName.dispose();
    _email.dispose();
    _password.dispose();
    _confirmPassword.dispose();
    _nameNode.dispose();
    _emailNode.dispose();
    _passwordNode.dispose();
    _confirmNode.dispose();
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
      case 'email-already-in-use':
        return 'This email is already in use. Try logging in instead.';
      case 'invalid-email':
        return 'That email looks invalid. Please check and try again.';
      case 'weak-password':
        return 'That password is too weak. Try adding numbers & symbols.';
      case 'operation-not-allowed':
        return 'Email sign-up is disabled for now.';
      case 'account-exists-with-different-credential':
        return 'An account already exists with this email. Try another sign-in method.';
      default:
        return e.message ?? 'Sign up failed. Please try again.';
    }
  }

  double _passwordStrength(String v) {
    // Simple heuristic: 0 → 1
    var s = 0.0;
    if (v.length >= 6) s += 0.25;
    if (v.length >= 10) s += 0.25;
    if (RegExp(r'[A-Z]').hasMatch(v)) s += 0.2;
    if (RegExp(r'\d').hasMatch(v)) s += 0.2;
    if (RegExp(r'[!@#\$%^&*(),.?":{}|<>_\-]').hasMatch(v)) s += 0.1;
    return s.clamp(0, 1);
  }

  Color _strengthColor(double s) {
    if (s < 0.34) return Colors.red;
    if (s < 0.67) return Colors.orange;
    return Colors.green;
  }

  Future<void> _signup() async {
    if (!_formKey.currentState!.validate()) return;
    if (!_agreeTos) {
      _showSnack('Please agree to the Terms to continue.');
      return;
    }

    setState(() => _loading = true);
    try {
      final user = await AuthService.signUpWithEmail(
        _email.text.trim(),
        _password.text.trim(),
        _displayName.text.trim(),
      );

      if (user != null) {
        // Create Firestore profile if needed
        await UserProfileService(FirebaseFirestore.instance).getOrCreate(
          uid: user.uid,
          displayName: _displayName.text.trim(),
          avatarUrl: user.photoURL,
          publicProfile: true,
        );
        // Optionally send email verification:
        // await user.sendEmailVerification();
      }

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

  Future<void> _googleSignup() async {
    if (!_agreeTos) {
      _showSnack('Please agree to the Terms to continue.');
      return;
    }

    setState(() => _loading = true);
    try {
      final user = await AuthService.signInWithGoogle();
      if (user != null) {
        await UserProfileService(FirebaseFirestore.instance).getOrCreate(
          uid: user.uid,
          displayName: user.displayName ?? _displayName.text.trim(),
          avatarUrl: user.photoURL,
          publicProfile: true,
        );
      }
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

  Future<void> _appleSignup() async {
    if (!_agreeTos) {
      _showSnack('Please agree to the Terms to continue.');
      return;
    }

    setState(() => _loading = true);
    try {
      final user = await AuthService.signInWithApple();
      if (user != null) {
        await UserProfileService(FirebaseFirestore.instance).getOrCreate(
          uid: user.uid,
          displayName: user.displayName ?? _displayName.text.trim(),
          avatarUrl: user.photoURL,
          publicProfile: true,
        );
      }
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

  String? _validateName(String? v) {
    final value = (v ?? '').trim();
    if (value.isEmpty) return 'Full name is required';
    if (value.length < 2) return 'Enter a valid name';
    return null;
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

  String? _validateConfirm(String? v) {
    final value = (v ?? '').trim();
    if (value != _password.text.trim()) return 'Passwords do not match';
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
                    vertical: 14,
                  ),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 520),
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
                              vertical: 16,
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
                                            Icons.person_add_alt_1_outlined,
                                            size: 30,
                                            color: Color(0xFF1D3E59),
                                          ),
                                        ),
                                        const SizedBox(height: 8),
                                        Text(
                                          'Create your account',
                                          style: theme.textTheme.headlineSmall
                                              ?.copyWith(
                                                fontWeight: FontWeight.w700,
                                                color: const Color(0xFF0D1A2A),
                                              ),
                                          textAlign: TextAlign.center,
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          'Join and personalize your shopping experience.',
                                          style: theme.textTheme.bodyMedium
                                              ?.copyWith(
                                                color: const Color(0xFF3A4B5D),
                                              ),
                                          textAlign: TextAlign.center,
                                        ),
                                        const SizedBox(height: 12),
                                      ],
                                    ),
                                    TextFormField(
                                      controller: _displayName,
                                      focusNode: _nameNode,
                                      enabled: !_loading,
                                      textInputAction: TextInputAction.next,
                                      autofillHints: const [AutofillHints.name],
                                      decoration: const InputDecoration(
                                        labelText: 'Full Name',
                                        hintText: 'Jane Doe',
                                        prefixIcon: Icon(Icons.badge_outlined),
                                      ),
                                      validator: _validateName,
                                      onFieldSubmitted:
                                          (_) => _emailNode.requestFocus(),
                                    ),
                                    const SizedBox(height: 10),
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
                                    const SizedBox(height: 10),
                                    StatefulBuilder(
                                      builder: (context, setInner) {
                                        final strength = _passwordStrength(
                                          _password.text,
                                        );
                                        return Column(
                                          children: [
                                            TextFormField(
                                              controller: _password,
                                              focusNode: _passwordNode,
                                              enabled: !_loading,
                                              obscureText: _obscure,
                                              textInputAction:
                                                  TextInputAction.next,
                                              autofillHints: const [
                                                AutofillHints.newPassword,
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
                                                            () =>
                                                                _obscure =
                                                                    !_obscure,
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
                                              onChanged: (_) => setInner(() {}),
                                              onFieldSubmitted:
                                                  (_) =>
                                                      _confirmNode
                                                          .requestFocus(),
                                            ),
                                            const SizedBox(height: 6),
                                            ClipRRect(
                                              borderRadius:
                                                  BorderRadius.circular(6),
                                              child: LinearProgressIndicator(
                                                value: strength,
                                                minHeight: 6,
                                                backgroundColor:
                                                    Colors.grey.shade300,
                                                valueColor:
                                                    AlwaysStoppedAnimation<
                                                      Color
                                                    >(_strengthColor(strength)),
                                              ),
                                            ),
                                            const SizedBox(height: 4),
                                            Align(
                                              alignment: Alignment.centerLeft,
                                              child: Text(
                                                strength < 0.34
                                                    ? 'Weak'
                                                    : (strength < 0.67
                                                        ? 'Medium'
                                                        : 'Strong'),
                                                style: theme
                                                    .textTheme
                                                    .labelMedium
                                                    ?.copyWith(
                                                      color: const Color(
                                                        0xFF3A4B5D,
                                                      ),
                                                    ),
                                              ),
                                            ),
                                          ],
                                        );
                                      },
                                    ),
                                    const SizedBox(height: 10),
                                    TextFormField(
                                      controller: _confirmPassword,
                                      focusNode: _confirmNode,
                                      enabled: !_loading,
                                      obscureText: _obscureConfirm,
                                      textInputAction: TextInputAction.done,
                                      autofillHints: const [
                                        AutofillHints.newPassword,
                                      ],
                                      decoration: InputDecoration(
                                        labelText: 'Confirm Password',
                                        prefixIcon: const Icon(
                                          Icons.lock_person_outlined,
                                        ),
                                        suffixIcon: IconButton(
                                          onPressed:
                                              _loading
                                                  ? null
                                                  : () => setState(
                                                    () =>
                                                        _obscureConfirm =
                                                            !_obscureConfirm,
                                                  ),
                                          icon: Icon(
                                            _obscureConfirm
                                                ? Icons.visibility_off
                                                : Icons.visibility,
                                          ),
                                          tooltip:
                                              _obscureConfirm
                                                  ? 'Show password'
                                                  : 'Hide password',
                                        ),
                                      ),
                                      validator: _validateConfirm,
                                      onFieldSubmitted: (_) => _signup(),
                                    ),
                                    const SizedBox(height: 6),
                                    Row(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.center,
                                      children: [
                                        Checkbox(
                                          value: _agreeTos,
                                          onChanged:
                                              _loading
                                                  ? null
                                                  : (v) => setState(
                                                    () =>
                                                        _agreeTos = v ?? false,
                                                  ),
                                        ),
                                        Expanded(
                                          child: Text(
                                            'I agree to the Terms of Service and Privacy Policy.',
                                            style: theme.textTheme.bodySmall
                                                ?.copyWith(
                                                  color: const Color(
                                                    0xFF243447,
                                                  ),
                                                ),
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 6),
                                    SizedBox(
                                      height: 46,
                                      child: ElevatedButton(
                                        onPressed: _loading ? null : _signup,
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
                                                  : const Text(
                                                    'Create account',
                                                  ),
                                        ),
                                      ),
                                    ),
                                    const SizedBox(height: 10),
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
                                            'or sign up with',
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
                                    const SizedBox(height: 10),
                                    SizedBox(
                                      height: 42,
                                      child: OutlinedButton.icon(
                                        onPressed:
                                            _loading ? null : _googleSignup,
                                        icon: _googleLogo(),
                                        label: const Text(
                                          'Continue with Google',
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
                                        height: 42,
                                        child: ElevatedButton.icon(
                                          onPressed:
                                              _loading ? null : _appleSignup,
                                          icon: const Icon(Icons.apple),
                                          label: const Text(
                                            'Continue with Apple',
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
                                    const SizedBox(height: 12),
                                    Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.center,
                                      children: [
                                        Text(
                                          'Already have an account?',
                                          style: theme.textTheme.bodyMedium
                                              ?.copyWith(
                                                color: const Color(0xFF243447),
                                              ),
                                        ),
                                        TextButton(
                                          onPressed:
                                              _loading
                                                  ? null
                                                  : () =>
                                                      Navigator.pop(context),
                                          child: const Text('Log in'),
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
