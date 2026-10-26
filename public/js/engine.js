/*
 * engine.js — the rule engine.
 *
 * Everything the dashboard says about a student comes from this file, and
 * every result carries the rule and threshold that produced it, so a marker
 * can always see *why* something was flagged.
 *
 * Works in the browser (window.Engine) and in Node (require('./engine')),
 * so the same logic is used by the app and by the automated tests.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Text helpers                                                        */
  /* ------------------------------------------------------------------ */

  function words(text) {
    return (text || '')
      .toLowerCase()
      .replace(/[’']/g, '')
      .split(/[^a-z0-9%]+/)
      .filter(Boolean);
  }

  function wordCount(text) {
    return words(text).length;
  }

  function shingles(tokens, n) {
    const out = new Set();
    for (let i = 0; i + n <= tokens.length; i++) out.add(tokens.slice(i, i + n).join(' '));
    return out;
  }

  // Matches a phrase at the start of a word, so "hallucinat" matches
  // "hallucinated" but "but" does not match "contribute".
  function includesAny(text, list) {
    const t = (text || '').toLowerCase().replace(/[’]/g, "'");
    const found = (list || []).filter((p) => {
      if (!p) return false;
      const esc = p.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp('(^|[^a-z0-9])' + esc).test(t);
    });
    // drop "check" when "checked" was also found, so explanations don't repeat
    return found.filter((p) => !found.some((q) => q !== p && q.toLowerCase().startsWith(p.toLowerCase())));
  }

  /* ------------------------------------------------------------------ */
  /* Vocabulary used by the rules (editable by the teacher)              */
  /* ------------------------------------------------------------------ */

  const DEFAULT_VOCAB = {
    genericPhrases: [
      'looks good', 'good answer', 'this is good', 'seems fine', 'all good',
      'very helpful', 'great response', 'no issues', 'i agree', 'makes sense',
      'it was useful', 'ok', 'fine'
    ],
    checkWords: [
      'checked', 'check', 'verified', 'verify', 'searched', 'looked up', 'cross-checked',
      'cross checked', 'google scholar', 'library', 'database', 'source', 'citation',
      'reference', 'stats nz', 'statistics', 'lecture', 'reading', 'textbook', 'confirmed',
      'compared', 'matches', 'slides', 'does not exist', "doesn't exist", 'could not find', "couldn't find"
    ],
    evaluativeWords: [
      'because', 'however', 'but', 'wrong', 'incorrect', 'inaccurate', 'overstates',
      'understates', 'missing', 'misses', 'too general', 'vague', 'biased', 'agree',
      'disagree', 'not true', 'outdated', 'hallucinat', 'made up', 'fabricated',
      'weak', 'strong', 'accurate', 'unsupported', 'not relevant', 'irrelevant',
      'oversimplif', 'assumes', 'ignores', 'generic', 'seem', 'no link',
      'not confident', 'correct', 'exaggerat', 'unclear', 'too broad'
    ],
    correctionWords: [
      'fixed', 'corrected', 'changed', 'rewrote', 'rewritten', 'replaced', 'removed',
      'deleted', 'split', 'added', 'used my own', 'instead', 'did not use', "didn't use",
      'rejected', 'dropped', 'cut'
    ],
    aiStylePhrases: [
      'it is important to note', 'comprehensive', 'valuable insights', 'delve',
      'in conclusion', 'overall, the ai', 'provides a comprehensive', 'plays a crucial role',
      'it is worth noting', 'multifaceted', 'in today\'s', 'navigate the complexities',
      'the ai response provides', 'offers valuable'
    ],
    pushbackWords: [
      'that is wrong', "that's wrong", 'not correct', 'incorrect', 'are you sure',
      'does not exist', "doesn't exist", 'cannot find', "can't find", 'could not find',
      'source', 'cite', 'citation', 'check', 'verify', 'that is not', "that's not",
      'outdated', 'actually', 'try again', 'too general', 'more specific', 'nz', 'new zealand'
    ]
  };

  /* ------------------------------------------------------------------ */
  /* Critique levels                                                     */
  /* ------------------------------------------------------------------ */

  const LEVELS = [
    { level: 0, name: 'No critique', text: 'Nothing was written about the AI output.' },
    { level: 1, name: 'Acknowledged', text: 'A generic or very short comment with no reasoning, e.g. "Looks good."' },
    { level: 2, name: 'Described', text: 'Summarises or restates the AI output without judging it.' },
    { level: 3, name: 'Evaluated', text: 'Makes a judgement about the output and gives a reason.' },
    { level: 4, name: 'Verified and acted', text: 'Checked the output against a source and corrected, rejected or changed it.' }
  ];

  /**
   * Classify one critique into a level 0–4.
   * Returns the level plus the evidence used, so the result is explainable.
   */
  function critiqueLevel(interaction, settings) {
    const s = settings || defaultSettings();
    const v = s.vocab;
    const critique = (interaction.critique || '').trim();
    const wc = wordCount(critique);
    const checks = includesAny(critique, v.checkWords);
    const evals = includesAny(critique, v.evaluativeWords);
    const corrections = includesAny(critique, v.correctionWords);
    const generic = isGeneric(critique, v.genericPhrases);
    const repeat = repeatShare(critique, interaction.output);
    const acted = interaction.decision === 'changed' || interaction.decision === 'not_used' || corrections.length > 0;

    let level;
    let why;
    if (wc === 0) { level = 0; why = 'Critique is empty.'; }
    else if (generic || wc < 4) { level = 1; why = generic ? 'Critique is a stock phrase.' : 'Critique is under 4 words.'; }
    else if (checks.length && acted) { level = 4; why = 'Mentions a check (' + checks.slice(0, 2).join(', ') + ') and the output was changed or not used.'; }
    else if (evals.length || checks.length) { level = 3; why = 'Gives a judgement (' + evals.concat(checks).slice(0, 2).join(', ') + ').'; }
    else { level = 2; why = repeat >= 0.25 ? 'Mostly restates the AI output.' : 'No judgement or check words found.'; }

    return { level, name: LEVELS[level].name, why, wordCount: wc, checks, evals, corrections, generic, repeat };
  }

  function isGeneric(critique, phrases) {
    const c = (critique || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!c) return false;
    if ((phrases || []).some((p) => c === p)) return true;
    // short critique that is mostly a stock phrase
    return wordCount(c) <= 6 && (phrases || []).some((p) => p.length > 3 && c.includes(p));
  }

  /** Share of the critique's 4-word phrases that also appear in the AI output (0–1). */
  function repeatShare(critique, output) {
    const c = shingles(words(critique), 4);
    if (c.size === 0) return 0;
    const o = shingles(words(output), 4);
    let hit = 0;
    c.forEach((g) => { if (o.has(g)) hit++; });
    return hit / c.size;
  }

  /* ------------------------------------------------------------------ */
  /* Settings and presets                                                */
  /* ------------------------------------------------------------------ */

  const PRESETS = {
    lenient: { label: 'Lenient', minWords: 8, minLevel: 2, repeatPct: 50, mostlyUnchangedPct: 85, sharedPct: 70, critiqueWords: 30 },
    standard: { label: 'Standard', minWords: 15, minLevel: 3, repeatPct: 36, mostlyUnchangedPct: 70, sharedPct: 50, critiqueWords: 45 },
    strict: { label: 'Strict', minWords: 25, minLevel: 4, repeatPct: 25, mostlyUnchangedPct: 50, sharedPct: 30, critiqueWords: 70 }
  };

  // AI detection sensitivity: one setting for both Gemini's AI evaluation and the flag rules' preset.
  const AI_SENSITIVITY = {
    cautious: { label: 'Cautious', preset: 'lenient', text: 'Only marks text as AI when it clearly matches a reply in the chat log. Fewer flags, fewer false alarms.' },
    balanced: { label: 'Balanced', preset: 'standard', text: 'The default. Marks text as AI when there is good evidence in the chat log, and gives the student the benefit of the doubt.' },
    strict: { label: 'Strict', preset: 'strict', text: 'Marks reworded and paraphrased AI text too, and expects detailed reflections. Catches more, with more false alarms.' }
  };
  const SENSITIVITY_FOR_PRESET = { lenient: 'cautious', standard: 'balanced', strict: 'strict' };
  const DEFAULT_AI = { sensitivity: 'balanced', unlogged: true, brainstorm: true };

  function defaultSettings() {
    const p = PRESETS.standard;
    return {
      preset: 'standard',
      ai: Object.assign({}, DEFAULT_AI),
      rules: {
        noCritique: { enabled: true },
        shortCritique: { enabled: true, minWords: p.minWords, exemptSpecific: true },
        genericCritique: { enabled: true },
        unchangedNoCheck: { enabled: true },
        repeatsOutput: { enabled: true, pct: p.repeatPct },
        belowLevel: { enabled: true, minLevel: p.minLevel },
        aiStyle: { enabled: true, minHits: 2 },
        mostlyUnchanged: { enabled: true, pct: p.mostlyUnchangedPct },
        highShared: { enabled: true, pct: p.sharedPct },
        noEvidence: { enabled: true },
        critiqueShort: { enabled: true, minWords: p.critiqueWords },
        critiqueLow: { enabled: true, minLevel: p.minLevel },
        critiqueMismatch: { enabled: true },
        critiqueAiWritten: { enabled: true, minHits: 2 }
      },
      vocab: JSON.parse(JSON.stringify(DEFAULT_VOCAB))
    };
  }

  function applyPreset(settings, name) {
    const p = PRESETS[name];
    if (!p) return settings;
    const s = JSON.parse(JSON.stringify(settings));
    s.preset = name;
    s.rules.shortCritique.minWords = p.minWords;
    s.rules.belowLevel.minLevel = p.minLevel;
    s.rules.repeatsOutput.pct = p.repeatPct;
    s.rules.mostlyUnchanged.pct = p.mostlyUnchangedPct;
    s.rules.highShared.pct = p.sharedPct;
    s.rules.critiqueShort.minWords = p.critiqueWords;
    s.rules.critiqueLow.minLevel = p.minLevel;
    return s;
  }

  /** Fill any missing keys from defaults (keeps old saved data working). */
  function normaliseSettings(saved) {
    const d = defaultSettings();
    if (!saved) return d;
    const s = { preset: saved.preset || 'custom', rules: {}, vocab: {},
      // Older saved settings have no AI detection block: start it from the flag-rule preset.
      ai: Object.assign({}, DEFAULT_AI, { sensitivity: SENSITIVITY_FOR_PRESET[saved.preset] || 'balanced' }, saved.ai || {}) };
    // Rules added later (e.g. the written-critique checks) start from the saved preset's values.
    const base = PRESETS[saved.preset] ? applyPreset(d, saved.preset) : d;
    Object.keys(d.rules).forEach((k) => { s.rules[k] = Object.assign({}, base.rules[k], (saved.rules || {})[k]); });
    Object.keys(d.vocab).forEach((k) => { s.vocab[k] = Array.isArray((saved.vocab || {})[k]) ? saved.vocab[k] : d.vocab[k]; });
    return s;
  }

  /* ------------------------------------------------------------------ */
  /* Rule catalogue — plain-language descriptions shown to markers       */
  /* ------------------------------------------------------------------ */

  const RULES = [
    { key: 'noCritique', scope: 'interaction', name: 'No critique', describe: () => 'The critique is empty.' },
    { key: 'shortCritique', scope: 'interaction', name: 'Short critique', describe: (r) => 'Critique is under ' + r.minWords + ' words' + (r.exemptSpecific ? ', unless it mentions a check or a correction.' : '.') },
    { key: 'genericCritique', scope: 'interaction', name: 'Generic critique', describe: () => 'Critique is a stock phrase such as "Looks good".' },
    { key: 'unchangedNoCheck', scope: 'interaction', name: 'Used unchanged, no check', describe: () => 'Output was used as-is and the critique mentions no check.' },
    { key: 'repeatsOutput', scope: 'interaction', name: 'Critique repeats AI output', describe: (r) => r.pct + '% or more of the critique\'s 4-word phrases also appear in the AI output.' },
    { key: 'belowLevel', scope: 'interaction', name: 'Below expected critique level', describe: (r) => 'Critique is below level ' + r.minLevel + ' (' + LEVELS[r.minLevel].name + ').' },
    { key: 'aiStyle', scope: 'interaction', name: 'Reflection may be AI-written', simulated: true, describe: (r) => 'Critique uses ' + r.minHits + ' or more phrases common in AI-written text. Simulated check: word lists like this misfire easily.' },
    { key: 'mostlyUnchanged', scope: 'student', name: 'Mostly used unchanged', describe: (r) => r.pct + '% or more of the student\'s AI outputs were used unchanged.' },
    { key: 'highShared', scope: 'student', name: 'High shared wording', describe: (r) => r.pct + '% or more of the final submission matches logged AI output word-for-word.' },
    { key: 'noEvidence', scope: 'student', name: 'No AI evidence submitted', describe: () => 'No chat link, transcript or journal entry was submitted.' },
    // The critique students write when they hand in (three guided answers), judged together with their replies in the chat.
    { key: 'critiqueShort', scope: 'critique', name: 'Short written critique', describe: (r) => 'The written critique is under ' + r.minWords + ' words. Students cannot hand in until they reach this length.' },
    { key: 'critiqueLow', scope: 'critique', name: 'Critique not insightful enough', describe: (r) => 'The combined critique level (written critique and replies in the chat) is below ' + r.minLevel + ' (' + LEVELS[r.minLevel].name + '). Uses Gemini\'s level once AI evaluation has run.' },
    { key: 'critiqueMismatch', scope: 'critique', name: 'Critique doesn\'t match the log', describe: () => 'Gemini found claims in the written critique (e.g. "I checked…", "I rewrote…") that the chat log and the work do not support. Needs AI evaluation.' },
    { key: 'critiqueAiWritten', scope: 'critique', name: 'Critique may be AI-written', describe: (r) => 'Gemini thinks the written critique was likely written by AI, e.g. it reads nothing like the student\'s own prompts. Before AI evaluation runs: ' + r.minHits + ' or more phrases common in AI-written text.' }
  ];

  const RULE_BY_KEY = {};
  RULES.forEach((r) => { RULE_BY_KEY[r.key] = r; });

  /* ------------------------------------------------------------------ */
  /* Evaluate one interaction                                            */
  /* ------------------------------------------------------------------ */

  function evaluateInteraction(interaction, settings) {
    const s = settings || defaultSettings();
    const r = s.rules;
    const lvl = critiqueLevel(interaction, s);
    const flags = [];
    const add = (key, detail) => flags.push({ key, name: RULE_BY_KEY[key].name, rule: RULE_BY_KEY[key].describe(r[key]), detail, simulated: !!RULE_BY_KEY[key].simulated });
    const critique = (interaction.critique || '').trim();
    const specific = lvl.checks.length > 0 || lvl.corrections.length > 0;

    if (r.noCritique.enabled && lvl.wordCount === 0) add('noCritique', 'No critique was recorded for this step.');

    if (r.shortCritique.enabled && lvl.wordCount > 0 && lvl.wordCount < r.shortCritique.minWords && !(r.shortCritique.exemptSpecific && specific)) {
      add('shortCritique', 'Critique is ' + lvl.wordCount + ' word' + (lvl.wordCount === 1 ? '' : 's') + '.');
    }

    if (r.genericCritique.enabled && lvl.generic) add('genericCritique', 'Matches a stock phrase: "' + critique + '".');

    if (r.unchangedNoCheck.enabled && interaction.decision === 'unchanged' && lvl.checks.length === 0) {
      add('unchangedNoCheck', 'Marked "used unchanged" and no check is mentioned.');
    }

    if (r.repeatsOutput.enabled && lvl.wordCount >= 8 && lvl.repeat * 100 >= r.repeatsOutput.pct) {
      add('repeatsOutput', Math.round(lvl.repeat * 100) + '% of the critique\'s 4-word phrases appear in the AI output.');
    }

    if (r.belowLevel.enabled && lvl.level < r.belowLevel.minLevel && lvl.level > 0) {
      add('belowLevel', 'Classified as level ' + lvl.level + ' (' + lvl.name + '). ' + lvl.why);
    }

    if (r.aiStyle.enabled) {
      const hits = includesAny(critique, s.vocab.aiStylePhrases);
      if (hits.length >= r.aiStyle.minHits) add('aiStyle', 'Phrases found: ' + hits.map((h) => '"' + h + '"').join(', ') + '.');
    }

    return { level: lvl, flags };
  }

  /* ------------------------------------------------------------------ */
  /* Shared wording between AI output and final submission               */
  /* ------------------------------------------------------------------ */

  /**
   * Finds runs of 5+ words in the submission that also appear in any logged
   * AI output. Returns coverage (0–1) and segments for highlighting.
   */
  function sharedWording(submission, outputs, n) {
    n = n || 5;
    const text = submission || '';
    const tokenRe = /[A-Za-z0-9%’']+/g;
    const tokens = [];
    let m;
    while ((m = tokenRe.exec(text))) tokens.push({ w: m[0].toLowerCase().replace(/[’']/g, ''), start: m.index, end: m.index + m[0].length });
    if (tokens.length === 0) return { coverage: 0, segments: [{ text, shared: false }], matchedWords: 0, totalWords: 0 };

    const outGrams = new Set();
    (outputs || []).forEach((o) => shingles(words(o), n).forEach((g) => outGrams.add(g)));

    const mark = new Array(tokens.length).fill(false);
    for (let i = 0; i + n <= tokens.length; i++) {
      const g = tokens.slice(i, i + n).map((t) => t.w).join(' ');
      if (outGrams.has(g)) for (let j = i; j < i + n; j++) mark[j] = true;
    }

    const segments = [];
    let cursor = 0;
    let i = 0;
    while (i < tokens.length) {
      const state = mark[i];
      let j = i;
      while (j + 1 < tokens.length && mark[j + 1] === state) j++;
      const start = state ? tokens[i].start : cursor;
      const end = state ? tokens[j].end : (j + 1 < tokens.length ? tokens[j + 1].start : text.length);
      if (state && start > cursor) segments.push({ text: text.slice(cursor, start), shared: false });
      segments.push({ text: text.slice(start, end), shared: state });
      cursor = end;
      i = j + 1;
    }
    if (cursor < text.length) segments.push({ text: text.slice(cursor), shared: false });

    const matched = mark.filter(Boolean).length;
    return { coverage: matched / tokens.length, segments, matchedWords: matched, totalWords: tokens.length };
  }

  /* ------------------------------------------------------------------ */
  /* Evaluate a whole student                                            */
  /* ------------------------------------------------------------------ */

  function evaluateStudent(student, settings) {
    const s = settings || defaultSettings();
    const r = s.rules;
    const interactions = (student.interactions || []).map((it) => Object.assign({}, it, { result: evaluateInteraction(it, s) }));
    const shared = sharedWording(student.submission, interactions.map((i) => i.output));
    const patternFlags = [];
    const add = (key, detail) => patternFlags.push({ key, scope: RULE_BY_KEY[key].scope, name: RULE_BY_KEY[key].name, rule: RULE_BY_KEY[key].describe(r[key]), detail });

    const recorded = interactions.filter((i) => i.decision && i.decision !== 'unrecorded');
    const unchanged = recorded.filter((i) => i.decision === 'unchanged').length;
    if (r.mostlyUnchanged.enabled && recorded.length >= 2 && (unchanged / recorded.length) * 100 >= r.mostlyUnchanged.pct) {
      add('mostlyUnchanged', unchanged + ' of ' + recorded.length + ' outputs were used unchanged.');
    }
    if (r.highShared.enabled && shared.totalWords > 0 && shared.coverage * 100 >= r.highShared.pct) {
      add('highShared', Math.round(shared.coverage * 100) + '% of the submission matches logged AI output word-for-word. Paraphrasing is not detected.');
    }
    if (r.noEvidence.enabled && interactions.length === 0) {
      add('noEvidence', 'This student has no logged AI interactions. They may not have used AI, or may not have submitted evidence.');
    }

    // The written critique (handed in with the work) and the replies in the chat give one combined level.
    const critique = critiqueSummary(student, interactions, s);
    if (critique.text) {
      if (r.critiqueShort.enabled && critique.words < r.critiqueShort.minWords) add('critiqueShort', 'The written critique is ' + critique.words + ' words.');
      if (r.critiqueLow.enabled && critique.level != null && critique.level < r.critiqueLow.minLevel) {
        add('critiqueLow', 'Combined critique level ' + fmtLevel(critique.level) + ' (' + LEVELS[Math.round(critique.level)].name + ')' + (critique.source === 'ai' ? ', from Gemini.' : ', from the rules.'));
      }
      const strict = (s.ai || DEFAULT_AI).sensitivity === 'strict';
      const ai = critique.ai;
      if (r.critiqueMismatch.enabled && ai && (ai.accuracy === 'does_not_match' || (strict && ai.accuracy === 'partly'))) {
        const bad = (ai.claims || []).filter((c) => c.verdict !== 'supported').length;
        add('critiqueMismatch', (bad ? bad + ' claim' + (bad === 1 ? '' : 's') + ' in the critique' : 'The critique') + ' not supported by the chat log or the work.');
      }
      if (r.critiqueAiWritten.enabled) {
        if (ai && (ai.aiWritten === 'likely' || (strict && ai.aiWritten === 'possible'))) add('critiqueAiWritten', 'Gemini: ' + (ai.aiWrittenReason || 'reads like AI-generated text.'));
        else if (!ai) {
          const hits = includesAny(critique.text, s.vocab.aiStylePhrases);
          if (hits.length >= r.critiqueAiWritten.minHits) add('critiqueAiWritten', 'Phrases found: ' + hits.map((h) => '"' + h + '"').join(', ') + '. Run AI evaluation for a closer check.');
        }
      }
    }

    const interactionFlagCount = interactions.reduce((n, i) => n + i.result.flags.length, 0);
    const avgLevel = critique.level;
    const decisions = { changed: 0, not_used: 0, unchanged: 0, unrecorded: 0 };
    interactions.forEach((i) => { decisions[i.decision || 'unrecorded'] = (decisions[i.decision || 'unrecorded'] || 0) + 1; });
    const pushbacks = interactions.filter((i) => i.pushback).length;

    return {
      interactions,
      shared,
      patternFlags,
      flagCount: interactionFlagCount + patternFlags.length,
      flaggedInteractions: interactions.filter((i) => i.result.flags.length > 0).length,
      avgLevel, // the combined critique level (kept under its old name, used across the dashboard)
      critique,
      decisions,
      pushbacks
    };
  }

  /* ------------------------------------------------------------------ */
  /* Critique: the written critique plus the replies in the chat          */
  /* ------------------------------------------------------------------ */
  // The three guided questions a student answers when handing in.
  const CRITIQUE_QUESTIONS = [
    { key: 'used', label: 'What did you use AI for?', hint: 'e.g. brainstorming ideas, finding sources, drafting a paragraph, checking grammar.' },
    { key: 'checked', label: 'What did you check, and how?', hint: 'Which facts, figures or sources did you check against something else (readings, a database, Stats NZ…)? What did you find?' },
    { key: 'changed', label: 'What did you change, reject or keep, and why?', hint: 'Which AI output did you rewrite, correct or leave out, and which did you keep as it was? Say why.' }
  ];
  function critiqueText(c) {
    return c ? CRITIQUE_QUESTIONS.map((q) => String(c[q.key] || '').trim()).filter(Boolean).join('\n') : '';
  }
  const fmtLevel = (n) => (Math.round(n * 10) / 10).toString();

  /**
   * One critique level for a student: Gemini's (it reads the written critique and the
   * chat together, and checks one against the other) once AI evaluation has run;
   * until then the rules' level of the written critique averaged with the chat steps.
   */
  function critiqueSummary(student, interactions, settings) {
    const text = critiqueText(student.critique);
    const outputs = interactions.map((i) => i.output).join('\n');
    const written = text ? critiqueLevel({ critique: text, output: outputs, decision: null }, settings) : null;
    const chatLevels = interactions.map((i) => i.result.level.level);
    const chat = chatLevels.length ? chatLevels.reduce((a, b) => a + b, 0) / chatLevels.length : null;
    const g = student.aiEval && student.aiEval.critique;
    const ai = g && Number.isInteger(g.level) && g.level >= 0 && g.level <= 4 ? g : null;
    let level = null, source = null;
    if (ai) { level = ai.level; source = 'ai'; }
    else if (written && chat != null) { level = (written.level + chat) / 2; source = 'rules'; }
    else if (written) { level = written.level; source = 'rules'; }
    else if (chat != null) { level = chat; source = 'rules'; }
    return { text, words: wordCount(text), written, chat, ai, level, source };
  }

  /** Summaries across the whole class, used by the dashboard charts. */
  function evaluateClass(students, settings) {
    const rows = students.map((st) => ({ student: st, eval: evaluateStudent(st, settings) }));
    const decisions = { changed: 0, not_used: 0, unchanged: 0, unrecorded: 0 };
    const levels = [0, 0, 0, 0, 0];
    const byRule = {};
    RULES.forEach((r) => { byRule[r.key] = 0; });
    let interactions = 0;
    rows.forEach(({ eval: e }) => {
      Object.keys(decisions).forEach((k) => { decisions[k] += e.decisions[k] || 0; });
      // One combined critique level per student.
      if (e.avgLevel != null) levels[Math.round(e.avgLevel)]++;
      e.interactions.forEach((i) => {
        interactions++;
        i.result.flags.forEach((f) => { byRule[f.key]++; });
      });
      e.patternFlags.forEach((f) => { byRule[f.key]++; });
    });
    return {
      rows,
      totals: {
        students: students.length,
        interactions,
        flaggedStudents: rows.filter((r) => r.eval.flagCount > 0).length,
        reviewed: students.filter((s) => s.review && s.review.status === 'reviewed').length,
        noEvidence: rows.filter((r) => r.eval.interactions.length === 0).length
      },
      decisions,
      levels,
      byRule
    };
  }

  /* ------------------------------------------------------------------ */
  /* Marking rubric for the work itself (separate from AI-use marking)   */
  /* ------------------------------------------------------------------ */
  // Every criterion uses the same four levels; a level is a share of the criterion's points.
  const MARK_LEVELS = [
    { key: 'excellent', label: 'Excellent', share: 1 },
    { key: 'good', label: 'Good', share: 0.75 },
    { key: 'okay', label: 'Okay', share: 0.5 },
    { key: 'not_good', label: 'Not good', share: 0.25 }
  ];
  const MARK_LEVEL_BY_KEY = {};
  MARK_LEVELS.forEach((l) => { MARK_LEVEL_BY_KEY[l.key] = l; });

  const crit = (name, points, description, excellent, good, okay, notGood) =>
    ({ name, points, description, levels: { excellent, good, okay, not_good: notGood } });

  // Starting points a teacher can pick in the New assignment wizard, also used by the demo data.
  const MARKING_TEMPLATES = {
    essay: { label: 'Essay', criteria: [
      crit('Argument', 30, 'Takes and defends a clear position on the question.',
        'Clear position argued throughout; counter-arguments are weighed and answered.', 'Clear position, mostly well argued; counter-arguments mentioned but not weighed.',
        'A position is there but it is vague or drifts.', 'No clear position; mostly description.'),
      crit('Evidence', 30, 'Uses specific, reliable evidence, especially New Zealand evidence.',
        'Specific, reliable evidence used accurately and cited for every key claim.', 'Relevant evidence for most claims, with small gaps.',
        'Some evidence, often general or uncited.', 'Claims are mostly unsupported.'),
      crit('Structure', 20, 'Paragraphs build the argument in a logical order.',
        'Each paragraph makes one point and the order builds the argument.', 'Mostly logical, with a few weak links.',
        'Hard to follow in places.', 'No clear structure.'),
      crit('Writing and referencing', 20, 'Clear, accurate writing with consistent APA 7 referencing.',
        'Clear, concise and error-free; referencing is correct.', 'Clear, with minor errors.',
        'Errors sometimes get in the way of meaning.', 'Frequent errors; little or no referencing.')
    ] },
    report: { label: 'Report', criteria: [
      crit('Problem and scope', 25, 'Defines the problem, scope and stakeholders.',
        'Problem, scope and stakeholders are precise and justified.', 'Clear problem and scope, with minor gaps.',
        'Problem is stated but the scope is loose.', 'Problem is unclear.'),
      crit('Analysis', 35, 'Analyses the situation using evidence and appropriate methods.',
        'Insightful analysis backed by evidence and sound methods.', 'Sound analysis with some evidence.',
        'Mostly descriptive, little analysis.', 'Little or no analysis.'),
      crit('Recommendations', 25, 'Gives realistic recommendations that follow from the analysis.',
        'Specific, realistic and clearly linked to the analysis.', 'Reasonable and mostly linked to the analysis.',
        'Generic or loosely linked.', 'Missing or unrelated.'),
      crit('Presentation', 15, 'Professional layout, writing and referencing.',
        'Professional and error-free, with correct referencing.', 'Clear with minor errors.',
        'Inconsistent layout or frequent errors.', 'Hard to read.')
    ] },
    presentation: { label: 'Presentation', criteria: [
      crit('Content', 40, 'Covers the problem, solution and evaluation results.',
        'Complete, accurate and focused on results.', 'Covers the main points, with small gaps.',
        'Thin on results or evaluation.', 'Key content missing.'),
      crit('Demo', 30, 'Shows the prototype working on a realistic task.',
        'Smooth demo of a realistic task, explained clearly.', 'Works, with minor hiccups.',
        'Partial or hard to follow.', 'No working demo.'),
      crit('Delivery', 30, 'Clear, well-timed delivery that answers questions well.',
        'Confident, on time, and answers questions well.', 'Clear, mostly on time.',
        'Rushed or over time; weak answers.', 'Hard to follow.')
    ] },
    technical: { label: 'Technical task', criteria: [
      crit('Correctness', 40, 'The model or queries are correct and tested.',
        'Everything is correct and shown to be tested.', 'Mostly correct, with minor errors.',
        'Several errors, little testing.', 'Mostly incorrect.'),
      crit('Design rationale', 30, 'Explains and justifies the design decisions.',
        'Every key decision is explained and justified against the case.', 'Most decisions explained.',
        'Few decisions explained.', 'No rationale.'),
      crit('Clarity', 30, 'Notation, naming and layout are clear and consistent.',
        'Clear, consistent and easy to check.', 'Mostly clear.',
        'Inconsistent in places.', 'Hard to read.')
    ] }
  };

  /** A fresh copy of a template, with ids. */
  function markingFromTemplate(key, idPrefix) {
    const t = MARKING_TEMPLATES[key];
    if (!t) return [];
    return t.criteria.map((c, k) => ({ id: (idPrefix || 'mc-' + key) + '-' + (k + 1), name: c.name, points: c.points, description: c.description, levels: Object.assign({}, c.levels) }));
  }

  // Where each level starts, as a percentage of a criterion's points. Teachers can change these per assignment.
  const MARK_BANDS = { excellent: 85, good: 65, okay: 50 };
  function normaliseBands(b) {
    const x = Object.assign({}, MARK_BANDS, b || {});
    ['excellent', 'good', 'okay'].forEach((k) => { x[k] = Math.max(1, Math.min(100, Math.round(Number(x[k]) || MARK_BANDS[k]))); });
    return x;
  }
  /** A problem with the bands, or '' if they are fine. */
  function bandsProblem(b) {
    const x = b || {};
    const n = (k) => Number(x[k]);
    if (['excellent', 'good', 'okay'].some((k) => !(n(k) > 0 && n(k) <= 100))) return 'Each level must start between 1% and 100%.';
    if (!(n('excellent') > n('good') && n('good') > n('okay'))) return 'Levels must go down in order: Excellent above Good above Okay.';
    return '';
  }
  const half = (v) => Math.round(v * 2) / 2;
  /** Each level's score range for a criterion worth `points`, in half points: { excellent: [min, max], ... }. */
  function levelRanges(points, bands) {
    const b = normaliseBands(bands);
    const p = Math.max(0, Number(points) || 0);
    const lo = (pct) => Math.min(p, Math.ceil(p * pct / 100 * 2) / 2);
    const ex = lo(b.excellent), gd = lo(b.good), ok = lo(b.okay);
    return { excellent: [ex, p], good: [gd, Math.max(gd, ex - 0.5)], okay: [ok, Math.max(ok, gd - 0.5)], not_good: [0, Math.max(0, ok - 0.5)] };
  }
  /** The level a score falls in. */
  function levelForScore(score, points, bands) {
    const p = Math.max(0, Number(points) || 0);
    if (!(p > 0) || score == null || score === '' || isNaN(Number(score))) return null;
    const b = normaliseBands(bands);
    const pct = Number(score) / p * 100;
    return pct >= b.excellent ? 'excellent' : pct >= b.good ? 'good' : pct >= b.okay ? 'okay' : 'not_good';
  }
  /** One criterion's score: the teacher's own number if given, otherwise the top of the chosen level's range. */
  function criterionScore(c, mark, bands) {
    const p = Math.max(0, Number(c.points) || 0);
    if (!mark) return null;
    if (mark.score != null && mark.score !== '' && !isNaN(Number(mark.score))) return Math.max(0, Math.min(p, half(Number(mark.score))));
    if (mark.level && MARK_LEVEL_BY_KEY[mark.level]) return levelRanges(p, bands)[mark.level][1];
    return null;
  }

  /** The content mark: points earned, points possible and how many criteria are marked. */
  function contentScore(criteria, marks, bands) {
    const list = Array.isArray(criteria) ? criteria : [];
    const m = marks || {};
    let earned = 0, possible = 0, marked = 0;
    list.forEach((c) => {
      const pts = Math.max(0, Number(c.points) || 0);
      possible += pts;
      const sc = criterionScore(c, m[c.id], bands);
      if (sc != null) { marked++; earned += sc; }
    });
    earned = Math.round(earned * 10) / 10;
    return { earned, possible, marked, total: list.length, complete: list.length > 0 && marked === list.length, pct: possible ? earned / possible : 0 };
  }

  return {
    words, wordCount, repeatShare, critiqueLevel, isGeneric, CRITIQUE_QUESTIONS, critiqueText, critiqueSummary,
    LEVELS, PRESETS, RULES, RULE_BY_KEY, DEFAULT_VOCAB,
    defaultSettings, applyPreset, normaliseSettings,
    evaluateInteraction, evaluateStudent, evaluateClass, sharedWording, includesAny,
    MARK_LEVELS, MARK_LEVEL_BY_KEY, MARKING_TEMPLATES, markingFromTemplate, contentScore,
    MARK_BANDS, normaliseBands, bandsProblem, levelRanges, levelForScore, criterionScore,
    AI_SENSITIVITY, SENSITIVITY_FOR_PRESET, DEFAULT_AI
  };
});
