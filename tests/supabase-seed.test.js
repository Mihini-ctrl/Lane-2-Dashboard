'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const seed = require('../data/seed.json');
const { buildSeedPlan, stableUuid } = require('../scripts/supabase-seed-plan');

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test('synthetic seed converts to complete relational rows with stable ids', () => {
  const plan = buildSeedPlan(seed, owner);
  assert.equal(plan.courses.length, 3);
  assert.equal(plan.course_memberships.length, 3);
  assert.equal(plan.students.length, 24);
  assert.equal(plan.enrolments.length, 32);
  assert.equal(plan.assignments.length, 3);
  assert.equal(plan.rubric_criteria.length, 11);
  assert.equal(plan.submissions.length, 32);
  assert.equal(plan.interaction_sources.length, 29);
  assert.equal(plan.interactions.length, 131);
  assert.equal(plan.submission_critiques.length, 27);
  assert.equal(plan.submission_reviews.length, 21);
  assert.equal(plan.rubric_marks.length, 331);
  assert.equal(new Set(plan.interactions.map((row) => row.id)).size, 131);
  assert.equal(stableUuid('course', 'c-im399'), stableUuid('course', 'c-im399'));
});

test('every relational reference points to a row in the same seed plan', () => {
  const plan = buildSeedPlan(seed, owner);
  const courses = new Set(plan.courses.map((row) => row.id));
  const students = new Set(plan.students.map((row) => row.id));
  const assignments = new Set(plan.assignments.map((row) => row.id));
  const submissions = new Set(plan.submissions.map((row) => row.id));
  const interactions = new Set(plan.interactions.map((row) => row.id));
  const criteria = new Set(plan.rubric_criteria.map((row) => row.id));
  const reviews = new Set(plan.submission_reviews.map((row) => row.id));
  plan.enrolments.forEach((row) => assert.ok(courses.has(row.course_id) && students.has(row.student_id)));
  plan.assignments.forEach((row) => assert.ok(courses.has(row.course_id)));
  plan.submissions.forEach((row) => assert.ok(assignments.has(row.assignment_id) && students.has(row.student_id)));
  plan.interactions.forEach((row) => assert.ok(submissions.has(row.submission_id)));
  plan.rubric_marks.forEach((row) => assert.ok(reviews.has(row.review_id) && interactions.has(row.interaction_id) && criteria.has(row.criterion_id)));
});

test('grading rubric and historical content marks are retained without conflating the AI rubric', () => {
  const plan = buildSeedPlan(seed, owner);
  assert.equal(plan.assignments.reduce((n, row) => n + row.settings.gradingRubric.length, 0), 12);
  assert.equal(plan.submission_reviews.reduce((n, row) => n + Object.keys(row.content_marks).length, 0), 71);
  assert.equal(plan.rubric_criteria.length, 11);
});
