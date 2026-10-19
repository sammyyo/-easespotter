import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {after, before, beforeEach, test} from 'node:test';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {doc, collection, setDoc, updateDoc, deleteDoc, getDoc, getDocs} from 'firebase/firestore';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const {initializeApp, deleteApp} = require('firebase-admin/app');
const {getFirestore, Timestamp} = require('firebase-admin/firestore');
const {handleGroceryCollaboration} = require('./grocery_collaboration');
let env, app, admin;
const projectId = 'demo-easespotter-grocery';
const client = (uid) => uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();
const invoke = (uid, action, data = {}) => handleGroceryCollaboration(admin, {
  auth: uid ? {uid, token: {firebase: {sign_in_provider: 'password'}}} : null,
  data: {action, ...data},
});
const create = () => invoke('alice', 'create', {list: [{title: 'Milk', quantity: 1}]});
const rejects = (promise, code) => assert.rejects(promise, (error) => error.code === code);
before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Never run against production');
  env = await initializeTestEnvironment({projectId, firestore: {host: '127.0.0.1', port: 8180, rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')}});
  app = initializeApp({projectId}, 'grocery-tests');
  admin = getFirestore(app);
});
beforeEach(async () => { await env.clearFirestore(); });
after(async () => { await env?.cleanup(); if (app) await deleteApp(app); });

test('create generates independent unguessable invites and private lists', async () => {
  const a = await create();
  const b = await create();
  assert.match(a.code, /^[A-F0-9]{32}$/);
  assert.notEqual(a.docId, a.code);
  assert.notEqual(a.code, b.code);
  await assertSucceeds(getDoc(doc(client('alice'), 'grocery_shares', a.docId)));
  for (const uid of ['mallory', null]) {
    await assertFails(getDoc(doc(client(uid), 'grocery_shares', a.docId)));
    await assertFails(getDocs(collection(client(uid), 'grocery_shares')));
  }
  for (const uid of ['alice', 'mallory', null]) {
    await assertFails(getDoc(doc(client(uid), 'grocery_invites', a.code)));
    await assertFails(getDocs(collection(client(uid), 'grocery_invites')));
    await assertFails(getDoc(doc(client(uid), 'grocery_invite_attempts', 'alice')));
  }
});

test('callable denies guests, anonymous users and malformed payloads', async () => {
  await rejects(invoke(null, 'create', {list: []}), 'unauthenticated');
  await rejects(handleGroceryCollaboration(admin, {auth: {uid: 'guest', token: {firebase: {sign_in_provider: 'anonymous'}}}, data: {action: 'create', list: []}}), 'unauthenticated');
  for (const list of [null, {}, [{}], [{title: 'x'.repeat(501)}], Array(501).fill({title: 'x'})]) {
    await rejects(invoke('alice', 'create', {list}), 'invalid-argument');
  }
  await rejects(invoke('alice', 'join', {code: '../path'}), 'invalid-argument');
  await rejects(invoke('alice', 'open', {shareId: '../path'}), 'invalid-argument');
});

test('valid invite joins atomically; clients cannot forge membership or write lists', async () => {
  const a = await create();
  await invoke('bob', 'join', {code: a.code.toLowerCase(), participants: ['mallory']});
  const path = 'grocery_shares/' + a.docId;
  const data = (await admin.doc(path).get()).data();
  assert.deepEqual(data.participants, ['alice', 'bob']);
  assert.equal(data.participantMap.bob, true);
  assert.equal(data['participantMap.bob'], undefined);
  await assertSucceeds(getDoc(doc(client('bob'), path)));
  for (const uid of ['alice', 'bob', 'mallory']) {
    await assertFails(updateDoc(doc(client(uid), path), {participants: [uid]}));
    await assertFails(updateDoc(doc(client(uid), path), {list: []}));
    await assertFails(deleteDoc(doc(client(uid), path)));
    await assertFails(setDoc(doc(client(uid), 'grocery_shares/forged'), {uid, participants: [uid]}));
  }
  for (const action of ['open', 'update', 'leave', 'renew']) {
    await rejects(invoke('mallory', action, {shareId: a.docId, revision: 0, list: []}), 'permission-denied');
  }
});

test('expired invites cannot admit new users, existing members retain access', async () => {
  const a = await create();
  await invoke('bob', 'join', {code: a.code});
  await admin.doc('grocery_invites/' + a.code).update({expiresAt: Timestamp.fromMillis(1)});
  await rejects(invoke('mallory', 'join', {code: a.code}), 'failed-precondition');
  assert.equal((await invoke('bob', 'open', {shareId: a.docId})).docId, a.docId);
  await invoke('bob', 'update', {shareId: a.docId, revision: 0, list: [{title: 'Bread'}]});
});

test('only owner can rotate invite; old links stop admitting people', async () => {
  const a = await create();
  await invoke('bob', 'join', {code: a.code});
  await rejects(invoke('bob', 'renew', {shareId: a.docId}), 'permission-denied');
  const renewed = await invoke('alice', 'renew', {shareId: a.docId});
  assert.notEqual(a.code, renewed.code);
  await rejects(invoke('mallory', 'join', {code: a.code}), 'not-found');
  await invoke('mallory', 'join', {code: renewed.code});
  await invoke('bob', 'open', {shareId: a.docId});
});

test('leave removes all memberships and access; owner can end collaboration', async () => {
  const a = await create();
  await invoke('bob', 'join', {code: a.code});
  await invoke('bob', 'leave', {shareId: a.docId});
  const data = (await admin.doc('grocery_shares/' + a.docId).get()).data();
  assert.deepEqual(data.participants, ['alice']);
  assert.deepEqual(data.collaborators, []);
  assert.equal(data.participantMap.bob, undefined);
  await assertFails(getDoc(doc(client('bob'), 'grocery_shares', a.docId)));
  await rejects(invoke('bob', 'update', {shareId: a.docId, revision: 0, list: []}), 'permission-denied');
  await invoke('alice', 'leave', {shareId: a.docId});
  assert.equal((await admin.doc('grocery_shares/' + a.docId).get()).exists, false);
  assert.equal((await admin.doc('grocery_invites/' + a.code).get()).exists, false);
});

for (const [blocker, blocked] of [['alice', 'bob'], ['bob', 'alice']]) {
  test('blocks prevent joining in direction ' + blocker + ' -> ' + blocked, async () => {
    const a = await create();
    await admin.doc('users/' + blocker + '/blockedUsers/' + blocked).set({uid: blocked});
    await rejects(invoke('bob', 'join', {code: a.code}), 'permission-denied');
  });
}

test('blocked existing member cannot read or save, but can leave', async () => {
  const a = await create();
  await invoke('bob', 'join', {code: a.code});
  await admin.doc('users/alice/blockedUsers/bob').set({uid: 'bob'});
  await assertFails(getDoc(doc(client('bob'), 'grocery_shares', a.docId)));
  await rejects(invoke('bob', 'open', {shareId: a.docId}), 'permission-denied');
  await rejects(invoke('bob', 'update', {shareId: a.docId, revision: 0, list: []}), 'permission-denied');
  await invoke('bob', 'leave', {shareId: a.docId});
});

test('concurrent edits accept one version and reject stale overwrite', async () => {
  const a = await create();
  await invoke('bob', 'join', {code: a.code});
  const results = await Promise.allSettled([
    invoke('alice', 'update', {shareId: a.docId, revision: 0, list: [{title: 'Apples'}]}),
    invoke('bob', 'update', {shareId: a.docId, revision: 0, list: [{title: 'Bananas'}]}),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'aborted');
  assert.equal((await invoke('alice', 'open', {shareId: a.docId})).revision, 1);
});

test('legacy six-character invitations only reopen for existing members until renewed', async () => {
  await admin.doc('grocery_shares/ABC123').set({uid: 'alice', collaborators: ['bob'], list: [], code: 'ABC123'});
  await invoke('bob', 'join', {code: 'ABC123'});
  await rejects(invoke('mallory', 'join', {code: 'ABC123'}), 'failed-precondition');
  const renewed = await invoke('alice', 'renew', {shareId: 'ABC123'});
  await invoke('mallory', 'join', {code: renewed.code});
});

test('failed redemption attempts are rate limited', async () => {
  for (let i = 0; i < 30; i++) await rejects(invoke('mallory', 'join', {code: 'A'.repeat(32)}), 'not-found');
  await rejects(invoke('mallory', 'join', {code: 'A'.repeat(32)}), 'resource-exhausted');
});

test('concurrent joins preserve both memberships', async () => {
  const a = await create();
  await Promise.all([
    invoke('bob', 'join', {code: a.code}),
    invoke('carol', 'join', {code: a.code}),
  ]);
  const data = (await admin.doc('grocery_shares/' + a.docId).get()).data();
  assert.deepEqual(data.participants.slice().sort(), ['alice', 'bob', 'carol']);
  assert.equal(data.participantMap.bob, true);
  assert.equal(data.participantMap.carol, true);
});

test('joining checks blocks against non-owner members and enforces capacity', async () => {
  const a = await create();
  await invoke('bob', 'join', {code: a.code});
  await admin.doc('users/bob/blockedUsers/carol').set({uid: 'carol'});
  await rejects(invoke('carol', 'join', {code: a.code}), 'permission-denied');
  await admin.doc('grocery_shares/' + a.docId).update({
    participants: ['alice', ...Array.from({length: 49}, (_, i) => 'member' + i)],
    collaborators: [],
  });
  await rejects(invoke('carol', 'join', {code: a.code}), 'resource-exhausted');
});

test('list editing cannot change ownership, memberships or invitation token', async () => {
  const a = await create();
  await invoke('bob', 'join', {code: a.code});
  await invoke('bob', 'update', {
    shareId: a.docId, revision: 0, list: [{title: 'Milk'}],
    uid: 'bob', participants: ['bob', 'mallory'], code: 'A'.repeat(32),
  });
  const data = (await admin.doc('grocery_shares/' + a.docId).get()).data();
  assert.equal(data.uid, 'alice');
  assert.equal(data.code, a.code);
  assert.deepEqual(data.participants, ['alice', 'bob']);
});
