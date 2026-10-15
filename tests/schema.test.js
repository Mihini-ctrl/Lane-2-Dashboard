'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const migrations = path.join(__dirname, '..', 'supabase', 'migrations');
const files = fs.readdirSync(migrations).filter((name) => name.endsWith('.sql')).sort();
const sql = files.map((name) => fs.readFileSync(path.join(migrations, name), 'utf8')).join('\n');

const tables = [
  'profiles', 'courses', 'course_memberships', 'students', 'enrolments',
  'assignments', 'rubric_criteria', 'submissions', 'interaction_sources',
  'interactions', 'submission_reviews', 'rubric_marks', 'audit_events'
];

test('the initial backend migration defines every core table', () => {
  assert.ok(files.length > 0, 'at least one SQL migration is required');
  tables.forEach((table) => {
    assert.match(sql, new RegExp(`create table public\\.${table}\\s*\\(`, 'i'), `${table} table is missing`);
  });
});

test('every browser-accessible table enables RLS', () => {
  tables.forEach((table) => {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'), `${table} does not enable RLS`);
  });
});

test('the migration never grants access to the anonymous role', () => {
  assert.doesNotMatch(sql, /grant\s+.+\s+to\s+anon\b/i);
  assert.match(sql, /revoke all on all tables in schema public from anon, authenticated/i);
});

test('reviews are uniquely owned per marker and submission', () => {
  assert.match(sql, /unique\s*\(submission_id, reviewer_id\)/i);
  assert.match(sql, /reviewer_id = \(select auth\.uid\(\)\)/i);
});
