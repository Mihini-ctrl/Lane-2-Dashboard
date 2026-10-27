'use strict';
// Size limits on the prototype server: saves can be up to 20 MB, and a save that
// is too large gets a clear 413 answer rather than a dropped connection.
const test = require('node:test');
const assert = require('node:assert');
const { server } = require('../server.js');
const aiEval = require('../ai-eval.js');

const MB = 1024 * 1024;

test('a save over 20 MB is refused with a clear message', async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    // Never a valid state, so nothing is written even if the limit were missing.
    const body = JSON.stringify({ padding: 'x'.repeat(21 * MB) });
    const r = await fetch(base + '/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
    assert.strictEqual(r.status, 413);
    assert.match((await r.json()).error, /20 MB/);

    // A large save under the limit gets past the size check (and fails only because it is not a valid state).
    const ok = await fetch(base + '/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ padding: 'x'.repeat(12 * MB) }) });
    assert.strictEqual(ok.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('AI status reports how much Gemini reads, so the app can say when it read only part', () => {
  const st = aiEval.status();
  assert.deepStrictEqual(st.limits, { log: 60000, submission: 40000 });
});
