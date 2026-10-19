import {readFileSync} from 'node:fs';
import {after, before, beforeEach, test} from 'node:test';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {doc, collection, setDoc, updateDoc, deleteDoc, getDoc, getDocs, serverTimestamp, writeBatch} from 'firebase/firestore';

let env;
const db = (uid, claims = {}) => uid ? env.authenticatedContext(uid, claims).firestore() : env.unauthenticatedContext().firestore();
const pair = ['alice', 'bob'];
const conversation = () => ({participants: pair, participantMap: {alice: true, bob: true}, lastMessage: '', createdAt: serverTimestamp(), updatedAt: serverTimestamp()});
const report = (extra = {}) => ({reporterUid: 'alice', targetUid: 'bob', targetType: 'user', targetId: 'bob', reason: 'harassment', details: 'Repeated unwanted messages', status: 'pending', createdAt: serverTimestamp(), ...extra});
const block = (owner = 'alice', target = 'bob') => setDoc(doc(db(owner), `users/${owner}/blockedUsers/${target}`), {uid: target, createdAt: serverTimestamp()});
const message = (uid, convoId = 'alice_bob') => setDoc(doc(collection(db(uid), `conversations/${convoId}/messages`)), {senderId: uid, text: 'Hello', type: 'text', createdAt: serverTimestamp()});

before(async () => {
  env = await initializeTestEnvironment({projectId: 'demo-easespotter-safety', firestore: {host: '127.0.0.1', port: 8180, rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')}});
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const admin = context.firestore();
    for (const uid of ['alice', 'bob', 'mallory']) await setDoc(doc(admin, `users/${uid}`), {uid, displayName: uid, bio: '', following: [], followers: []});
    await setDoc(doc(admin, 'conversations/alice_bob'), conversation());
    await setDoc(doc(admin, 'conversations/alice_bob/messages/existing'), {senderId: 'bob', text: 'Earlier', type: 'text', createdAt: serverTimestamp()});
    for (const type of ['glowups', 'recipes', 'shopping_wall', 'reels']) await setDoc(doc(admin, `${type}/post`), {uid: 'bob', authorUid: 'bob', isPublic: true});
  });
});

test('authenticated reports are private, immutable, and duplicate-resistant', async () => {
  const path = 'abuseReports/alice_user_bob';
  await assertSucceeds(setDoc(doc(db('alice'), path), report()));
  for (const uid of ['alice', 'bob', 'mallory', null]) await assertFails(getDoc(doc(db(uid), path)));
  await assertFails(getDocs(collection(db('bob'), 'abuseReports')));
  await assertFails(setDoc(doc(db('alice'), path), report()));
  await assertFails(deleteDoc(doc(db('alice'), path)));
  await assertSucceeds(getDoc(doc(db('moderator', {admin: true}), path)));
  await assertSucceeds(updateDoc(doc(db('moderator', {admin: true}), path), {status: 'reviewed'}));
  await assertFails(updateDoc(doc(db('moderator', {admin: true}), path), {targetUid: 'mallory'}));
});

test('reports reject unauthenticated, forged, self, malformed and nonexistent targets', async () => {
  await assertFails(setDoc(doc(db(null), 'abuseReports/alice_user_bob'), report()));
  for (const extra of [{reporterUid: 'bob'}, {targetUid: 'alice', targetId: 'alice'}, {targetUid: 'missing', targetId: 'missing'}, {status: 'actioned'}, {reason: 'invalid'}, {details: 'x'.repeat(1001)}, {createdAt: new Date(0)}, {unexpected: true}]) {
    await assertFails(setDoc(doc(db('alice'), `abuseReports/alice_user_${extra.targetId ?? 'bob'}`), report(extra)));
  }
  await assertFails(setDoc(doc(db('alice'), 'abuseReports/random'), report()));
});

for (const type of ['glowups', 'recipes', 'shopping_wall', 'reels']) {
  test(`reports validate ${type} ownership and existence`, async () => {
    const data = report({targetType: type, targetId: 'post'});
    await assertFails(setDoc(doc(db('alice'), `abuseReports/alice_${type}_post`), {...data, targetUid: 'mallory'}));
    await assertFails(setDoc(doc(db('alice'), `abuseReports/alice_${type}_missing`), {...data, targetId: 'missing'}));
    await assertSucceeds(setDoc(doc(db('alice'), `abuseReports/alice_${type}_post`), data));
  });
}

test('only the blocker can manage and enumerate their blocks', async () => {
  await assertSucceeds(block());
  await assertSucceeds(getDocs(collection(db('alice'), 'users/alice/blockedUsers')));
  await assertSucceeds(getDoc(doc(db('bob'), 'users/alice/blockedUsers/bob')));
  await assertFails(getDoc(doc(db('mallory'), 'users/alice/blockedUsers/bob')));
  await assertFails(getDocs(collection(db('bob'), 'users/alice/blockedUsers')));
  await assertFails(deleteDoc(doc(db('bob'), 'users/alice/blockedUsers/bob')));
  await assertFails(setDoc(doc(db('bob'), 'users/alice/blockedUsers/mallory'), {uid: 'mallory', createdAt: serverTimestamp()}));
  await assertFails(block('alice', 'alice'));
  await assertFails(block('alice', 'missing'));
  await assertSucceeds(deleteDoc(doc(db('alice'), 'users/alice/blockedUsers/bob')));
});

for (const owner of ['alice', 'bob']) {
  test(`a block by ${owner} stops both directions, including new conversations`, async () => {
    await assertSucceeds(message('alice'));
    await block(owner, owner === 'alice' ? 'bob' : 'alice');
    await assertFails(message('alice'));
    await assertFails(message('bob'));
    await assertFails(setDoc(doc(db('alice'), 'conversations/new'), conversation()));
    await assertFails(updateDoc(doc(db('alice'), 'conversations/alice_bob'), {lastMessage: 'bypass', updatedAt: serverTimestamp()}));
    await assertFails(updateDoc(doc(db('bob'), 'conversations/alice_bob/messages/existing'), {userReactions: {bob: '❤️'}}));
    await assertFails(setDoc(doc(db('bob'), 'users/alice/inbox/alice_bob'), {conversationId: 'alice_bob', otherUid: 'bob', lastMessage: 'bypass', lastMessageAt: serverTimestamp(), unreadCount: 1}));
    await assertSucceeds(getDoc(doc(db('alice'), 'conversations/alice_bob/messages/existing')));
    await deleteDoc(doc(db(owner), `users/${owner}/blockedUsers/${owner === 'alice' ? 'bob' : 'alice'}`));
    await assertSucceeds(message('alice'));
    await assertSucceeds(message('bob'));
  });
}

test('unblocking does not remove a reverse block', async () => {
  await block('alice', 'bob'); await block('bob', 'alice');
  await deleteDoc(doc(db('alice'), 'users/alice/blockedUsers/bob'));
  await assertFails(message('alice')); await assertFails(message('bob'));
});

test('forged inbox membership and participant rewrites cannot bypass blocks', async () => {
  await setDoc(doc(db('mallory'), 'users/mallory/inbox/alice_bob'), {otherUid: 'bob'});
  await assertFails(getDoc(doc(db('mallory'), 'conversations/alice_bob')));
  await assertFails(message('mallory'));
  await assertFails(updateDoc(doc(db('alice'), 'conversations/alice_bob'), {participants: ['alice', 'mallory'], participantMap: {alice: true, mallory: true}}));
  await assertFails(setDoc(doc(db('alice'), 'conversations/forged'), {participants: ['alice', 'mallory'], participantMap: {alice: true, mallory: true, bob: true}}));
});

test('first conversation plus recipient inbox can be created atomically', async () => {
  const client = db('alice'); const batch = writeBatch(client);
  batch.set(doc(client, 'conversations/new'), conversation());
  batch.set(doc(client, 'users/bob/inbox/new'), {conversationId: 'new', otherUid: 'alice', lastMessage: '', lastMessageAt: serverTimestamp(), unreadCount: 0});
  await assertSucceeds(batch.commit());
});

for (const type of ['glowups', 'recipes', 'shopping_wall', 'reels']) {
  test(`blocked users cannot create or edit comments on ${type}`, async () => {
    const client = db('alice');
    const data = type === 'recipes'
      ? {userId: 'alice', content: 'Comment', createdAt: serverTimestamp()}
      : {uid: 'alice', text: 'Comment', createdAt: serverTimestamp(), ...(type === 'glowups' ? {updatedAt: serverTimestamp()} : {})};
    const path = `${type}/post/comments/comment`;
    await assertSucceeds(setDoc(doc(client, path), data));
    await block('bob', 'alice');
    await assertFails(setDoc(doc(client, `${type}/post/comments/new`), data));
    await assertFails(updateDoc(doc(client, path), type === 'recipes' ? {content: 'Changed'} : {text: 'Changed'}));
  });
}

test('private posts cannot be reported by guessing an ID', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    for (const type of ['recipes', 'reels']) await updateDoc(doc(context.firestore(), `${type}/post`), {isPublic: false});
  });
  for (const type of ['recipes', 'reels']) await assertFails(setDoc(doc(db('alice'), `abuseReports/alice_${type}_post`), report({targetType: type, targetId: 'post'})));
});

test('blocks reject forged data and unsigned writes', async () => {
  const path = 'users/alice/blockedUsers/bob';
  await assertFails(setDoc(doc(db(null), path), {uid: 'bob', createdAt: serverTimestamp()}));
  await assertFails(setDoc(doc(db('alice'), path), {uid: 'mallory', createdAt: serverTimestamp()}));
  await assertFails(setDoc(doc(db('alice'), path), {uid: 'bob', createdAt: new Date(0)}));
  await assertFails(setDoc(doc(db('alice'), path), {uid: 'bob', createdAt: serverTimestamp(), admin: true}));
});

test('atomic block and send cannot bypass the block', async () => {
  const client = db('alice'); const batch = writeBatch(client);
  batch.set(doc(client, 'users/alice/blockedUsers/bob'), {uid: 'bob', createdAt: serverTimestamp()});
  batch.set(doc(client, 'conversations/alice_bob/messages/bypass'), {senderId: 'alice', text: 'Hello', type: 'text', createdAt: serverTimestamp()});
  await assertFails(batch.commit());
});

test('reel owners cannot frame another author by transferring attribution', async () => {
  await assertFails(updateDoc(doc(db('bob'), 'reels/post'), {uid: 'mallory', authorUid: 'mallory'}));
  await assertSucceeds(updateDoc(doc(db('bob'), 'reels/post'), {title: 'Edited title'}));
});

test('blocked users cannot trigger reel reactions or change comment attribution', async () => {
  await assertSucceeds(updateDoc(doc(db('alice'), 'reels/post'), {likedBy: ['alice']}));
  await block('bob', 'alice');
  await assertFails(updateDoc(doc(db('alice'), 'reels/post'), {likedBy: ['mallory']}));
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'reels/post/comments/old'), {uid: 'alice', text: 'Old'});
  });
  await assertFails(updateDoc(doc(db('mallory'), 'reels/post/comments/old'), {uid: 'bob', text: 'Forged'}));
});

const detailValues = (extra = {}) => ({city: '', interests: '', cuisines: '', dietaryPreferences: '', favouriteStores: '', ...extra});
const detailSharing = (extra = {}) => ({city: false, interests: false, cuisines: false, dietaryPreferences: false, favouriteStores: false, ...extra});
const saveDetails = (actor, values, sharing, published) => {
  const firestore = db(actor);
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, 'users/alice/profileDetails/private'), {values, sharing});
  batch.set(doc(firestore, 'users/alice/profileDetails/public'), published);
  return batch.commit();
};

test('optional profile fields remain private until explicitly shared', async () => {
  await assertSucceeds(saveDetails('alice', detailValues({city: 'Berlin', dietaryPreferences: 'Vegetarian'}), detailSharing({city: true}), detailValues({city: 'Berlin'})));
  await assertSucceeds(getDoc(doc(db('alice'), 'users/alice/profileDetails/private')));
  for (const uid of ['bob', null]) {
    await assertFails(getDoc(doc(db(uid), 'users/alice/profileDetails/private')));
    await assertFails(getDocs(collection(db(uid), 'users/alice/profileDetails')));
    const publicDoc = await assertSucceeds(getDoc(doc(db(uid), 'users/alice/profileDetails/public')));
    if (publicDoc.data().dietaryPreferences !== '') throw new Error('Hidden field leaked');
  }
});

test('profile sharing enforces ownership and rejects hidden-field publication', async () => {
  await assertFails(saveDetails('bob', detailValues(), detailSharing(), detailValues()));
  await assertFails(saveDetails(null, detailValues(), detailSharing(), detailValues()));
  await assertFails(saveDetails('alice', detailValues({city: 'Berlin'}), detailSharing(), detailValues({city: 'Berlin'})));
  await assertFails(saveDetails('alice', detailValues({city: 'x'.repeat(161)}), detailSharing(), detailValues()));
  await assertFails(saveDetails('alice', detailValues(), detailSharing({city: 'true'}), detailValues()));
});

test('hiding a shared profile field removes public data atomically', async () => {
  await assertSucceeds(saveDetails('alice', detailValues({city: 'Berlin'}), detailSharing({city: true}), detailValues({city: 'Berlin'})));
  await assertFails(updateDoc(doc(db('alice'), 'users/alice/profileDetails/private'), {'sharing.city': false}));
  await assertSucceeds(saveDetails('alice', detailValues({city: 'Berlin'}), detailSharing(), detailValues()));
  const publicDoc = await getDoc(doc(db(null), 'users/alice/profileDetails/public'));
  if (publicDoc.data().city !== '') throw new Error('City remained public');
  await assertFails(updateDoc(doc(db('bob'), 'users/alice/profileDetails/public'), {city: 'Forged'}));
  await assertFails(deleteDoc(doc(db('alice'), 'users/alice/profileDetails/private')));
});
