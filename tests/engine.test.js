/*
 * Automated checks:  npm test   (or: node --test tests/)
 * Uses Node's built-in test runner, so nothing needs installing.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../public/js/engine.js');
const CASES = require('../public/js/testcases.js');
const seed = require('../data/seed.json');

const standard = Engine.defaultSettings();
const subsFor = (aid) => seed.submissions.filter((s) => s.assignmentId === aid && s.stage !== 'not_started');

test('every Test Lab case passes under the Standard preset', () => {
  CASES.forEach((c) => {
    const r = Engine.evaluateInteraction(c, standard);
    assert.equal(r.level.level, c.expectedLevel, c.id + ' level');
    assert.deepEqual(r.flags.map((f) => f.key).sort(), c.expectedFlags.slice().sort(), c.id + ' flags');
  });
});

test('T5: a short but specific correction is not flagged as short', () => {
  const t5 = CASES.find((c) => c.id === 'T5');
  const r = Engine.evaluateInteraction(t5, standard);
  assert.ok(!r.flags.some((f) => f.key === 'shortCritique'));
});

test('turning the exemption off brings the short-critique flag back', () => {
  const s = Engine.defaultSettings();
  s.rules.shortCritique.exemptSpecific = false;
  const t5 = CASES.find((c) => c.id === 'T5');
  assert.ok(Engine.evaluateInteraction(t5, s).flags.some((f) => f.key === 'shortCritique'));
});

test('stricter presets never flag fewer students than lenient ones, in every assignment', () => {
  seed.assignments.forEach((a) => {
    const count = (p) => Engine.evaluateClass(subsFor(a.id), Engine.applyPreset(standard, p)).totals.flaggedStudents;
    assert.ok(count('lenient') <= count('standard'), a.id);
    assert.ok(count('standard') <= count('strict'), a.id);
  });
});

test('demo data: several courses, each assignment belongs to a course with a roster', () => {
  assert.ok(seed.courses.length >= 2);
  seed.assignments.forEach((a) => {
    const c = seed.courses.find((x) => x.id === a.courseId);
    assert.ok(c, a.id + ' has a course');
    assert.equal(seed.submissions.filter((s) => s.assignmentId === a.id).length, c.roster.length, a.id + ' has one submission per student');
    assert.ok(a.rubric.length > 0, a.id + ' has a rubric');
  });
  const perStudent = {};
  seed.courses.forEach((c) => c.roster.forEach((r) => { perStudent[r.studentId] = (perStudent[r.studentId] || 0) + 1; }));
  assert.ok(Object.values(perStudent).some((n) => n > 1), 'some students take more than one course');
});

test('demo data: AI logs are attached before hand-in', () => {
  seed.submissions.forEach((s) => {
    if (s.stage === 'not_started') { assert.equal(s.logsAttachedAt, null); assert.equal(s.handedInAt, null); return; }
    assert.ok(s.logsAttachedAt, s.id + ' has a log time');
    if (s.stage === 'handed_in') assert.ok(new Date(s.logsAttachedAt) < new Date(s.handedInAt), s.id + ' log before hand-in');
    s.interactions.forEach((i) => assert.ok(new Date(i.timestamp) <= new Date(s.logsAttachedAt), i.id + ' happened before the log was attached'));
  });
  ['handed_in', 'logs_attached', 'not_started'].forEach((stage) => assert.ok(seed.submissions.some((s) => s.stage === stage), 'some submissions are ' + stage));
});

test('demo data: the patterns still separate under each assignment\'s rules', () => {
  seed.assignments.forEach((a) => {
    const c = Engine.evaluateClass(subsFor(a.id), a.settings);
    c.rows.filter((r) => r.student.pattern === 'passive' && r.student.interactions.length >= 3).forEach((r) => assert.ok(r.eval.flagCount >= 3, r.student.id + ' should be flagged'));
    if (a.settings.preset !== 'strict') c.rows.filter((r) => r.student.pattern === 'verifier').forEach((r) => assert.equal(r.eval.flagCount, 0, r.student.id + ' should be clear'));
    c.rows.filter((r) => r.student.pattern === 'none').forEach((r) => assert.ok(r.eval.patternFlags.some((f) => f.key === 'noEvidence')));
  });
});

test('shared wording finds copied text and ignores original text', () => {
  const out = 'Entry-level workers will need strong critical thinking skills and clear communication.';
  const copied = Engine.sharedWording('Entry-level workers will need strong critical thinking skills, I think.', [out]);
  const own = Engine.sharedWording('My manager says juniors now spend more time checking reports.', [out]);
  assert.ok(copied.coverage > 0.6);
  assert.equal(own.coverage, 0);
});

test('grading rubric: any score counts, levels follow the bands', () => {
  const crit = [{ id: 'a', points: 30 }, { id: 'b', points: 20 }, { id: 'c', points: 10 }];
  const none = Engine.contentScore(crit, {});
  assert.deepEqual([none.earned, none.possible, none.marked, none.complete], [0, 60, 0, false]);
  // In-between scores are kept as given (to the half point) and clamped to the criterion's points.
  const some = Engine.contentScore(crit, { a: { score: 27 }, b: { score: 25 }, x: { score: 5 } });
  assert.deepEqual([some.earned, some.marked, some.complete], [47, 2, false], 'over-max is clamped and unknown criteria are ignored');
  // A level with no typed score gives the top of that level's range.
  const r = Engine.levelRanges(30);
  assert.deepEqual(r, { excellent: [25.5, 30], good: [19.5, 25], okay: [15, 19], not_good: [0, 14.5] });
  assert.equal(Engine.criterionScore({ points: 30 }, { level: 'good' }), 25);
  assert.equal(Engine.levelForScore(27, 30), 'excellent');
  assert.equal(Engine.levelForScore(25, 30), 'good');
  assert.equal(Engine.levelForScore(14, 30), 'not_good');
  // Teacher-set bands move the ranges.
  const b = { excellent: 90, good: 70, okay: 40 };
  assert.equal(Engine.levelForScore(26, 30, b), 'good');
  assert.deepEqual(Engine.levelRanges(30, b).okay, [12, 20.5]);
  assert.equal(Engine.bandsProblem({ excellent: 60, good: 70, okay: 40 }) !== '', true, 'bands must go down in order');
  assert.equal(Engine.bandsProblem(Engine.MARK_BANDS), '');
  assert.equal(Engine.contentScore(crit, { a: { level: null, comment: 'hi' } }).marked, 0, 'a comment alone is not a mark');
});

test('AI detection sensitivity maps onto the flag-rule presets', () => {
  Object.keys(Engine.AI_SENSITIVITY).forEach((k) => assert.equal(Engine.SENSITIVITY_FOR_PRESET[Engine.AI_SENSITIVITY[k].preset], k));
  assert.deepEqual(Engine.normaliseSettings({ preset: 'lenient', rules: {} }).ai, { sensitivity: 'cautious', unlogged: true, brainstorm: true }, 'older settings start from their preset');
  assert.equal(Engine.defaultSettings().ai.sensitivity, 'balanced');
});

test('every demo assignment has a marking rubric with all four level descriptions', () => {
  seed.assignments.forEach((a) => {
    assert.ok(a.marking.length >= 3, a.id + ' has marking criteria');
    a.marking.forEach((c) => {
      assert.ok(c.id && c.name && c.points > 0, a.id + ' criterion is complete');
      Engine.MARK_LEVELS.forEach((l) => assert.ok(c.levels[l.key], a.id + ' ' + c.name + ' describes ' + l.label));
    });
  });
});
