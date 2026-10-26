# Lane2 teaching workspace (merged prototype, v3)

A decision-support tool that helps teaching staff see how students used AI in Lane 2 assessments across all the courses they teach. INFOMGMT 399 capstone, Team 15.

This version merges the two earlier prototypes. It uses the engine, server and data handling from the **teacher prototype (v2)** and the sidebar, look and feel from **Lane2AI_Dashboard**.

**All students, conversations and essays are synthetic.** Flags are prompts for a marker to look closer. They are not evidence of misconduct, and the final judgement always stays with the marker.

## Getting started (team members)

1. Install **Node.js 22 or newer** (the LTS installer from <https://nodejs.org>).
2. Download or clone this repo, open a terminal in the folder and run:

   ```bash
   node server.js
   ```

3. Open <http://localhost:3000>. Teacher login `minakh` / `lane2demo`, student login `srey914` / `lane2demo`.

For AI evaluation, copy `.env.example` to `.env` and paste a Gemini key after `GEMINI_API_KEY=` (see "AI evaluation" below for a free key). `.env` is not in the repo, so keys are never submitted or shared through GitHub. Without a key everything works except AI evaluation.

## Hosted demo (Render)

The live demo runs this same `node server.js` (JSON prototype mode) on Render, with the Gemini key stored as an environment variable on Render rather than in the repo. Markers only need the URL and the logins above.

- Free Render services sleep after about 15 minutes idle; the first visit can take up to a minute to wake.
- Data lives in `data/db.json` on the server and goes back to the seed data whenever the service restarts or redeploys. That is expected for a demo with synthetic data.
- Gemini's free tier has a daily quota. Results are saved, so submissions already evaluated keep showing their results even when the quota is used up.

To set it up again: in Render choose **New → Blueprint**, pick this repo (it reads `render.yaml`), and enter `GEMINI_API_KEY` when asked. Check `/api/ai/status` on the live URL reports `"configured": true`.

Each computer keeps its own data. For the student-to-teacher demo, do both on the same computer (see "Demo" below).

## Design (v5)

v5 keeps the v4 layout and type, on a white page, with a new palette for the interface and the v4 colours for status.

- **Interface palette** (tokens in `public/css/base.css`):
  - `--forest` `#292E16` (Darkest Forest): sidebar, login screen, primary buttons
  - `--accent` `#42010F` (Rhinoceros Beetle): the one accent, used for links, course badges, flagged numbers on course cards and highlights. `--accent-tint` and `--accent-soft` are pale versions used behind burgundy text.
  - `--dry-leaf` `#CFBD8C`: markers on the dark sidebar (active page, nav count, course switcher)
  - `--tilleul` `#898660` and `--cypress` `#595B3E`: secondary greens. The "Submissions received" box on each course card is a light green (`--cypress-soft`) with Cypress text.
- **Submission stages use two palette colours on every page:** `--handed-in` is `#7B9669` and `--log-attached` is `#ECDFD2`. They cover the screening bars and legend, the stage pills, the "Log" cells in the course matrix, the in-progress outline and the "Not handed in yet" banner on the review page.
- **Status and flag colours keep the v4 hues**, so teachers can tell them apart at a glance. This covers the screening list (grey not started; red "to review", grey "Closed" and green "Open" pills), the flag matrix, rule types, flag severity, AI-usage categories and critique levels. These rules are in the last block of `public/css/styles.css`.
- **Less text.** No eyebrow labels, no greeting, no explanatory lines under "Your courses", and no action buttons on the dashboard: it opens straight on the course cards.
- **Under Assignments** in the sidebar there are three sub-tabs, in this order: **Marking**, **Adjust Rubrics** and **New assignment**. Assignments itself is an overview; marking happens under Marking. Courses are still added from the **Assignments** page or **Admin**.
- **Headings** use Poppins 600, self-hosted in `public/fonts/` (SIL OFL), through `--font-heading`. Body text is unchanged.

## Run it

You need [Node.js](https://nodejs.org) 22 or newer (download the LTS installer from nodejs.org). Then, in this folder:

```bash
node server.js
```

`npm install` is only needed for the tests and the Supabase backend, not to run the app.

Then open <http://localhost:3000>. In VS Code you can also press **F5**.

The login screen has two tabs, **Teacher** and **Student**.

- **Teacher:** log in with the demo account (username `minakh`, password `lane2demo`), which owns the three demo courses. Or choose **Sign up** to create a new teacher account. A new account starts with an empty workspace and only ever sees the courses that teacher creates.
- **Student:** log in with the demo student account (username `srey914`, password `lane2demo`). This is Sofia Reyes, who takes all three courses. There is no student sign-up.

Without Node, open `public/index.html` directly in a browser. Everything works, but changes are saved only in that browser.

| Command | What it does |
| --- | --- |
| `npm start` | Same as `node server.js` |
| `npm test` | Runs the automated checks in `tests/` |
| `npm run test:all` | Runs the rule-engine, schema and seed-conversion checks |
| `npm run backend:dev` | Runs the new Supabase API in watch mode on port 3100 |
| `npm run backend:build` | Type-checks and compiles the production API |
| `npm run backend:test` | Runs the backend route tests without a live database |
| `npm run reset` | Deletes `data/db.json` so the demo data loads again |
| `npm run seed` | Rebuilds the demo courses from `data/generate-seed.js` |

## Screens

| Screen | What the teacher can do |
| --- | --- |
| **Log in / Sign up** | Prototype accounts. A **Teacher / Student** switch at the top picks who is logging in. The demo logins are shown on the page. Sign-up (teachers only) creates a teacher with no courses. |
| **Student: My courses** | One card per course the student takes: open assignments, how many are still to hand in, how many are handed in, and the next due date. |
| **Student: Course** | Every assignment in the course with its due date and the student's status (To hand in, AI log saved, Handed in, Not handed in). **Hand in** opens the assignment. |
| **Student: Assignment** | Details on the right. On the left, two steps and one **Hand in** button: **1** upload the work (PDF or Word, up to 2 MB, click or drag), **2** paste the full AI chat history. Tabs for ChatGPT, Microsoft Copilot, Claude, Gemini and other tools show short copy instructions (open the chat, scroll to the top, Ctrl/Cmd + A, Ctrl/Cmd + C, paste). After hand-in the student sees what they handed in and can **Replace submission** until the due date. |
| **Dashboard** (landing) | One card per course, showing open assignments, flagged students (and how many are waiting for you), submissions received and students. Below that, a screening list of every assignment, most urgent first, with filters. "Start next review" jumps to the next flagged submission. A teacher with no courses sees a three-step setup guide instead. |
| **Course drop-down** (sidebar) | Switch course from anywhere. The arrow stays visible when a course is selected. Each course shows how many flagged submissions are waiting. On review pages, picking a course filters the review picker. |
| **Assignments** (index) | Every course you teach, with its assignments shown as chips (green = open). Click a course to open its page. |
| **Course page** | All of the course's assessments as a list, showing due date, hand-in progress, flagged count and how many are reviewed. Below it, a student × assignment grid shows each student's status in every assignment. Click a cell to open that submission. |
| **New assignment** | Three pages. **Step 1**: course, title, short name, word limit, instructions and a due date chosen from a small **calendar pop-up**. **Next** checks the required fields. **Step 2: Grading rubric** (grades the work itself): criteria with points, marked **Excellent / Good / Okay / Not good** (100 / 75 / 50 / 25% of the points), with an optional description of each level. Start from a template (Essay, Report, Presentation, Technical task) or write your own; at least one criterion is required. **Step 3: AI use rubric** (checks how AI was used, marked on every prompt step): flag-rule strictness, auto-populated criteria (tick or untick) and your own criteria with **+**. **Save as draft** on either page keeps it under **Drafts** on the Assignments page to continue or delete later. |
| **Marking** (sub-tab under Assignments) | Class tabs, then a card per assignment with how many are left to mark (most left first). Click one to open its marking page. The sidebar badge shows how many handed-in submissions are still to mark. |
| **Marking page** (one assignment) | One **marking progress** bar (marked, left to mark, flagged and waiting), then the student list, with students still to mark at the top and marked students at the bottom. Submissions still to mark are greyed out with a **Mark** button; marked ones show **Open**. On a course page each assignment's main button says how many are left ("Mark 9 left"). A drop-down switches assignment; buttons go to all the course's assignments, its Performance graphs, Adjust rubric and Start next review. The sidebar's count of flagged submissions waiting now sits on **Assignments**. |
| **Review Performance** | Two tabs. **Class overview**: pick a class (or All classes); an **assignment comparison** shows handed in, flagged by the rules, marked and average critique level side by side, plus **what students did with AI** across the class. Click an assignment to drill down. **By assignment**: class and assignment filters, then what students did with AI, critique levels and which rules flagged work. Clicking a colour, bar or rule opens the marking list filtered to those students. Both tabs have a **Students** filter (everyone with a log, handed in, log only, flagged by the rules, not marked yet, approved or flagged by you). |
| **Submission** (click a student in Marking) | The handed-in work as one full document. It always opens with **AI evaluation off** and the **grading rubric** beside it: click a level for each criterion (each button shows its score range and gives the top of it) or press **Enter score** for anything in between, such as 22 out of 25 (the level follows the score), add comments and overall feedback, then press **Save marks**. Nothing is kept until you save ("Unsaved changes" shows until then, and leaving the page asks first); after saving it shows "Saved" with the time, and the mark appears in the **Mark** column of the marking list. Turning **AI evaluation** on hides the grading rubric and colours only the AI-like parts of the text; click a coloured part to see the prompts behind it. **AI interactions and rubric** opens the step-by-step AI use marking. Marks are for teachers only for now. |
| **Adjust Rubrics** → an assignment | Three tabs, each with its own colour: **Grading rubric** (green, grades the work: criteria, points, what each level looks like, and the **score bands** where Excellent / Good / Okay start), **AI use rubric** (burgundy, the criteria marked Approve / Flag / Comment on every prompt step, with version history) and **AI detection** (blue, how sensitive the AI checks are). The grading rubric is also reachable from **Grading rubric** buttons on the course and marking pages and **Edit rubric** on a submission. Removing a grading criterion removes its marks. |
| **AI detection** (Adjust Rubrics tab) | One **sensitivity** setting, **Cautious / Balanced / Strict**, controls both checks: how readily **Gemini** colours text as AI, and the **flag rules** preset (reflection length, critique level, shared wording). Two Gemini options: flag AI-like text with no matching prompt ("Not recorded"), and whether ideas from brainstorming count as AI help. The flag rules can still be fine-tuned rule by rule, with the fixed test cases. Changes count once you press **Save changes**; evaluations run with older settings keep their results and show a "re-run" note, and Gemini only runs again when a marker presses Re-run. |
| **AI interactions and rubric** | Each AI step (prompt + response) with the **rubric beside it** comes first, then the final submission, then the flags raised by the rules. The **process timeline** sits in the Mark this submission panel: each step is green once every criterion on it is marked and red until then, and clicking one jumps to it. Each criterion has **Approve / Flag / Comment**; comments are saved with **Post** and can be edited or deleted. The Mark this submission panel is tinted so it stands out, and the shared-wording percentage sits in the final submission box. The **+** beside "Rubric" adds your own criterion to the assignment's rubric without leaving the script; it then appears for every student and step (remove it in Adjust Rubrics). A side panel has the same three actions for the whole submission, plus rubric progress, a review timer and Previous / Next / "Next to review" buttons. |
| **Adjust Rubrics** (under Assignments) | Three steps: choose a class, then one of its assignments, then adjust its rubric. The rubric has **auto-populated criteria** from the flag rules (tick or untick) and **your own criteria**, added with **+**. The rubric step is split in half: the **rubric** on the left with a compact **version history** and the **fixed test cases** under it, and the **flag rules** on the right. Changes show live in the test lab but only count once you press **Save changes** in the bar at the bottom, which records a new version (with an optional note). **Discard** goes back to the last saved version, any older version can be restored and then saved, and leaving with unsaved changes asks first. Criteria added with + on a student review, or in the assignment settings, are saved as a version straight away. The test lab holds the per-assignment rules: toggles, sliders, presets, copy rules from another assignment and word lists. The fixed test cases update as you change a rule, and show which cases changed. The assignment's rubric is edited here too: pick rules as criteria or create your own. |
| **Export** (the Export button on Admin) | Class summary CSV, rubric marks CSV, every-interaction CSV, class report PDF, single-student PDF, rule settings, full backup and restore. |
| **Admin** | **Courses** (add, edit, remove), **Assignments** (create with rubric criteria, edit, remove, copy Canvas link), **People** (enrol students per course, groups, teaching staff), **Canvas & data** (embed links, reset demo data). |

Most numbers, pills and chart parts explain themselves when you hover over them.

## Key design changes from v2

- **Teachers teach several classes.** The data is now courses → assignments → submissions. The demo has 3 courses with **one assignment each** and 24 students, some of whom take two or three courses: INFOMGMT 399 Report 1 (closed, marked), INFOSYS 222 Assignment 1 (closed, mostly marked) and the BUSINESS 201 essay **"Are electric cars the right path for New Zealand?"** (open until 20 November, 12 students: 9 handed in, 2 with a log only, and Sofia not started). Submissions are full essays and reports of about 450 to 650 words, with chats of four to six prompts. **Noah Taylor's** essay comes with a realistic raw ChatGPT copy-and-paste, so AI evaluation has to split it into steps. Each assignment has its own grading rubric; the essay's is written for it (position, New Zealand evidence, trade-offs, structure, writing).
- **Students paste their AI conversation before hand-in, not after.** The teacher Import page is gone. Each submission records when the log was attached (`logsAttachedAt`) and when the work was handed in (`handedInAt`). Open assignments show students at every stage.
- **The rubric replaces per-step flag cards and the critique section.** When creating an assignment, the teacher chooses rubric criteria from the flag rules and/or writes their own. In the review the teacher marks each criterion on each step. Automatic flags are summarised once at the top of the page and are not shown beside the criteria, so the judgement is the teacher's.
- **Rubrics, flag rules and the test lab are one page (Adjust Rubrics)**, and rules are saved per assignment.
- **Canvas:** every assignment has an embed link (`?embed=1#assignment/<id>`) that hides the sidebar so the dashboard can sit inside a Canvas page. See `docs/canvas-lti.md` for a full LTI integration.

## Critique levels (used by the rules)

| Level | Name | Meaning |
| --- | --- | --- |
| 0 | No critique | Nothing written |
| 1 | Acknowledged | Stock phrase or under 4 words, e.g. "Looks good." |
| 2 | Described | Restates or summarises the output without judging it |
| 3 | Evaluated | Makes a judgement and gives a reason |
| 4 | Verified and acted | Mentions a check against a source and changed or rejected the output |

## Demo: a student hands in, a teacher marks it

This shows the whole system working end to end. It needs `node server.js` running.

1. **Student.** Log in on the **Student** tab as `srey914` / `lane2demo` (Sofia Reyes). Open **BUSINESS 201** → the electric cars essay → **Hand in**.
2. Upload **`demo/sofia-ev-essay.pdf`** in step 1. Trace reads the text and shows how many words it found.
3. In step 2, open **`demo/sofia-chatgpt-chat.txt`**, select everything (Ctrl/Cmd + A), copy it and paste it into the box. This is what a real ChatGPT copy looks like, page clutter included.
   In step 3, answer the three **critique** questions (what AI was used for, what was checked and how, what was changed, rejected or kept and why). Hand in stays blocked until the critique reaches the assignment's word minimum (45 words on Balanced). Press **Hand in**.
4. **Teacher.** Log out, then log in on the **Teacher** tab as `minakh` / `lane2demo`. Go to **Marking** → BUSINESS 201 → the essay. Sofia is now "Handed in". Click her row.
5. The essay opens with AI evaluation off. Mark each criterion of the **grading rubric**, add feedback and press **Save marks**. Her mark appears in the Mark column.
6. Turn on **AI evaluation**. Gemini colours the AI-like parts of her essay and splits her chat into steps. Click a coloured part to see the prompt behind it, then **Open in AI interactions and rubric** to mark her AI use with the **AI use rubric**.

To run the demo again from scratch: stop the server, run `npm run reset`, and start it again.

## Written critique of AI use

Students must hand in a short critique of their AI use with every submission: three guided answers (what they used AI for, what they checked and how, what they changed, rejected or kept and why). Students never see a level; teachers do.

- **One critique level per student** (0 No critique to 4 Verified and acted). It combines the written critique with the student's own replies in the chat. Until AI evaluation runs, the flag rules score both and average them. Once it runs, Gemini sets the level: it reads both, checks every claim in the critique ("I checked…", "I rewrote…") against the chat log and the work, and says whether the critique itself reads as AI-written (for example, polished text from a student whose prompts are casual).
- **Teachers see it** at the top of **AI interactions and rubric** (level, written and chat levels, Gemini's check with each claim marked ✓ / ? / ✕ and linked to its step, and the answers), in the AI evaluation panel on the submission page, in the marking list's **Critique level** column, in **Review Performance** (Critique levels chart and averages, one level per student) and in the CSV export.
- **Flag rules → Checks on the written critique**: *Short written critique* (also the minimum students must write to hand in), *Critique not insightful enough* (below the expected level), *Critique doesn't match the log* and *Critique may be AI-written* (both from Gemini; the last falls back to an AI-phrase word list before AI evaluation runs). Each preset sets the word minimum (30 / 45 / 70) and expected level.
- Submissions handed in before this change have no written critique; their level comes from the chat only and the critique checks don't apply.

## AI evaluation (Google Gemini)

On a student's submission page, the **AI evaluation** switch sends the final submission and the AI chat log to Google Gemini. It colours the text by where it came from (student's own writing, Changed, Used unchanged, Not recorded, plus an outline where the step has flags). It also links each part to the prompts that shaped it. "See this prompt" opens that step on the **AI interactions and rubric** page. The first run on a pasted log also splits it into prompt / response steps, so the rubric and flag rules work on it. The result is saved, so later toggles are instant and every marker sees the same thing. **Re-run** asks Gemini again and keeps rubric marks.

The teacher's **AI detection** settings for the assignment (sensitivity and the two options) are added to every request, so Gemini labels text more or less readily. The model is `gemini-3.6-flash` (free tier, stable). When Google says it is busy, Trace tries `gemini-3.5-flash-lite` instead. The newer `gemini-3.8-flash` was often overloaded in October 2026; set `GEMINI_MODEL=gemini-3.8-flash` in `.env` to try it. The prompt and output format are in `ai-eval.js`. Gemini only returns sentence and line numbers plus labels, so the text Trace shows is always the student's own text.

**Get a free API key** (about 2 minutes, no credit card):

1. Go to <https://aistudio.google.com/apikey> and sign in with a Google account. You must be 18 or over. Your `@aucklanduni.ac.nz` Google account should work, since AI Studio is on by default for Workspace accounts. If it shows "you do not have access to Google AI Studio", the university has turned it off, so use a personal Gmail account instead.
2. Accept the terms. AI Studio creates a Google Cloud project for you. If you already use Google Cloud, import a project under **Dashboard → Projects → Import projects**.
3. Click **Create API key** and copy it. New keys are already restricted to the Gemini API, which Gemini now requires.
4. Copy `.env.example` to `.env` (no name before the dot) and make sure it contains:

   ```
   GEMINI_API_KEY=paste-your-key-here
   ```

5. Restart `node server.js`. The key stays on the server and never reaches the browser.

The University of Auckland gives students Gemini in the browser through their university Google account (see TeachWell's Gemini and NotebookLM page). That does not include API access, so the free AI Studio key above is the way in. Free-tier limits are per project and reset at midnight US Pacific time. Check yours at <https://aistudio.google.com/rate-limit>. AI evaluation needs `node server.js`, and it does not work when `index.html` is opened directly.

**Privacy:** on the free tier, Google may use what you send to improve its products, and human reviewers may read it. Only send synthetic demo data. Real student work would need a paid (billed) project and university approval.

## Working, simulated and planned

| Part | Status |
| --- | --- |
| Multi-course landing, screening, course and assignment dashboards | Working |
| Rubric marking (per step) and Approve / Flag / Comment decisions | Working |
| Adjust Rubrics with per-assignment rules, auto-populated and custom criteria | Working |
| Creating courses and assignments, enrolling students | Working |
| AI-written reflection check | Simulated with a phrase list |
| Student view: courses, assignments, file upload and pasted AI log | Working (prototype login only, not connected to the Supabase backend) |
| Submission page with the full handed-in document (text read from the PDF or Word file) | Working (old `.doc` files can only be downloaded) |
| AI evaluation: human vs AI colouring, prompt-to-part mapping, splitting pasted logs into steps | Working with a Gemini API key in `.env` (estimates, not evidence) |
| Content marking on the submission page | Planned (the page is view-only for now) |
| Login, sign-up and per-teacher course lists | Working (prototype only: plain-text passwords, session kept in the browser) |
| Secure logins, roles, real Canvas LTI integration | Planned (see `docs/canvas-lti.md`) |

## Project structure

```
server.js                 Local server: serves the app, saves data, runs AI evaluation
ai-eval.js                Gemini prompt, output format and API call for AI evaluation
backend/
  src/                    TypeScript/Fastify production API
  test/                   Auth and route contract tests
public/
  index.html              App shell (sidebar, top bar)
  css/base.css            Visual style from the Lane2AI_Dashboard prototype
  css/styles.css          Styles for the new screens, in the same style
  js/engine.js            Rules, critique levels, shared wording
  js/testcases.js         The 12 fixed Test Lab reflections
  js/app.js               Screens and interactions
  js/seed-data.js         Browser copy of the demo data (generated)
data/
  generate-seed.js        Builds the demo courses, assignments and students
  seed.json               The demo data (generated)
  db.json                 Working data (created on first run, ignored by git)
  uploads/                Files students hand in (ignored by git)
tests/engine.test.js      Automated checks (npm test)
docs/canvas-lti.md        Notes on running this inside Canvas
docs/backend.md           PostgreSQL/Supabase implementation and migration plan
supabase/migrations/      Production schema and Row Level Security policies
```

## Production backend work

The production backend migration has started with a normalised PostgreSQL
schema, Supabase Auth integration points and course-scoped Row Level Security.
The current JSON server remains the default while the UI is migrated screen by
screen. See [`docs/backend.md`](docs/backend.md) for setup and sequencing.

## Privacy

Do not put real student data into this prototype. Its login is for demonstrations only: passwords are stored in plain text alongside the data, and the server does not check who is asking. Use made-up accounts and synthetic data only.
