# Could this run inside Canvas?

Yes, in principle. Canvas supports third-party tools through **LTI 1.3** (Learning Tools Interoperability), the same standard that lets tools like Cogniti, Turnitin or Panopto appear inside a Canvas course. This prototype is not an LTI tool yet. This note explains what would have to change and what stays the same.

## What would stay the same

The rule engine (`public/js/engine.js`), the transcript parser (`public/js/transcript.js`) and the dashboard screens do not depend on where the class list comes from. They would be reused as they are.

## What would have to change

| Area | Prototype now | As a Canvas LTI tool |
| --- | --- | --- |
| Launch and login | Opens at `localhost:3000`, no login | Canvas launches the tool from a course link using an LTI 1.3 launch (OpenID Connect login plus a signed token). The tool checks the signature and reads the user's role. |
| Who sees what | Teacher view only | Roles from the launch decide the view: instructors and TAs see the dashboard; students would see a submission page for their own chat link and reflection. |
| Class list | Typed in Admin, or synthetic | Read from Canvas with the **Names and Role Provisioning Service**, so the roster stays in sync. Admin's class-size editing would be removed. |
| Student evidence | Teacher pastes a link or text | Students submit the share link and reflection themselves, either through the tool or as a Canvas assignment submission the tool reads. |
| Results back to Canvas | CSV export | Optionally the **Assignment and Grade Services** could post a "reviewed" status or comment. It should never post an automatic grade, because flags are prompts, not judgements. |
| Hosting | Local Node server, JSON file | A hosted HTTPS server with a real database (for example PostgreSQL), backups and access logs. |
| Security and privacy | Synthetic data, no security | Must meet University privacy, data-retention and security requirements before any real student data is used. |

## Who has to approve it

A teacher cannot add an LTI 1.3 tool alone. A Canvas administrator has to register the tool with a **Developer Key** and enable it for a course or the whole institution. At the University of Auckland this would go through the teams that manage Canvas and learning technologies, and it would need a privacy assessment because the tool stores student AI conversations.

## A realistic path

1. Keep the current prototype for the capstone, with synthetic data.
2. Separate the student submission page from the teacher dashboard.
3. Move storage from `data/db.json` to a database.
4. Add an LTI 1.3 launch using an existing library rather than writing the security code by hand.
5. Test in a Canvas sandbox or test course with synthetic users before any real course.

Steps 4 and 5 are outside the scope of the capstone.

## Embed link (available now)

Before any LTI work, an assignment's dashboard can be placed inside Canvas with its embed link (Admin → Canvas & data, or "Canvas link" on an assignment). The link adds `?embed=1`, which hides the Lane2 sidebar so the page fits inside a Canvas page or module item. It still needs the server to be reachable from the teacher's browser, and it has no login, so it is only suitable for demonstrating with synthetic data.
