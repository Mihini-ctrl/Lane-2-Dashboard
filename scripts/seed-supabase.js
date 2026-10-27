'use strict';

require('dotenv').config();
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createClient } = require('@supabase/supabase-js');
const { buildSeedPlan } = require('./supabase-seed-plan');

const APPLY = process.argv.includes('--apply');
const emailArg = process.argv.find((value) => value.startsWith('--owner-email='));
const ownerEmail = (emailArg ? emailArg.slice('--owner-email='.length) : process.env.SUPABASE_SEED_OWNER_EMAIL || '').trim().toLowerCase();
const seed = JSON.parse(readFileSync(resolve(__dirname, '../data/seed.json'), 'utf8'));
const counts = {
  courses: seed.courses.length,
  students: seed.students.length,
  enrolments: seed.courses.reduce((total, course) => total + (course.roster || []).length, 0),
  assignments: seed.assignments.length,
  submissions: seed.submissions.length,
  interactions: seed.submissions.reduce((total, row) => total + (row.interactions || []).length, 0)
};

function usage() {
  console.log('Synthetic Supabase seed:', counts);
  console.log('Dry run only. To import, set SUPABASE_SECRET_KEY and run:');
  console.log('  npm run supabase:seed -- --owner-email=you@auckland.ac.nz --apply');
}

async function upsertInChunks(client, table, rows, onConflict) {
  if (!rows.length) return;
  for (let start = 0; start < rows.length; start += 100) {
    const chunk = rows.slice(start, start + 100);
    const { error } = await client.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`${table}: ${error.code || 'ERROR'} ${error.message}`);
  }
  console.log(`  ${table}: ${rows.length}`);
}

async function main() {
  if (!APPLY) return usage();
  const url = process.env.SUPABASE_URL?.trim();
  const secret = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url) throw new Error('SUPABASE_URL is required in .env.');
  if (!secret) throw new Error('SUPABASE_SECRET_KEY is required in .env for the one-time server-side import.');
  if (!ownerEmail) throw new Error('Pass --owner-email=your@auckland.ac.nz or set SUPABASE_SEED_OWNER_EMAIL.');

  const client = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: owner, error: ownerError } = await client.from('profiles')
    .select('id, email').ilike('email', ownerEmail).maybeSingle();
  if (ownerError) throw new Error(`Could not find the owner profile: ${ownerError.message}`);
  if (!owner) throw new Error(`No confirmed Lane2 profile exists for ${ownerEmail}. Sign up and confirm it first.`);

  const plan = buildSeedPlan(seed, owner.id);
  console.log(`Importing synthetic data for ${owner.email}…`);
  await upsertInChunks(client, 'courses', plan.courses, 'legacy_id');
  await upsertInChunks(client, 'course_memberships', plan.course_memberships, 'course_id,user_id');
  await upsertInChunks(client, 'students', plan.students, 'legacy_id');
  await upsertInChunks(client, 'enrolments', plan.enrolments, 'course_id,student_id');
  await upsertInChunks(client, 'assignments', plan.assignments, 'legacy_id');
  await upsertInChunks(client, 'rubric_criteria', plan.rubric_criteria, 'assignment_id,legacy_id');
  await upsertInChunks(client, 'submissions', plan.submissions, 'legacy_id');
  await upsertInChunks(client, 'interaction_sources', plan.interaction_sources, 'id');
  await upsertInChunks(client, 'interactions', plan.interactions, 'legacy_id');
  await upsertInChunks(client, 'submission_critiques', plan.submission_critiques, 'submission_id');
  await upsertInChunks(client, 'submission_reviews', plan.submission_reviews, 'submission_id,reviewer_id');
  await upsertInChunks(client, 'rubric_marks', plan.rubric_marks, 'review_id,interaction_id,criterion_id');
  console.log('Synthetic Supabase import complete. Reload Lane2 to see the three demo courses.');
}

main().catch((error) => {
  console.error(`Synthetic import failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
