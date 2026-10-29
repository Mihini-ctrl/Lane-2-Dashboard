# Trace — Lane 2 Assessment Workspace

Trace helps teaching staff review students’ AI use in Lane 2 assessments. It brings together submitted work, AI conversation logs, written critiques and marking rubrics across multiple courses.

Developed for **INFOMGMT 399 Capstone, University of Auckland — Team 15**.

> **Prototype:** Use synthetic data only. Automated flags and AI evaluations support teacher review; they do not determine marks or establish misconduct.

## Demo

[Open Trace](https://trace-lane2.onrender.com)

| Role | Hosted demo email | Password |
| --- | --- | --- |
| Teacher | `minakh+lane2-demo@auckland.ac.nz` | `lane2demo` |
| Student | `srey914+lane2-demo@aucklanduni.ac.nz` | `lane2demo` |

These are public demonstration accounts for synthetic data only. The Render services may take about a minute to wake after inactivity; keep the page open while they load.

The checked-in synthetic dataset currently contains three courses, three
assignments, 22 students, 30 submission records and 131 AI interactions.

## Main features

- **Student submissions:** Upload work, paste an AI conversation log and complete a written critique.
- **Course management:** Create courses and assignments, enrol students and track submission progress.
- **Teacher review:** Review submitted work, AI interactions and critiques alongside grading and AI-use rubrics.
- **Configurable rules:** Set assignment-specific thresholds and criteria, test changes against fixed cases and keep rubric version history.
- **Optional Gemini evaluation:** Analyse logged AI interactions and submitted text to suggest areas for review.
- **Reporting:** View class and assignment summaries and export review data.

## Local setup

### Requirements

- Node.js 22 or newer.
- npm for tests and the optional Fastify/Supabase backend.
- A Gemini API key only if you want AI evaluation.

### Run the local prototype

Download or clone the repository, open a terminal in its root directory and run:

```bash
node server.js
```

Open [http://localhost:3000](http://localhost:3000).

| Role | Local username | Password |
| --- | --- | --- |
| Teacher | `minakh` | `lane2demo` |
| Student | `srey914` | `lane2demo` |

The local prototype starts without `npm install`. Install dependencies before running tests or working on the Fastify backend:

```bash
npm install
```

Local working data is stored in `data/db.json`, with uploaded files in `data/uploads/`. Treat local accounts and authentication as demonstration-only.

### Optional AI evaluation

Copy `.env.example` to `.env` and set:

```dotenv
GEMINI_API_KEY=your-api-key
```

Obtain a key from [Google AI Studio](https://aistudio.google.com/apikey), then restart the server. Keep `.env` out of version control. Without a key, the app’s other workflows remain available.

AI requests run through `ai-eval.js` on the server. Submitted work, AI logs and critique content may be sent to Google for evaluation. Use synthetic content only; results are estimates that require teacher judgement. Model availability and API quotas can affect evaluation.

The code currently defaults to `gemini-3.6-flash` and falls back to
`gemini-3.5-flash-lite` when the first model is unavailable. Both model names
are listed in Google's [Gemini model documentation](https://ai.google.dev/gemini-api/docs/models).
Under Google's [Gemini API terms](https://ai.google.dev/gemini-api/terms),
content submitted through unpaid services may be used to improve Google
products and may be reviewed by people. Do not send personal, confidential or
real student information through the prototype.

## Supabase backend and deployment

The hosted configuration uses two Render services:

- **`trace-lane2`:** Serves the browser app, handles Gemini requests and proxies `/api/v1/*` to the backend.
- **`trace-lane2-backend`:** Runs the TypeScript/Fastify API, verifies Supabase Auth sessions and accesses Supabase PostgreSQL and private file storage.

The browser runs the rule engine. In backend mode, database access uses the signed-in user’s token and PostgreSQL Row Level Security (RLS). This is separate from the local JSON demo mode.

### Configuration

Apply every SQL migration in `supabase/migrations/` in filename order, then
configure the backend service with:

```dotenv
SUPABASE_URL=your-project-url
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_JWKS_URL=your-jwks-url
```

Keep `GEMINI_API_KEY` on the app-serving Render service. A Supabase secret key is not required by the deployed user-scoped API and must never be exposed to the browser.

For Render deployment:

1. Deploy or sync the Blueprint in `render.yaml`.
2. Set the backend environment variables manually in Render, including when updating an existing Blueprint.
3. Set the Supabase Auth Site URL and allowed redirect URL to the deployed app URL.
4. Check that `/api/v1/health` returns `{"ok":true,"service":"lane2-backend"}` and `/js/runtime-config.js` reports `backendEnabled: true`.

Original submission-file storage requires migration
`202610280006_submission_files.sql`. Without it, hand-ins retain extracted text
but not the original file. Migration
`202610280007_submission_file_cleanup.sql` adds course-scoped staff permission
for removing stored files when an assignment or course is deleted. New
environments should apply both as part of the full migration sequence.

Stored submission files are private. Authenticated students and teaching staff
from the relevant course can obtain a signed download URL that expires after
120 seconds. The Fastify API enforces the 10 MB limit, accepted filename
extensions and basic file signatures; the Storage bucket separately enforces
its size and MIME allowlist. This is format validation, not malware scanning or
complete inspection of the document contents.

See [docs/backend.md](docs/backend.md) for detailed backend setup. In backend mode, a teacher must enrol a student’s exact university email before the student registers and confirms that address.

### Synthetic demo data

After applying migrations, set `SUPABASE_SECRET_KEY` in a local `.env` for the administrative import scripts only. Preview the import before applying it:

```bash
npm run supabase:seed -- --owner-email=your.name@auckland.ac.nz
```

Add `--apply` to write the synthetic records. To create and link the hosted demo accounts:

```bash
npm run supabase:demo -- --apply
```

Use a development project containing synthetic data only. These scripts do not make the local prototype suitable for real student records.

## Development commands

| Command | Purpose |
| --- | --- |
| `npm start` | Start the app server |
| `npm test` | Run all core and backend tests |
| `npm run test:core` | Run browser engine, schema, file, server-limit and seed tests |
| `npm run test:all` | Alias for `npm test` |
| `npm run test:db` | Apply every migration to in-memory PostgreSQL and test RLS rules |
| `npm run dev:supabase` | Run the app and Fastify API together in Supabase mode |
| `npm run backend:dev` | Start the Fastify API in watch mode on port 3100 |
| `npm run backend:build` | Type-check and compile the API |
| `npm run backend:test` | Run backend route tests without a live database |
| `npm run supabase:check` | Check that the configured Supabase schema is ready |
| `npm run supabase:seed` | Preview the synthetic import; add an owner email and `--apply` to write it |
| `npm run supabase:demo` | Preview demo-account linking; add `--apply` to perform it |
| `npm run seed` | Regenerate the local synthetic dataset |
| `npm run reset` | Delete `data/db.json` and `data/uploads/` so the local demo reloads its seed data; local changes and files will be lost |

## Project structure

```text
server.js                App server and local JSON persistence
ai-eval.js               Gemini evaluation requests and output handling
backend/                 TypeScript/Fastify API and backend tests
public/
  index.html             Browser app shell
  css/                   Interface styles
  js/app.js              Screens and interactions
  js/engine.js           Browser-based rules and critique scoring
  js/testcases.js        Fixed rule-testing cases
data/                    Synthetic seed data and local working files
demo/                    Example submission and AI log
tests/                   Automated checks
supabase/migrations/     Database schema and access policies
docs/                    Backend and integration documentation
render.yaml              Render deployment configuration
```

## Limits, security and current scope

- The prototype uses synthetic student data and has not been established as suitable for real student records.
- Each assignment has a basic sidebar-free Canvas embed link. Full Canvas LTI 1.3 login, roster synchronisation and grade return are not implemented; [the integration notes](docs/canvas-lti.md) describe that future work.
- Hand-in files are limited to 10 MB and pasted AI logs to 200,000 characters. The local JSON workspace has a 20 MB save limit; this is not a per-file or Supabase database limit.
- Gemini evaluates up to the first 60,000 characters of an AI log and 40,000 characters of submitted work. Longer inputs may receive a partial evaluation.
- Legacy `.doc` files can be downloaded, but their text is not displayed as a parsed document.
- Marks are currently visible to teaching staff only.
- Assignment drafts in backend mode are stored in `localStorage`, separated by signed-in user, and remain only in that browser.
- Supabase access and refresh tokens are stored in browser `localStorage` under `lane2-api-session`. A successful cross-site scripting attack could read them; production hardening should move sessions to secure, `HttpOnly`, `SameSite` cookies and use a strict Content Security Policy.
- The `/api/ai/evaluate` endpoint on the app-serving Node process does not currently require a Supabase bearer token or enforce a per-user rate limit. The Gemini key remains server-side, but an unauthenticated caller could consume its quota. This must be fixed before non-demo use.
- Course staff can read reviews from other staff in the same course for moderation, but can update only their own review. The normal workspace interface displays the signed-in marker's own review.
- Rule-based indicators are recalculated in the browser from the current submission, interactions, critique, saved AI evaluation (when available) and assignment settings. They are cached only in memory and are not stored as database findings.
- Local JSON storage and hosted Supabase storage are separate modes. Resetting local data does not reset the hosted database.
