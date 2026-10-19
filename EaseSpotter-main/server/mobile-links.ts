import type { Express } from "express";

const SHARE_CODE_PATTERN = /^(?:[A-Z0-9]{6}|[A-F0-9]{32})$/;
// Verified local release certificate shared by both directly distributed APKs.
const ANDROID_RELEASE_SHA256 = '9D:DA:D0:9A:88:2C:D3:B4:E0:0E:28:0D:B1:EF:04:F4:17:5A:89:83:53:FC:27:60:B3:E2:2C:F5:B3:42:71:F1';
const APP_LINK_PATHS = ['/share/*', '/recipes/*', '/glowup/*', '/reels/*'];

function splitEnvList(value: string | undefined): string[] {
  if (!value) return [];

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getIosAppIds(): string[] {
  const explicitAppIds = splitEnvList(process.env.IOS_APP_IDS);
  const teamId = process.env.IOS_APP_TEAM_ID?.trim();
  const bundleId = process.env.IOS_APP_BUNDLE_ID?.trim();
  const composedAppId = teamId && bundleId ? `${teamId}.${bundleId}` : null;

  return Array.from(new Set([
    'JVQNWKGP23.com.easespotter.app',
    'JVQNWKGP23.com.samuel.easespotter',
    ...explicitAppIds,
    composedAppId,
  ].filter(Boolean) as string[]));
}

function getAndroidAppLinkStatement() {
  // Preserve configured certificates and add the verified release key for both
  // packages. Per-package settings can add Play app-signing certificates.
  const packages = [
    {
      name: process.env.ANDROID_PACKAGE_NAME?.trim() || 'com.samuel.easespotter',
      fingerprints: splitEnvList(process.env.ANDROID_SHA256_CERT_FINGERPRINTS),
    },
    {
      name: 'com.samuel.easespotter',
      fingerprints: [ANDROID_RELEASE_SHA256, ...splitEnvList(process.env.ANDROID_LEGACY_SHA256_CERT_FINGERPRINTS)],
    },
    {
      name: 'com.easespotter.app',
      fingerprints: [ANDROID_RELEASE_SHA256, ...splitEnvList(process.env.ANDROID_NEW_SHA256_CERT_FINGERPRINTS)],
    },
  ];
  const fingerprintsByPackage = new Map<string, Set<string>>();
  for (const { name, fingerprints } of packages) {
    if (fingerprints.length === 0) continue;
    const merged = fingerprintsByPackage.get(name) || new Set<string>();
    fingerprints.forEach((fingerprint) => merged.add(fingerprint));
    fingerprintsByPackage.set(name, merged);
  }

  return Array.from(fingerprintsByPackage, ([packageName, fingerprints]) => ({
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: packageName,
      sha256_cert_fingerprints: Array.from(fingerprints),
    },
  }));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getShareFallbackHtml(code: string): string {
  const safeCode = escapeHtml(code);
  const appStoreUrl = process.env.IOS_APP_STORE_URL?.trim() || '#';
  const playStoreUrl = process.env.ANDROID_PLAY_STORE_URL?.trim() || '#';
  const hasAppStoreUrl = appStoreUrl !== '#';
  const hasPlayStoreUrl = playStoreUrl !== '#';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>Shared Grocery List | EaseSpotter</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f7f8fb;
        color: #111827;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
      }

      main {
        width: min(100%, 460px);
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 28px;
        box-shadow: 0 18px 60px rgba(15, 23, 42, 0.12);
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 28px;
      }

      .brand-mark {
        width: 42px;
        height: 42px;
        border-radius: 999px;
        background: #111827;
        color: #ffffff;
        display: grid;
        place-items: center;
        font-weight: 800;
        letter-spacing: 0;
      }

      .brand-name {
        font-size: 20px;
        font-weight: 800;
      }

      h1 {
        margin: 0 0 12px;
        font-size: 28px;
        line-height: 1.15;
        letter-spacing: 0;
      }

      p {
        margin: 0;
        color: #4b5563;
        line-height: 1.6;
        font-size: 15px;
      }

      .code {
        margin: 22px 0;
        padding: 12px 14px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        background: #f9fafb;
        color: #111827;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        font-size: 14px;
        overflow-wrap: anywhere;
      }

      .actions {
        display: grid;
        gap: 10px;
        margin-top: 24px;
      }

      a, button {
        display: flex;
        min-height: 48px;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        text-decoration: none;
        font-weight: 700;
        letter-spacing: 0;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }

      .primary {
        background: #111827;
        color: #ffffff;
      }

      .secondary {
        border: 1px solid #d1d5db;
        color: #111827;
        background: #ffffff;
      }

      .disabled {
        pointer-events: none;
        opacity: 0.45;
      }

      .note {
        margin-top: 18px;
        font-size: 13px;
        color: #6b7280;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="brand" aria-label="EaseSpotter">
        <div class="brand-mark">E</div>
        <div class="brand-name">EaseSpotter</div>
      </div>
      <h1>Shared grocery list</h1>
      <p>You have been invited to open a shared grocery list in the EaseSpotter app.</p>
      <div class="code" aria-label="Share code"><span id="invite-code">${safeCode}</span></div>
      <p>Sign in to EaseSpotter, open Grocery List, tap the group icon, and paste this invitation code to join.</p>
      <div class="actions">
        <button class="secondary" id="copy-invite" type="button">Copy invitation code</button>
        <p id="copy-status" role="status" aria-live="polite"></p>
        ${hasAppStoreUrl ? `<a class="primary" href="${escapeHtml(appStoreUrl)}">Download on the App Store</a>` : ''}
        ${hasPlayStoreUrl ? `<a class="secondary" href="${escapeHtml(playStoreUrl)}">Get it on Google Play</a>` : ''}
      </div>
      <p class="note">Invites expire after seven days. If yours has expired, ask the list owner for a new link. If you need to install the app first, return to this invitation afterwards. During testing, ask your inviter for access to the app.</p>
    </main>
    <script>
      document.getElementById('copy-invite').addEventListener('click', async function () {
        const code = document.getElementById('invite-code').textContent;
        const status = document.getElementById('copy-status');
        try {
          await navigator.clipboard.writeText(code);
          status.textContent = 'Invitation copied. Paste it in the EaseSpotter app.';
        } catch (_) {
          status.textContent = 'Press and hold the invitation code above to copy it.';
        }
      });
    </script>
  </body>
</html>`;
}

export function registerMobileLinks(app: Express) {
app.get('/.well-known/apple-app-site-association', (_req, res) => {
  const appIds = getIosAppIds();

  res
    .type('application/json')
    .set('Cache-Control', 'public, max-age=3600')
    .json({
      applinks: {
        apps: [],
        details: appIds.map((appID) => ({
          appID,
          paths: APP_LINK_PATHS,
        })),
      },
    });
});

app.get('/.well-known/assetlinks.json', (_req, res) => {
  res
    .type('application/json')
    .set('Cache-Control', 'public, max-age=3600')
    .json(getAndroidAppLinkStatement());
});

app.get('/share/:code', (req, res) => {
  const code = req.params.code.trim().toUpperCase();

  if (!SHARE_CODE_PATTERN.test(code)) {
    return res.status(404).end();
  }

  res
    .type('html')
    .set('Cache-Control', 'no-store')
    .set('X-Robots-Tag', 'noindex')
    .set('Referrer-Policy', 'no-referrer')
    .send(getShareFallbackHtml(code));
});

}
