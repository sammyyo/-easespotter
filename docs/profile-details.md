# Optional profile details

Profile Settings → More about you provides city/region, food interests, favourite cuisines, dietary preferences, and favourite stores. All are optional, limited to 160 characters, and hidden by default. Each field has a Show on profile switch; a preview shows exactly which new details will be displayed after saving. Empty fields are omitted from the public profile. Existing bio, links, and mood music keep their existing behavior.

Storage uses two documents under `users/{uid}/profileDetails`:

- `private`: owner-only values and sharing flags.
- `public`: only selected values; hidden values are empty strings.

Saving writes both documents in a single batch. Rules validate ownership, fields, lengths, flag types, and that the public document exactly matches the selected private values. Hiding a field must clear its public copy in the same operation. Private values never go into the publicly readable user document. Firebase documents are read as a whole, which is why private data needs a separate document: [Firebase field access guidance](https://firebase.google.com/docs/firestore/security/rules-fields).

Deploy the updated rules before releasing this app change:

```sh
firebase deploy --project easespotter --only firestore:rules
```

No function deployment, indexes, or migration is required for these new fields. Until rules are deployed, the editor shows a load error and cannot save. Nothing was deployed by this implementation.

Verification: five focused Dart/widget tests and 27 security/notification tests passed, including private reads, unauthorized writes, explicit publication, and atomic removal. Test on two accounts after deployment: save all fields hidden; share one and confirm only that one appears for the other user; hide it again; reopen Settings and confirm the private value remains available. Previously public information cannot be recalled from copies already saved by viewers.
