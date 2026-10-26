/*
 * ai-eval.js — AI evaluation of one submission with Google Gemini.
 *
 * The teacher's browser sends the assignment brief, the final submission text
 * and the AI chat log. This module:
 *   1. splits the submission into numbered sentences [S1], [S2] ...
 *   2. numbers the lines of a raw pasted chat log [L1], [L2] ... (or lists
 *      steps that already exist)
 *   3. asks Gemini to split the log into prompt / response steps, say how
 *      each step's output was used, and label every sentence of the
 *      submission (student's own, changed AI text, unchanged AI text, or
 *      AI-like text with no matching prompt)
 *   4. maps Gemini's numbers back to real text, so the app never shows
 *      text Gemini rewrote.
 *
 * Gemini only returns numbers and labels, which keeps output tokens low and
 * means the submission and log are always shown exactly as written.
 *
 * Settings (in .env):
 *   GEMINI_API_KEY   required. Free key from https://aistudio.google.com/apikey
 *   GEMINI_MODEL     optional, defaults to gemini-3.6-flash
 *
 * If a model is busy (Google returns "high demand", the free limit is hit, or
 * it does not answer in time), the next model in FALLBACK_MODELS is tried.
 */
'use strict';

// gemini-3.8-flash is newer but was often overloaded on the free tier (Oct 2026),
// so the default is the previous stable Flash, with Flash-Lite as a fallback.
const DEFAULT_MODEL = 'gemini-3.6-flash';
const FALLBACK_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];
const ATTEMPT_TIMEOUT_MS = 45000;
const API_BASE = 'https://generativelanguage.googleapis.com';
const MAX_SUBMISSION_CHARS = 40000;
const MAX_LOG_CHARS = 60000;
const PURPOSES = ['brainstorming', 'research', 'drafting', 'editing', 'checking', 'other'];
const USES = ['unchanged', 'changed', 'not_used', 'unclear'];
const SOURCES = ['own', 'changed', 'unchanged', 'unlogged'];

const SYSTEM_PROMPT = `You help a university teacher understand how a student used generative AI while writing an assignment.
You do not decide whether anyone cheated. Your labels are estimates that point the teacher to where to look.

You receive:
- the assignment brief
- the student's final submission, split into numbered sentences written as [S1], [S2], ...
- the student's AI chat log, EITHER as numbered lines [L1], [L2], ... (a raw copy-and-paste of the chat) OR as numbered steps that are already split.

Do three things.

1. steps
   - If the log is numbered LINES: split it into steps. A step is one message the student sent to the AI (the prompt) plus the AI reply that follows it.
     Give inclusive line numbers: promptStart/promptEnd for the student's message and responseStart/responseEnd for the AI reply.
     Lines that are only tool labels (for example "You said:", "ChatGPT said:", "Copilot:") may be included or skipped.
     If the student's NEXT message reacts to this reply (agrees, judges, corrects or pushes back), also give that message's lines as reactionStart/reactionEnd. Those lines are still the prompt of the next step.
     Use 0 for any line number that does not apply. Steps are numbered 1, 2, 3 ... in chat order.
   - If the log is already split into numbered STEPS: return exactly one entry per given step, with the same step number, and set every line number to 0.
   - For every step give:
     task: a label of at most 6 words, e.g. "Brainstorm stakeholder groups".
     purpose: brainstorming, research, drafting, editing, checking or other.
     use: how the AI reply shows up in the final submission:
       "unchanged" = copied word-for-word or nearly so;
       "changed"   = used, but reworded, cut, extended or corrected by the student;
       "not_used"  = no trace in the submission (e.g. ideas that were dropped or a reply the student rejected);
       "unclear"   = cannot tell.

2. sentences: one entry for EVERY sentence id, each id exactly once.
   source:
     "own"       = no clear link to any AI reply in the log;
     "changed"   = based on an AI reply, but reworded or developed by the student;
     "unchanged" = repeats an AI reply word-for-word or nearly so;
     "unlogged"  = reads strongly like AI-generated text but matches nothing in the log. Use this rarely and only with clear signs.
   steps: the step numbers that shaped this sentence. A brainstorming step counts if the sentence develops one of its ideas.
     Several sentences can share a step, and a sentence can come from several steps. Use [] for "own" and "unlogged".

3. summary: two or three plain sentences for the teacher about how AI was used in this piece of work. Describe; do not accuse.

Rules:
- Base every label on evidence you can see in the submission and the log.
- When unsure between "own" and "changed", choose "own". When unsure between "changed" and "unchanged", choose "changed".
- Return JSON only, matching the schema.`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    steps: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          step: { type: 'INTEGER' },
          task: { type: 'STRING' },
          purpose: { type: 'STRING', enum: PURPOSES },
          use: { type: 'STRING', enum: USES },
          promptStart: { type: 'INTEGER' },
          promptEnd: { type: 'INTEGER' },
          responseStart: { type: 'INTEGER' },
          responseEnd: { type: 'INTEGER' },
          reactionStart: { type: 'INTEGER' },
          reactionEnd: { type: 'INTEGER' }
        },
        required: ['step', 'task', 'purpose', 'use', 'promptStart', 'promptEnd', 'responseStart', 'responseEnd', 'reactionStart', 'reactionEnd'],
        propertyOrdering: ['step', 'promptStart', 'promptEnd', 'responseStart', 'responseEnd', 'reactionStart', 'reactionEnd', 'task', 'purpose', 'use']
      }
    },
    sentences: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'INTEGER' },
          source: { type: 'STRING', enum: SOURCES },
          steps: { type: 'ARRAY', items: { type: 'INTEGER' } }
        },
        required: ['id', 'source', 'steps'],
        propertyOrdering: ['id', 'source', 'steps']
      }
    }
  },
  required: ['steps', 'sentences', 'summary'],
  // Steps first, then every sentence, then the summary written from both.
  propertyOrdering: ['steps', 'sentences', 'summary']
};

/* The teacher's AI detection settings (Adjust Rubrics → AI detection), added to the prompt. */
const SENSITIVITY_TEXT = {
  cautious: 'Sensitivity: CAUTIOUS. Only label a sentence "changed" or "unchanged" when it clearly and specifically matches an AI reply (the same facts, examples or wording). General ideas or common knowledge that also appear in a reply are "own". When in any doubt, choose "own".',
  balanced: 'Sensitivity: BALANCED. Apply the rules above as written.',
  strict: 'Sensitivity: STRICT. Label a sentence "changed" whenever its idea, structure or key facts clearly came from an AI reply, even if the student fully reworded it. Treat close paraphrase (same sentence structure, a few words swapped) as "unchanged". Still label genuinely independent writing "own".'
};
function settingsText(d) {
  const s = Object.assign({ sensitivity: 'balanced', unlogged: true, brainstorm: true }, d || {});
  return 'TEACHER SETTINGS (these override the defaults above where they differ)\n' +
    '- ' + (SENSITIVITY_TEXT[s.sensitivity] || SENSITIVITY_TEXT.balanced) + '\n' +
    '- ' + (s.unlogged
      ? 'Use "unlogged" for sentences that read strongly like AI-generated text but match nothing in the log' + (s.sensitivity === 'cautious' ? ', only with very clear signs' : '') + '.'
      : 'Do not use "unlogged" at all; label such sentences "own".') + '\n' +
    '- ' + (s.brainstorm
      ? 'A sentence that develops an idea from a brainstorming reply counts as "changed", linked to that step.'
      : 'A sentence that only reuses an idea from a brainstorming reply, written in the student\'s own words, counts as "own".');
}

class AiError extends Error {
  constructor(status, message, busy) { super(message); this.status = status; this.busy = !!busy; }
}

/** Tries the chosen model, then the fallbacks, while Google says a model is busy. */
async function callWithFallback(key, first, prompt, check) {
  const models = [first].concat(FALLBACK_MODELS.filter((m) => m !== first));
  let last;
  for (const model of models) {
    // Each model gets two tries: models sometimes stop early and skip fields.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await callGemini(key, model, prompt, true);
        const problem = check(raw);
        if (!problem) return { model, raw };
        last = new AiError(502, 'Gemini (' + model + ') gave an incomplete answer: ' + problem + '. Try running it again.', true);
      } catch (e) {
        if (!e.busy) throw e;
        last = e;
        if (e.status !== 502) break; // busy or rate limited: go straight to the next model
      }
    }
  }
  throw last;
}

/** Paragraphs → sentences, keeping which paragraph each sentence is in. */
function splitSentences(text) {
  const out = [];
  String(text || '').replace(/\r\n?/g, '\n').split(/\n\s*\n/).forEach((para, p) => {
    const flat = para.replace(/\s*\n\s*/g, ' ').trim();
    if (!flat) return;
    flat.split(/(?<=[.!?…]["')\]]?)\s+(?=["'(\[]?[A-Z0-9])/).forEach((s) => { if (s.trim()) out.push({ text: s.trim(), para: p }); });
  });
  return out;
}

const LABEL_LINE = /^\s*(you|me|user|student|assistant|ai|chatgpt|copilot|microsoft copilot|claude|gemini)(\s+said)?\s*:?\s*$/i;
const LABEL_PREFIX = /^\s*(you|me|user|student|assistant|ai|chatgpt|copilot|claude|gemini)(\s+said)?\s*:\s*/i;

/** Lines from..to (1-based, inclusive), without tool labels. */
function sliceLines(lines, from, to) {
  if (!(from >= 1) || !(to >= from)) return '';
  const part = lines.slice(from - 1, Math.min(to, lines.length));
  while (part.length && (LABEL_LINE.test(part[0]) || !part[0].trim())) part.shift();
  while (part.length && !part[part.length - 1].trim()) part.pop();
  if (part.length) part[0] = part[0].replace(LABEL_PREFIX, '');
  return part.join('\n').trim();
}

function buildPrompt(input, sentences, lines) {
  const a = input.assignment || {};
  const brief = 'ASSIGNMENT\nTitle: ' + (a.title || 'Untitled') + '\n' + (a.description ? 'Brief: ' + a.description + '\n' : '');
  const sub = 'FINAL SUBMISSION (numbered sentences)\n' + sentences.map((s, i) => '[S' + (i + 1) + '] ' + s.text).join('\n');
  let log;
  if (lines) {
    log = 'AI CHAT LOG (raw paste, numbered lines)\n' + lines.map((l, i) => '[L' + (i + 1) + '] ' + l).join('\n');
  } else {
    log = 'AI CHAT LOG (already split into steps)\n' + input.steps.map((s, i) =>
      'STEP ' + (i + 1) + '\nStudent prompt: ' + s.prompt + '\nAI reply: ' + s.output + (s.critique ? '\nStudent reflection: ' + s.critique : '')).join('\n\n');
  }
  return brief + '\n' + sub + '\n\n' + log + '\n\n' + settingsText(input.detection);
}

function readJson(text) {
  const clean = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(clean); }
  catch (e) {
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new AiError(502, 'Gemini did not return valid JSON. Try running it again.');
  }
}

async function callGemini(key, model, prompt, withSchema) {
  const base = (process.env.GEMINI_API_BASE || API_BASE).replace(/\/$/, '');
  // The key goes in the URL: Google answers 404 to newer "AQ." keys sent in the x-goog-api-key header (Oct 2026).
  const url = base + '/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);
  const generationConfig = { temperature: 0.2, responseMimeType: 'application/json' };
  if (withSchema) generationConfig.responseSchema = RESPONSE_SCHEMA;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig
      }),
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS)
    });
  } catch (e) {
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw new AiError(503, 'Gemini (' + model + ') did not answer in time. It may be busy; try again in a minute.', true);
    throw new AiError(502, 'Could not reach Gemini. Check the internet connection and try again.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (body.error && body.error.message) || res.statusText;
    if (res.status === 400 && withSchema && /schema|response_?schema|Unknown name/i.test(msg)) return callGemini(key, model, prompt, false);
    if (res.status === 429) throw new AiError(429, 'Gemini\'s free limit was reached. Wait a minute and try again. Daily limits reset at midnight US Pacific time.', true);
    if (res.status === 503 || res.status === 500) throw new AiError(503, 'Gemini (' + model + ') is busy right now (' + msg + ') Try again in a minute.', true);
    if (res.status === 401 || res.status === 403 || /API key/i.test(msg)) throw new AiError(401, 'Gemini rejected the API key. Check GEMINI_API_KEY in .env and restart the server.');
    if (res.status === 404) throw new AiError(404, 'Gemini does not know the model "' + model + '". Check GEMINI_MODEL in .env.');
    throw new AiError(502, 'Gemini error: ' + msg);
  }
  const cand = body.candidates && body.candidates[0];
  const text = cand && cand.content && (cand.content.parts || []).map((p) => p.text || '').join('');
  if (!text) throw new AiError(502, 'Gemini returned no answer' + (cand && cand.finishReason ? ' (' + cand.finishReason + ')' : '') + '. Try again.');
  return readJson(text);
}

// Accepts 3, "3", "S3" or "L12".
const int = (n) => (Number.isInteger(n) ? n : Math.round(Number(String(n == null ? '' : n).replace(/^[^0-9-]+/, '')) || 0));

/**
 * input: { assignment: {title, description}, submission: string,
 *          log: string | null, steps: [{prompt, output, critique}] | null }
 * returns: { model, summary, sentences: [{text, para, source, steps:[n]}],
 *            steps: [{step, task, purpose, use, prompt?, response?, reaction?}] }
 */
async function evaluate(input) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AiError(503, 'AI evaluation is not set up. Add GEMINI_API_KEY to the .env file and restart the server.');
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  const submission = String(input.submission || '').slice(0, MAX_SUBMISSION_CHARS);
  const sentences = splitSentences(submission);
  if (!sentences.length) throw new AiError(400, 'There is no submission text to evaluate.');
  const given = Array.isArray(input.steps) && input.steps.length ? input.steps : null;
  const lines = given ? null : String(input.log || '').slice(0, MAX_LOG_CHARS).replace(/\r\n?/g, '\n').split('\n');
  if (!given && !lines.some((l) => l.trim())) throw new AiError(400, 'There is no AI chat log to evaluate.');

  // An answer must label at least most sentences and, for a raw log, find at least one prompt.
  const check = (raw) => {
    const labelled = Array.isArray(raw.sentences) ? raw.sentences.filter((x) => int(x.id) >= 1 && int(x.id) <= sentences.length).length : 0;
    if (labelled < Math.ceil(sentences.length * 0.8)) return 'it labelled ' + labelled + ' of ' + sentences.length + ' sentences';
    const steps = Array.isArray(raw.steps) ? raw.steps : [];
    if (lines && !steps.some((s) => int(s.promptStart) >= 1 && int(s.promptEnd) >= int(s.promptStart))) return 'it found no prompts in the chat log';
    return '';
  };
  const detection = Object.assign({ sensitivity: 'balanced', unlogged: true, brainstorm: true }, input.detection || {});
  const { model: used, raw } = await callWithFallback(key, model, buildPrompt({ assignment: input.assignment, steps: given, detection }, sentences, lines), check);

  // Steps: keep one per number, in order, with real text sliced from the log.
  const seen = new Set();
  const steps = (Array.isArray(raw.steps) ? raw.steps : []).map((s) => ({
    step: int(s.step), task: String(s.task || '').slice(0, 80),
    purpose: PURPOSES.includes(s.purpose) ? s.purpose : 'other',
    use: USES.includes(s.use) ? s.use : 'unclear',
    lines: [int(s.promptStart), int(s.promptEnd), int(s.responseStart), int(s.responseEnd), int(s.reactionStart), int(s.reactionEnd)]
  })).filter((s) => s.step >= 1 && (!given || s.step <= given.length) && !seen.has(s.step) && seen.add(s.step))
    .sort((x, y) => x.step - y.step);
  let out = steps;
  if (lines) {
    out = steps.map((s) => Object.assign({}, s, {
      prompt: sliceLines(lines, s.lines[0], s.lines[1]),
      response: sliceLines(lines, s.lines[2], s.lines[3]),
      reaction: sliceLines(lines, s.lines[4], s.lines[5])
    })).filter((s) => s.prompt || s.response);
    out.forEach((s, k) => { s.step = k + 1; });
  }
  // Gemini's step numbers → renumbered steps (raw logs drop empty steps).
  const renumber = new Map(steps.map((s) => [s.step, null]));
  if (lines) steps.forEach((s) => { const hit = out.find((o) => o.lines === s.lines); renumber.set(s.step, hit ? hit.step : null); });
  else steps.forEach((s) => renumber.set(s.step, s.step));
  out.forEach((s) => { delete s.lines; });

  const bySentence = new Map((Array.isArray(raw.sentences) ? raw.sentences : []).map((x) => [int(x.id), x]));
  const labelled = sentences.map((s, i) => {
    const x = bySentence.get(i + 1) || {};
    let source = SOURCES.includes(x.source) ? x.source : 'own';
    if (source === 'unlogged' && !detection.unlogged) source = 'own'; // the teacher turned "Not recorded" off
    const linked = source === 'own' || source === 'unlogged' ? [] :
      Array.from(new Set((Array.isArray(x.steps) ? x.steps : []).map((n) => renumber.get(int(n))).filter((n) => n)));
    return { text: s.text, para: s.para, source, steps: linked };
  });

  return { model: used, detection, summary: String(raw.summary || '').slice(0, 1200), sentences: labelled, steps: out };
}

function status() {
  return { configured: !!process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || DEFAULT_MODEL };
}

module.exports = { evaluate, status, splitSentences, sliceLines, settingsText, AiError, SYSTEM_PROMPT, RESPONSE_SCHEMA };
