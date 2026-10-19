# Grocery collaboration review — 2026-10-19

This records the pre-fix review of the checkout and public website association files. The subsequent local implementation and rollout are documented in [grocery-collaboration.md](grocery-collaboration.md). No production grocery documents were read or changed, no rules were deployed, and no app behavior was changed. Firestore findings were reproduced against the checkout's rules in the local demo emulator; the deployed rules were not independently retrieved.

## Findings

1. **High — shared lists can be enumerated by unrelated users.** `firestore.rules` grants every signed-in user read access to the entire `grocery_shares` collection. An unrelated authenticated emulator user successfully queried all shares and read their items and membership. Possession of an invite link is not required. Replace broad collection access with a protected invite redemption flow and member-only list access.
2. **High — nonmembers can rewrite membership.** `joinsSelfAsGroceryParticipant` only requires the caller to appear in one resulting membership structure. The emulator accepted a write replacing other members and inserting a third party while adding the caller. Member list updates also permit membership changes. Restrict join/leave to exactly the caller, preserve creator and other participants, and separate item edits from membership edits.
3. **High — the normal app join request is denied.** `_joinGroceryShareDocument` uses `set(..., merge: true)` with `'participantMap.$uid'`. This writes a literal dotted field rather than updating the nested map. That additional field is outside the allowed keys. An equivalent SDK request was rejected in the emulator. Use a nested map with merge, or `update` with a field path, alongside corrected membership rules.
4. **Medium — seven-day expiry is not enforced in the actual join path or rules.** The emulator accepted joining an expired share. `ShareService.fetchGroceryList` checks expiry, but the collaboration screen does not call it. Decide whether expiry ends only new invitations or the whole collaboration, then enforce that server-side.
5. **Medium — owner deletion is denied.** The delete rule calls `uidUnchanged`, which accesses `request.resource.data`; deletes have no new document. The emulator rejected an owner delete. This also breaks the unused fetch helper's expired-share cleanup.
6. **Medium — leaving is local only.** The Leave action deletes the local saved shortcut, not server membership. Existing access remains. The active listener also remains subscribed.
7. **Medium — subscriptions leak across list switches.** `_listenToCollaboration` discards its subscription and neither switching nor `dispose` cancels it. A previous list's updates can replace the currently displayed list. The listener also uses `doc['updatedBy']` although newly created shares omit this field, so the first snapshot can throw. Remote updates are not saved to local storage.
8. **Medium — signed-out invitations are lost.** `_handledInitialShareCode` is set before checking authentication. The screen shows a sign-in message but does not retain/retry the invite after login. Concurrent initial local-data loading can also overwrite the joined list.
9. **Medium — concurrent edits can overwrite each other.** Each edit sends the entire list array with no revision check or item-level merge. Two users editing from the same snapshot can lose one user's changes. Write errors are not consistently surfaced by callers.

Additional observations: codes use six characters from non-cryptographic `Random()` with no collision retry; starting with an existing same-owner code could overwrite a prior share. Active collaboration selection is not persisted across screen recreation. These should be addressed in the invite/sync redesign.

## Live app links

- `https://www.easespotter.com/.well-known/assetlinks.json`: lists both `com.easespotter.app` and `com.samuel.easespotter`, with the local release SHA-256 certificate. It does not list the debug certificate; debug installs will not verify through this entry. Play-distributed builds require their actual Play signing fingerprint.
- `https://www.easespotter.com/.well-known/apple-app-site-association`: lists both `JVQNWKGP23.com.easespotter.app` and the old application identifier, including `/share/*`.
- Both equivalent non-www endpoints returned HTTP 404.
- The app currently generates `https://www.easespotter.com/share/{code}`, so its generated host is the configured one. Opening/accepting an invite end-to-end on two devices was not tested. Association-file correctness alone does not validate the website fallback/login flow.

## Local reproduction results

Using a fresh demo Firestore emulator and synthetic Alice/Bob/Mallory records:

- Owner creates invite: allowed.
- App's current merge-set join request: denied.
- Unrelated signed-in user enumerates shares: allowed (security defect).
- Outsider rewrites membership while adding themselves: allowed (security defect).
- Expired share accepts a join: allowed (expiry defect).
- Owner deletes own share: denied (rule defect).

The temporary audit script is `/private/tmp/easespotter-grocery-audit.cjs`; results are in `/private/tmp/easespotter-grocery-audit.log`. These assertions intentionally reproduce existing defects rather than certify desired security behavior.

## Recommended order

Fix invite redemption/access rules and the corresponding client together, add regression tests, then repair subscription lifecycle, server-side leave, login continuation, and concurrent edits. Deploy the tested rules/backend before distributing the matching app build. Restricting reads alone will break the existing query-based join flow, so these changes need a coordinated rollout.
