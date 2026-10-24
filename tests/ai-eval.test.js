/*
 * Checks for ai-eval.js without calling Google: fetch is replaced by a fake
 * Gemini that returns a fixed answer.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ai = require('../ai-eval');

function fakeGemini(answer, status) {
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body), headers: opts.headers });
    return { ok: !status, status: status || 200, statusText: 'x', json: async () => status ? { error: { message: 'quota' } } : { candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] } };
  };
  return calls;
}

test('sentences keep their paragraph', () => {
  const s = ai.splitSentences('First one. Second one?\n\nThird "quoted" one! 4th line.');
  assert.deepEqual(s.map((x) => [x.text, x.para]), [['First one.', 0], ['Second one?', 0], ['Third "quoted" one!', 1], ['4th line.', 1]]);
});

test('log slices drop tool labels', () => {
  const lines = ['You said:', 'Help me plan', '', 'ChatGPT said:', 'Here is a plan.'];
  assert.equal(ai.sliceLines(lines, 1, 2), 'Help me plan');
  assert.equal(ai.sliceLines(lines, 4, 5), 'Here is a plan.');
  assert.equal(ai.sliceLines(lines, 0, 0), '');
});

test('a raw pasted log is split into steps and sentences map to them', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  const calls = fakeGemini({
    summary: 'Used AI for a plan.',
    steps: [
      { step: 1, task: 'Plan slides', purpose: 'brainstorming', use: 'changed', promptStart: 1, promptEnd: 2, responseStart: 4, responseEnd: 5, reactionStart: 0, reactionEnd: 0 },
      { step: 2, task: 'Empty', purpose: 'other', use: 'unclear', promptStart: 0, promptEnd: 0, responseStart: 0, responseEnd: 0 }
    ],
    sentences: [{ id: 1, source: 'changed', steps: [1] }, { id: 2, source: 'own', steps: [1] }]
  });
  const r = await ai.evaluate({ assignment: { title: 'Pres' }, submission: 'My plan has five slides. I wrote this myself.', log: 'You said:\nHelp me plan\n\nChatGPT said:\nHere is a plan.' });
  assert.equal(calls[0].headers['x-goog-api-key'], 'test-key');
  assert.match(calls[0].url, /gemini-3\.6-flash:generateContent$/);
  assert.match(calls[0].body.contents[0].parts[0].text, /\[S1\] My plan has five slides\./);
  assert.match(calls[0].body.contents[0].parts[0].text, /\[L2\] Help me plan/);
  assert.equal(r.steps.length, 1, 'empty steps are dropped');
  assert.deepEqual([r.steps[0].prompt, r.steps[0].response], ['Help me plan', 'Here is a plan.']);
  assert.deepEqual(r.sentences.map((x) => [x.source, x.steps]), [['changed', [1]], ['own', []]], 'own writing links to no step');
});

test('steps that already exist are kept and missing sentences default to own', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  fakeGemini({ summary: '', steps: [{ step: 1, task: 'A', purpose: 'drafting', use: 'unchanged' }, { step: 9, task: 'bad', purpose: 'x', use: 'y' }],
    sentences: [{ id: 'S2', source: 'unchanged', steps: [1, 7] }, { id: 3, source: 'own', steps: [] }, { id: 4, source: 'own', steps: [] }, { id: 5, source: 'own', steps: [] }] });
  const r = await ai.evaluate({ submission: 'One. Two. Three. Four. Five.', steps: [{ prompt: 'p', output: 'o' }] });
  assert.deepEqual(r.steps.map((s) => s.step), [1]);
  assert.deepEqual(r.sentences.slice(0, 2).map((x) => [x.source, x.steps]), [['own', []], ['unchanged', [1]]], '"S2" ids are read and the missing sentence is own');
});

test('friendly errors for a missing key and the free limit', async () => {
  delete process.env.GEMINI_API_KEY;
  await assert.rejects(ai.evaluate({ submission: 'x.', log: 'y' }), /GEMINI_API_KEY/);
  process.env.GEMINI_API_KEY = 'k';
  fakeGemini(null, 429);
  await assert.rejects(ai.evaluate({ submission: 'x.', log: 'y' }), /free limit/);
});

test('a busy model falls back to the next one', async () => {
  process.env.GEMINI_API_KEY = 'k';
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    if (calls.length === 1) return { ok: false, status: 503, statusText: 'x', json: async () => ({ error: { message: 'high demand' } }) };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ summary: 's', steps: [{ step: 1, task: 't', purpose: 'other', use: 'changed', promptStart: 1, promptEnd: 1, responseStart: 0, responseEnd: 0 }], sentences: [{ id: 1, source: 'own', steps: [] }] }) }] } }] }) };
  };
  const r = await ai.evaluate({ submission: 'One.', log: 'You said: hi' });
  assert.equal(calls.length, 2);
  assert.match(calls[1], /gemini-3\.5-flash-lite/);
  assert.equal(r.model, 'gemini-3.5-flash-lite');
});

test('an incomplete answer is asked for again', async () => {
  process.env.GEMINI_API_KEY = 'k';
  const answers = [
    { summary: 's', steps: [{ step: 1, task: 't', purpose: 'other', use: 'changed', promptStart: 1 }], sentences: [] },
    { summary: 's', steps: [{ step: 1, task: 't', purpose: 'other', use: 'changed', promptStart: 1, promptEnd: 1, responseStart: 2, responseEnd: 2 }], sentences: [{ id: 1, source: 'changed', steps: [1] }] }
  ];
  let n = 0;
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(answers[n++]) }] } }] }) });
  const r = await ai.evaluate({ submission: 'One.', log: 'hi\nhello' });
  assert.equal(n, 2);
  assert.deepEqual(r.sentences[0].steps, [1]);
  assert.equal(r.steps[0].prompt, 'hi');
});

test('the teacher\'s AI detection settings reach the prompt and are enforced', async () => {
  process.env.GEMINI_API_KEY = 'k';
  const calls = fakeGemini({ summary: 's', steps: [{ step: 1, task: 't', purpose: 'other', use: 'changed' }], sentences: [{ id: 1, source: 'unlogged', steps: [] }, { id: 2, source: 'changed', steps: [1] }] });
  const r = await ai.evaluate({ submission: 'One. Two.', steps: [{ prompt: 'p', output: 'o' }], detection: { sensitivity: 'strict', unlogged: false, brainstorm: false } });
  const prompt = calls[0].body.contents[0].parts[0].text;
  assert.match(prompt, /Sensitivity: STRICT/);
  assert.match(prompt, /Do not use "unlogged"/);
  assert.match(prompt, /written in the student's own words, counts as "own"/);
  assert.equal(r.sentences[0].source, 'own', '"unlogged" is turned into own writing when the teacher switched it off');
  assert.deepEqual(r.detection, { sensitivity: 'strict', unlogged: false, brainstorm: false });
  assert.match(ai.settingsText({ sensitivity: 'cautious' }), /CAUTIOUS/);
});
