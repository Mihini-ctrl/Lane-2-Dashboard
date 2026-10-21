/*
 * generate-seed.js — builds data/seed.json: a synthetic teacher with three
 * courses, seven Lane 2 assignments and about twelve students per course.
 *
 *   node data/generate-seed.js
 *
 * Every name, prompt, AI output, reflection and essay here is invented.
 *
 * Students attach their AI conversation BEFORE they hand in, so every
 * submission carries two timestamps: logsAttachedAt (the paste/link step)
 * and handedInAt (the final hand-in). Open assignments show students at
 * every stage: not started, logs attached, and handed in.
 *
 * Students follow one of eight patterns so the rules have something to tell
 * apart: careful verifiers, evaluators, concise-but-specific writers,
 * passive acceptors, restaters, AI-style reflections, a minimal logger and
 * a student who declared no AI use.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Engine = require('../public/js/engine.js');

/* Deterministic random numbers so the seed is identical on every machine. */
let seed = 399;
function rand() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ------------------------------------------------------------------ */
/* Courses                                                             */
/* ------------------------------------------------------------------ */
const COURSES = [
  { id: 'c-im399', code: 'INFOMGMT 399', name: 'Information Management Capstone', semester: 'Semester 2 · 2026', badge: 'IM' },
  { id: 'c-bus201', code: 'BUSINESS 201', name: 'Business in a Digital World', semester: 'Semester 2 · 2026', badge: 'BU' },
  { id: 'c-is222', code: 'INFOSYS 222', name: 'Database Systems', semester: 'Semester 2 · 2026', badge: 'IS' }
];

/* ------------------------------------------------------------------ */
/* Task banks: what students asked, what the AI said, and the raw      */
/* material for each kind of reflection.                               */
/*   good   what was fine about the output                             */
/*   issue  what was wrong with it (uses judgement words)              */
/*   check  what the student checked it against                        */
/*   fix    what the student changed (uses correction words)           */
/*   short  a concise but specific reflection                          */
/* ------------------------------------------------------------------ */

// BUSINESS 201 Essay 1 keeps the hand-written reflections from v2.
const ESSAY = [
  { key: 'outline', task: 'Plan the essay structure',
    prompt: 'Give me an outline for an essay on how generative AI is changing entry-level work in New Zealand.',
    output: 'Introduction: define generative AI and entry-level work. Section 1: automation of routine tasks such as data entry and customer queries. Section 2: new roles such as prompt specialists and AI trainers are growing quickly across New Zealand. Section 3: the skills gap and the need for digital literacy. Conclusion: entry-level work will change rather than disappear.',
    written: {
      verifier: { c: 'The outline is a reasonable starting point, but section 2 overstates prompt specialist roles. I searched Seek and TradeMe Jobs and could not find any NZ entry-level listings with that title, so I replaced it with a section on changing graduate tasks.', d: 'changed' },
      evaluator: { c: 'Good overall structure but the section on new roles feels exaggerated for New Zealand, so I changed it to focus on how existing graduate roles are shifting instead.', d: 'changed' },
      concise: { c: 'Section 2 overstated; checked Seek, removed it.', d: 'changed' } } },
  { key: 'evidence', task: 'Find evidence on AI adoption',
    prompt: 'Find New Zealand statistics on how many employers are using AI tools.',
    output: 'According to the Aotearoa Workforce Futures Report 2024, 64% of New Zealand employers had adopted generative AI tools by mid-2024, and 38% said they had reduced graduate hiring as a result. The report recommends that tertiary providers embed AI skills in every degree.',
    written: {
      verifier: { c: 'I searched for the Aotearoa Workforce Futures Report on Google Scholar and the library database and it does not exist, so this looks like a hallucination. I did not use these numbers and used the Stats NZ business operations survey from our week 4 reading instead.', d: 'not_used', push: 'That report does not exist when I search for it. Can you give me a link to the source?' },
      evaluator: { c: 'The numbers seem very high and there is no link to the report, so I was not confident using them. I left them out and decided to use figures from class instead.', d: 'not_used' },
      concise: { c: 'Report does not exist, checked library. Not used.', d: 'not_used' } } },
  { key: 'automation', task: 'Understand task automation',
    prompt: 'Explain what task automation means for graduate jobs.',
    output: 'Task automation means that specific tasks within a job are performed by software rather than people. For graduates, this means routine work such as summarising documents, drafting emails and cleaning data is increasingly automated, so entry-level roles shift towards checking, judgement and client contact.',
    written: {
      verifier: { c: 'The definition matches the lecture slides from week 3, which I checked. However it ignores that some graduate roles are growing, so I added a sentence on that and rewrote the example in my own words.', d: 'changed' },
      evaluator: { c: 'Clear explanation and accurate as far as I can tell. I kept the main idea because it matches what we covered, but simplified the wording.', d: 'changed' },
      concise: { c: 'Matches week 3 slides. Rewrote example.', d: 'changed' } } },
  { key: 'feedback', task: 'Get feedback on a paragraph',
    prompt: 'Give feedback on this paragraph: AI is taking jobs from graduates because companies can now use chatbots and automation instead of hiring people, and wages are going down for everyone.',
    output: 'The paragraph makes a clear claim but mixes two separate ideas: automation replacing tasks and wages falling. Consider splitting these into two sentences and supporting each with evidence. The claim that wages are going down for everyone is too broad and should be qualified.',
    written: {
      verifier: { c: 'The AI was right that I mixed automation and wages, so I split that sentence in two. I disagreed about removing my wage claim because I have evidence from the MBIE report, which I checked, so I kept it but qualified it to young workers.', d: 'changed' },
      evaluator: { c: 'Helpful because it pointed out my paragraph mixed two ideas. I agree the wage claim was too broad, so I narrowed it down to young workers in retail.', d: 'changed' },
      concise: { c: 'Split the sentence as suggested, kept wage claim.', d: 'changed' } } },
  { key: 'counter', task: 'Find counterarguments',
    prompt: 'What are the counterarguments to the idea that AI will remove entry-level jobs?',
    output: 'Counterarguments include that AI creates new tasks that need human oversight, that previous technologies such as spreadsheets changed jobs without removing them, and that employers still need graduates to build relationships with clients. Some economists argue AI will increase demand for junior staff who can work alongside it.',
    written: {
      verifier: { c: 'Useful list, but the claim that some economists argue AI increases junior demand had no source. I checked our course reading by Autor and it supports a weaker version, so I rewrote the point with that citation instead.', d: 'changed' },
      evaluator: { c: 'The spreadsheet example is a strong comparison and I used it. The point about economists is vague though, so I did not include that part.', d: 'changed' },
      concise: { c: 'No source for economists claim, removed.', d: 'changed' } } },
  { key: 'references', task: 'Format references',
    prompt: 'Format these references in APA 7: Ministry of Business Innovation and Employment report on AI and the workforce, and the Stats NZ business operations survey.',
    output: 'Ministry of Business, Innovation and Employment. (2021). Artificial intelligence and the future of work in New Zealand. MBIE. Stats NZ. (2021). Business operations survey: 2021. Stats NZ.',
    written: {
      verifier: { c: 'Both years were wrong. I checked the MBIE website and the report is from 2023, and the survey I used is the 2024 edition, so I corrected both references before using them.', d: 'changed', push: 'The MBIE report is from 2023 not 2021, can you check the years again?' },
      evaluator: { c: 'Formatting looked correct for APA 7 so I used it as it was.', d: 'unchanged' },
      concise: { c: 'Wrong year, checked MBIE site: 2023. Fixed.', d: 'changed' } } },
  { key: 'conclusion', task: 'Draft a conclusion',
    prompt: 'Write a conclusion for my essay about generative AI and entry-level work in New Zealand.',
    output: 'In conclusion, generative AI is reshaping entry-level work in New Zealand by automating routine tasks while creating demand for new skills. Graduates who can critically evaluate AI outputs and communicate clearly will be best placed to succeed, and employers and universities must work together to prepare them.',
    written: {
      verifier: { c: 'I did not use this because it reads like a generic summary and introduces a claim about universities that my essay never argues. I wrote my own conclusion that links back to my thesis about task change.', d: 'not_used' },
      evaluator: { c: 'The conclusion is fine but too general and does not mention my main argument, so I rewrote most of it myself.', d: 'changed' },
      concise: { c: 'Generic, wrote my own instead.', d: 'not_used' } } }
];

const MARKETING = [
  { key: 'persona', task: 'Build a customer persona',
    prompt: 'Create a customer persona for an independent bookshop in Dunedin.',
    output: 'Meet Sarah, 34, a marketing manager who loves bestsellers, shops mainly on Amazon and follows celebrity book clubs on Instagram. She values convenience and fast delivery above everything else.',
    good: 'The persona format is useful', issue: 'it is too generic and assumes the customers shop on Amazon, which ignores the students who make up most of the foot traffic',
    check: 'the shop\'s Google reviews and the Census data for Dunedin', fix: 'rewrote the persona around a second-year student who buys second-hand texts',
    short: 'Generic persona; checked shop reviews, rewrote around students.' },
  { key: 'channels', task: 'Choose social media channels',
    prompt: 'Which social media channels should a small bookshop use?',
    output: 'Focus on TikTok, Instagram, Facebook, LinkedIn and Pinterest, posting at least twice a day on each platform to maximise reach. TikTok has the highest engagement of any platform for all age groups.',
    good: 'The channel list is a starting point', issue: 'posting twice a day on five platforms is unrealistic for a two-person shop and the engagement claim is unsupported',
    check: 'the DataReportal New Zealand figures from our week 6 slides', fix: 'cut it down to Instagram and TikTok with three posts a week',
    short: 'Unrealistic frequency; checked DataReportal, cut to 2 channels.' },
  { key: 'budget', task: 'Draft a campaign budget',
    prompt: 'Write a monthly budget for a $1,500 digital campaign for the bookshop.',
    output: 'Allocate $800 to Meta ads, $400 to Google Ads, $200 to influencer partnerships and $100 to email software. This mix typically delivers a 12x return on ad spend for small retailers.',
    good: 'The split between channels is reasonable', issue: 'the 12x return claim has no source and looks made up',
    check: 'the Meta benchmark figures in the course reading', fix: 'removed the return claim and lowered the influencer budget',
    short: 'No source for 12x ROAS, checked reading. Removed.', push: 'Where does the 12x return figure come from? I cannot find it.' },
  { key: 'kpis', task: 'Pick campaign KPIs',
    prompt: 'Suggest KPIs for the bookshop campaign.',
    output: 'Track reach, impressions, follower growth, click-through rate, conversion rate, cost per acquisition and customer lifetime value.',
    good: 'These are standard KPIs', issue: 'customer lifetime value is not measurable for a shop without a loyalty system',
    check: 'the KPI framework from lecture 7', fix: 'replaced it with in-store redemption of a promo code',
    short: 'CLV not measurable; checked lecture 7, replaced it.' },
  { key: 'slogans', task: 'Write campaign slogans',
    prompt: 'Write five slogans for the bookshop campaign.',
    output: '1. Unlock Your Next Adventure. 2. Stories Await. 3. Read Local, Read More. 4. Where Every Page Turns Magic. 5. Your Story Starts Here.',
    good: 'They are catchy', issue: 'most of them are cliches that other bookshops already use',
    check: 'Google for each slogan', fix: 'did not use them and wrote my own around the shop\'s Octagon location', reject: true,
    short: 'Cliches, checked Google, wrote my own instead.' }
];

const STAKEHOLDER = [
  { key: 'stakeholders', task: 'Draft a stakeholder analysis',
    prompt: 'Draft a stakeholder analysis for a university AI assessment dashboard.',
    output: 'The key stakeholders are students, instructors, administrators, and IT support. Students need ease of use, while instructors need efficient monitoring of every AI interaction.',
    good: 'The main groups are right', issue: 'it misses privacy and governance staff and treats all teaching staff as having the same needs',
    check: 'the University assessment policy and our client interview notes', fix: 'added markers, course coordinators and the privacy office as separate groups',
    short: 'Missing privacy office; checked interview notes, added it.' },
  { key: 'problem', task: 'Write the problem statement',
    prompt: 'Help me write a problem statement about marking AI-assisted work.',
    output: 'Teachers currently spend up to 20 hours per assignment reading AI chat logs, which causes burnout and inconsistent grading across universities worldwide.',
    good: 'The framing around marker workload is useful', issue: 'the 20 hours figure is unsupported and the scope is too broad',
    check: 'the project brief from our client', fix: 'removed the number and narrowed the statement to Lane 2 courses at one university',
    short: '20 hours unsupported; checked brief, removed it.', push: 'Where does the 20 hours figure come from?' },
  { key: 'risks', task: 'Identify risks and mitigations',
    prompt: 'Give me risks and mitigations for an automated flagging tool.',
    output: 'Risks include data privacy breaches, algorithmic bias, over-reliance on automated flags and unauthorised access. Mitigate with encryption, bias audits, human review and role-based access control.',
    good: 'The risk list is accurate', issue: 'it ignores false positives, which are the biggest risk for students',
    check: 'the week 7 governance lecture', fix: 'added false positives with a test lab as the mitigation',
    short: 'Missed false positives; checked week 7, added them.' },
  { key: 'framework', task: 'Compare assessment frameworks',
    prompt: 'Compare the two-lane assessment framework with traditional assessment.',
    output: 'Traditional assessment assumes limited external assistance, whereas the two-lane model distinguishes secure assessments from open assessments where AI use is permitted and must be acknowledged.',
    good: 'The contrast is clear', issue: 'it is too broad and does not say how Lane 2 work is actually judged',
    check: 'the University two-lane guidance page', fix: 'rewrote the paragraph to focus on how markers judge the process',
    short: 'Too broad; checked guidance page, rewrote for Lane 2.' },
  { key: 'objective', task: 'Tighten the project objective',
    prompt: 'Improve this project objective without changing its scope.',
    output: 'Design, build and evaluate an auditable web platform that transforms student-AI interaction histories into concise evidence, automatically grades critical thinking and integrates with every LMS.',
    good: 'The auditable evidence idea is right', issue: 'it adds automatic grading and LMS integration, which are out of scope',
    check: 'our scope statement in the proposal', fix: 'removed both and replaced evaluate with demonstrate',
    short: 'Scope creep; checked proposal, removed grading.' }
];

const PROTOTYPE = [
  { key: 'schema', task: 'Design the data model',
    prompt: 'Suggest a data model for courses, assignments, prompts and critiques.',
    output: 'Use Course as the root entity with one-to-many relationships to Assignment, Prompt, Response and Critique, each stored in its own table and linked by foreign keys.',
    good: 'The entities are sensible', issue: 'separate prompt and response tables add complexity without value',
    check: 'the week 5 normalisation slides', fix: 'modelled each interaction as one row with a version history',
    short: 'Too many tables; checked week 5, merged into one.' },
  { key: 'usability', task: 'Plan usability tests',
    prompt: 'Write five usability test tasks for a teacher dashboard.',
    output: '1. Log in. 2. Find a flagged student. 3. Change a rule threshold. 4. Export a report. 5. Rate the interface from 1 to 10.',
    good: 'Tasks 2 to 4 are useful', issue: 'logging in is not part of our prototype and a 1 to 10 rating is not a validated measure',
    check: 'the System Usability Scale reading from lecture 9', fix: 'replaced them with a review task and the SUS questionnaire',
    short: 'Rating not validated; checked lecture 9, used SUS.' },
  { key: 'results', task: 'Summarise test results',
    prompt: 'Summarise these usability results: 5 teachers, average SUS 71, two could not find the Test Lab.',
    output: 'The prototype achieved an excellent SUS score of 71, well above the industry benchmark, and all participants were able to complete every task with ease.',
    good: 'The structure of the summary is fine', issue: 'it calls 71 excellent and says everyone succeeded, which is wrong because two teachers could not find the Test Lab',
    check: 'the SUS grading scale from Sauro', fix: 'corrected it to above average and reported the two failures',
    short: 'Wrong: 2 failed a task. Checked Sauro, corrected.', push: 'That is not right, two of the five could not find the Test Lab.' },
  { key: 'flags', task: 'Argue the value of flags',
    prompt: 'Explain why automated flags might not save teachers time.',
    output: 'Flags may simply shift workload if they are noisy, poorly explained or require teachers to reconstruct context. Measure review time and false positives to know whether they help.',
    good: 'This is a strong point', issue: 'it does not say how to measure false positives',
    check: 'our pilot data and the evaluation plan', fix: 'added a review timer and a false positive count to the method',
    short: 'No method; checked eval plan, added timer.' },
  { key: 'ethics', task: 'Discuss ethical concerns',
    prompt: 'Write a paragraph on ethical concerns with monitoring student AI use.',
    output: 'Monitoring student AI use raises concerns about surveillance, consent and trust. Students may feel they are being policed, and data could be misused if retention periods are not defined.',
    good: 'The paragraph is accurate', issue: 'it is generic and misses Maori data sovereignty, which our client raised',
    check: 'the Te Mana Raraunga principles', fix: 'added a section on data sovereignty',
    short: 'Generic; checked Te Mana Raraunga, added section.' }
];

const PRESENTATION = [
  { key: 'outline', task: 'Outline the presentation',
    prompt: 'Outline a 10-minute presentation of our capstone prototype.',
    output: 'Slide 1: title. Slide 2: team. Slides 3 to 5: background on AI in education. Slide 6: problem. Slides 7 to 12: feature walkthrough. Slide 13: conclusion.',
    good: 'The order is logical', issue: 'it spends too long on background and has no evaluation results',
    check: 'the presentation marking rubric on Canvas', fix: 'cut background to one slide and added two evaluation slides',
    short: 'No results; checked rubric, added 2 slides.' },
  { key: 'script', task: 'Script the demo',
    prompt: 'Write a script for the demo section of our presentation.',
    output: 'Here you can see our revolutionary dashboard, which uses cutting-edge AI to instantly detect cheating and save teachers hours every week.',
    good: 'The energy is good', issue: 'it calls flags cheating detection, which is wrong and the opposite of our design',
    check: 'our design principles in Report 2', fix: 'rewrote the script to say flags are prompts for review', reject: true,
    short: 'Wrong framing; checked Report 2, rewrote script.' },
  { key: 'questions', task: 'Prepare for panel questions',
    prompt: 'What questions might the panel ask us about the prototype?',
    output: 'The panel may ask about scalability, cost, privacy, how flags are validated, and how students feel about the tool.',
    good: 'Useful list', issue: 'it is missing questions about false positives and Canvas integration',
    check: 'feedback from our Report 2 marker', fix: 'added both and prepared answers',
    short: 'Missing 2 questions; checked feedback, added them.' }
];

const ERD = [
  { key: 'entities', task: 'Identify entities',
    prompt: 'What entities do I need for a GP clinic booking system?',
    output: 'You need Patient, Doctor, Appointment, Room, Prescription, Medicine, Pharmacy, Insurance and Payment entities.',
    good: 'Patient, Doctor and Appointment are correct', issue: 'Pharmacy and Insurance are outside the case study scope',
    check: 'the case study brief', fix: 'removed them and added Clinic for the two sites',
    short: 'Out of scope; checked brief, removed 2 entities.' },
  { key: 'relationships', task: 'Define a relationship',
    prompt: 'Describe the relationship between Doctor and Appointment.',
    output: 'Doctor and Appointment have a many-to-many relationship, because a doctor has many appointments and an appointment can involve many doctors.',
    good: 'The first half is right', issue: 'the many-to-many claim is incorrect here because each appointment has exactly one doctor',
    check: 'the case study and the lecture 3 cardinality examples', fix: 'corrected it to one-to-many',
    short: 'Wrong cardinality, checked lecture 3, fixed to 1:M.', push: 'Each appointment only has one doctor in this case, so is it really many-to-many?' },
  { key: 'attributes', task: 'List attributes',
    prompt: 'List attributes for the Patient entity.',
    output: 'PatientID, FirstName, LastName, DateOfBirth, Age, Address, Phone, Email, NHI number.',
    good: 'Most attributes are fine', issue: 'Age is a derived attribute and should not be stored',
    check: 'the textbook chapter on derived attributes', fix: 'removed Age and kept DateOfBirth',
    short: 'Age is derived; checked textbook, removed it.' },
  { key: 'weak', task: 'Check a weak entity',
    prompt: 'Is Prescription a weak entity?',
    output: 'Yes, Prescription is a weak entity because it cannot exist without a Patient, so its primary key should be PatientID alone.',
    good: 'The weak entity part is right', issue: 'the key is wrong because PatientID alone would allow only one prescription per patient',
    check: 'the weak entity example in tutorial 4', fix: 'made the key PatientID plus PrescriptionNo',
    short: 'Wrong key; checked tutorial 4, fixed it.' },
  { key: 'notation', task: 'Write Crow\'s Foot notation',
    prompt: 'Describe my ERD in Crow\'s Foot notation.',
    output: 'Patient ||--o{ Appointment, Doctor ||--o{ Appointment, Appointment }o--|| Room.',
    good: 'The notation is mostly right', issue: 'Room should be optional because telehealth appointments have no room',
    check: 'the case study again', fix: 'changed Room to optional',
    short: 'Room must be optional; checked case, fixed.' }
];

const SQL = [
  { key: 'join', task: 'Write a join query',
    prompt: 'Write SQL to list each doctor with their number of appointments in March.',
    output: 'SELECT d.name, COUNT(*) FROM Doctor d JOIN Appointment a ON d.id = a.doctor_id WHERE MONTH(a.date) = 3 GROUP BY d.name;',
    good: 'The join is correct', issue: 'it misses doctors with no appointments and MONTH() does not work in our Oracle database',
    check: 'it by running it in the lab database', fix: 'changed it to a LEFT JOIN with EXTRACT',
    short: 'Tested in lab DB, MONTH fails. Fixed with EXTRACT.' },
  { key: 'normalise', task: 'Normalise to 3NF',
    prompt: 'Normalise this table to 3NF: Booking(BookingID, PatientName, PatientPhone, DoctorName, DoctorRoom, Date).',
    output: 'Split into Patient(PatientName, PatientPhone), Doctor(DoctorName, DoctorRoom) and Booking(BookingID, PatientName, DoctorName, Date). This is now in 3NF.',
    good: 'The split is the right idea', issue: 'using names as keys is wrong because two patients can share a name',
    check: 'the lecture 6 normalisation steps', fix: 'added PatientID and DoctorID surrogate keys',
    short: 'Names as keys; checked lecture 6, added IDs.' },
  { key: 'exists', task: 'Compare IN and EXISTS',
    prompt: 'Explain the difference between IN and EXISTS.',
    output: 'IN compares a value to a list returned by a subquery, while EXISTS checks whether the subquery returns any rows. EXISTS is always faster than IN.',
    good: 'The explanation is clear', issue: 'saying it is always faster is an overstatement',
    check: 'the Oracle documentation', fix: 'removed the performance claim',
    short: 'Overstated speed; checked Oracle docs, removed.' },
  { key: 'index', task: 'Decide on an index',
    prompt: 'Should I add an index to the Appointment date column?',
    output: 'Yes. Indexes always improve performance, so you should index every column used in a WHERE clause.',
    good: 'Indexing the date column is fine', issue: 'it ignores that indexes slow down inserts',
    check: 'the week 8 indexing slides', fix: 'only indexed date and explained the trade-off',
    short: 'Ignores insert cost; checked week 8, fixed.' },
  { key: 'view', task: 'Create a view',
    prompt: 'Write a view for today\'s appointments.',
    output: 'CREATE VIEW TodayAppointments AS SELECT * FROM Appointment WHERE date = SYSDATE;',
    good: 'The view structure is right', issue: 'it returns no rows because SYSDATE includes the time',
    check: 'it by testing in SQL Developer', fix: 'used TRUNC(SYSDATE) and listed the columns instead of SELECT *',
    short: 'Returned 0 rows; tested it, fixed with TRUNC.' }
];

/* Paragraphs "written by students" for the final submissions. */
const OWN = {
  essay: [
    'When I worked part-time at a bank call centre, many of the simple questions I used to answer are now handled by a chatbot, which means new staff spend more time on complex cases.',
    'Stats NZ data shows that larger firms are adopting AI faster than small businesses, so the effect on graduates depends heavily on where they are employed.',
    'The change is less about jobs disappearing and more about the tasks inside each job being rearranged, with juniors expected to check and explain machine output.',
    'Employers still describe communication and the ability to build trust with clients as the reason they hire graduates, and these are not skills a chatbot replaces.',
    'For Maori and Pacific graduates, who are more likely to enter roles with routine tasks, the shift could widen existing gaps unless training is targeted.',
    'Spreadsheets did not end accounting jobs; they changed what an accountant spends the day on, and generative AI looks likely to follow a similar path.'
  ],
  marketing: [
    'Most customers who walk past the shop are students heading to the Octagon, so the plan focuses on cheap second-hand texts and a study-space event each fortnight.',
    'With two staff members, three Instagram posts a week is realistic, and each post will show a staff pick written in their own words.',
    'A printed promo code on receipts lets the shop measure how many online followers actually visit in person.',
    'The budget favours Instagram because the shop already has 900 followers there, while TikTok is treated as a low-cost experiment.',
    'Success after three months means a ten percent rise in weekday foot traffic, measured by the existing door counter.'
  ],
  stakeholder: [
    'Markers and course coordinators have different needs: markers want fast evidence for one student, while coordinators need consistency across tutors.',
    'Our client told us the privacy office must approve any tool that stores student conversations, so they are a key stakeholder even though they never use the dashboard.',
    'The core problem is that Lane 2 work asks teachers to judge a process they cannot see without reading long chat logs.',
    'A false positive could make a student feel accused, so every flag in our design is framed as a prompt for a human to look closer.',
    'We narrowed the scope to one course so we could test with real teaching staff before thinking about other faculties.'
  ],
  prototype: [
    'We stored each interaction as a single row so that a marker can see the prompt, output and reflection together without joining tables.',
    'Five teachers completed our test sessions and the average SUS score was 71, which is above average but leaves room to improve navigation.',
    'Two participants could not find the Test Lab, so we moved it next to the rules and gave it a clearer label.',
    'We added a review timer because the main claim of the project is that flags save time, and that claim needs evidence.',
    'Data sovereignty matters because some students may share conversations that include their whakapapa or community knowledge.'
  ],
  presentation: [
    'Our presentation leads with the marker problem, then shows one student review from start to finish.',
    'We will show the usability results honestly, including the two teachers who could not find the Test Lab.'
  ],
  erd: [
    'Each appointment links exactly one patient and one doctor, so both relationships are one-to-many from the appointment side.',
    'Room is optional because the clinic now runs telehealth appointments that do not need a physical space.',
    'I removed Age from Patient because it can be calculated from the date of birth and would go out of date.',
    'Prescription is weak because it depends on Patient, so its key combines PatientID with a prescription number.',
    'Clinic was added as an entity because the case study describes two sites that share doctors.'
  ],
  sql: [
    'A LEFT JOIN keeps doctors who had no appointments in March, which the manager specifically asked to see.',
    'Surrogate keys were added because names are not unique and patients often change their phone numbers.',
    'I only indexed the date column because the booking table receives many inserts each morning.',
    'The view uses TRUNC on SYSDATE so the comparison ignores the time of day.',
    'Testing every query in the lab database showed two functions from the AI that our Oracle version does not support.'
  ]
};

const GENERIC = ['Looks good.', 'Good answer.', 'Seems fine.', 'Very helpful.', 'OK', 'Makes sense.', 'Great response.', ''];

function restate(output) {
  const sentences = output.split(/(?<=\.)\s+/);
  return 'The AI explained that ' + sentences[0].charAt(0).toLowerCase() + sentences[0].slice(1) + ' ' + (sentences[1] || '');
}
function aiStyle(t) {
  const out = t.output.split(/(?<=\.)\s+/)[0];
  return 'It is important to note that the AI response provides a comprehensive overview of this topic. ' + out + ' This offers valuable insights for my work and plays a crucial role in my argument.';
}

/** Reflection + decision for one task, written in the student's pattern. */
function reflect(t, pattern, k, unchangedAt) {
  const key = pattern === 'minimal' ? 'evaluator' : pattern;
  if (t.written && t.written[key]) {
    const w = t.written[key];
    return { c: w.c, d: w.d, push: pattern === 'verifier' ? w.push : '' };
  }
  switch (pattern) {
    case 'verifier': return { c: t.good + ', but ' + t.issue + '. I checked ' + t.check + ' and ' + t.fix + '.', d: t.reject ? 'not_used' : 'changed', push: t.push || '' };
    case 'evaluator':
    case 'minimal':
      if (k === unchangedAt) return { c: t.good + ' and accurate as far as I can tell, so I used it as it was.', d: 'unchanged' };
      return { c: t.good + ', but ' + t.issue + ', so I ' + t.fix.replace(/^did not use them and /, 'dropped them and ') + '.', d: t.reject ? 'not_used' : 'changed' };
    case 'concise': return { c: t.short, d: t.reject ? 'not_used' : 'changed' };
    case 'passive': return { c: pick(GENERIC), d: 'unchanged' };
    case 'restater': return { c: restate(t.output), d: rand() < 0.6 ? 'unchanged' : 'changed' };
    case 'aistyle': return { c: aiStyle(t), d: rand() < 0.5 ? 'unchanged' : 'changed' };
    default: return { c: '', d: 'unrecorded' };
  }
}

/* ------------------------------------------------------------------ */
/* People                                                              */
/* ------------------------------------------------------------------ */
const PEOPLE = [
  ['Aroha', 'Ngata', 'verifier'], ['Jake', 'Morrison', 'passive'], ['Liam', 'Chen', 'evaluator'],
  ['Mele', 'Tupou', 'evaluator'], ['Priya', 'Raman', 'evaluator'], ['Sam', 'Wilson', 'none'],
  ['Hana', 'Kim', 'verifier'], ['Tama', 'Wiremu', 'concise'], ['Olivia', 'Brown', 'restater'],
  ['Arjun', 'Patel', 'verifier'], ['Sione', 'Fifita', 'restater'], ['Emma', 'Walker', 'evaluator'],
  ['Ruby', 'Thompson', 'aistyle'], ['Kenji', 'Sato', 'evaluator'], ['Maya', 'Singh', 'aistyle'],
  ['Noah', 'Taylor', 'passive'], ['Leilani', "Fa'asalele", 'minimal'], ['Isla', 'Robertson', 'concise'],
  ['Daniel', 'Lee', 'passive'], ['Grace', 'Huang', 'verifier'],
  ['Aisha', 'Rahman', 'passive'], ['Ethan', 'Park', 'evaluator'], ['Sofia', 'Reyes', 'verifier'],
  ['Wiremu', 'Tane', 'restater'], ['Chloe', 'Martin', 'evaluator'], ['Rangi', 'Parata', 'concise'],
  ['Zoe', 'Campbell', 'aistyle'], ['Lucas', 'Nguyen', 'evaluator'], ['Ana', 'Lolohea', 'verifier'],
  ['Ben', 'Hughes', 'none']
];
const AVATARS = ['avatar-rose', 'avatar-blue', 'avatar-purple', 'avatar-green', 'avatar-gold', 'avatar-navy'];

function upi(first, last, i) {
  return (first.slice(0, 1) + last.replace(/[^A-Za-z]/g, '').slice(0, 3)).toLowerCase() + String(100 + i * 37).slice(-3);
}
const students = PEOPLE.map(([first, last, pattern], i) => {
  const code = upi(first, last, i);
  return { id: 'p' + String(i + 1).padStart(2, '0'), firstName: first, lastName: last, upi: code,
    email: code + '@student.example.ac.nz', avatar: AVATARS[i % AVATARS.length], pattern };
});

// Each course has 12 students; some students take two courses.
const ROSTERS = {
  'c-im399': [20, 21, 22, 23, 24, 2, 9, 13, 14, 15, 16, 17],
  'c-bus201': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12],
  'c-is222': [25, 26, 27, 28, 29, 18, 19, 11, 1, 22, 13, 6]
};
COURSES.forEach((c) => {
  c.roster = ROSTERS[c.id].map((idx, k) => ({ studentId: students[idx].id, group: k % 2 === 0 ? 'Tutorial A' : 'Tutorial B' }));
});

/* ------------------------------------------------------------------ */
/* Assignments                                                         */
/* ------------------------------------------------------------------ */
const rule = (ruleKey) => ({ id: 'cr-' + ruleKey, type: 'rule', ruleKey });
const custom = (id, name, description) => ({ id: 'cr-' + id, type: 'custom', name, description });

// `stages` = how many students are handed in / have logs only, for open assignments
const ASSIGNMENTS = [
  { id: 'a-im399-r1', courseId: 'c-im399', title: 'Report 1: Problem definition and stakeholder analysis', short: 'Report 1', dueDate: '2026-08-21', wordLimit: 2000,
    description: 'Team report defining the problem, scope and stakeholders. Each member attaches their own AI log before hand-in.', bank: STAKEHOLDER, own: 'stakeholder', preset: 'standard', reviewed: 1,
    rubric: [rule('unchangedNoCheck'), rule('belowLevel'), rule('shortCritique')] },
  { id: 'a-im399-r2', courseId: 'c-im399', title: 'Report 2: Prototype design and evaluation', short: 'Report 2', dueDate: '2026-09-25', wordLimit: 3000,
    description: 'Prototype documentation and usability evaluation. Attach your AI log before hand-in.', bank: PROTOTYPE, own: 'prototype', preset: 'standard', reviewed: 0.17,
    rubric: [rule('unchangedNoCheck'), rule('belowLevel'), rule('repeatsOutput'), rule('aiStyle'), custom('evidence', 'Claims checked against evidence', 'Facts or figures taken from the AI were checked against a reliable source.')] },
  { id: 'a-im399-pres', courseId: 'c-im399', title: 'Final presentation and demo', short: 'Presentation', dueDate: '2026-10-23', wordLimit: 0,
    description: 'A 10-minute presentation with a live demo. Attach any AI use for slides or scripts before hand-in.', bank: PRESENTATION, own: 'presentation', preset: 'lenient', reviewed: 0,
    stages: { handed_in: 0, logs_attached: 3 },
    rubric: [rule('unchangedNoCheck'), custom('framing', 'Accurate framing of the tool', 'AI-written text does not overclaim what the prototype does.')] },
  { id: 'a-bus201-essay', courseId: 'c-bus201', title: 'Essay 1: How is generative AI changing entry-level work in New Zealand?', short: 'Essay 1', dueDate: '2026-09-18', wordLimit: 1200,
    description: 'A 1200-word argumentative essay. AI use is permitted (Lane 2): attach your full AI conversation before you hand in.', bank: ESSAY, own: 'essay', preset: 'standard', reviewed: 0.45,
    rubric: [rule('unchangedNoCheck'), rule('belowLevel'), rule('repeatsOutput'), custom('purpose', 'Prompt is purposeful', 'The prompt asks for something specific to the essay rather than the whole answer.')] },
  { id: 'a-bus201-plan', courseId: 'c-bus201', title: 'Report 2: Digital marketing plan for a local business', short: 'Report 2', dueDate: '2026-10-09', wordLimit: 1500,
    description: 'A marketing plan for a real local business. Attach your AI conversation, then hand in the plan.', bank: MARKETING, own: 'marketing', preset: 'standard', reviewed: 0,
    stages: { handed_in: 5, logs_attached: 4 },
    rubric: [rule('unchangedNoCheck'), rule('genericCritique'), custom('local', 'Adapted to the local context', 'AI suggestions were adapted to the actual business and its customers.')] },
  { id: 'a-is222-a1', courseId: 'c-is222', title: 'Assignment 1: ER model for a clinic booking system', short: 'Assignment 1', dueDate: '2026-09-11', wordLimit: 800,
    description: 'ER diagram plus a short design rationale. Attach your AI log before hand-in.', bank: ERD, own: 'erd', preset: 'strict', reviewed: 0.75,
    rubric: [rule('unchangedNoCheck'), rule('belowLevel'), custom('verified', 'Design decision verified', 'The student tested or checked the AI design against the case study.')] },
  { id: 'a-is222-a2', courseId: 'c-is222', title: 'Assignment 2: SQL queries and normalisation', short: 'Assignment 2', dueDate: '2026-10-02', wordLimit: 0,
    description: 'Ten SQL queries and a normalisation exercise. Attach your AI log before hand-in.', bank: SQL, own: 'sql', preset: 'standard', reviewed: 0,
    stages: { handed_in: 9, logs_attached: 2 },
    rubric: [rule('unchangedNoCheck'), rule('shortCritique'), custom('tested', 'Query tested', 'AI-written SQL was run and checked before being used.')] }
];

/* ------------------------------------------------------------------ */
/* Dates (the demo data is written as if today is 1 October 2026)      */
/* ------------------------------------------------------------------ */
const TODAY = new Date('2026-10-01T12:00:00+13:00');
const HOUR = 3600 * 1000;
function iso(d) {
  const nz = new Date(d.getTime() + 13 * HOUR); // NZDT, fixed offset keeps the file stable
  return nz.toISOString().slice(0, 19) + '+13:00';
}

/* Pattern drift: most students behave the same way in every course,
 * but now and then a student does better or worse on one assignment. */
const DRIFT = { evaluator: 'verifier', verifier: 'evaluator', passive: 'restater', restater: 'passive', concise: 'evaluator', aistyle: 'aistyle', minimal: 'evaluator', none: 'none' };

function buildSubmission(a, def, entry, index) {
  const st = students.find((s) => s.id === entry.studentId);
  let pattern = st.pattern;
  if (pattern !== 'none' && rand() < 0.15) pattern = DRIFT[pattern];
  const id = a.id.replace(/^a-/, 's-') + '-' + st.id;
  const due = new Date(a.dueDate + 'T23:59:00+13:00');
  const open = due > TODAY;

  let stage = 'handed_in';
  if (open) {
    const s = def.stages;
    stage = index < s.handed_in ? 'handed_in' : index < s.handed_in + s.logs_attached ? 'logs_attached' : 'not_started';
  }

  const windowEnd = open ? new Date(Math.min(due.getTime(), TODAY.getTime()) - 6 * HOUR) : new Date(due.getTime() - 20 * HOUR);
  const windowStart = new Date(windowEnd.getTime() - 14 * 24 * HOUR);
  const bank = def.bank;
  const count = stage === 'not_started' || pattern === 'none' ? 0 : pattern === 'minimal' ? 1 : Math.min(bank.length, 3 + Math.floor(rand() * 3));
  const keys = pattern === 'minimal' ? [bank[0].key] : shuffle(bank.map((t) => t.key)).slice(0, count);
  const order = bank.map((t) => t.key);
  keys.sort((x, y) => order.indexOf(x) - order.indexOf(y));
  const tool = pick(['ChatGPT', 'ChatGPT', 'ChatGPT', 'Copilot', 'Gemini', 'Claude']);
  const unchangedAt = rand() < 0.5 ? Math.floor(rand() * Math.max(count, 1)) : -1;

  const span = windowEnd.getTime() - windowStart.getTime();
  const interactions = keys.map((key, k) => {
    const t = bank.find((x) => x.key === key);
    const r = reflect(t, pattern, k, unchangedAt);
    const at = new Date(windowStart.getTime() + span * ((k + rand() * 0.8) / Math.max(count, 1)));
    return {
      id: id + '-i' + (k + 1), step: k + 1, task: t.task, tool,
      prompt: t.prompt, output: t.output,
      critique: r.c, critiqueSource: r.c ? 'reflection' : 'none',
      pushback: !!r.push, pushbackText: r.push || '',
      decision: r.d, timestamp: iso(at)
    };
  });

  // Logs are attached first, then the work is handed in.
  let logsAttachedAt = null;
  let handedInAt = null;
  if (stage !== 'not_started') {
    const last = interactions.length ? new Date(interactions[interactions.length - 1].timestamp) : new Date(windowEnd.getTime() - 30 * HOUR);
    logsAttachedAt = new Date(last.getTime() + (1 + rand() * 8) * HOUR);
    if (stage === 'handed_in') {
      const limit = Math.min(due.getTime(), TODAY.getTime() - HOUR);
      handedInAt = new Date(Math.min(limit, logsAttachedAt.getTime() + (0.5 + rand() * 20) * HOUR));
      if (handedInAt <= logsAttachedAt) logsAttachedAt = new Date(handedInAt.getTime() - 2 * HOUR);
    }
  }

  // Final submission text from the pattern (only once handed in).
  let text = '';
  if (stage === 'handed_in') {
    const own = shuffle(OWN[def.own]);
    const used = interactions.filter((i) => i.decision === 'unchanged').map((i) => i.output);
    if (pattern === 'passive') text = interactions.map((i) => i.output).concat(own.slice(0, 1)).join(' ');
    else if (pattern === 'restater' || pattern === 'aistyle') text = used.concat(own.slice(0, 3)).join(' ');
    else if (pattern === 'none') text = own.slice(0, 4).join(' ');
    else {
      const keep = interactions.length && (pattern === 'evaluator' || pattern === 'minimal') ? [interactions[0].output.split(/(?<=\.)\s+/)[0]] : [];
      text = shuffle(own.slice(0, 4).concat(keep)).join(' ');
    }
  }

  const linked = rand() < 0.7;
  return {
    id, assignmentId: a.id, studentId: st.id, pattern, // pattern kept for tests only; never shown to markers
    stage, declaration: stage === 'not_started' ? null : pattern === 'none' ? 'no_ai' : 'ai_used',
    logsAttachedAt: logsAttachedAt ? iso(logsAttachedAt) : null,
    handedInAt: handedInAt ? iso(handedInAt) : null,
    sources: interactions.length ? [{ type: linked ? 'link' : 'pasted', tool, url: linked ? 'https://chatgpt.com/share/demo-' + st.upi + '-' + a.id.slice(2) : '', attachedAt: iso(logsAttachedAt) }] : [],
    interactions,
    submission: text,
    review: { status: 'not_reviewed', decision: null, comment: '', marks: {}, seconds: 0 }
  };
}

/** Simulates a teacher's own review: their rubric marks and overall decision. */
function simulateReview(sub, a, depth) {
  const e = Engine.evaluateStudent(sub, a.settings);
  const marks = {};
  const steps = depth === 'full' ? e.interactions : e.interactions.slice(0, 1);
  steps.forEach((i) => {
    marks[i.id] = {};
    a.rubric.forEach((c) => {
      const hit = c.type === 'rule' && i.result.flags.some((f) => f.key === c.ruleKey);
      marks[i.id][c.id] = { mark: hit ? 'flag' : 'approve', comment: hit && rand() < 0.3 ? 'Reflection does not show how this was checked.' : '' };
    });
  });
  const anyFlag = Object.values(marks).some((m) => Object.values(m).some((x) => x.mark === 'flag')) || e.patternFlags.length > 0;
  sub.review.marks = marks;
  sub.review.seconds = depth === 'full' ? 140 + Math.floor(rand() * 260) : 40 + Math.floor(rand() * 80);
  if (depth === 'full') {
    sub.review.status = 'reviewed';
    sub.review.decision = anyFlag && rand() < 0.7 ? 'flag' : 'approve';
    if (sub.review.decision === 'flag') sub.review.comment = pick(['Asked the student to explain how they checked the AI output.', 'Discussed in tutorial; student to resubmit reflection.', 'Raise at the moderation meeting.']);
  } else {
    sub.review.status = 'in_progress';
  }
}

const assignments = [];
const submissions = [];
ASSIGNMENTS.forEach((def) => {
  const course = COURSES.find((c) => c.id === def.courseId);
  const a = { id: def.id, courseId: def.courseId, title: def.title, short: def.short, description: def.description,
    dueDate: def.dueDate, wordLimit: def.wordLimit, lane: 2,
    settings: Engine.applyPreset(Engine.defaultSettings(), def.preset), rubric: def.rubric };
  const subs = course.roster.map((entry, k) => buildSubmission(a, def, entry, k));
  const handedIn = subs.filter((s) => s.stage === 'handed_in' && s.interactions.length);
  const nFull = Math.round(handedIn.length * def.reviewed);
  handedIn.forEach((s, k) => {
    if (k < nFull) simulateReview(s, a, 'full');
    else if (def.reviewed > 0 && k === nFull) simulateReview(s, a, 'partial');
  });
  if (def.reviewed === 1) subs.filter((s) => s.stage === 'handed_in' && !s.interactions.length).forEach((s) => { s.review.status = 'reviewed'; s.review.decision = 'approve'; s.review.seconds = 45; });
  assignments.push(a);
  submissions.push(...subs);
});

const seedData = {
  version: 3,
  generatedAt: '2026-10-01T09:00:00+13:00',
  teacher: { name: 'Mina Khoshmehr', first: 'Mina', initials: 'MK', role: 'Course administrator', email: 'mina.khoshmehr@example.ac.nz' },
  staff: [
    { name: 'Mina Khoshmehr', initials: 'MK', role: 'Course administrator', courses: ['c-im399', 'c-bus201', 'c-is222'] },
    { name: 'Dr. Harriet Cole', initials: 'HC', role: 'Course coordinator', courses: ['c-im399'] },
    { name: 'Tom Ruatapu', initials: 'TR', role: 'Marker', courses: ['c-bus201', 'c-is222'] }
  ],
  courses: COURSES,
  students: students.map(({ pattern, ...s }) => s),
  assignments,
  submissions
};

fs.writeFileSync(path.join(__dirname, 'seed.json'), JSON.stringify(seedData, null, 2));

// Browser copy, so the app still runs without the server (e.g. VS Code Live Server).
fs.writeFileSync(path.join(__dirname, '..', 'public', 'js', 'seed-data.js'),
  '/* Generated by data/generate-seed.js. Do not edit by hand. */\n' +
  'window.SEED_DATA = ' + JSON.stringify(seedData) + ';\n');

const n = (f) => submissions.filter(f).length;
console.log('Wrote data/seed.json: ' + COURSES.length + ' courses, ' + assignments.length + ' assignments, ' +
  students.length + ' students, ' + submissions.length + ' submissions (' + n((s) => s.stage === 'handed_in') + ' handed in, ' +
  n((s) => s.stage === 'logs_attached') + ' logs only, ' + n((s) => s.stage === 'not_started') + ' not started), ' +
  submissions.reduce((k, s) => k + s.interactions.length, 0) + ' interactions.');
