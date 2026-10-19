# Grocery collaboration: implementation and rollout

Implemented locally on 2026-10-19. This work has not been deployed to Firebase or Railway.

## Behavior

- A signed-in, non-anonymous user creates a shared list through the `groceryCollaboration` callable in `us-central1`.
- Invitations use 128-bit random tokens in a private `grocery_invites` collection. They expire after seven days. Expiry prevents new members from joining; existing members retain access.
- Only members can read a list. All client writes to shares, invitations and rate-limit records are denied. The callable checks authentication, membership and payload limits.
- Joining checks blocks in both directions against all current members. An existing owner's block relationship with a participant also denies that participant reads and edits. Blocks between two existing non-owner participants do not split an already-shared group; either can leave.
- Up to 50 members and 500 items (200 KB serialized) per list. Each account can attempt 30 invite redemptions per hour, including failed attempts.
- Leaving removes server membership. If the owner leaves, the collaboration and current invite are deleted after an explicit confirmation. Local copies already saved on devices remain.
- Owners can replace an invite with the refresh button in the collaboration dialog. Replacing an invite invalidates its old token without removing current members.
- Legacy six-character invitations can reopen a list for existing members only. Its owner must replace the invite before adding new members.
- The app cancels old listeners when switching, leaving, signing out or closing the screen; remote updates are persisted locally. The active list is restored on reopening.
- Signed-out invite recipients are routed to login; the invitation is persisted and resumed from the main screen after sign-in.
- Updates use revision checks. A stale edit cannot overwrite another member's accepted edit. Failed/conflicting edits are recovered into **Favorite Lists**, with a message explaining how to reopen the collaboration. Pending edits are journaled locally for recovery after process termination. This is recovery, not automatic merging.
- Sharing from the grocery toolbar uses the active collaboration or creates one that the owner can manage later.

## Firebase deployment

Run from the project root, after reviewing the complete current rules file (it includes the earlier profile and community-safety work):

```sh
firebase deploy --project easespotter --only functions:groceryCollaboration
firebase deploy --project easespotter --only firestore:rules
```

Deploy the function first, then the rules, and distribute the matching app build to testers. **Old builds use direct writes and code queries and will no longer create/join/edit collaborations under the new rules.** Existing data remains in place; current members can reopen it in the updated app.

The callable uses the existing Firebase project and Admin SDK. No Neon database migration is needed for this mobile feature. No new Firestore composite index is required (the app reads share documents by ID).

These commands deploy live changes. They have not been run as part of implementation.

## Railway website

The website source is now available at `EaseSpotter-main/`. Its Express server already had host-independent association endpoints with the old/new application IDs and the local release certificate. These routes were moved into `server/mobile-links.ts` for isolated testing, and the invite fallback now supports copying codes, signing in, expiry guidance and access during testing.

The routes are registered before authentication and SPA/static handling. No duplicate static files are needed. Reference copies are retained in [website-app-links/.well-known](website-app-links/.well-known/).

On Railway, ensure both custom domains point to this Express service and bypass any upstream canonical-host redirects for:

- `https://easespotter.com/.well-known/assetlinks.json`
- `https://www.easespotter.com/.well-known/assetlinks.json`
- `https://easespotter.com/.well-known/apple-app-site-association`
- `https://www.easespotter.com/.well-known/apple-app-site-association`

Redeploy the website after reviewing the changes. Each endpoint must return HTTP 200 JSON without authentication or redirects. Local route tests cannot verify Railway's domain configuration; the earlier live non-www 404 remains an external rollout check.

Both Android packages use the existing local **release** certificate. For Google Play distribution, add the actual Play App Signing certificate through the per-package environment settings if it differs. Local debug builds have a different certificate; see [app-identifier-migration.md](app-identifier-migration.md).

The website's `/share/{code}` fallback accepts the new 32-character tokens and legacy six-character codes. It lets recipients copy the code and explains how to install/open the app. Automatic continuation after a fresh app installation is not implemented; users can reopen the link or paste it into the app.

## Verification and remaining device checks

Completed locally on 2026-10-19:

- 42 backend/security tests passed in the Firestore demo emulator.
- 9 targeted Flutter tests passed (4 collaboration + 5 existing profile-detail regressions).
- 7 website HTTP route tests passed, including both Host headers, both association formats, token validation and fallback content.
- Backend ESLint and isolated website route TypeScript checks passed.
- Targeted Flutter analysis reported no errors; 4 existing warnings and 12 informational lints remain.
- Android debug APK, unsigned iOS release and Railway website production builds passed.
- Live `www` association endpoints returned HTTP 200 JSON. A curl recheck of `https://easespotter.com/.well-known/assetlinks.json` still returned HTTP 404. The non-www domain needs a Railway mapping/deployed-version check.

Reproduce website checks without a Neon connection:

```sh
cd EaseSpotter-main
npm ci --ignore-scripts
npm run test:mobile-links
npm run build
```

Automated checks cover callable authorization, invite secrecy/expiry/rotation, membership tampering, leaving and owner deletion, blocking, legacy shares, rate limits and stale concurrent updates. Flutter tests cover parsing, login continuation storage and interrupted-edit recovery.

After deploying, test with two accounts on physical Android/iOS devices:

1. Create and share a list; open the invite while signed in and while signed out.
2. Confirm both devices receive changes; switch lists and check the former list no longer replaces the screen.
3. Edit simultaneously; confirm a stale edit is preserved in Favorite Lists.
4. Leave as a member, then confirm access is denied. End as owner, then confirm the other device disconnects.
5. Replace an invite; verify the old link no longer admits a new account.
6. Open links from both hosts with the signing certificate of the distributed build.

Emulator/build success does not establish that production rules, the callable or Railway association files are deployed, or replace this two-device test.
