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
  'interactions', 'submission_reviews', 'rubric_marks', 'rubric_scores', 'audit_events',
  'submission_critiques', 'ai_evaluations', 'critique_assessments', 'critique_claims', 'critique_claim_steps'
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

test('written critiques: only the student writes them, and the word minimum is enforced in the database', () => {
  assert.match(sql, /create policy critiques_insert_self on public\.submission_critiques[\s\S]*?private\.is_submission_student\(submission_id\)/i);
  assert.match(sql, /create policy critiques_update_self on public\.submission_critiques[\s\S]*?private\.is_submission_student\(submission_id\)/i);
  assert.match(sql, /before insert or update on public\.submission_critiques[\s\S]*?private\.check_critique\(\)/i);
  assert.match(sql, /'critiqueShort'/);
});

test('critique levels and Gemini verdicts are staff-only, and claims link to steps', () => {
  ['ai_evaluations', 'critique_assessments', 'critique_claims'].forEach((table) => {
    const policies = sql.match(new RegExp(`create policy \\w+ on public\\.${table}[\\s\\S]*?;`, 'gi')) || [];
    assert.ok(policies.length, table + ' has a policy');
    policies.forEach((p) => assert.doesNotMatch(p, /is_submission_student|is_own_student/, table + ' must not be readable by students'));
  });
  assert.match(sql, /create table public\.critique_claim_steps[\s\S]*?references public\.interactions\(id\)/i);
  assert.match(sql, /function public\.hand_in_submission[\s\S]*?security invoker/i);
  assert.match(sql, /function public\.save_ai_evaluation[\s\S]*?security invoker/i);
});

test('the students/enrolments policy loop is broken for student queries', () => {
  assert.match(sql, /drop policy if exists enrolments_select_course_or_self[\s\S]*?private\.is_own_student\(student_id\)/i);
});

test('stored submission files can be deleted only by staff from their course', () => {
  assert.match(sql, /function private\.submission_file_staff_access\(object_name text\)[\s\S]*?private\.is_course_staff\(private\.course_for_submission\(target\)\)/i);
  assert.match(sql, /create policy submission_files_delete_staff on storage\.objects for delete to authenticated[\s\S]*?private\.submission_file_staff_access\(name\)/i);
});
