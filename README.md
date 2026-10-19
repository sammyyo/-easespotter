# easespotter

EaseSpotter mobile application.

Reporting, user blocking, moderation storage, local security tests, and rollout
instructions are documented in [Community safety](docs/community-safety.md).

## Mobile toolchain

- Flutter **3.47.5**, with Dart **3.13.4** (see `.flutter-version`).
- Android: JDK 17, compile SDK 37, target SDK 36, minimum API 24.
  Gradle 9.3.1, Android Gradle Plugin 9.1.1, Kotlin 2.4.0, and the
  Flutter-provided NDK version are configured in `android/`.
  The legacy Kotlin and AGP DSL compatibility flags remain enabled because the
  current Firebase plugins still require them; revisit these on the next Flutter
  upgrade.
  `android/build.gradle.kts` also retains AVIF's original Java implementation:
  `flutter_avif_android` 3.1.0 includes a duplicate Kotlin plugin class that the
  newer toolchain would otherwise compile alongside it. Its Android SDK settings
  are also aligned with the app (compile 37, minimum 24).
- iOS: minimum **15.5**, Xcode 27, CocoaPods 1.16.2. Flutter uses Swift
  Package Manager for supported plugins and CocoaPods for the remaining ones.

Use Flutter 3.47.5 in your IDE and on the command line, then run:

```sh
flutter pub get
flutter analyze
flutter test
flutter build apk --debug
flutter build ios --release --no-codesign
```

The unsigned iOS build checks compilation; distribution still requires signing.
The current ML Kit native dependencies do not support arm64 iOS simulators;
test scanning and face detection on a physical iPhone.
Open `ios/Runner.xcworkspace` for Xcode builds. Commit `pubspec.lock`,
`ios/Podfile.lock`, and the Xcode Swift package resolution file when updating
dependencies. Run `cd ios && pod update` after changing native pod requirements.

All direct Dart dependencies were upgraded to the latest resolvable stable
versions on October 8, 2026. Transitive versions remain constrained by Flutter
and their parent packages; do not force them with dependency overrides.

The existing `test/widget_test.dart` is a starter counter test and needs to be
replaced with application tests that initialize or mock Firebase before it can
pass. The analyzer also reports existing warnings and deprecation/lint notices.

Upgrade validation: Android debug APK and unsigned iOS release builds passed.
Analysis reported zero errors, 17 warnings, and 278 informational lint notices.
Physical-device behavior and signed release distribution were not tested.

## Getting Started

This project is a starting point for a Flutter application.

A few resources to get you started if this is your first Flutter project:

- [Lab: Write your first Flutter app](https://docs.flutter.dev/get-started/codelab)
- [Cookbook: Useful Flutter samples](https://docs.flutter.dev/cookbook)

For help getting started with Flutter development, view the
[online documentation](https://docs.flutter.dev/), which offers tutorials,
samples, guidance on mobile development, and a full API reference.
