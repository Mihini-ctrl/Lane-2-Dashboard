# Backend implementation

Lane2 is moving from a single JSON-file state to Supabase-managed PostgreSQL.
The existing `node server.js` prototype remains available while screens are
migrated incrementally.

## What has been implemented

- A normalised relational schema in `supabase/migrations/`
- A deterministic converter from `data/seed.json` to relational rows
- Supabase Auth profiles rather than application-managed passwords
- Course-level roles and database-enforced Row Level Security (RLS)
- Separate submissions, AI interactions, per-marker reviews, process marks and numeric rubric scores
- Optimistic-concurrency fields (`revision` and `updated_at`)
- An audit-event table for privileged activity
- A TypeScript/Fastify API in `backend/` with authenticated course,
  assignment, enrolment, student, submission and per-marker review routes

## Local setup

1. Run `npm install`; the project-scoped Supabase CLI is included as a dev dependency.
2. Copy `.env.example` to `.env` and fill in a development project's values.
3. Authenticate with `npx supabase login`.
4. Link the repository with `npx supabase link --project-ref <project-ref>`.
5. Preview with `npx supabase db push --dry-run`, then apply with `npx supabase db push`.
6. Confirm that PostgREST can see all required tables with `npm run supabase:check`.
7. Build and run the API:

   ```bash
   npm run backend:build
   npm run backend:start
   ```

For development, `npm run backend:dev` watches TypeScript files and restarts
the API. It defaults to `http://127.0.0.1:3100` so the prototype can continue
running on port 3000.

## Importing the synthetic demonstration data

`data/seed.json` remains the source of the synthetic demonstration records.
To make the same three courses available through the Supabase backend:

1. Sign up and confirm the teaching account that should own the demo courses.
2. Apply all migrations and run `npm run supabase:check`.
3. Copy the project's server-side secret key from the Supabase API settings to
   `SUPABASE_SECRET_KEY` in the local `.env`. Never put this key in `public/`,
   Render's frontend service, screenshots or Git.
4. Preview the fixed record counts with `npm run supabase:seed`.
5. Apply the import:

   ```bash
   npm run supabase:seed -- --owner-email=your.name@auckland.ac.nz --apply
   ```

The importer converts the nested seed into courses, memberships, students,
enrolments, assignments, AI-use criteria, submissions, sources, interactions,
written critiques, marker reviews and per-step marks. Grading rubrics and the
historical content marks are preserved in assignment settings and review
columns. Stable UUIDs make repeat runs update the synthetic records instead of
duplicating them; unrelated records are not deleted or modified.

This command is intentionally not exposed as an application endpoint. The
secret key bypasses RLS and is used only for the one-time development import.

## API implemented so far

All routes except health require `Authorization: Bearer <Supabase access token>`.
`@supabase/server` verifies that token against the project's JWKS and issuer.
Database calls retain the verified token, so PostgreSQL RLS evaluates the
actual caller rather than a privileged service account.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/health` | Service readiness |
| `POST` | `/api/v1/auth/login` | Exchange email/password for a Supabase session |
| `POST` | `/api/v1/auth/signup` | Create a teaching-staff account |
| `POST` | `/api/v1/auth/refresh` | Refresh an expired access token |
| `GET` | `/api/v1/me` | Current authenticated identity |
| `GET` | `/api/v1/bootstrap` | Load the teacher workspace for the existing UI |
| `GET` | `/api/v1/courses` | Courses available to the caller |
| `POST` | `/api/v1/courses` | Create a course and make the caller its administrator |
| `PATCH / DELETE` | `/api/v1/courses/:id` | Edit or delete a course |
| `GET` | `/api/v1/courses/:id/assignments` | Assignments in one course |
| `POST` | `/api/v1/assignments` | Create an assignment, rubric and roster submissions |
| `PUT / DELETE` | `/api/v1/assignments/:id` | Edit rules/rubric/details or delete an assignment |
| `POST` | `/api/v1/courses/:id/enrolments` | Create or enrol a student and seed submissions |
| `PATCH / DELETE` | `/api/v1/courses/:id/enrolments/:studentId` | Change a group or unenrol a student |
| `PATCH / DELETE` | `/api/v1/students/:id` | Edit or delete a student |
| `GET` | `/api/v1/assignments/:id/submissions` | Submission queue |
| `GET` | `/api/v1/submissions/:id` | Full review record |
| `PUT` | `/api/v1/submissions/:id/review` | Create or update the caller's review |
| `PUT` | `/api/v1/submissions/:id/hand-in` | Student hands in the work's text, pasted AI chat and written critique |
| `PUT` | `/api/v1/submissions/:id/ai-evaluation` | Staff save an AI evaluation and Gemini's check of the critique |

Review writes support overall outcomes (`approve`, `flag`, or `clarify`),
numeric criterion scores, feedback, and `expectedUpdatedAt` for optimistic concurrency. A stale
editor receives HTTP 409 rather than silently replacing a newer review.

## Written critique and AI evaluation

Migration `202610260001_add_written_critique.sql` stores the student's critique
of their AI use and links it to the steps of their chat:

```
students ─ submissions ─┬─ interactions (steps: prompt, output, reflection)
                        │        ▲
                        ├─ submission_critiques (three answers; written by the student)
                        ├─ ai_evaluations (sentence labels; staff only)
                        └─ critique_assessments (level, accuracy, AI-written; staff only)
                                 └─ critique_claims ─ critique_claim_steps ─┘
```

- `submissions` gains `chat_log`, `ai_tool`, `ai_split` and `hand_in_count`.
- `submission_critiques`: one row per submission. Only the submission's student
  can insert or update it; course staff can read it. A trigger counts words the
  same way as `public/js/engine.js` and rejects a critique below the
  assignment's *Short written critique* minimum (from `settings.rules`, or the
  preset's 30 / 45 / 70 words).
- `ai_evaluations`, `critique_assessments`, `critique_claims` and
  `critique_claim_steps` are **staff-only**: students can never read their
  critique level or Gemini's verdicts, nor write them. Each claim links to the
  steps it is about; a trigger stops a claim linking to another submission's step.
  Results are tied to the submission's `revision`, so a new hand-in marks them out of date.
- `public.hand_in_submission(...)` and `public.save_ai_evaluation(id, payload)`
  run each write as one transaction with `security invoker`, so RLS still
  applies to the caller. Hand-in checks the caller is the student, the due date
  (end of the day in New Zealand) and the critique minimum; a new chat replaces
  the earlier steps. Saving an evaluation splits a pasted log into steps the
  first time and maps step numbers to step ids.
- `public.submission_critique_overview` (a `security_invoker` view) gives one
  row per submission for reporting: critique words, level, accuracy, steps and
  unsupported claims.
- The migration also fixes a policy loop between `students` and `enrolments`
  that made every query by a signed-in student fail with "infinite recursion
  detected in policy".

`npm run test:db` applies every migration to an in-memory Postgres (PGlite)
and checks these rules as real signed-in roles: student, another student, the
course teacher and a teacher of another course.

In Supabase mode the teacher's AI evaluation still calls Gemini through
`node server.js` (`/api/ai/evaluate`) and then saves the result through the
API; the student hand-in form calls the hand-in route. Student sign-in and
file storage are not part of the Supabase backend yet, so handed-in files are
represented only by their extracted text.

## Connecting the current frontend

The frontend server has a same-origin reverse proxy. Start both processes with:

```bash
npm run dev:supabase
```

Opening <http://localhost:3000> now enables production-backend mode. Login,
sign-up, workspace reads, submission reviews, rubric marks and rubric scores use the Fastify
API. The browser receives Supabase access and refresh tokens from the auth
routes, but it never receives `SUPABASE_SECRET_KEY`.

Without `BACKEND_URL`, the frontend deliberately continues in JSON prototype
mode. Opening `public/index.html` directly continues in browser-only mode.

## Render deployment

`render.yaml` defines the public `trace-lane2` service and a separate
`trace-lane2-backend` service. The public service receives the backend's private
`hostport` through a Blueprint service reference and proxies `/api/v1/*` to it.
This keeps API traffic same-origin in the browser and avoids CORS configuration.

After syncing the Blueprint, manually set these values on
`trace-lane2-backend` because an existing Blueprint ignores newly introduced
`sync: false` values:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_JWKS_URL`

The Blueprint sets `BACKEND_HOST=0.0.0.0` and the confirmation redirect to
`https://trace-lane2.onrender.com`. Add that exact address as the Supabase Auth
Site URL and an allowed Redirect URL. The deployed API intentionally does not
need `SUPABASE_SECRET_KEY`: it forwards each caller's access token so RLS makes
the authorization decision.

Successful deployment checks:

```text
GET /js/runtime-config.js -> backendEnabled: true
GET /api/v1/health        -> 200 {"ok":true,"service":"lane2-backend"}
```

Writes are persisted immediately in Supabase and the initiating screen updates
after the API response. The app does not yet subscribe to Supabase Realtime, so
changes made in a second browser appear after reloading rather than being pushed
live to every open browser.

Course, assignment, enrolment, student, rule and rubric administration all use
row-level API mutations in production-backend mode. New assignments seed one
empty submission per enrolled student; new enrolments do the same for every
existing assignment in the course.

If Auth works but login ends with `SCHEMA_NOT_READY`, the user account exists
but the project's SQL migrations have not been applied. Run every file in
`supabase/migrations/` in filename order (or use `supabase db push`), then run
`npm run supabase:check`. The profile backfill migration makes accounts created
before schema installation usable without signing up again.

New sign-ups and application sessions require an exact `@aucklanduni.ac.nz`
student address or `@auckland.ac.nz` staff address. Supabase email confirmation
must remain enabled. A database trigger also rejects direct Auth sign-ups using
personal or lookalike domains.

For confirmation delivery beyond Supabase project-team email addresses,
configure custom SMTP in the Supabase dashboard. The built-in sender is only
appropriate for limited development testing.

## First end-to-end test

1. Run `npm run supabase:check`; it must report that all 19 tables are ready.
2. Run `npm run dev:supabase` and open <http://localhost:3000>.
3. Sign up with an eligible University of Auckland email address, follow the confirmation link,
   and log in. An account created before the migrations also works because the
   backfill migration creates its missing profile.
4. Create a course, enrol a test student, and create an assignment with rubric
   criteria. The database creates an empty submission for each enrolment.
5. Save a review, log out, reload the browser, and log in again. The course,
   assignment, student, review, scores, and feedback should all reload from
   PostgreSQL rather than browser demo state.

Do not use production or real student data during development. The secret key
must remain server-side and must never be added to `public/`.

## Data model decisions

Assignment rule settings remain JSON because they are versioned configuration
consumed by `public/js/engine.js`. Identities, ownership, enrolments, submission
status, reviews and marks are relational because they require constraints,
transactions, reporting and row-level authorization.

Reviews now belong to a marker. This avoids the prototype's single shared
`submission.review` object, which would allow two markers to overwrite one
another. Moderation can still read all reviews within a course.

## Migration sequence

1. Apply and test the schema/RLS migration in a development Supabase project.
2. Add an idempotent importer for `data/seed.json` and verify record counts.
3. Replace the prototype login with Supabase Auth.
4. Add a small data-access layer and migrate one vertical slice first:
   course list -> assignment list -> submission review.
5. Move each mutation from whole-state `PUT /api/state` calls to row-level
   inserts/updates with revision checks.
6. Add the student submission experience.
7. Add a thin TypeScript/Fastify service for LTI launch validation, Canvas
   roster synchronisation and other privileged jobs.

## Security checks required before real data

- Automated allow-and-deny tests for every RLS policy and role
- University privacy, retention and data-residency approval
- Audit logging for roster changes, exports and review decisions
- Backups and a tested restore process
- Content-size, URL and uploaded-file validation
- Removal or permanent disabling of the prototype state/reset API
