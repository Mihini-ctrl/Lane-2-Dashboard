# Lane2 teaching workspace (merged prototype, v3)

A decision-support tool that helps teaching staff see how students used AI in Lane 2 assessments across all the courses they teach. INFOMGMT 399 capstone, Team 15.

This version merges the two earlier prototypes. It uses the engine, server and data handling from the **teacher prototype (v2)** and the sidebar, look and feel from **Lane2AI_Dashboard**.

**All students, conversations and essays are synthetic.** Flags are prompts for a marker to look closer. They are not evidence of misconduct, and the final judgement always stays with the marker.

## Run it

You need [Node.js](https://nodejs.org) 18 or newer. Nothing needs to be installed with npm.

```bash
node server.js
```

Then open <http://localhost:3000>. In VS Code you can also press **F5**.

Without Node, open `public/index.html` directly in a browser. Everything works, but changes are saved only in that browser.

| Command | What it does |
| --- | --- |
| `npm start` | Same as `node server.js` |
| `npm test` | Runs the automated checks in `tests/` |
| `npm run reset` | Deletes `data/db.json` so the demo data loads again |
| `npm run seed` | Rebuilds the demo courses from `data/generate-seed.js` |

## Screens

| Screen | What the teacher can do |
| --- | --- |
| **All courses** (landing) | Choose which course to open. See every course as a card, plus a screening list of every assignment in every class, most urgent first, with filters. "Start next review" jumps to the next flagged submission. |
| **Course drop-down** (sidebar) | Switch course from anywhere. Each course shows how many flagged submissions are waiting. |
| **Assignments** (course page) | All of the course's assessments as a list, showing due date, hand-in progress, flagged count and how many are reviewed. Below it, a student × assignment grid shows each student's status in every assignment. Click a cell to open that submission. |
| **Review dashboard** (one assignment) | The current metrics and charts. Charts are clickable filters (decision, critique level, rule). A hand-in pipeline shows who has attached a log, who has handed in and who hasn't started. The student table can be searched, filtered and sorted. |
| **Submission review** | Flags raised by the rules, the process timeline, then each AI step (prompt + response) with the **rubric beside it**. Each criterion has **Approve / Flag / Comment**. A side panel has the same three actions for the whole submission, plus rubric progress, a review timer and Previous / Next / "Next to review" buttons. |
| **Rules & Test Lab** (one page) | Per-assignment rules: toggles, sliders, presets, copy rules from another assignment and word lists. The fixed test cases, preset comparison and a live "try a reflection" box update as you change a rule, and show which cases changed. The assignment's rubric is edited here too: pick rules as criteria or create your own. |
| **Export** | Class summary CSV, rubric marks CSV, every-interaction CSV, class report PDF, single-student PDF, rule settings, full backup and restore. |
| **Admin** | **Courses** (add, edit, remove), **Assignments** (create with rubric criteria, edit, remove, copy Canvas link), **People** (enrol students per course, groups, teaching staff), **Canvas & data** (embed links, reset demo data). |

Most numbers, pills and chart parts explain themselves when you hover over them.

## Key design changes from v2

- **Teachers teach several classes.** The data is now courses → assignments → submissions. The demo has 3 courses, 7 assignments and 30 students, some of whom take two courses.
- **Students paste their AI conversation before hand-in, not after.** The teacher Import page is gone. Each submission records when the log was attached (`logsAttachedAt`) and when the work was handed in (`handedInAt`). Open assignments show students at every stage.
- **The rubric replaces per-step flag cards and the critique section.** When creating an assignment, the teacher chooses rubric criteria from the flag rules and/or writes their own. In the review the teacher marks each criterion on each step. Automatic flags are summarised once at the top of the page and are not shown beside the criteria, so the judgement is the teacher's.
- **Flag rules and the Test Lab are one page**, and rules are saved per assignment.
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
| Rules & Test Lab with per-assignment rules and custom criteria | Working |
| Creating courses and assignments, enrolling students | Working |
| AI-written reflection check | Simulated with a phrase list |
| Student-facing page where students paste their log | Planned (logs arrive as demo data) |
| Logins, roles, real Canvas LTI integration | Planned (see `docs/canvas-lti.md`) |

## Project structure

```
server.js                 Local server: serves the app and saves data
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
```

## Privacy

Do not put real student data into this prototype. It has no logins and stores everything in a plain file. Use synthetic data only.
