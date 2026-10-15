# Backend implementation

Lane2 is moving from a single JSON-file state to Supabase-managed PostgreSQL.
The existing `node server.js` prototype remains available while screens are
migrated incrementally.

## What has been implemented

- A normalised relational schema in `supabase/migrations/`
- A deterministic converter from `data/seed.json` to relational rows
- Supabase Auth profiles rather than application-managed passwords
- Course-level roles and database-enforced Row Level Security (RLS)
- Separate submissions, AI interactions, per-marker reviews and rubric marks
- Optimistic-concurrency fields (`revision` and `updated_at`)
- An audit-event table for privileged activity
- A TypeScript/Fastify API in `backend/` with authenticated course,
  assignment, submission and per-marker review routes

## Local setup

1. Install the Supabase CLI using one of its supported installation methods.
2. Copy `.env.example` to `.env` and fill in a development project's values.
3. Link the local repository to the development project.
4. Apply the migration with `supabase db push`.
5. Build and run the API:

   ```bash
   npm run backend:build
   npm run backend:start
   ```

For development, `npm run backend:dev` watches TypeScript files and restarts
the API. It defaults to `http://127.0.0.1:3100` so the prototype can continue
running on port 3000.

## API implemented so far

All routes except health require `Authorization: Bearer <Supabase access token>`.
Database calls retain that token, so PostgreSQL RLS evaluates the actual caller
rather than a privileged service account.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/health` | Service readiness |
| `GET` | `/api/v1/me` | Current authenticated identity |
| `GET` | `/api/v1/courses` | Courses available to the caller |
| `GET` | `/api/v1/courses/:id/assignments` | Assignments in one course |
| `GET` | `/api/v1/assignments/:id/submissions` | Submission queue |
| `GET` | `/api/v1/submissions/:id` | Full review record |
| `PUT` | `/api/v1/submissions/:id/review` | Create or update the caller's review |

Review writes support `expectedUpdatedAt` for optimistic concurrency. A stale
editor receives HTTP 409 rather than silently replacing a newer review.

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
