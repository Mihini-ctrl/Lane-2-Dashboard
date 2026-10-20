'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const requiredTables = [
  'profiles',
  'courses',
  'course_memberships',
  'students',
  'enrolments',
  'assignments',
  'rubric_criteria',
  'submissions',
  'interaction_sources',
  'interactions',
  'submission_reviews',
  'rubric_marks',
  'rubric_scores',
  'audit_events'
];

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set in .env.');
  }

  const fetchWithTimeout = (input, init = {}) => {
    const timeoutSignal = AbortSignal.timeout(8000);
    const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
    return fetch(input, { ...init, signal });
  };
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: fetchWithTimeout }
  });

  const checks = await Promise.all(requiredTables.map(async (table) => {
    // A normal select validates table discovery. With RLS, an anonymous user
    // safely receives no rows when the table exists.
    const { error } = await client.from(table).select('*').limit(1);
    if (!error || error.code === '42501') return null;
    return { table, code: error.code || 'UNKNOWN', message: error.message };
  }));
  const unavailable = checks.filter(Boolean);

  if (unavailable.length) {
    console.error('Supabase schema check failed:');
    unavailable.forEach(({ table, code, message }) => console.error(`- ${table}: ${code} ${message}`));
    process.exitCode = 1;
    return;
  }

  console.log(`Supabase schema is ready (${requiredTables.length} tables found; anonymous access is protected).`);
}

main().catch((error) => {
  console.error(`Supabase check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
