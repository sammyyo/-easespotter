# Mobile app identifier: com.easespotter.app

Android and iOS now use `com.easespotter.app`. The displayed app name remains EaseSpotter. The Firebase project remains `easespotter`; its database, storage, rules, functions and existing Auth users were not replaced. The previous Firebase app registrations remain available to existing test builds. macOS/web/Windows configurations were not changed.

## Completed

- Android application ID, namespace, MainActivity package and directory updated.
- iOS Runner bundle identifier updated in Debug/Profile/Release; RunnerTests identifier updated too.
- New Firebase Android registration: `1:171701293716:android:5490e9216a38db49731a81`.
- New Firebase iOS registration: `1:171701293716:ios:c0ac763a0fee0031731a81`.
- Downloaded genuine Google services configuration files for those registrations and aligned Android/iOS entries in `lib/firebase_options.dart` and `firebase.json`.
- Registered this machine's debug and existing release keystore SHA-1/SHA-256 fingerprints with the new Android Firebase registration. The downloaded configuration contains Android OAuth clients for both SHA-1 certificates and a web client.
- Updated the iOS Google callback URL scheme and GIDClientID to the new iOS OAuth client.
- Removed the old manually pinned App Store provisioning profile and enabled automatic signing with existing Apple team `JVQNWKGP23`. Xcode successfully provisioned and signed the new App ID. The embedded development profile identifies `JVQNWKGP23.com.easespotter.app`, includes Sign in with Apple, and expires on 2027-10-17.
- Android debug build passed; the built APK identifier was verified. The iOS release build passed with development signing, and its bundle ID, Google client ID, Apple sign-in entitlement, and code signature were verified. Live OAuth on a device and App Store distribution signing were not tested.

## Before distributing to friends

1. The new iOS App ID is already provisioned for development. Open `ios/Runner.xcworkspace` in Xcode to run on a registered device or archive/export for TestFlight using automatic signing. The current build is development-signed, not an uploaded TestFlight build.
2. If using TestFlight or Google Play testing, create a new store app record for this identifier. For Google Play App Signing, also add the **new listing's app-signing certificate** fingerprints to the new Firebase Android app; they can differ from the local release/upload key. Refresh `google-services.json` if needed.
3. Update the website association files on both `easespotter.com` and `www.easespotter.com`:
   - `/.well-known/assetlinks.json`: add an Android entry with package `com.easespotter.app` and the distributing certificate's SHA-256. For locally signed release APKs this is `9D:DA:D0:9A:88:2C:D3:B4:E0:0E:28:0D:B1:EF:04:F4:17:5A:89:83:53:FC:27:60:B3:E2:2C:F5:B3:42:71:F1`; use the Play app-signing SHA-256 for Play installs.
   - `/.well-known/apple-app-site-association`: add the new application identifier, normally `JVQNWKGP23.com.easespotter.app` (verify the provisioning profile's application-identifier prefix), preserving supported share/content paths. Keep the old entries while friends still use old builds.
4. If API keys are restricted by Android package or iOS bundle ID (including Google Maps), authorize the new identifier and corresponding signing certificates in Google Cloud Console. Existing Maps settings were not changed.
5. Test Google/Apple sign-in and share links on actual signed builds. If Apple login must preserve identities across old/new App IDs, verify the Apple App ID grouping before switching testers; retaining the Firebase database alone does not establish Apple account continuity.

Friends install this as a separate app and sign in again. Device-local preferences and guest data from the old app do not automatically transfer. No store upload, website deployment, or notification/rules redeployment is part of this identifier change.

References: [Firebase Google sign-in setup](https://firebase.google.com/docs/auth/android/google-signin), [Apple signing workflow](https://help.apple.com/xcode/mac/current/en.lproj/dev60b6fbbc7.html).
