'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const DraftStore = require('../public/js/draft-store');

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
    put: (key, value) => values.set(key, value)
  };
}

const draft = (owner, id = 'draft-1') => ({ id, owner, step: 2, data: { title: 'Report' } });

test('backend assignment drafts are stored separately for each signed-in user', () => {
  const storage = memoryStorage();
  DraftStore.save(storage, 'teacher-a', [draft('teacher-a')]);
  DraftStore.save(storage, 'teacher-b', [draft('teacher-b', 'draft-2')]);
  assert.deepEqual(DraftStore.load(storage, 'teacher-a').map((item) => item.id), ['draft-1']);
  assert.deepEqual(DraftStore.load(storage, 'teacher-b').map((item) => item.id), ['draft-2']);
});

test('draft storage ignores another owner and malformed browser data', () => {
  const storage = memoryStorage();
  assert.deepEqual(DraftStore.save(storage, 'teacher-a', [draft('teacher-a'), draft('teacher-b')]).map((item) => item.owner), ['teacher-a']);
  storage.put(DraftStore.key('teacher-a'), '{broken');
  assert.deepEqual(DraftStore.load(storage, 'teacher-a'), []);
});

test('the backend assignment wizard loads and saves browser drafts', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.ok(html.indexOf('js/draft-store.js') < html.indexOf('js/app.js'));
  assert.match(app, /state\.drafts = DraftStore\.load\(localStorage, result\.user\.id\)/);
  assert.match(app, /DraftStore\.save\(localStorage, user\.id, state\.drafts/);
  assert.doesNotMatch(app, /Draft assignments are not yet stored in Supabase/);
});
