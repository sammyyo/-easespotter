import assert from 'node:assert/strict';
import {after, before, test} from 'node:test';
import {once} from 'node:events';
import type {Server} from 'node:http';
import express from 'express';
import {publicStoreLocationSchema} from '../shared/store-location';
import {distanceMeters, nearestStores, publicAddress, type StoreLocationRow} from './store-location';
import {storeLocationRoutes} from './store-location-routes';

const row = (id: number, latitude: number, longitude: number, published = true): StoreLocationRow => ({
  vendorId: id, name: 'Store ' + id, businessName: 'Business', logoUrl: '/logo.png',
  integrationSettings: {secretApiKey: 'private-do-not-expose', publicLocation: {address: 'Main Street 1, Berlin', latitude, longitude, published}},
});

test('publishing requires a real address and finite, in-range coordinates', () => {
  for (const value of [
    {address: '', latitude: 0, longitude: 0, published: true},
    {address: 'Store', latitude: null, longitude: 0, published: true},
    {address: 'Store', latitude: 91, longitude: 0, published: true},
    {address: 'Store', latitude: 0, longitude: 181, published: true},
    {address: 'Store', latitude: NaN, longitude: 0, published: true},
  ]) assert.equal(publicStoreLocationSchema.safeParse(value).success, false);
  assert.equal(publicStoreLocationSchema.safeParse({address: '', published: false}).success, true);
  assert.equal(publicStoreLocationSchema.safeParse({address: ' Equator ', latitude: 0, longitude: 0, published: true}).success, true);
});

test('unpublished and legacy locations stay private; public output excludes integration secrets', () => {
  assert.equal(publicAddress(row(1, 52, 13, false)), null);
  assert.equal(publicAddress({...row(1, 52, 13), integrationSettings: null}), null);
  const result = publicAddress(row(1, 52, 13))!;
  assert.equal(result.latitude, 52);
  assert.equal(result.vendorId, 1);
  assert.equal(JSON.stringify(result).includes('private-do-not-expose'), false);
  assert.equal('integrationSettings' in result, false);
  assert.equal('email' in result, false);
});

test('nearest selection searches beyond the former first 80 candidates', () => {
  const rows = Array.from({length: 100}, (_, i) => row(i + 1, 20, 20));
  rows.push(row(101, 52.5201, 13.405));
  rows.push(row(102, 52.53, 13.405));
  rows.push(row(103, 52.52, 13.405, false));
  const result = nearestStores(rows, 52.52, 13.405, 50, 10);
  assert.deepEqual(result.map((store) => store.storeId), [101, 102]);
  assert.ok(result[0].distanceMeters < result[1].distanceMeters);
});

test('distance works across the date line and on identical coordinates', () => {
  assert.equal(distanceMeters(0, 0, 0, 0), 0);
  const meters = distanceMeters(0, 179.9, 0, -179.9);
  assert.ok(meters > 22000 && meters < 23000);
  assert.equal(nearestStores([row(1, 1, 1)], 0, 0, 1, 10).length, 0);
});

let server: Server;
let base: string;
let unavailable = false;
before(async () => {
  const app = express();
  app.use('/api/stores', storeLocationRoutes(async () => {
    if (unavailable) throw new Error('database secret connection string');
    return [row(1, 52.52, 13.405), row(2, 52.521, 13.405)];
  }));
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  base = 'http://127.0.0.1:' + address.port + '/api/stores/nearby';
});
after(async () => { if (server) await new Promise<void>((resolve) => server.close(() => resolve())); });

test('nearby API is public, bounded, non-cacheable and returns distance', async () => {
  const response = await fetch(base + '?latitude=52.52&longitude=13.405&limit=1');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].distanceMeters, 0);
  assert.equal(result.radiusKm, 50);
});

test('invalid, repeated, nonfinite and oversized queries are rejected', async () => {
  for (const query of ['', '?latitude=&longitude=0', '?latitude=91&longitude=0',
    '?latitude=NaN&longitude=0', '?latitude=0&longitude=0&limit=51',
    '?latitude=0&latitude=1&longitude=0', '?latitude=0&longitude=0&radiusKm=501']) {
    assert.equal((await fetch(base + query)).status, 400, query);
  }
});

test('database failure is reported without exposing internal details', async () => {
  unavailable = true;
  try {
    const response = await fetch(base + '?latitude=0&longitude=0');
    assert.equal(response.status, 503);
    assert.equal((await response.text()).includes('secret'), false);
  } finally { unavailable = false; }
});

test('store profile accepts a published location when optional contact email is blank', async () => {
  const {insertStoreProfileSchema} = await import('../db/schema');
  const payload = {
    name: 'Test Store', slug: 'test-store', vendorId: 1, contactEmail: '',
    integrationType: 'manual',
    integrationSettings: row(1, 52, 13).integrationSettings,
  };
  assert.equal(insertStoreProfileSchema.safeParse(payload).success, true);
  assert.equal(insertStoreProfileSchema.safeParse({...payload, contactEmail: 'not-an-email'}).success, false);
});
