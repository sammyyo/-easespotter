import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function handlers(blockedPath) {
  const writes = [];
  const records = {
    'conversations/chat': {participants: ['alice', 'bob']},
    'users/alice': {displayName: 'Alice'},
    'glowups/post': {uid: 'bob'},
    'recipes/post': {uid: 'bob'},
    'shopping_wall/post': {uid: 'bob'},
  };
  const ref = (path) => ({path,
    collection: (name) => ref(`${path}/${name}`),
    doc: (id = 'auto') => ref(`${path}/${id}`),
    get: async () => ({exists: path in records, data: () => records[path]}),
    add: async (payload) => writes.push({path, payload}),
  });
  const db = {
    doc: ref, collection: ref,
    getAll: async (...refs) => refs.map(({path}) => ({exists: path === blockedPath})),
    batch: () => ({set: (target, payload) => writes.push({path: target.path, payload}), commit: async () => {}}),
  };
  const exports = {};
  const modules = {
    'firebase-functions/v2/firestore': {onDocumentCreated: (_, handler) => handler, onDocumentUpdated: (_, handler) => handler},
    'firebase-functions/v2/https': {onCall: (_, handler) => handler},
    './grocery_collaboration': {handleGroceryCollaboration: () => {}},
    'firebase-functions/v2/scheduler': {onSchedule: (_, handler) => handler},
    'firebase-admin/app': {initializeApp() {}},
    'firebase-admin/firestore': {getFirestore: () => db, FieldValue: {serverTimestamp: () => 'server-time'}},
  };
  vm.runInNewContext(readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8'), {
    exports, require: (name) => { assert.ok(name in modules); return modules[name]; },
    console: {error: (...args) => { throw new Error(args.join(' ')); }},
  });
  return {exports, writes};
}

for (const blockedPath of [undefined, 'users/alice/blockedUsers/bob', 'users/bob/blockedUsers/alice']) {
  test(`notification handlers respect block state: ${blockedPath ?? 'unblocked'}`, async () => {
    const {exports: api, writes} = handlers(blockedPath);
    await api.onMessageCreateNotifyRecipient({params: {conversationId: 'chat'}, data: {data: () => ({senderId: 'alice', text: 'Hello'})}});
    await api.onGlowUpComment({params: {glowUpId: 'post'}, data: {data: () => ({uid: 'alice', text: 'Hello'})}});
    await api.onRecipeComment({params: {recipeId: 'post'}, data: {data: () => ({userId: 'alice', content: 'Hello'})}});
    await api.onShoppingWallComment({params: {postId: 'post'}, data: {data: () => ({uid: 'alice', text: 'Hello'})}});
    const reaction = {params: {glowUpId: 'post', reelId: 'post'}, data: {before: {data: () => ({uid: 'bob', likedBy: []})}, after: {data: () => ({uid: 'bob', likedBy: ['alice']})}}};
    await api.onGlowUpReaction(reaction);
    await api.onReelReaction(reaction);
    assert.equal(writes.length, blockedPath ? 0 : 6);
    for (const write of writes) {
      assert.ok(write.path.startsWith('users/bob/notifications'));
      assert.equal(write.payload.actorUid, 'alice');
    }
  });
}
