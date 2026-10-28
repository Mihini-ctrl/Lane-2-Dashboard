'use strict';

require('dotenv').config();
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createClient } = require('@supabase/supabase-js');
const { buildSeedPlan } = require('./supabase-seed-plan');

const APPLY = process.argv.includes('--apply');
const PASSWORD = 'lane2demo';
const TEACHER = {
  email: 'minakh+lane2-demo@auckland.ac.nz',
  metadata: { display_name: 'Mina Khoshmehr', first_name: 'Mina', initials: 'MK', default_role: 'course_admin' }
};
const STUDENT = {
  email: 'srey914+lane2-demo@aucklanduni.ac.nz',
  metadata: { display_name: 'Sofia Reyes', first_name: 'Sofia', initials: 'SR', default_role: 'student' }
};
const COURSE_LEGACY_IDS = ['c-im399', 'c-bus201', 'c-is222'];
const STUDENT_LEGACY_ID = 'p23';

async function findUserByEmail(client, email) {
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error(`Could not list Auth users: ${error.message}`);
    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < 100) return null;
  }
  throw new Error('Could not find the demo account within the first 10,000 Auth users.');
}

async function ensureUser(client, account) {
  let user = await findUserByEmail(client, account.email);
  if (user) {
    const { data, error } = await client.auth.admin.updateUserById(user.id, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: account.metadata
    });
    if (error) throw new Error(`Could not update ${account.email}: ${error.message}`);
    user = data.user;
  } else {
    const { data, error } = await client.auth.admin.createUser({
      email: account.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: account.metadata
    });
    if (error) throw new Error(`Could not create ${account.email}: ${error.message}`);
    user = data.user;
  }

  const { error: profileError } = await client.from('profiles').update({
    display_name: account.metadata.display_name,
    first_name: account.metadata.first_name,
    initials: account.metadata.initials,
    email: account.email,
    default_role: account.metadata.default_role
  }).eq('id', user.id);
  if (profileError) throw new Error(`Could not update the profile for ${account.email}: ${profileError.message}`);
  return user;
}

async function upsert(client, table, rows, onConflict) {
  if (!rows.length) return;
  const { error } = await client.from(table).upsert(rows, { onConflict });
  if (error) throw new Error(`${table}: ${error.code || 'ERROR'} ${error.message}`);
}

async function main() {
  console.log('Supabase demo accounts:');
  console.log(`  Teacher: ${TEACHER.email} / ${PASSWORD}`);
  console.log(`  Student: ${STUDENT.email} / ${PASSWORD}`);
  if (!APPLY) {
    console.log('Dry run only. Add --apply to create/link the accounts.');
    return;
  }

  const url = process.env.SUPABASE_URL?.trim();
  const secret = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url) throw new Error('SUPABASE_URL is required in .env.');
  if (!secret) throw new Error('SUPABASE_SECRET_KEY is required in .env for this one-time server-side setup.');

  const client = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: courses, error: courseError } = await client.from('courses')
    .select('id, legacy_id, code').in('legacy_id', COURSE_LEGACY_IDS);
  if (courseError) throw new Error(`Could not read synthetic courses: ${courseError.message}`);
  if (courses.length !== COURSE_LEGACY_IDS.length) {
    throw new Error(`Expected ${COURSE_LEGACY_IDS.length} synthetic courses but found ${courses.length}. Run the synthetic seed import first.`);
  }
  const { data: sofia, error: studentError } = await client.from('students')
    .select('id, legacy_id, auth_user_id').eq('legacy_id', STUDENT_LEGACY_ID).maybeSingle();
  if (studentError) throw new Error(`Could not read Sofia's synthetic student record: ${studentError.message}`);
  if (!sofia) throw new Error('Synthetic student p23 (Sofia Reyes) was not found. Run the synthetic seed import first.');

  const teacher = await ensureUser(client, TEACHER);
  const student = await ensureUser(client, STUDENT);

  const { data: otherLink, error: linkReadError } = await client.from('students')
    .select('id, legacy_id').eq('auth_user_id', student.id).neq('id', sofia.id).maybeSingle();
  if (linkReadError) throw new Error(`Could not validate the student identity link: ${linkReadError.message}`);
  if (otherLink) throw new Error(`The demo student Auth user is already linked to ${otherLink.legacy_id || otherLink.id}; no records were relinked.`);

  await upsert(client, 'course_memberships', courses.map((course) => ({
    course_id: course.id, user_id: teacher.id, role: 'course_admin'
  })), 'course_id,user_id');

  const { error: studentLinkError } = await client.from('students').update({
    auth_user_id: student.id,
    email: STUDENT.email
  }).eq('id', sofia.id);
  if (studentLinkError) throw new Error(`Could not link Sofia to the demo student account: ${studentLinkError.message}`);

  // Give the demo teacher its own copy of the synthetic review state. The
  // existing owner's reviews are left untouched, and unrelated data is never
  // read or changed.
  const seed = JSON.parse(readFileSync(resolve(__dirname, '../data/seed.json'), 'utf8'));
  const plan = buildSeedPlan(seed, teacher.id);
  await upsert(client, 'submission_reviews', plan.submission_reviews, 'submission_id,reviewer_id');
  for (let start = 0; start < plan.rubric_marks.length; start += 100) {
    await upsert(client, 'rubric_marks', plan.rubric_marks.slice(start, start + 100), 'review_id,interaction_id,criterion_id');
  }

  console.log(`Linked teacher to ${courses.length} synthetic courses and ${plan.submission_reviews.length} reviews.`);
  console.log(`Linked student to ${sofia.legacy_id} (Sofia Reyes).`);
  console.log('Supabase demo accounts are ready.');
}

main().catch((error) => {
  console.error(`Demo account setup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
