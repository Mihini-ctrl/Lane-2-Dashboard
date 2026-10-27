'use strict';
// Student hand-in files: the prototype server accepts PDF or Word files up to 10 MB.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { server } = require('../server.js');

const MB = 1024 * 1024;
const UPLOADS = path.join(__dirname, '..', 'data', 'uploads');

async function upload(base, name, bytes) {
  const r = await fetch(base + '/api/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, data: Buffer.alloc(bytes, 7).toString('base64') })
  });
  return { status: r.status, body: await r.json() };
}

test('hand-in files up to 10 MB are stored, larger ones are refused', async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const made = [];
  try {
    const ok = await upload(base, 'essay.pdf', 10 * MB);
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
    assert.strictEqual(ok.body.size, 10 * MB);
    made.push(ok.body.id);

    const mid = await upload(base, 'essay.docx', 6 * MB);
    assert.strictEqual(mid.status, 200, JSON.stringify(mid.body));
    made.push(mid.body.id);

    const big = await upload(base, 'essay.pdf', 10 * MB + 1024);
    assert.strictEqual(big.status, 400);
    assert.match(big.body.error, /10 MB/);
  } finally {
    for (const id of made) fs.rmSync(path.join(UPLOADS, id), { force: true });
    await new Promise((resolve) => server.close(resolve));
  }
});
