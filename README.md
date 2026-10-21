# Lane2 teaching workspace (merged prototype, v3)

A decision-support tool that helps teaching staff see how students used AI in Lane 2 assessments across all the courses they teach. INFOMGMT 399 capstone, Team 15.

This version merges the two earlier prototypes. It uses the engine, server and data handling from the **teacher prototype (v2)** and the sidebar, look and feel from **Lane2AI_Dashboard**.

**All students, conversations and essays are synthetic.** Flags are prompts for a marker to look closer. They are not evidence of misconduct, and the final judgement always stays with the marker.

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
- **Under Assignments** in the sidebar there are three sub-tabs: **New assignment**, **Marking** and **Adjust Rubrics**. Assignments itself is an overview; marking happens under Marking. Courses are still added from the **Assignments** page or **Admin**.
- **Headings** use Poppins 600, self-hosted in `public/fonts/` (SIL OFL), through `--font-heading`. Body text is unchanged.

## Run it

You need [Node.js](https://nodejs.org) 20 or newer. Run `npm install`
before using the production backend commands. The original prototype server has
no runtime dependencies of its own.

```bash
node server.js
```

Then open <http://localhost:3000>. In VS Code you can also press **F5**.

**Log in** with the demo account (username `minakh`, password `lane2demo`), which owns the three demo courses. Or choose **Sign up** to create a new teacher account. A new account starts with an empty workspace and only ever sees the courses that teacher creates.

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
| **Log in / Sign up** | Prototype accounts. The demo login is shown on the page. Sign-up creates a teacher with no courses. |
| **Dashboard** (landing) | One card per course, showing open assignments, flagged students (and how many are waiting for you), submissions received and students. Below that, a screening list of every assignment, most urgent first, with filters. "Start next review" jumps to the next flagged submission. A teacher with no courses sees a three-step setup guide instead. |
| **Course drop-down** (sidebar) | Switch course from anywhere. The arrow stays visible when a course is selected. Each course shows how many flagged submissions are waiting. On review pages, picking a course filters the review picker. |
| **Assignments** (index) | Every course you teach, with its assignments shown as chips (green = open). Click a course to open its page. |
| **Course page** | All of the course's assessments as a list, showing due date, hand-in progress, flagged count and how many are reviewed. Below it, a student × assignment grid shows each student's status in every assignment. Click a cell to open that submission. |
| **New assignment** | Two pages. **Step 1**: course, title, short name, word limit, instructions and a due date chosen from a small **calendar pop-up**. **Next** checks the required fields. **Step 2**: flag-rule strictness, auto-populated criteria (tick or untick) and your own criteria with **+**. **Save as draft** on either page keeps it under **Drafts** on the Assignments page to continue or delete later. |
| **Marking** (sub-tab under Assignments) | Class tabs, then a card per assignment with how many are left to mark (most left first). Click one to open its marking page. The sidebar badge shows how many handed-in submissions are still to mark. |
| **Marking page** (one assignment) | One **marking progress** bar (marked, left to mark, flagged and waiting), then the student list, with students still to mark at the top and marked students at the bottom. Submissions still to mark are greyed out with a **Mark** button; marked ones show **Open**. On a course page each assignment's main button says how many are left ("Mark 9 left"). A drop-down switches assignment; buttons go to all the course's assignments, its Performance graphs, Adjust rubric and Start next review. The sidebar's count of flagged submissions waiting now sits on **Assignments**. |
| **Review Performance** | Two tabs. **Class overview**: pick a class (or All classes); an **assignment comparison** shows handed in, flagged by the rules, marked and average critique level side by side, plus **what students did with AI** across the class. Click an assignment to drill down. **By assignment**: class and assignment filters, then what students did with AI, critique levels and which rules flagged work. Clicking a colour, bar or rule opens the marking list filtered to those students. Both tabs have a **Students** filter (everyone with a log, handed in, log only, flagged by the rules, not marked yet, approved or flagged by you). |
| **Submission review** | Each AI step (prompt + response) with the **rubric beside it** comes first, then the final submission, then the flags raised by the rules. The **process timeline** sits in the Mark this submission panel: each step is green once every criterion on it is marked and red until then, and clicking one jumps to it. Each criterion has **Approve / Flag / Comment**; comments are saved with **Post** and can be edited or deleted. The Mark this submission panel is tinted so it stands out, and the shared-wording percentage sits in the final submission box. The **+** beside "Rubric" adds your own criterion to the assignment's rubric without leaving the script; it then appears for every student and step (remove it in Adjust Rubrics). A side panel has the same three actions for the whole submission, plus rubric progress, a review timer and Previous / Next / "Next to review" buttons. |
| **Adjust Rubrics** (under Assignments) | Three steps: choose a class, then one of its assignments, then adjust its rubric. The rubric has **auto-populated criteria** from the flag rules (tick or untick) and **your own criteria**, added with **+**. The rubric step is split in half: the **rubric** on the left with a compact **version history** and the **fixed test cases** under it, and the **flag rules** on the right. Changes show live in the test lab but only count once you press **Save changes** in the bar at the bottom, which records a new version (with an optional note). **Discard** goes back to the last saved version, any older version can be restored and then saved, and leaving with unsaved changes asks first. Criteria added with + on a student review, or in the assignment settings, are saved as a version straight away. The test lab holds the per-assignment rules: toggles, sliders, presets, copy rules from another assignment and word lists. The fixed test cases update as you change a rule, and show which cases changed. The assignment's rubric is edited here too: pick rules as criteria or create your own. |
| **Export** (the Export button on Admin) | Class summary CSV, rubric marks CSV, every-interaction CSV, class report PDF, single-student PDF, rule settings, full backup and restore. |
| **Admin** | **Courses** (add, edit, remove), **Assignments** (create with rubric criteria, edit, remove, copy Canvas link), **People** (enrol students per course, groups, teaching staff), **Canvas & data** (embed links, reset demo data). |

Most numbers, pills and chart parts explain themselves when you hover over them.

## Key design changes from v2

- **Teachers teach several classes.** The data is now courses → assignments → submissions. The demo has 3 courses, 7 assignments and 30 students, some of whom take two courses.
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

## Working, simulated and planned

| Part | Status |
| --- | --- |
| Multi-course landing, screening, course and assignment dashboards | Working |
| Rubric marking (per step) and Approve / Flag / Comment decisions | Working |
| Adjust Rubrics with per-assignment rules, auto-populated and custom criteria | Working |
| Creating courses and assignments, enrolling students | Working |
| AI-written reflection check | Simulated with a phrase list |
| Student-facing page where students paste their log | Planned (logs arrive as demo data) |
| Login, sign-up and per-teacher course lists | Working (prototype only: plain-text passwords, session kept in the browser) |
| Secure logins, roles, real Canvas LTI integration | Planned (see `docs/canvas-lti.md`) |

## Project structure

```
server.js                 Local server: serves the app and saves data
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
