'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const migrations = path.join(__dirname, '..', 'supabase', 'migrations');
const files = fs.readdirSync(migrations).filter((name) => name.endsWith('.sql')).sort();
const sql = files.map((name) => fs.readFileSync(path.join(migrations, name), 'utf8')).join('\n');
const supabaseConfig = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'config.toml'), 'utf8');

const tables = [
  'profiles', 'courses', 'course_memberships', 'students', 'enrolments',
  'assignments', 'rubric_criteria', 'submissions', 'interaction_sources',
  'interactions', 'submission_reviews', 'rubric_marks', 'rubric_scores', 'audit_events'
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

test('marking supports numeric rubric scores and clarification outcomes', () => {
  assert.match(sql, /rubric_criteria[\s\S]*max_score/i);
  assert.match(sql, /decision in \('approve', 'flag', 'clarify'\)/i);
  assert.match(sql, /unique\s*\(review_id, criterion_id\)/i);
});

test('existing Supabase Auth users are backfilled into profiles', () => {
  assert.match(sql, /insert into public\.profiles[\s\S]*from auth\.users/i);
  assert.match(sql, /on conflict \(id\) do nothing/i);
  assert.match(sql, /notify pgrst, 'reload schema'/i);
});

test('new Auth users require a University of Auckland email domain', () => {
  assert.match(sql, /before insert or update of email on auth\.users/i);
  assert.match(sql, /email_domain not in \('aucklanduni\.ac\.nz', 'auckland\.ac\.nz'\)/i);
});

test('Supabase Auth requires confirmation and permits local confirmation redirects', () => {
  assert.match(supabaseConfig, /\[auth\.email\][\s\S]*enable_confirmations = true/i);
  assert.match(supabaseConfig, /site_url = "http:\/\/localhost:3000"/i);
  assert.match(supabaseConfig, /additional_redirect_urls = \["http:\/\/localhost:3000", "http:\/\/127\.0\.0\.1:3000"\]/i);
});
