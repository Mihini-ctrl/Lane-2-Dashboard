/*
 * precompute-ai.js — runs Gemini's AI evaluation (including the check of the
 * written critique) once for every demo submission that has a critique, and
 * saves the answers in data/ai-evaluations.json.
 *
 *   node data/precompute-ai.js            only submissions not done yet
 *   node data/precompute-ai.js --all      run every one again
 *
 * data/generate-seed.js then attaches these results to the demo data, so the
 * demo (and the hosted site, which reloads the demo data on every restart)
 * shows Gemini's verdicts at once without spending the free quota again.
 * Needs GEMINI_API_KEY in .env. Safe to stop and run again: it saves after each one.
 */
'use strict';
const fs = require('fs');
const path = require('path');
try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch (e) { /* key may already be in the environment */ }
const ai = require('../ai-eval');
const Engine = require('../public/js/engine.js');

const OUT = path.join(__dirname, 'ai-evaluations.json');
const seed = require('./seed.json');
const all = process.argv.includes('--all');
const saved = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// The same request the app sends from runAiEval in public/js/app.js.
function request(s) {
  const a = seed.assignments.find((x) => x.id === s.assignmentId);
  return {
    assignment: { title: a.title, description: a.description },
    submission: s.submission,
    detection: Engine.normaliseSettings(a.settings).ai,
    log: s.chatLog || '',
    critique: s.critique,
    steps: s.interactions.length ? s.interactions.map((i) => ({ prompt: i.prompt, output: i.output, critique: i.critique })) : null
  };
}

(async () => {
  if (!process.env.GEMINI_API_KEY) { console.error('Add GEMINI_API_KEY to .env first.'); process.exit(1); }
  const todo = seed.submissions.filter((s) => s.critique && s.stage === 'handed_in' && (all || !saved[s.id]));
  console.log(todo.length + ' submission(s) to evaluate.');
  let done = 0;
  for (const s of todo) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await ai.evaluate(request(s));
        // Fixed time so the generated demo data stays the same on every run.
        saved[s.id] = Object.assign(r, { ranAt: '2026-10-27T09:00:00+13:00', textLength: s.submission.length });
        fs.writeFileSync(OUT, JSON.stringify(saved, null, 2));
        done++;
        console.log('ok   ' + s.id + ' · ' + r.model + ' · critique level ' + (r.critique ? r.critique.level + ' ' + r.critique.accuracy + ' ' + r.critique.aiWritten : 'none'));
        break;
      } catch (e) {
        console.log('try ' + attempt + ' ' + s.id + ': ' + e.message);
        if (attempt === 3) console.log('skip ' + s.id + ' (run the script again later)');
        else await wait(e.status === 429 ? 65000 : 8000);
      }
    }
    await wait(4000); // stay under the free tier's requests-per-minute limit
  }
  console.log('Done: ' + done + ' new, ' + Object.keys(saved).length + ' saved in data/ai-evaluations.json. Now run: node data/generate-seed.js');
})();
