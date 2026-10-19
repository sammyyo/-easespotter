import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import { registerMobileLinks } from './mobile-links';

let server: Server;
let base: string;
before(async () => {
  const app = express();
  registerMobileLinks(app);
  app.get('*', (_req, res) => res.status(404).send('SPA fallback'));
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  base = 'http://127.0.0.1:' + address.port;
});
after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

for (const host of ['easespotter.com', 'www.easespotter.com']) {
  test('Android association on ' + host + ' is JSON without redirect or authentication', async () => {
    const response = await fetch(base + '/.well-known/assetlinks.json', {headers: {host}, redirect: 'manual'});
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type')!, /application\/json/);
    assert.equal(response.headers.get('location'), null);
    const data = await response.json();
    for (const name of ['com.easespotter.app', 'com.samuel.easespotter']) {
      const app = data.find((item: any) => item.target.package_name === name);
      assert.ok(app);
      assert.ok(app.target.sha256_cert_fingerprints.includes('9D:DA:D0:9A:88:2C:D3:B4:E0:0E:28:0D:B1:EF:04:F4:17:5A:89:83:53:FC:27:60:B3:E2:2C:F5:B3:42:71:F1'));
    }
  });

  test('Apple association on ' + host + ' includes both apps and share paths', async () => {
    const response = await fetch(base + '/.well-known/apple-app-site-association', {headers: {host}, redirect: 'manual'});
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type')!, /application\/json/);
    assert.equal(response.headers.get('location'), null);
    const data = await response.json();
    for (const id of ['JVQNWKGP23.com.easespotter.app', 'JVQNWKGP23.com.samuel.easespotter']) {
      assert.ok(data.applinks.details.find((item: any) => item.appID === id)?.paths.includes('/share/*'));
    }
  });
}

test('fallback accepts legacy and secure tokens with copy and sign-in instructions', async () => {
  for (const code of ['ABC123', 'a'.repeat(32)]) {
    const response = await fetch(base + '/share/' + code);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    const html = await response.text();
    assert.ok(html.includes(code.toUpperCase()));
    assert.ok(html.includes('Copy invitation code'));
    assert.ok(html.includes('Sign in to EaseSpotter'));
    assert.ok(html.includes('seven days'));
  }
});

test('invalid tokens and script-shaped input return 404', async () => {
  for (const code of ['abc', 'x'.repeat(32), 'a'.repeat(129), '<script>alert(1)</script>']) {
    const response = await fetch(base + '/share/' + encodeURIComponent(code));
    assert.equal(response.status, 404);
  }
});

test('additional signing certificates preserve the built-in certificate', async () => {
  const previous = process.env.ANDROID_NEW_SHA256_CERT_FINGERPRINTS;
  process.env.ANDROID_NEW_SHA256_CERT_FINGERPRINTS = 'TEST-FINGERPRINT';
  try {
    const data = await (await fetch(base + '/.well-known/assetlinks.json')).json();
    const fingerprints = data.find((item: any) => item.target.package_name === 'com.easespotter.app').target.sha256_cert_fingerprints;
    assert.ok(fingerprints.includes('TEST-FINGERPRINT'));
    assert.ok(fingerprints.length >= 2);
  } finally {
    if (previous === undefined) delete process.env.ANDROID_NEW_SHA256_CERT_FINGERPRINTS;
    else process.env.ANDROID_NEW_SHA256_CERT_FINGERPRINTS = previous;
  }
});
