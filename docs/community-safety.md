# Community safety

Safety menus are available on Taste, recipe, shopping-wall and Bite details, as
well as profiles and chats. Wall comments provide harassment reporting directly.
Reports accept a reason and up to 1,000 characters of optional context. They do
not automatically remove a post or suspend an account.

Settings → Blocked users lists blocked accounts and allows unblocking. Blocking
hides that user's posts, comments, profile, notifications and inbox entries in
this app. Firestore rules prevent direct messages in either direction, new
conversations, recipient inbox updates, message reactions, and creating or editing
comments on each other's posts. Existing conversation history remains readable by
its participants. Unblocking does not undo a block set by the other user.

Public content remains public, including to signed-out clients. Blocking is not a
privacy setting and does not erase history or remove existing follow relationships.

## Storage and moderation

- `users/{uid}/blockedUsers/{otherUid}`: only the owner can write or enumerate
  their blocks. Either participant can check their specific relationship.
- `abuseReports/{reporterUid}_{targetType}_{targetId}`: one immutable submission per
  reporter and target. Rules verify authentication, target existence/ownership,
  report reason, detail length and server timestamp. Post reports support
  `glowups`, `recipes`, `shopping_wall`, and `reels`; harassment uses `user`.
- Reports are unreadable by ordinary clients, including the reported user and the
  reporter. Moderators with the existing `admin: true` custom claim can read reports
  and update only `status`: `pending`, `reviewed`, `dismissed`, or `actioned`.
  Custom claims must be assigned through trusted Admin SDK tooling, never through
  a user profile document.
- Review pending reports through the Firebase Console or trusted admin tooling.
  This change does not add a moderator dashboard, automatic adjudication, or a
  moderation response-time guarantee. Arrange moderation ownership and retention
  before releasing the feature.
- Cloud Functions use the Admin SDK and therefore check blocks explicitly before
  sending notifications. Older notifications are filtered by the client.

Conversation membership is now immutable, and a user-created inbox entry no
longer grants access to a conversation. Existing conversations must contain the
two genuine participants and their matching `participantMap`. Malformed legacy
records should be repaired by trusted admin tooling; the client cannot rewrite
membership to bypass a block.

## Verification

Use Node.js 22+, Java 21+ and the Firebase CLI. From the repository root:

```sh
npm --prefix security_tests ci
firebase emulators:exec --config firebase.safety-tests.json \
  --only firestore --project demo-easespotter-safety \
  'npm --prefix security_tests test'
npm --prefix functions run lint
flutter analyze --no-pub
flutter build apk --debug --no-pub
flutter build ios --release --no-codesign --no-pub
```

The emulator configuration uses a `demo-` project and port 8180. Tests cover
private reports, forged identities, duplicate reports, private/nonexistent posts,
block ownership, both block directions, unblock behavior, forged inbox membership,
immutable participants, atomic block/send attempts, blocked comments, immutable
reel attribution, and notification dispatch. The test-only gRPC override applies
the patched 1.14.6 release; it is not included in the mobile app or Cloud Functions.

## Rollout

These changes are local until deployed. Deploy the rules and updated notification
functions before releasing the app. Block-list loading fails closed: content is
withheld if the app cannot load safety settings, and a retry is available on detail
screens and in Settings.

For an approved production rollout:

```sh
firebase deploy --project easespotter --only firestore:rules
firebase deploy --project easespotter --only \
  functions:onMessageCreateNotifyRecipient,functions:onGlowUpComment,functions:onRecipeComment,functions:onReelComment,functions:onShoppingWallComment,functions:onGlowUpReaction,functions:onReelReaction
```

Then test on two signed-in accounts: report a post, report harassment, block,
attempt messaging/commenting in both directions, unblock, and switch accounts.
Confirm reports are visible only to moderators. No live deployment or on-device
multi-account testing was performed as part of this implementation.
