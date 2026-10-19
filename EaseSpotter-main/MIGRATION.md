# EaseSpotter Migration Guide

This repo can be migrated off Replit without changing the core architecture:

- Frontend: Vite + React on Vercel
- Backend: Node + Express on a long-running host
- Database: Neon Postgres
- Optional sync service: `server.js` on a separate host if you still need Firestore sync

## 1. Recommended deployment layout

- Frontend: Vercel
- Backend API: Railway, Render, Fly.io, or a VPS
- Database: Neon
- Domains:
  - `app.yourdomain.com` -> Vercel
  - `api.yourdomain.com` -> backend host

Do not deploy the current Express backend to Vercel as-is. It uses long-lived sessions and WebSockets.

## 2. Neon setup

1. Create a Neon project and database.
2. Copy the pooled connection string into `DATABASE_URL`.
3. In your backend environment, set:

```env
DATABASE_URL=postgresql://...
```

4. Install dependencies and push the schema:

```bash
npm install
npm run db:push
```

This uses Drizzle config from `drizzle.config.ts` and schema from `db/schema.ts`.

## 3. Local development

Create a local env file from `.env.example`.

For local split setup, use:

```env
PORT=5000
BASE_URL=http://localhost:5000
SERVER_PUBLIC_URL=http://localhost:5000
FRONTEND_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173
SESSION_COOKIE_SAME_SITE=lax
VITE_API_BASE_URL=http://localhost:5000
VITE_WS_BASE_URL=ws://localhost:5000
```

Run the backend:

```bash
npm run dev
```

If you later split the frontend into its own Vercel project during development, keep `VITE_API_BASE_URL` pointed at your local backend.

## 4. Backend production env

Set these on your backend host:

```env
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://...
BASE_URL=https://api.yourdomain.com
SERVER_PUBLIC_URL=https://api.yourdomain.com
FRONTEND_URL=https://app.yourdomain.com
ALLOWED_ORIGINS=https://app.yourdomain.com
SESSION_SECRET=replace-with-a-long-random-secret
SESSION_COOKIE_SAME_SITE=none
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=EaseSpotter Support
EMAIL_LOGO_URL=https://app.yourdomain.com/favicon.png
```

For cross-site cookies between Vercel frontend and backend:

- `SESSION_COOKIE_SAME_SITE=none`
- use HTTPS in production
- leave `SESSION_COOKIE_DOMAIN` empty unless you know you need a custom cookie domain

## 5. Frontend production env on Vercel

Set these in Vercel:

```env
VITE_API_BASE_URL=https://api.yourdomain.com
VITE_WS_BASE_URL=wss://api.yourdomain.com
```

The frontend now supports explicit API and WebSocket base URLs through env vars.

## 6. External services to recreate under your own accounts

These are not stored in GitHub and must be recreated:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `BREVO_API_KEY`
- `SENDGRID_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `SYNC_KEY`

If you do not need a service immediately, leave it unset and bring it back later.

## 7. Mobile share links

The backend serves these domain verification and share routes:

- `GET /.well-known/apple-app-site-association`
- `GET /.well-known/assetlinks.json`
- `GET /share/:code`

Association identifiers and the verified local release certificate are built in. Optional production configuration:

```env
IOS_APP_IDS=JVQNWKGP23.com.easespotter.app,JVQNWKGP23.com.samuel.easespotter
IOS_APP_TEAM_ID=
IOS_APP_BUNDLE_ID=
ANDROID_PACKAGE_NAME=com.samuel.easespotter
ANDROID_SHA256_CERT_FINGERPRINTS=
ANDROID_NEW_SHA256_CERT_FINGERPRINTS=
IOS_APP_STORE_URL=https://apps.apple.com/app/...
ANDROID_PLAY_STORE_URL=https://play.google.com/store/apps/details?id=com.easespotter.app
```

Both iOS identifiers above are included by default, with the existing `/share/*`, `/recipes/*`, `/glowup/*`, and `/reels/*` paths. Keep the old identifier until existing users migrate.

Both Android packages include the verified shared local release certificate:

```text
9D:DA:D0:9A:88:2C:D3:B4:E0:0E:28:0D:B1:EF:04:F4:17:5A:89:83:53:FC:27:60:B3:E2:2C:F5:B3:42:71:F1
```

This supports directly distributed release APKs signed with that key. The debug certificate is intentionally not included. Friends' installed APK certificates have not been verified. For Play installations, obtain the Play app-signing fingerprint and add it through `ANDROID_NEW_SHA256_CERT_FINGERPRINTS` or `ANDROID_LEGACY_SHA256_CERT_FINGERPRINTS` for the corresponding package. These comma-separated settings add certificates to the built-in release key. Existing `ANDROID_PACKAGE_NAME` / `ANDROID_SHA256_CERT_FINGERPRINTS` settings remain supported and are merged without duplicates.

Both `easespotter.com` and `www.easespotter.com` must route these two `/.well-known/` URLs directly to this backend over HTTPS. Exempt them from any hosting-level apex/www redirects or authentication. The Express routes accept either host and return JSON before static/SPA handling; domain mappings are configured in the hosting provider, outside this repository.

Use either `IOS_APP_IDS` or `IOS_APP_TEAM_ID` + `IOS_APP_BUNDLE_ID`. For Android, use comma-separated SHA-256 fingerprints if you need both debug and release certificates.

After deployment, test:

- `https://easespotter.com/.well-known/apple-app-site-association`
- `https://easespotter.com/.well-known/assetlinks.json`
- `https://www.easespotter.com/.well-known/apple-app-site-association`
- `https://www.easespotter.com/.well-known/assetlinks.json`
- `https://easespotter.com/share/ABC123`

Each association URL must return HTTP 200 with `Content-Type: application/json` without a redirect. Confirm both old and new apps appear in each response.

`/share/:code` is a lightweight fallback invite page for users who do not have the app installed. The updated mobile app redeems invitation codes through the Firebase `groceryCollaboration` callable. New invites use 32-character hexadecimal tokens; the Firestore document ID is separate from the token. Do not query Firestore directly by code. Legacy six-character codes only reopen lists for existing members until the owner replaces the invitation.

The fallback page provides a copy button and explains sign-in, joining, expiry and testing access. It does not expose list contents, validate membership or access Neon. Test these routes locally without database credentials using `npm run test:mobile-links`; this starts only an isolated Express server.

For Railway, ensure **both** custom domains point to this Express service. The local routes accept either host, but they cannot change Railway domain mappings or upstream redirects. Redeploy this website and check all four URLs above. No Neon schema migration is needed for grocery invites.

## 8. Firestore sync service

The file `server.js` is a separate Express service using Firebase Admin and Firestore.

You only need to deploy it if you still rely on:

- `/internal/sync/store`
- `/internal/sync/promotion`

If not, leave it out of the first migration.

## 9. Rollout order

1. Provision Neon.
2. Set backend env vars.
3. Run `npm run db:push`.
4. Deploy backend.
5. Set Vercel frontend env vars.
6. Deploy frontend.
7. Test:
   - health endpoint
   - login
   - session persistence
   - dashboard data fetches
   - WebSocket features
8. Reconnect optional services one by one.

## 10. First production checks

- `GET https://api.yourdomain.com/api/health`
- frontend can log in successfully
- browser receives a session cookie after login
- authenticated requests from the frontend include cookies
- dashboards load without CORS errors
- WebSocket connects to `wss://api.yourdomain.com/ws`
