'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const seed = require('../data/seed.json');
const { normaliseSeed, stableUuid } = require('../data/normalise-seed');

const reviewerId = '11111111-1111-4111-8111-111111111111';

test('stable UUIDs are deterministic and valid version 5 UUIDs', () => {
  assert.equal(stableUuid('course:c-im399'), stableUuid('course:c-im399'));
  assert.notEqual(stableUuid('course:c-im399'), stableUuid('course:c-is222'));
  assert.match(stableUuid('anything'), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('the prototype seed normalises without losing domain records', () => {
  const rows = normaliseSeed(seed, reviewerId);
  const interactionCount = seed.submissions.reduce((count, item) => count + item.interactions.length, 0);
  const sourceCount = seed.submissions.reduce((count, item) => count + item.sources.length, 0);
  const criterionCount = seed.assignments.reduce((count, item) => count + item.rubric.length, 0);

  assert.equal(rows.courses.length, seed.courses.length);
  assert.equal(rows.students.length, seed.students.length);
  assert.equal(rows.assignments.length, seed.assignments.length);
  assert.equal(rows.submissions.length, seed.submissions.length);
  assert.equal(rows.submission_reviews.length, seed.submissions.length);
  assert.equal(rows.interactions.length, interactionCount);
  assert.equal(rows.interaction_sources.length, sourceCount);
  assert.equal(rows.rubric_criteria.length, criterionCount);
});

test('normalised foreign keys resolve to generated parent rows', () => {
  const rows = normaliseSeed(seed, reviewerId);
  const courses = new Set(rows.courses.map((row) => row.id));
  const students = new Set(rows.students.map((row) => row.id));
  const assignments = new Set(rows.assignments.map((row) => row.id));
  const submissions = new Set(rows.submissions.map((row) => row.id));
  const interactions = new Set(rows.interactions.map((row) => row.id));
  const criteria = new Set(rows.rubric_criteria.map((row) => row.id));

  rows.enrolments.forEach((row) => {
    assert.ok(courses.has(row.course_id));
    assert.ok(students.has(row.student_id));
  });
  rows.assignments.forEach((row) => assert.ok(courses.has(row.course_id)));
  rows.submissions.forEach((row) => {
    assert.ok(assignments.has(row.assignment_id));
    assert.ok(students.has(row.student_id));
  });
  rows.interactions.forEach((row) => assert.ok(submissions.has(row.submission_id)));
  rows.rubric_marks.forEach((row) => {
    assert.ok(interactions.has(row.interaction_id));
    assert.ok(criteria.has(row.criterion_id));
  });
});

test('invalid seed input and reviewer ids are rejected', () => {
  assert.throws(() => normaliseSeed({}, reviewerId), /Seed must contain/);
  assert.throws(() => normaliseSeed(seed, 'not-a-uuid'), /reviewerId/);
});

test('written critiques and hand-in content carry over to the relational rows', () => {
  const copy = JSON.parse(JSON.stringify(seed));
  const s = copy.submissions.find((x) => x.stage === 'handed_in');
  s.chatLog = 'You said: hi';
  s.critique = { used: 'Drafting.', checked: 'Checked the figures.', changed: 'Rewrote the intro.', writtenAt: s.handedInAt };
  const rows = normaliseSeed(copy, reviewerId);
  assert.equal(rows.submission_critiques.length, 1);
  assert.equal(rows.submission_critiques[0].submission_id, stableUuid('submission:' + s.id));
  assert.equal(rows.submission_critiques[0].used_for, 'Drafting.');
  assert.equal(rows.submissions.find((x) => x.legacy_id === s.id).chat_log, 'You said: hi');
});
