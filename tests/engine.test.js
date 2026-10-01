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
