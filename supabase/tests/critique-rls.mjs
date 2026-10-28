// npm run test:db — applies every migration to an in-memory Postgres (PGlite) and checks the
// written-critique tables, database functions and row-level security as real signed-in roles.
// Exits with an error on the first failed check.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const dir = process.argv[2] || fileURLToPath(new URL('../migrations', import.meta.url));
const db = new PGlite();
const q = (sql, params) => db.query(sql, params);

// Minimal stand-ins for what Supabase provides.
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  grant usage on schema public to authenticated, anon;
`);
for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
  let sql = readFileSync(dir + '/' + f, 'utf8').replace(/create extension if not exists pgcrypto;/i, '');
  try { await db.exec(sql); } catch (e) { console.error('MIGRATION FAILED', f, e.message); process.exit(1); }
  console.log('applied', f);
}

await db.exec('set role service_role');
assert.equal((await q("select private.word_count('one two three') as words")).rows[0].words, 3);
await db.exec('reset role');
console.log('  ok: trusted server-side clients can execute private trigger helpers');

const T = '10000000-0000-4000-8000-000000000001'; // teacher
const S = '10000000-0000-4000-8000-000000000002'; // the student
const O = '10000000-0000-4000-8000-000000000003'; // another student
const X = '10000000-0000-4000-8000-000000000004'; // teacher of another course
const C = '10000000-0000-4000-8000-000000000005'; // student account to claim
const U = '10000000-0000-4000-8000-000000000006'; // unenrolled student account
for (const [id, email] of [[T, 't@auckland.ac.nz'], [S, 's@aucklanduni.ac.nz'], [O, 'o@aucklanduni.ac.nz'], [X, 'x@auckland.ac.nz']]) {
  await q('insert into auth.users (id, email) values ($1, $2)', [id, email]);
}
for (const [id, email] of [[C, 'claim@aucklanduni.ac.nz'], [U, 'unenrolled@aucklanduni.ac.nz']]) {
  await q(`insert into auth.users (id, email, raw_user_meta_data)
    values ($1, $2, '{"default_role":"student","display_name":"New Student","first_name":"New","initials":"NS"}')`, [id, email]);
}
const course = (await q(`insert into public.courses (code, name, created_by) values ('BUS 201', 'Business', $1) returning id`, [T])).rows[0].id;
await q(`insert into public.courses (code, name, created_by) values ('OTHER', 'Other', $1)`, [X]);
const stu = (await q(`insert into public.students (auth_user_id, first_name, last_name, created_by) values ($1, 'Sofia', 'Reyes', $2) returning id`, [S, T])).rows[0].id;
const stuO = (await q(`insert into public.students (auth_user_id, first_name, last_name, created_by) values ($1, 'Other', 'Student', $2) returning id`, [O, T])).rows[0].id;
await q('insert into public.enrolments (course_id, student_id) values ($1, $2), ($1, $3)', [course, stu, stuO]);
const claimable = (await q(`insert into public.students (first_name, last_name, email, created_by)
  values ('Casey', 'Claim', 'CLAIM@aucklanduni.ac.nz', $1) returning id`, [T])).rows[0].id;
await q('insert into public.enrolments (course_id, student_id) values ($1, $2)', [course, claimable]);
const asg = (await q(`insert into public.assignments (course_id, title, short_name, due_date, settings) values ($1, 'EV essay', 'EV', current_date + 10, '{"preset":"standard","rules":{}}') returning id`, [course])).rows[0].id;
const sub = (await q('insert into public.submissions (assignment_id, student_id) values ($1, $2) returning id', [asg, stu])).rows[0].id;
await q('insert into public.submissions (assignment_id, student_id) values ($1, $2)', [asg, stuO]);

async function as(user, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}
async function fails(promise, code, label) {
  try { await promise; } catch (e) { if (code) assert.equal(e.code, code, label + ': ' + e.message); console.log('  ok (refused):', label, '-', e.code, e.message.slice(0, 90)); return; }
  assert.fail(label + ' should have failed');
}
const ok = (label) => console.log('  ok:', label);
const handIn = (user, critique, log = 'You said:\nwrite me an essay\nChatGPT said:\nHere is an essay.') => as(user, () =>
  q('select * from public.hand_in_submission($1, $2, $3, $4, $5, $6, $7)', [sub, 'My essay text.', log, 'ChatGPT', ...critique]));
const longCritique = ['I used ChatGPT to brainstorm arguments for and against electric cars in New Zealand and to draft one paragraph.',
  'I checked the 85 percent renewable electricity figure against MBIE energy statistics because the AI gave no source.',
  'I rewrote the paragraph in my own words and removed a claim about free chargers because I could not find evidence.'];

console.log('\nStudent account connection');
assert.equal((await as(C, () => q('select count(*)::int n from public.courses'))).rows[0].n, 0);
assert.equal((await as(C, () => q('select public.claim_student_account() student_id'))).rows[0].student_id, claimable);
assert.equal((await q('select auth_user_id from public.students where id = $1', [claimable])).rows[0].auth_user_id, C);
assert.equal((await as(C, () => q('select count(*)::int n from public.courses'))).rows[0].n, 1);
assert.equal((await as(C, () => q('select public.claim_student_account() student_id'))).rows[0].student_id, claimable);
ok('a confirmed student claims the pre-enrolled record with the same email and can read the course');
await fails(as(U, () => q('select public.claim_student_account()')), 'P0002', 'an account without a matching enrolment cannot claim a student record');

console.log('\nCourse creation');
const createdCourse = (await as(T, () => q(
  `insert into public.courses (code, name, semester, badge, created_by)
   values ('TEST 101', 'Test course', 'Semester 2', 'T', $1)
   returning id, code`, [T]
))).rows[0];
assert.equal(createdCourse.code, 'TEST 101');
assert.equal((await as(T, () => q(
  'select count(*)::int n from public.course_memberships where course_id = $1 and user_id = $2',
  [createdCourse.id, T]
))).rows[0].n, 1);
ok('a signed-in teacher can create a course and receives its administrator membership');
await fails(as(S, () => q(
  `insert into public.courses (code, name, created_by) values ('FORGED', 'Forged course', $1)`, [T]
)), '42501', 'a user cannot create a course owned by someone else');

console.log('\nStudent hand-in');
await fails(handIn(S, ['drafting', 'nothing', 'kept it']), '23514', 'a 4-word critique is below the 45-word minimum');
await fails(handIn(S, ['', 'x', 'y']), null, 'an empty answer');
await fails(handIn(O, longCritique), 'P0002', 'another student cannot even see this work');
await fails(handIn(T, longCritique), '42501', 'a teacher cannot hand in for the student');
const r1 = (await handIn(S, longCritique)).rows[0];
assert.equal(r1.stage, 'handed_in'); assert.equal(r1.hand_in_count, 1); assert.equal(r1.revision, 2);
ok('the student hands in with a 55-word critique (stage handed_in, revision 2)');
const crit = (await as(S, () => q('select word_count from public.submission_critiques where submission_id = $1', [sub]))).rows[0];
assert.ok(crit.word_count >= 45); ok('the student can read their own critique (' + crit.word_count + ' words)');
assert.equal((await as(O, () => q('select * from public.submission_critiques where submission_id = $1', [sub]))).rows.length, 0);
ok('another student cannot read it');
assert.equal((await as(X, () => q('select * from public.submission_critiques where submission_id = $1', [sub]))).rows.length, 0);
ok('a teacher of another course cannot read it');
assert.equal((await as(T, () => q('select * from public.submission_critiques where submission_id = $1', [sub]))).rows.length, 1);
ok('the course teacher can read it');
await fails(as(T, () => q(`update public.submission_critiques set checked = 'changed by teacher' where submission_id = $1 returning 1`, [sub]).then((r) => { if (!r.rows.length) { const e = new Error('no rows updated'); e.code = 'RLS'; throw e; } })), 'RLS', 'the teacher cannot rewrite the student\'s critique');

console.log('\nAI evaluation by the teacher');
const payload = {
  model: 'gemini-3.6-flash', detection: { sensitivity: 'balanced' }, summary: 'Used AI for a draft.', textLength: 14,
  splitSteps: [{ step: 1, task: 'Draft essay', tool: 'ChatGPT', prompt: 'write me an essay', output: 'Here is an essay.', reaction: '', decision: 'unchanged' },
               { step: 2, task: 'Shorten', tool: 'ChatGPT', prompt: 'shorter', output: 'Shorter essay.', reaction: 'ok', decision: 'changed' }],
  sentences: [{ text: 'My essay text.', para: 0, source: 'unchanged', steps: [1, 9] }],
  steps: [{ step: 1, task: 'Draft essay', purpose: 'drafting', use: 'unchanged' }],
  critique: { level: 1, writtenDepth: 4, chatDepth: 0, accuracy: 'does_not_match', aiWritten: 'unlikely', aiWrittenReason: 'Matches her style.', summary: 'Claims checks the chat does not show.',
    claims: [{ claim: 'Checked MBIE figures', verdict: 'not_found', steps: [1] }, { claim: 'Rewrote a paragraph', verdict: 'contradicted', steps: [1, 2, 9] }] }
};
await fails(as(S, () => q('select public.save_ai_evaluation($1, $2)', [sub, payload])), '42501', 'the student cannot save an evaluation');
await fails(as(X, () => q('select public.save_ai_evaluation($1, $2)', [sub, payload])), 'P0002', 'a teacher of another course cannot even see it');
await as(T, () => q('select public.save_ai_evaluation($1, $2)', [sub, payload]));
const steps = (await as(T, () => q('select id, step, critique, student_decision from public.interactions where submission_id = $1 order by step', [sub]))).rows;
assert.equal(steps.length, 2); assert.equal(steps[1].critique, 'ok'); assert.equal(steps[0].student_decision, 'unchanged');
ok('the pasted log was split into 2 steps (prompt, output, reaction as reflection)');
const ev = (await as(T, () => q('select sentences, step_info from public.ai_evaluations where submission_id = $1', [sub]))).rows[0];
assert.deepEqual(ev.sentences[0].steps, [steps[0].id], 'step numbers became interaction ids; unknown step 9 dropped');
assert.ok(ev.step_info[steps[0].id]); ok('sentence labels point at real steps');
const links = (await as(T, () => q(`select c.position, c.verdict, array_agg(i.step order by i.step) steps from public.critique_claims c
  left join public.critique_claim_steps cs on cs.claim_id = c.id left join public.interactions i on i.id = cs.interaction_id
  where c.submission_id = $1 group by c.position, c.verdict order by c.position`, [sub]))).rows;
assert.deepEqual(links.map((x) => [x.verdict, x.steps]), [['not_found', [1]], ['contradicted', [1, 2]]]);
ok('claims are linked to the steps they are about: ' + JSON.stringify(links.map((x) => x.steps)));
assert.equal((await as(S, () => q('select * from public.ai_evaluations'))).rows.length, 0);
assert.equal((await as(S, () => q('select * from public.critique_assessments'))).rows.length, 0);
assert.equal((await as(S, () => q('select * from public.critique_claims'))).rows.length, 0);
const ov = (await as(S, () => q('select critique_level, critique_words from public.submission_critique_overview where submission_id = $1', [sub]))).rows[0];
assert.equal(ov.critique_level, null); assert.ok(ov.critique_words > 0);
ok('the student sees their word count in the overview but never their level or Gemini\'s verdicts');
await fails(as(S, () => q(`insert into public.critique_assessments (submission_id, submission_revision, level, written_depth, chat_depth, accuracy, ai_written) values ($1, 2, 4, 4, 4, 'matches', 'unlikely')`, [sub])), '42501', 'the student cannot give themselves a level');
const ovT = (await as(T, () => q('select critique_level, accuracy, assessment_current, steps, unsupported_claims from public.submission_critique_overview where submission_id = $1', [sub]))).rows[0];
assert.deepEqual([ovT.critique_level, ovT.accuracy, ovT.assessment_current, Number(ovT.steps), Number(ovT.unsupported_claims)], [1, 'does_not_match', true, 2, 2]);
ok('the teacher overview shows level 1, does_not_match, 2 steps, 2 unsupported claims');

console.log('\nIntegrity');
const other = (await q('select id from public.submissions where student_id = $1', [stuO])).rows[0].id;
await q(`insert into public.interactions (submission_id, step) values ($1, 1)`, [other]);
const otherStep = (await q('select id from public.interactions where submission_id = $1', [other])).rows[0].id;
const claimId = (await q('select id from public.critique_claims where submission_id = $1 limit 1', [sub])).rows[0].id;
await fails(q('insert into public.critique_claim_steps (claim_id, interaction_id) values ($1, $2)', [claimId, otherStep]), '23514', 'a claim cannot link to another student\'s step');

console.log('\nHanding in again');
const r2 = (await handIn(S, longCritique, 'You said:\na different chat')).rows[0];
assert.equal(r2.revision, 3); assert.equal(r2.ai_split, false);
assert.equal((await q('select count(*)::int n from public.interactions where submission_id = $1', [sub])).rows[0].n, 0);
assert.equal((await q('select count(*)::int n from public.critique_claim_steps')).rows[0].n, 0);
const stale = (await as(T, () => q('select assessment_current from public.submission_critique_overview where submission_id = $1', [sub]))).rows[0];
assert.equal(stale.assessment_current, false);
ok('a new chat replaces the steps (and their claim links); the old check is marked out of date');
await q(`update public.assignments set due_date = current_date - 2 where id = $1`, [asg]);
await fails(handIn(S, longCritique), 'LN001', 'handing in after the due date');
await q(`update public.assignments set due_date = current_date + 10, settings = '{"preset":"strict","rules":{"critiqueShort":{"enabled":true,"minWords":80}}}' where id = $1`, [asg]);
await fails(handIn(S, longCritique), '23514', 'the teacher raised the minimum to 80 words');
await q(`update public.assignments set settings = '{"rules":{"critiqueShort":{"enabled":false,"minWords":80}}}' where id = $1`, [asg]);
await handIn(S, ['a', 'b', 'c']); ok('with the rule turned off, any non-empty critique is accepted');
console.log('\nAll checks passed.');
