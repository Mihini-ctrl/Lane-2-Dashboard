/*
 * generate-seed.js — builds data/seed.json: a synthetic teacher with three
 * courses, ONE assignment per course, and nine to eleven students per course.
 *
 *   node data/generate-seed.js
 *
 * Every name, prompt, AI output, reflection, essay and report is invented.
 *
 *   INFOMGMT 399  Report 1: problem definition and stakeholders   (closed, marked)
 *   BUSINESS 201  Essay: electric cars in New Zealand             (OPEN, due 20 Nov)
 *   INFOSYS 222   Assignment 1: ER model and design rationale     (closed, mostly marked)
 *
 * Submissions are full-length (roughly 500-700 words): a title, an
 * introduction, five body paragraphs and a conclusion. Body paragraphs come
 * from the student's own writing, an AI reply used unchanged, or the
 * student's reworked version of an AI reply, depending on how that student
 * uses AI. Chats have four to six prompts.
 *
 * Students follow one of seven patterns so the rules have something to tell
 * apart: careful verifiers, evaluators, concise-but-specific writers,
 * passive acceptors, restaters, AI-style reflections and a minimal logger.
 *
 * Noah Taylor's essay and chat are written by hand (a raw ChatGPT
 * copy-and-paste). Sofia Reyes, the demo student account, has NOT handed in
 * the essay: she does that live in a demo, using the files in demo/.
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
/* Task banks: what students asked, what the AI said, and how a        */
/* student who engaged with it reworked it.                            */
/*   output  the AI's reply (used as is by students who copy)          */
/*   edited  the student's reworked paragraph (used when "changed")    */
/*   good / issue / check / fix / short  raw material for reflections  */
/*   reject  careful students drop this output ("not used")            */
/* ------------------------------------------------------------------ */

// BUSINESS 201 Essay: Are electric cars the right path for New Zealand?
const EV = [
  { key: 'arguments', task: 'Brainstorm arguments',
    prompt: `What are the main arguments for and against electric cars in New Zealand? I need them for an 800 word essay.`,
    output: `Electric cars suit New Zealand in several ways. Most of the country's electricity comes from renewable sources, so charging produces far fewer emissions than in countries that burn coal. Running costs are lower than petrol, and the country would depend less on imported fuel, which matters because New Zealand now imports all of its refined fuel. Against this, new electric cars cost more upfront, charging is patchy outside the main centres, and electric cars have paid road user charges since April 2024, which narrows the gap with petrol. Batteries also raise questions about mining and recycling.`,
    edited: `There are good reasons to think electric cars fit New Zealand better than most countries. Because most of our electricity is renewable, an EV charged here is genuinely cleaner, and every litre of petrol we avoid is a litre we no longer have to import now that Marsden Point has closed. The case is not one-sided, though. A new EV still costs thousands more than a petrol hatchback, and most of the EVs people can actually afford are second-hand imports from Japan with ageing batteries, which the usual arguments tend to ignore.`,
    good: 'The list covers the main points', issue: 'it does not mention that most EVs here are second-hand imports, which matters for cost',
    check: 'the Ministry of Transport fleet statistics', fix: 'added a point about second-hand imported EVs',
    short: 'Missed used imports; checked MoT fleet stats, added point.' },
  { key: 'renewable', task: 'Draft the renewable electricity paragraph',
    prompt: `Write a paragraph about why New Zealand's renewable electricity makes EVs a good fit.`,
    output: `One of the strongest arguments for electric vehicles in New Zealand is the country's largely renewable electricity supply. Around 85 percent of New Zealand's electricity comes from renewable sources such as hydro, geothermal and wind, which means that charging an electric car here produces far fewer emissions than in countries that rely on coal or gas. Because transport is one of the largest sources of New Zealand's domestic emissions, shifting the vehicle fleet to electric power is one of the most direct ways the country can meet its climate targets.`,
    edited: `New Zealand's electricity mix is the strongest part of the case. In a normal year roughly 85 percent of our power is renewable, mostly hydro and geothermal, so the emissions from charging an EV are a fraction of those from burning petrol. The figure is not fixed, however. In a dry year, when the southern lakes are low, more power comes from the coal and gas units at Huntly, and EVs become less clean than the headline number suggests. Even then, transport is such a large share of our emissions that electrifying cars is still one of the most direct cuts available.`,
    good: 'The paragraph is clear', issue: 'it ignores dry years, when more coal is burned at Huntly',
    check: 'the MBIE energy statistics', fix: 'added a sentence about dry years and Huntly',
    short: 'Ignored dry years; checked MBIE stats, added Huntly.' },
  { key: 'cost', task: 'Explain the cost of owning an EV',
    prompt: `Is it actually cheaper to own an electric car in NZ? Include road user charges.`,
    output: `The cost of owning an electric car in New Zealand depends on how far you drive. Electric cars are more expensive to buy, but charging at home costs much less per kilometre than petrol, and servicing is cheaper because there are fewer moving parts. Since 1 April 2024, light electric vehicles have paid road user charges of $76 per 1,000 km, which reduces but does not remove the running-cost advantage. For high-mileage drivers, the total cost of ownership is usually lower than for a comparable petrol car.`,
    edited: `Whether an EV saves money depends on the driver. Charging overnight at home costs a few dollars for the same distance a tank of petrol would cover, and there are fewer parts to service. Road user charges of $76 per 1,000 km since April 2024 have eaten into that saving, and the Clean Car Discount that used to cut the purchase price ended in December 2023. For a commuter driving 15,000 km a year the running costs still come out ahead, but for someone who barely drives, the higher purchase price may never pay for itself.`,
    good: 'The cost comparison is useful', issue: 'it does not mention that the Clean Car Discount has ended',
    check: 'the NZTA road user charges page', fix: 'added the end of the Clean Car Discount and a worked example',
    short: 'Missed CCD ending; checked NZTA, added example.' },
  { key: 'charging', task: 'Explain charging gaps in the regions',
    prompt: `Explain the problems with EV charging in rural New Zealand.`,
    output: `Despite these benefits, charging infrastructure remains a significant barrier to widespread EV adoption in New Zealand. While major cities such as Auckland, Wellington and Christchurch have a growing network of fast chargers, many rural areas and smaller towns have only limited options. This makes long-distance travel more difficult and contributes to range anxiety, the fear of running out of charge before reaching a charger. For rural New Zealanders, who often travel long distances for work and everyday tasks, this is a real concern.`,
    edited: `Charging is where the picture changes between town and country. Fast chargers are now common in the main cities, but many rural districts have one or two, and a single broken charger can strand a queue of cars on a holiday weekend. Rural households also drive longer distances, often towing, which is exactly where current EVs are weakest. Until the regional charging network is reliable, it is unrealistic to expect farming communities to switch at the same pace as city commuters.`,
    good: 'The point about rural towns is right', issue: 'it has no specifics and ignores towing',
    check: 'the EECA public charger map for my region', fix: 'added the point about towing and broken chargers',
    short: 'Too general; checked EECA map, added towing.' },
  { key: 'counter', task: 'Find a counter-argument',
    prompt: `Give me a strong counter-argument to "EVs are the right path for NZ".`,
    output: `A strong counter-argument is that electric cars do not solve congestion or the wider problems of car dependency. Replacing petrol cars with electric ones still leaves cities designed around private vehicles, and the manufacturing of batteries has its own environmental costs. Investment in public transport, walking and cycling could reduce emissions faster and more fairly, because it benefits people who cannot afford a new car. From this perspective, electric cars should be one part of a wider transport strategy rather than the main path.`,
    edited: `The strongest objection is that swapping petrol cars for electric ones keeps us dependent on cars. An EV still sits in the same Auckland traffic, still needs a park, and is still out of reach for many households. Money spent subsidising EVs could instead buy more frequent buses and safer cycleways, which cut emissions for everyone, not only for people who can afford a new car. I think this objection is right about fairness, but it does not make EVs the wrong path; it means they cannot be the only one.`,
    good: 'The counter-argument is strong', issue: 'it is written as if public transport works the same in rural areas',
    check: 'Auckland Transport patronage figures', fix: 'limited the point to cities and answered it',
    short: 'Ignores rural; checked AT figures, answered it.' },
  { key: 'conclusion', task: 'Write a conclusion',
    prompt: `Can you write a conclusion for my essay?`,
    output: `In conclusion, electric vehicles represent a promising path forward for New Zealand. With its abundant renewable energy, the country is uniquely positioned to benefit from the transition to electric transport. However, challenges such as cost and charging infrastructure must be addressed to ensure that all New Zealanders can share in the benefits. With the right policies and investment, electric cars can play a crucial role in building a sustainable future for Aotearoa.`,
    edited: `Electric cars are the right long-term path for New Zealand, but only as part of a wider plan. Our renewable electricity gives EVs an advantage few countries have, and the running costs already suit commuters. What holds the change back is the upfront price and the gaps in regional charging, and both of those are policy choices, not technical limits.`,
    good: 'It summarises the essay', issue: 'it is generic and adds nothing that is not already in the essay',
    check: 'the marking rubric for the conclusion', fix: 'did not use it and wrote my own',
    short: 'Generic; checked rubric, wrote my own.', reject: true }
];

// INFOMGMT 399 Report 1: problem definition and stakeholder analysis (the capstone project is Trace itself).
const STAKEHOLDER = [
  { key: 'problem', task: 'Write the problem statement',
    prompt: `Write a problem statement for a capstone project: a dashboard that shows teachers how students used AI in Lane 2 assignments.`,
    output: `Teachers increasingly allow students to use generative AI in assessments, but they have little visibility into how that AI was used. Reviewing full chat logs is time-consuming, and without a structured view it is difficult to tell whether a student engaged critically with the AI or simply copied its output. This project aims to design a dashboard that summarises student-AI interactions, highlights where AI output appears in submissions, and supports fair, consistent judgements about the quality of AI use.`,
    edited: `Under the university's two-lane approach, Lane 2 assessments allow students to use AI, but markers are still expected to judge the student's own thinking. In practice markers receive long chat logs they do not have time to read, so most AI use goes unexamined. Our client estimates that reading logs properly adds fifteen to twenty minutes per script. The problem we are solving is not detecting AI, which Lane 2 already permits, but making it quick for a marker to see where a student relied on AI and where they questioned it.`,
    good: 'The statement is clear', issue: 'it does not connect to the two-lane policy or the time cost our client described',
    check: 'our client interview notes', fix: 'added the Lane 2 context and the time estimate',
    short: 'Missing Lane 2 context; checked notes, added it.' },
  { key: 'stakeholders', task: 'Identify the stakeholders',
    prompt: `Who are the stakeholders for this AI assessment dashboard and what does each need?`,
    output: `The key stakeholders are students, instructors, administrators and IT support. Students need a simple way to submit their AI logs and want to be treated fairly. Instructors need efficient monitoring of every AI interaction and clear indicators of concern. Administrators need reporting across courses to ensure policy compliance, and IT support needs a secure system that integrates with existing tools such as the learning management system.`,
    edited: `We identified five stakeholder groups. Students need hand-in to be simple and, above all, need to trust that a flag is not an accusation. Markers and lecturers need to get through a class quickly and see why something was flagged. Course coordinators need consistency between markers. The university's privacy office is a stakeholder even though it will never open the dashboard, because it must approve any tool that stores student conversations. Finally, the Canvas support team decides whether the tool can be embedded in courses at all.`,
    good: 'The list is a useful start', issue: 'it misses the privacy office, which our client said must approve the tool',
    check: 'the client brief and the university privacy policy', fix: 'added the privacy office and coordinators',
    short: 'Missed privacy office; checked brief, added it.' },
  { key: 'risks', task: 'List the project risks',
    prompt: `What are the main risks of a tool that reads students' AI chat logs?`,
    output: `Risks include data privacy breaches, algorithmic bias, over-reliance on automated flags and unauthorised access to sensitive student information. Students may feel surveilled, which could discourage honest disclosure of AI use. There is also a risk that teachers treat automated indicators as evidence of misconduct. These risks can be mitigated with encryption, role-based access control, bias audits and clear communication that flags are prompts for human review.`,
    edited: `The most serious risk is a false positive. If a student who used AI well is flagged and feels accused, trust in the whole Lane 2 system suffers, so every indicator in our design is framed as a reason to look closer, never as a finding. The second risk is that students stop pasting honest logs if they feel watched. Privacy is the third: chat logs can contain personal details, so access must be limited to the student's own markers and logs deleted at the end of the course.`,
    good: 'The risks are relevant', issue: 'it treats them all as equal and does not say which matters most',
    check: 'the university guidance on academic integrity', fix: 'ranked the risks and explained why false positives come first',
    short: 'Unranked; checked integrity guidance, ranked them.' },
  { key: 'scope', task: 'Narrow the scope',
    prompt: `Help me narrow the scope of this project so it fits one semester.`,
    output: `To fit a single semester, focus on a minimum viable product: a teacher dashboard for one course, support for one AI tool's chat format, a small set of rule-based indicators, and a basic review workflow. Integration with the learning management system, multi-course reporting and advanced analytics can be described as future work. This keeps the project achievable while still demonstrating the core value of the system.`,
    edited: `To finish in one semester we limited the scope to one course and one assignment type, essays and reports, with logs pasted as text rather than imported from each AI tool. Canvas integration is designed but not built. We kept the rubric marking in scope because our client said it was the part markers would actually use, and we dropped cross-course analytics, which nobody we interviewed asked for.`,
    good: 'The MVP idea is helpful', issue: 'it suggests one AI tool, but students use several',
    check: 'a quick survey of our tutorial', fix: 'scoped to pasted text so any tool works',
    short: 'One tool too narrow; surveyed class, used paste.' },
  { key: 'objective', task: 'Improve the project objective',
    prompt: `Improve this project objective without changing its scope: "make a dashboard so teachers can see AI use".`,
    output: `Design, build and evaluate an auditable web platform that transforms student-AI interaction histories into concise evidence, supports rubric-based marking of AI use, and integrates with the learning management system, so that teachers can make fair and consistent judgements about Lane 2 assessments in less time.`,
    edited: `Our objective is to build and test a web tool that lets a marker see, in under five minutes per script, where a student used AI and how critically they engaged with it, and record a rubric-based judgement that another marker could check.`,
    good: 'The wording is professional', issue: 'it adds LMS integration, which is outside our scope',
    check: 'our scope section', fix: 'removed LMS integration and added a measurable target',
    short: 'Added out-of-scope LMS; checked scope, fixed it.' }
];

// INFOSYS 222 Assignment 1: ER model for a GP clinic booking system, with a written design rationale.
const ERD = [
  { key: 'entities', task: 'Identify the entities',
    prompt: `What entities do I need for an ER model of a GP clinic booking system?`,
    output: `A GP clinic booking system typically needs the following entities: Patient, Doctor, Appointment, Room, Prescription, Medicine, Pharmacy, Insurance and Payment. Each entity represents a distinct real-world object or event that the clinic needs to store information about. Patient and Doctor are the core entities, while Appointment links them together at a specific time and place.`,
    edited: `The case study describes booking, not billing or dispensing, so I kept the model to five entities: Patient, Doctor, Appointment, Room and Clinic. The AI suggested Pharmacy, Insurance and Payment as well, but nothing in the brief needs them stored, and adding them would make the model harder to check without answering any of the required queries. Patient and Doctor are the core entities, and Appointment is the event that connects them at a time and in a room.`,
    good: 'Patient, Doctor and Appointment are right', issue: 'it adds entities like Pharmacy and Insurance that the case study does not need',
    check: 'the case study brief', fix: 'cut the model to five entities',
    short: 'Too many entities; checked brief, cut to five.' },
  { key: 'relationships', task: 'Work out the relationships',
    prompt: `What are the relationships and cardinalities between Patient, Doctor and Appointment?`,
    output: `A Patient can have many Appointments, and each Appointment belongs to exactly one Patient (one-to-many). A Doctor can have many Appointments, and each Appointment is with exactly one Doctor (one-to-many). Through Appointment, there is a many-to-many relationship between Patient and Doctor. Each Appointment is also held in one Room, and a Room can host many Appointments.`,
    edited: `Each appointment is for one patient with one doctor in one room, and patients, doctors and rooms each have many appointments over time, so Appointment sits between them as the associative entity that resolves the many-to-many link between Patient and Doctor. I made Room optional on Appointment because the brief says phone consultations are booked without a room, which the generic answer missed.`,
    good: 'The cardinalities are correct', issue: 'it assumes every appointment has a room, but phone consultations do not',
    check: 'the case study section on phone consultations', fix: 'made Room optional on Appointment',
    short: 'Room not always needed; checked brief, made optional.' },
  { key: 'keys', task: 'Choose keys and attributes',
    prompt: `Suggest primary keys and attributes for the Appointment entity.`,
    output: `Appointment could use AppointmentID as its primary key, with attributes AppointmentDate, StartTime, Duration, Reason, Status, PatientID (foreign key), DoctorID (foreign key) and RoomID (foreign key). Alternatively, a composite key of PatientID, DoctorID, AppointmentDate and StartTime could be used, but a surrogate key is simpler.`,
    edited: `Appointment uses a surrogate key, AppointmentID, because a natural composite key would have to include the doctor, date and start time, and changing a booking would then change the key. Its attributes are the date, start time, duration, status and reason, plus foreign keys to Patient, Doctor and, optionally, Room. I added a unique constraint on DoctorID, date and start time so the database itself prevents double-booking a doctor, which the suggested design did not enforce.`,
    good: 'The surrogate key makes sense', issue: 'nothing stops a doctor being double-booked',
    check: 'by testing two inserts in Oracle', fix: 'added a unique constraint on doctor, date and time',
    short: 'Allowed double-booking; tested inserts, added constraint.' },
  { key: 'normalise', task: 'Check normalisation',
    prompt: `Is this table in 3NF? Booking(BookingID, PatientName, PatientPhone, DoctorName, DoctorRoom, Date)`,
    output: `The table is not in third normal form. PatientPhone depends on PatientName rather than on the key, and DoctorRoom depends on DoctorName, which creates transitive dependencies. To reach 3NF, split it into Patient(PatientID, Name, Phone), Doctor(DoctorID, Name, Room) and Booking(BookingID, PatientID, DoctorID, Date).`,
    edited: `The original Booking table is in second normal form but not third, because the patient's phone depends on the patient and the doctor's room depends on the doctor, not on the booking. Splitting out Patient and Doctor removes those transitive dependencies. I did not put Room on Doctor, as suggested, because doctors in this clinic move between rooms during the week; room belongs on the appointment instead.`,
    good: 'The 3NF reasoning is right', issue: 'putting Room on Doctor is wrong for this clinic',
    check: 'the clinic timetable in the case study', fix: 'kept Room on Appointment',
    short: 'Room on Doctor wrong; checked timetable, moved it.' },
  { key: 'rationale', task: 'Draft the design rationale',
    prompt: `Write a short design rationale for my ER model.`,
    output: `This ER model was designed to accurately represent the core operations of a GP clinic booking system. The entities were chosen to capture all relevant information, and relationships were defined to reflect real-world interactions between patients, doctors and appointments. The model is normalised to third normal form to reduce redundancy and ensure data integrity, making it scalable and easy to maintain.`,
    edited: `The model is deliberately small. Every entity answers at least one of the queries in the brief, and anything that did not was left out. The main design decisions were to treat Appointment as the associative entity, to make Room optional for phone consultations, and to enforce the no-double-booking rule in the database rather than trusting the booking screen.`,
    good: 'It reads well', issue: 'it is generic and could describe any ER model',
    check: 'the assignment rubric', fix: 'did not use it and wrote my own about my actual decisions',
    short: 'Generic; checked rubric, wrote my own.', reject: true }
];

/* The student's own writing: titles, introductions, body paragraphs and conclusions. */
const OWN = {
  ev: {
    title: 'Are electric cars the right path for New Zealand?',
    intro: [
      `New Zealand has set itself a target of net zero emissions by 2050, and transport is one of the hardest parts of that goal. Electric cars are often presented as the obvious answer. In this essay I argue that they are the right long-term path for New Zealand, but that the switch will only be fair and fast enough if the government deals with upfront cost and regional charging rather than leaving it to individual buyers.`,
      `When my family replaced our old Corolla last year, we spent weeks arguing about whether to buy an electric car. That argument is happening in households all over the country. This essay argues that electric cars are the right path for New Zealand because of our renewable electricity, but that the benefits are uneven, and that the transition needs public investment to reach people outside the main cities.`,
      `Few countries are as well placed as New Zealand to benefit from electric cars, and yet EVs still make up a small share of the vehicles on our roads. This essay asks whether they are the right path for the country. I argue that they are, but only as part of a wider transport plan that also takes cost, fairness and rural needs seriously.`
    ],
    body: [
      `Fairness is the issue that most discussions skip. The households that spend the largest share of their income on petrol are often the ones least able to buy any car new, let alone an EV. Most EVs on our roads are second-hand imports from Japan, which brings prices down but also means older batteries with less range. A policy that only rewards people buying new cars therefore helps the people who need help least.`,
      `Electricity supply is another question. If a large share of the fleet charges at the same time in the evening, the grid has to meet a new peak. Smart charging, where cars charge overnight when demand is low, avoids most of that problem, and the lines companies are already offering cheaper night rates. With sensible pricing, the extra demand from EVs looks manageable rather than a reason to slow down.`,
      `Batteries are often raised as an environmental objection. Mining lithium and cobalt does cause real damage, and New Zealand has no large-scale battery recycling yet. However, the lifetime emissions of an EV charged on our grid are still far lower than those of a petrol car, and a recycling scheme could be required as part of importing EVs. The objection is a reason to regulate the supply chain, not to avoid EVs.`,
      `Businesses matter as much as households. Vans and utes do far more kilometres than private cars, so converting delivery and trade fleets would cut emissions quickly. Several New Zealand courier firms already run electric vans in Auckland, which shows the technology works for urban routes. Heavy and rural vehicles are harder, and for them hydrogen or biofuels may play a bigger part.`,
      `Fuel security is a quieter argument but an important one. Since the Marsden Point refinery closed in 2022, every litre of petrol and diesel New Zealand uses is imported as a finished product, and supply depends on shipping routes we do not control. Electricity, by contrast, is generated here. Each car that switches to electric reduces how exposed households are to a fuel shock, which is a benefit even for people who are not motivated by emissions.`
    ],
    conclusion: [
      `Overall, electric cars are the right path for New Zealand because our renewable electricity makes them genuinely cleaner here than almost anywhere else. The barriers are price and charging, especially outside the cities. If the government targets help at second-hand EVs and regional chargers, the change can be both faster and fairer.`,
      `In my view the evidence points one way: New Zealand should keep moving to electric cars, but it should not pretend they solve everything. Public transport, walking and cycling, and support for rural drivers all need to sit alongside them. EVs are the right path, as long as they are not the only one.`,
      `Electric cars make more sense in New Zealand than in most countries, and the running-cost and emissions case is already strong. What is missing is a plan for the people who cannot easily switch. Fixing that is a policy choice, and it is the difference between a transition that works and one that leaves the regions behind.`
    ]
  },
  im399: {
    title: 'Report 1: Problem definition and stakeholder analysis',
    intro: [
      `This report defines the problem our capstone team is addressing and analyses the people it affects. Our client, a teaching and learning team at the university, asked for a tool that helps markers understand how students used AI in Lane 2 assessments. The report sets out the problem, identifies the stakeholders and their needs, and explains the risks that shaped our early design decisions.`,
      `Generative AI is now permitted in many university assessments, but the processes for marking that work have not caught up. Our capstone project, Trace, is a dashboard for markers of Lane 2 assignments. This report defines the problem Trace addresses, the stakeholders involved, and the scope we agreed with our client for this semester.`
    ],
    body: [
      `We gathered requirements through two interviews with our client and a short survey of six markers. The clearest finding was that markers do not want an AI detector. They want to see the student's process quickly and record a judgement they can defend if a student asks. This shaped our decision to present evidence and let the marker decide, rather than produce a single score.`,
      `A key design principle is that the student's work and the student's AI use are marked separately. Markers told us they worry that seeing an AI report first would bias their judgement of the content. Our design therefore shows the submission on its own first, with the AI evaluation available only when the marker turns it on.`,
      `Our success measures follow from the problem. We will test whether markers can review a script in under five minutes, whether two markers reach similar judgements on the same script, and whether students in a pilot feel the process is fair. These measures will be reported in Report 2 after usability testing.`,
      `Te Tiriti o Waitangi obligations and Maori data sovereignty were raised by our client early on. Chat logs may contain personal or cultural information, so we will follow the university's data guidance, store logs only for the duration of the course, and consult the university's Maori data advisor before any pilot with real students.`,
      `Existing tools do not solve this problem. AI detectors give a probability that text was machine-written, which is irrelevant when AI use is allowed and unreliable enough that the university advises against relying on them. Canvas lets students attach files but offers no way to connect a chat log to the submission it produced. Our tool sits in that gap: it assumes AI was used and asks how well.`,
      `Our team is split across the work so that each stakeholder group has an owner. Two of us lead the marker experience, one leads the student hand-in, and one is responsible for privacy and the conversation with the university's data team. We meet our client every fortnight, and each meeting starts by checking the stakeholder needs in this report against what we have built so far.`
    ],
    conclusion: [
      `In summary, the problem is not that students use AI, which Lane 2 permits, but that markers cannot see how it was used without spending far more time than they have. Our stakeholders want speed, fairness and privacy in roughly that order, and our scope reflects those priorities.`,
      `This report has defined a clear, bounded problem and the stakeholders who shape it. The next stage is to turn these needs into a prototype and test it with markers, which Report 2 will cover.`
    ]
  },
  is222: {
    title: 'Assignment 1: ER model for a clinic booking system',
    intro: [
      `This assignment presents an entity relationship model for the Ponsonby GP clinic booking system described in the case study, together with the reasoning behind its design. The model needs to support booking, rescheduling and cancelling appointments, and the reports listed in the brief. I explain the entities, relationships, keys and constraints, and the decisions where I departed from the obvious design.`,
      `The clinic in the case study currently books appointments on paper, which leads to double-bookings and lost records. This report describes the ER model I designed for a replacement booking system and justifies the main design decisions against the requirements in the brief.`
    ],
    body: [
      `The clinic has three doctors who also do phone consultations, and the brief asks for a weekly report of each doctor's workload. Because the report counts appointments per doctor per week, Appointment needs its date and duration stored as separate attributes rather than a single free-text slot, so the totals can be calculated directly.`,
      `I tested the model by writing the five queries in the brief against sample data in Oracle. All five ran without needing extra joins or derived tables, which suggests the model fits the requirements. One query, finding patients who have not visited in two years, needed an index on the appointment date to run quickly.`,
      `Cancellations are recorded with a status attribute instead of deleting rows. The clinic manager said in the case study that she wants to see how many appointments are missed or cancelled each month, which would be impossible if cancelled bookings were removed from the table.`,
      `One limitation is that the model does not store doctors' working hours, so the database cannot stop a booking outside a doctor's shift. I chose to leave this to the booking screen because the hours change every week, but it would be a sensible extension if the clinic grows.`,
      `Patients are identified by their National Health Index number as well as an internal PatientID. I kept the surrogate key as the primary key because some walk-in patients, such as tourists, do not have an NHI number, but I added a unique constraint on NHI so the same New Zealand patient cannot be registered twice. This matches the case study's complaint that the paper system often held duplicate records for one person.`,
      `Privacy shaped several decisions. The brief notes that reception staff should see a patient's contact details but not the reason for an appointment, so the reason is stored on Appointment rather than on Patient, where a view for reception can leave it out. Storing it this way also means each visit keeps its own reason instead of being overwritten by the latest one.`,
      `Naming follows one convention throughout: singular entity names, attributes in PascalCase, and foreign keys named after the entity they point to, such as DoctorID. This sounds minor, but when I first sketched the model by hand I had used three different names for the same doctor key, which made the relationships hard to check. A consistent convention made errors much easier to spot when testing.`
    ],
    conclusion: [
      `The final model is small but complete for the brief. It supports every required query, prevents double-booking in the database itself, and keeps cancelled appointments for reporting.`,
      `Overall, the design favours a model that can be checked against the brief over one that tries to cover every possible clinic. The main decisions, an associative Appointment entity, an optional Room and a double-booking constraint, each come directly from the case study.`
    ]
  }
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
  switch (pattern) {
    case 'verifier': return { c: t.good + ', but ' + t.issue + '. I checked ' + t.check + ' and ' + t.fix + '.', d: t.reject ? 'not_used' : 'changed', push: t.push || '' };
    case 'evaluator':
    case 'minimal':
      if (k === unchangedAt && !t.reject) return { c: t.good + ' and accurate as far as I can tell, so I used it as it was.', d: 'unchanged' };
      return { c: t.good + ', but ' + t.issue + ', so I ' + t.fix.replace(/^did not use it and /, 'dropped it and ') + '.', d: t.reject ? 'not_used' : 'changed' };
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

// Index 22 is Sofia Reyes, the demo student account: she takes all three courses.
// Index 15 is Noah Taylor, whose BUSINESS 201 essay is written by hand.
// In BUSINESS 201 the roster order matters: the first 8 have handed in, the next
// 2 have attached a log only, Noah has handed in and Sofia has not started.
const ROSTERS = {
  'c-im399': [20, 21, 22, 23, 24, 2, 9, 13, 14, 15],
  'c-bus201': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 15, 22],
  'c-is222': [25, 26, 27, 28, 29, 18, 1, 22, 13, 6]
};
COURSES.forEach((c) => {
  c.roster = ROSTERS[c.id].map((idx, k) => ({ studentId: students[idx].id, group: k % 2 === 0 ? 'Tutorial A' : 'Tutorial B' }));
});

/* ------------------------------------------------------------------ */
/* Assignments: one per course                                         */
/* ------------------------------------------------------------------ */
const rule = (ruleKey) => ({ id: 'cr-' + ruleKey, type: 'rule', ruleKey });
const custom = (id, name, description) => ({ id: 'cr-' + id, type: 'custom', name, description });
const crit = (key, name, points, description, excellent, good, okay, notGood) =>
  ({ key, name, points, description, levels: { excellent, good, okay, not_good: notGood } });

// The grading rubric written for the electric cars essay (the work itself, not the AI use).
const EV_GRADING = [
  crit('position', 'Position and argument', 25, 'Answers the question with a clear position and argues it throughout.',
    'A clear, nuanced position on whether EVs are the right path, argued consistently from introduction to conclusion.',
    'A clear position, mostly argued well, with a few points that do not connect back to it.',
    'A position is stated but the essay mostly describes EVs rather than arguing.',
    'No clear position, or the conclusion contradicts the body.'),
  crit('evidence', 'New Zealand evidence', 25, 'Supports claims with specific, accurate New Zealand evidence.',
    'Specific and accurate NZ evidence (electricity mix, road user charges, fleet or charger data) for every key claim, with sources.',
    'Relevant NZ evidence for most claims, with minor gaps or one inaccuracy.',
    'Mostly general claims; NZ evidence is thin, dated or unsourced.',
    'Little or no evidence, or key facts are wrong (e.g. the Clean Car Discount still applying).'),
  crit('tradeoffs', 'Trade-offs and counter-arguments', 20, 'Weighs costs, fairness and regional differences, and answers objections.',
    'Weighs cost, fairness and rural versus urban needs, and answers at least one strong counter-argument.',
    'Recognises the main trade-offs and mentions a counter-argument without fully answering it.',
    'Trade-offs are listed but not weighed.',
    'One-sided; no counter-arguments.'),
  crit('structure', 'Structure', 15, 'Introduction, paragraphs and conclusion build the argument in order.',
    'Each paragraph makes one point that builds on the last; the conclusion follows from the body.',
    'Logical overall, with a few weak links between paragraphs.',
    'Hard to follow in places; paragraphs mix several points.',
    'No clear structure.'),
  crit('writing', 'Writing and referencing', 15, 'Clear, accurate academic writing within the word limit, referenced in APA 7.',
    'Clear, concise and error-free, within 800 words, with correct APA 7 referencing.',
    'Clear, with minor errors or small referencing slips.',
    'Errors sometimes get in the way of meaning; referencing is inconsistent.',
    'Frequent errors, well over the word limit, or no referencing.')
];
const gradingFrom = (list, prefix) => list.map((c) => ({ id: prefix + '-' + c.key, name: c.name, points: c.points, description: c.description, levels: Object.assign({}, c.levels) }));

// `stages` = how many students have handed in / have a log only, for open assignments (in roster order)
const ASSIGNMENTS = [
  { id: 'a-im399-r1', courseId: 'c-im399', title: 'Report 1: Problem definition and stakeholder analysis', short: 'Report 1', dueDate: '2026-08-21', wordLimit: 2000,
    description: 'Individual report defining your capstone problem, scope and stakeholders. AI use is permitted (Lane 2): paste your full AI conversation when you hand in.',
    bank: STAKEHOLDER, own: 'im399', bodyCount: 6, preset: 'standard', reviewed: 1,
    grading: Engine.markingFromTemplate('report', 'mc-im399-r1'),
    rubric: [rule('unchangedNoCheck'), rule('belowLevel'), rule('shortCritique'), custom('evidence', 'Claims checked against evidence', 'Facts the AI gave were checked against the client brief or another source.')] },
  { id: 'a-bus201-ev', courseId: 'c-bus201', title: 'Essay: Are electric cars the right path for New Zealand?', short: 'EV essay', dueDate: '2026-11-20', wordLimit: 800,
    description: 'An 800-word argumentative essay. Take a position, support it with New Zealand evidence and answer at least one counter-argument. AI use is permitted (Lane 2): upload your essay as a PDF or Word file and paste your full AI conversation when you hand in.',
    bank: EV, own: 'ev', preset: 'standard', reviewed: 0.25,
    stages: { handed_in: 8, logs_attached: 2 },
    grading: gradingFrom(EV_GRADING, 'mc-bus201-ev'),
    rubric: [rule('unchangedNoCheck'), rule('repeatsOutput'), rule('belowLevel'), custom('nzevidence', 'AI facts checked against NZ sources', 'Figures the AI gave (prices, charges, electricity mix) were checked against a New Zealand source.')] },
  { id: 'a-is222-a1', courseId: 'c-is222', title: 'Assignment 1: ER model for a clinic booking system', short: 'Assignment 1', dueDate: '2026-09-11', wordLimit: 800,
    description: 'An ER model for the clinic case study plus a written design rationale. AI use is permitted (Lane 2): paste your AI conversation when you hand in.',
    bank: ERD, own: 'is222', bodyCount: 7, preset: 'strict', reviewed: 0.75,
    grading: Engine.markingFromTemplate('technical', 'mc-is222-a1'),
    rubric: [rule('unchangedNoCheck'), rule('belowLevel'), custom('verified', 'Design decision verified', 'The student tested or checked the AI design against the case study.')] }
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

/** Title, introduction, five body paragraphs and a conclusion, written in the student's pattern. */
function writeSubmission(def, interactions, pattern) {
  const own = OWN[def.own];
  const body = [];
  interactions.forEach((i) => {
    const t = def.bank.find((x) => x.task === i.task);
    if (t.key === 'conclusion' || t.key === 'rationale' || t.key === 'objective') return; // these replace the closing paragraph below
    if (i.decision === 'unchanged') body.push(t.output);
    else if (i.decision === 'changed') body.push(t.edited);
  });
  const extra = shuffle(own.body);
  while (body.length < (def.bodyCount || 5) && extra.length) body.push(extra.shift());
  // A closing paragraph: the AI's (copied or reworked) if the student used it, otherwise their own.
  const closer = interactions.find((i) => ['conclusion', 'rationale', 'objective'].includes(def.bank.find((x) => x.task === i.task).key) && i.decision !== 'not_used');
  const closeTask = closer && def.bank.find((x) => x.task === closer.task);
  const conclusion = closeTask ? (closer.decision === 'unchanged' ? closeTask.output : closeTask.edited) : pick(own.conclusion);
  const intro = pattern === 'passive' && interactions[0] ? def.bank.find((x) => x.task === interactions[0].task).output : pick(own.intro);
  const paras = [own.title, intro].concat(pattern === 'passive' && interactions[0] ? body.slice(1) : body).concat([conclusion]);
  return Array.from(new Set(paras)).join('\n\n');
}

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

  const windowEnd = open ? new Date(TODAY.getTime() - 30 * HOUR) : new Date(due.getTime() - 20 * HOUR);
  const windowStart = new Date(windowEnd.getTime() - 14 * 24 * HOUR);
  const bank = def.bank;
  const count = stage === 'not_started' || pattern === 'none' ? 0 : pattern === 'minimal' ? 1 : Math.min(bank.length, 4 + Math.floor(rand() * 3));
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

  const text = stage === 'handed_in' ? writeSubmission(def, interactions, pattern) : '';
  const linked = rand() < 0.7;
  return {
    id, assignmentId: a.id, studentId: st.id, pattern, // pattern kept for tests only; never shown to markers
    stage, declaration: stage === 'not_started' ? null : pattern === 'none' ? 'no_ai' : 'ai_used',
    logsAttachedAt: logsAttachedAt ? iso(logsAttachedAt) : null,
    handedInAt: handedInAt ? iso(handedInAt) : null,
    sources: interactions.length ? [{ type: linked ? 'link' : 'pasted', tool, url: linked ? 'https://chatgpt.com/share/demo-' + st.upi + '-' + a.id.slice(2) : '', attachedAt: iso(logsAttachedAt) }] : [],
    interactions,
    submission: text,
    review: { status: 'not_reviewed', decision: null, comment: '', marks: {}, seconds: 0, content: {}, feedback: '' }
  };
}

/** Grading-rubric marks a teacher might give, loosely following how much of the work is the student's own. */
const GRADE_BY_PATTERN = {
  verifier: ['excellent', 'excellent', 'good'], evaluator: ['good', 'good', 'excellent', 'okay'], concise: ['good', 'okay', 'good'],
  minimal: ['good', 'okay'], passive: ['okay', 'not_good', 'okay'], restater: ['okay', 'good', 'not_good'], aistyle: ['okay', 'not_good', 'good'], none: ['good', 'excellent', 'okay']
};
const FEEDBACK = {
  high: 'A well-argued piece that clearly reflects your own thinking. Keep checking every figure against a source.',
  mid: 'Solid work with a clear structure. The argument would be stronger with more specific evidence in the middle paragraphs.',
  low: 'Parts of this read like general AI text rather than your own argument. Focus on answering the question with specific evidence.'
};
function simulateGrading(sub, a) {
  const levels = GRADE_BY_PATTERN[sub.pattern] || GRADE_BY_PATTERN.evaluator;
  // A level, then a score somewhere inside its range (teachers rarely give the exact top of a band).
  a.marking.forEach((c) => {
    const level = pick(levels);
    const [lo, hi] = Engine.levelRanges(c.points, a.markingBands)[level];
    const score = Math.round((lo + rand() * (hi - lo)) * 2) / 2;
    sub.review.content[c.id] = { level: Engine.levelForScore(score, c.points, a.markingBands), score };
  });
  const pct = Engine.contentScore(a.marking, sub.review.content, a.markingBands).pct;
  sub.review.feedback = pct >= 0.8 ? FEEDBACK.high : pct >= 0.6 ? FEEDBACK.mid : FEEDBACK.low;
  sub.review.contentSavedAt = sub.handedInAt;
}

/** Simulates a teacher's own review: AI-use rubric marks and an overall decision. */
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
    simulateGrading(sub, a);
  } else {
    sub.review.status = 'in_progress';
  }
}

/* ------------------------------------------------------------------ */
/* Noah Taylor: a realistic ChatGPT copy-and-paste and his essay       */
/* ------------------------------------------------------------------ */
// Copied with Ctrl+A / Ctrl+C, so the page clutter (sidebar, footer) is included.
// The essay copies one AI paragraph, reworks two others, drops the AI
// conclusion and is otherwise his own. The log is not split into steps, so
// AI evaluation does that.
const NOAH_EV_LOG = `Skip to content
Open sidebar
ChatGPT
New chat
Search chats
Library
Chats
EV essay help
Marketing plan ideas
excel vlookup not working
You said:
hey i need to write a 800 word essay for business 201, the question is "are electric cars the right path for new zealand". can u give me some arguments for and against
ChatGPT said:
Sure! Here are some key arguments you could use:

Arguments for electric cars in New Zealand

Renewable electricity: Around 85% of New Zealand's electricity comes from renewable sources like hydro, geothermal and wind, so EVs here are much cleaner than in coal-heavy countries.
Lower running costs: Charging at home is far cheaper per kilometre than petrol.
Fuel security: New Zealand imports all of its refined fuel since the Marsden Point refinery closed in 2022.
Government support: The Clean Car Discount offers rebates of up to $7,015 on new electric vehicles.

Arguments against

High upfront cost: New EVs are still more expensive than comparable petrol cars.
Charging infrastructure: Rural areas have far fewer chargers, making long trips harder.
Road user charges: EVs now pay RUC, which reduces the cost advantage.
Battery concerns: Mining for lithium and cobalt, and recycling at end of life.

Would you like help structuring the essay?

You said:
isnt the clean car discount gone now?? pretty sure it ended at the end of 2023. also can u write me a paragraph on the renewable electricity point, like an actual essay paragraph
ChatGPT said:
You're right, thanks for catching that. The Clean Car Discount ended on 31 December 2023, so it no longer applies to new purchases.

Here's a paragraph on renewable electricity:

One of the strongest arguments for electric vehicles in New Zealand is the country's largely renewable electricity supply. Around 85 percent of New Zealand's electricity comes from renewable sources such as hydro, geothermal and wind, which means that charging an electric car here produces far fewer emissions than in countries that rely on coal or gas. Because transport is one of the largest sources of New Zealand's domestic emissions, shifting the vehicle fleet to electric power is one of the most direct ways the country can meet its climate targets.

You said:
ok now one about the problems with charging, especially rural areas
ChatGPT said:
Here's a paragraph on charging infrastructure:

Despite these benefits, charging infrastructure remains a significant barrier to widespread EV adoption in New Zealand. While major cities such as Auckland, Wellington and Christchurch have a growing network of fast chargers, many rural areas and smaller towns have only limited options. This makes long-distance travel more difficult and contributes to "range anxiety", the fear of running out of charge before reaching a charger. For rural New Zealanders, who often travel long distances for work and everyday tasks, this is a real concern.

You said:
how much are road user charges for evs
ChatGPT said:
Since 1 April 2024, light electric vehicles in New Zealand pay road user charges (RUC) of $76 per 1,000 km. Plug-in hybrids pay a lower rate of $38 per 1,000 km. Before this, EVs were exempt from RUC, which was one of the incentives to buy them.

You said:
can u write a conclusion
ChatGPT said:
In conclusion, electric vehicles represent a promising path forward for New Zealand. With its abundant renewable energy, the country is uniquely positioned to benefit from the transition to electric transport. However, challenges such as cost and charging infrastructure must be addressed to ensure that all New Zealanders can share in the benefits. With the right policies and investment, electric cars can play a crucial role in building a sustainable future for Aotearoa.

You said:
thats kinda generic lol ill write my own. thanks
ChatGPT said:
No problem! Writing your own conclusion is a great idea — it'll sound more like you. Good luck with your essay! 🚗⚡

ChatGPT can make mistakes. Check important info.`;

const NOAH_EV_ESSAY = `Are electric cars the right path for New Zealand?

Every time I fill up my dad's ute in Hamilton, petrol seems to have gone up again, so it is no surprise more New Zealanders are looking at electric cars. In this essay I argue that electric cars are the right long-term path for New Zealand, but that the change will be slower outside the main cities unless cost and charging are sorted out.

One of the strongest arguments for electric vehicles in New Zealand is the country's largely renewable electricity supply. Around 85 percent of New Zealand's electricity comes from renewable sources such as hydro, geothermal and wind, which means that charging an electric car here produces far fewer emissions than in countries that rely on coal or gas. Because transport is one of the largest sources of New Zealand's domestic emissions, shifting the vehicle fleet to electric power is one of the most direct ways the country can meet its climate targets.

Cost is the part most people actually care about. Electric cars are still more expensive to buy than a petrol car of the same size, and the government ended the Clean Car Discount at the end of 2023. Since April 2024, EV owners have also paid road user charges of $76 for every 1,000 km, which takes away some of the savings. Even so, charging at home overnight is much cheaper than petrol, so for someone who drives to work every day the running costs still come out lower.

Charging is the biggest problem, especially in the regions. Auckland and Wellington have plenty of fast chargers, but smaller towns often only have one or two. When my family borrowed an EV to drive to Taupō last summer, we waited almost forty minutes for a free charger. For people on farms, where trips are long and chargers are few, range anxiety is a real reason not to switch.

Most people my age will not be buying a new car anyway. The EVs we can afford are second-hand Nissan Leafs imported from Japan, and a lot of them have batteries that only hold part of their original range. A friend bought one for her commute to university and it is fine for that, but she would never take it to Wellington. That means the cheap end of the EV market is mainly useful in cities, which is where the chargers already are.

There is also the question of what happens in a dry year. Our hydro lakes depend on rain and snow, and when they are low the Huntly power station burns more coal. EVs are still cleaner than petrol cars in those years, but the gap is smaller, so building more wind and solar matters as much as selling more EVs.

Overall, electric cars make more sense here than in most countries because our power is mostly renewable. The government should focus on building chargers in regional towns and helping lower-income families buy second-hand EVs instead of leaving it to the market. If that happens, I think electric cars are the right path for New Zealand.`;

/* ------------------------------------------------------------------ */
/* Written critique of AI use (handed in with the work)                */
/* ------------------------------------------------------------------ */
// Written in each student's pattern from the steps in their own chat, so the
// critique level, the critique flags and Gemini's check all have something to
// tell apart. No rand() here: adding critiques leaves the rest of the seed as it was.
const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const listOf = (xs) => xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];
const WORK = { 'a-im399-r1': 'report', 'a-bus201-ev': 'essay', 'a-is222-a1': 'assignment' };
const idNum = (id) => id.split('').reduce((n, ch) => n + ch.charCodeAt(0), 0);

const NOAH_EV_CRITIQUE = {
  used: 'i used chatgpt to write a paragraph about renewable electricity and one about charging, to find out how much road user charges are, and to try a conclusion',
  checked: 'honestly i didnt check the renewable paragraph, it sounded right so i used it pretty much as it was. i trusted the RUC number too because it matched what my dad pays',
  changed: 'i rewrote the charging paragraph with my own story about waiting for a charger in taupo. the conclusion it gave me was really generic so i wrote my own one about what the government should do instead'
};

function writeCritique(sub, def) {
  if (sub.stage !== 'handed_in' || sub.declaration !== 'ai_used') return null;
  if (sub.id === 's-bus201-ev-p16') return NOAH_EV_CRITIQUE;
  const work = WORK[def.id] || 'work';
  const steps = sub.interactions.map((i) => Object.assign({ i }, def.bank.find((t) => t.task === i.task) || {}));
  if (!steps.length) return null;
  const tool = steps[0].i.tool;
  const tasks = listOf(steps.map((t) => lc(t.task)));
  const first = steps[0];
  switch (sub.pattern) {
    case 'verifier': return {
      used: 'I used ' + tool + ' for ' + steps.length + ' parts of the ' + work + ': to ' + tasks + '. I planned the argument and wrote the introduction and conclusion myself.',
      checked: steps.slice(0, 3).map((t) => 'For "' + lc(t.task) + '", ' + lc(t.good) + ', but ' + t.issue + '. I checked ' + t.check + ' to confirm the details before using any of it.').join(' '),
      changed: steps.slice(0, 3).map((t) => 'I ' + t.fix.replace(/^did not use it and /, 'did not use the reply and ') + ', because ' + t.issue + '.').join(' ') + ' Nothing went into the ' + work + ' word-for-word without being checked first.'
    };
    case 'evaluator': return {
      used: 'I used ' + tool + ' to ' + tasks + '. I wanted a starting point for each section rather than finished text.',
      checked: 'I did not look anything up separately; I judged each reply on whether it fitted my argument and what we covered in class. ' + steps.slice(0, 2).map((t) => t.good + ', but ' + t.issue + '.').join(' '),
      changed: 'I rewrote most replies in my own voice and cut the parts that were too general. ' + steps.slice(0, 2).map((t) => 'For "' + lc(t.task) + '" I ' + t.fix.replace(/^did not use it and /, 'dropped the reply and ') + '.').join(' ')
    };
    case 'concise': return {
      used: tool + ' for ' + steps.length + ' sections: ' + tasks + '. Structure and conclusion are mine.',
      checked: steps.map((t) => t.short).join(' '),
      changed: 'Rewrote every paragraph I kept in my own words. Dropped anything I could not confirm against a source, so no reply went in unchanged.'
    };
    case 'minimal': return {
      used: 'I used AI once, to ' + lc(first.task) + ', because I was not sure how to start the ' + work + ' and wanted to see what a good opening could look like.',
      checked: 'I read through the reply carefully to make sure it was about the right question and that I understood every part of it before I used anything.',
      changed: 'I used the main ideas from the reply as a starting point and then wrote the rest of the ' + work + ' myself, using my own examples from the course.'
    };
    case 'passive':
      // Some passive students overclaim: their critique says they checked and rewrote everything,
      // which the rules score highly but the chat and the work do not support (Gemini flags it).
      if (idNum(sub.id) % 2 === 0) return {
        used: 'I used ' + tool + ' for research and ideas for the ' + work + ', mainly to ' + tasks + '.',
        checked: 'I checked every statistic and claim against Stats NZ and the course readings, and I verified the sources the AI gave me before using any of them.',
        changed: 'I rewrote each paragraph in my own words and corrected the parts that were wrong, so nothing in the ' + work + ' was copied from the AI.'
      };
      return {
        used: 'I used ' + tool + ' to help write most of my ' + work + ' because it explains things clearly and it saves a lot of time when there are other deadlines.',
        checked: 'The answers looked right to me and they were what I expected, so I did not need to do much else with them before putting them in.',
        changed: 'I kept most of the paragraphs the way they were and put them together in order, then added a title and changed a few words so it flowed better.'
      };
    case 'restater': return {
      used: 'I asked ' + tool + ' to ' + tasks + ' for my ' + work + '.',
      checked: 'The AI explained that ' + lc(first.output.split(/(?<=\.)\s+/)[0]) + ' It also covered ' + listOf(steps.slice(1, 3).map((t) => lc(t.task))) + '.',
      changed: 'I used what the AI said about ' + lc(first.task) + ' and the other sections, and put the information into my ' + work + ' in the same order that it was given to me.'
    };
    case 'aistyle': return {
      used: 'Throughout this ' + work + ', I leveraged ' + tool + ' as a valuable tool to ' + tasks + ', which played a crucial role in shaping my overall approach.',
      checked: 'It is important to note that the AI provided a comprehensive overview of each topic. I critically evaluated its responses to ensure they were accurate and offered valuable insights for my work.',
      changed: 'I carefully refined the AI-generated content to align with the requirements of the assignment, ensuring my work reflects a multifaceted understanding and helps navigate the complexities of the topic.'
    };
    default: return null;
  }
}

/* ------------------------------------------------------------------ */
/* Gemini results saved by data/precompute-ai.js                       */
/* ------------------------------------------------------------------ */
const AI_FILE = path.join(__dirname, 'ai-evaluations.json');
const AI_RESULTS = fs.existsSync(AI_FILE) ? JSON.parse(fs.readFileSync(AI_FILE, 'utf8')) : {};
const USE_TO_DECISION = { unchanged: 'unchanged', changed: 'changed', not_used: 'not_used', unclear: 'unrecorded' };

/** Same mapping as runAiEval in public/js/app.js: a pasted log is split into steps, numbers become step ids. */
function attachAiEvaluation(s, j) {
  if (s.submission.length !== j.textLength) return; // the work changed since Gemini read it
  if (!s.interactions.length) {
    const tool = (s.sources[0] && s.sources[0].tool) || 'AI';
    s.interactions = j.steps.map((x, k) => ({
      id: s.id + '-g' + (k + 1), step: k + 1, task: x.task || 'Step ' + (k + 1), tool,
      prompt: x.prompt || '', output: x.response || '',
      critique: x.reaction || '', critiqueSource: x.reaction ? 'chat' : 'none',
      pushback: false, pushbackText: x.reaction || '',
      decision: USE_TO_DECISION[x.use] || 'unrecorded', decisionSource: 'ai',
      timestamp: s.logsAttachedAt || s.handedInAt
    }));
    s.aiSplit = true;
  }
  const idOf = (n) => (s.interactions[n - 1] || {}).id;
  const steps = {};
  j.steps.forEach((x) => { const id = idOf(x.step); if (id) steps[id] = { task: x.task, purpose: x.purpose, use: x.use }; });
  s.aiEval = {
    model: j.model, ranAt: j.ranAt, summary: j.summary, detection: j.detection, textLength: j.textLength,
    sentences: j.sentences.map((x) => ({ text: x.text, para: x.para, source: x.source, steps: x.steps.map(idOf).filter(Boolean) })),
    steps,
    critique: j.critique ? Object.assign({}, j.critique, { claims: j.critique.claims.map((c) => Object.assign({}, c, { steps: c.steps.map(idOf).filter(Boolean) })) }) : null
  };
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */
const assignments = [];
const submissions = [];
ASSIGNMENTS.forEach((def) => {
  const course = COURSES.find((c) => c.id === def.courseId);
  const a = { id: def.id, courseId: def.courseId, title: def.title, short: def.short, description: def.description,
    dueDate: def.dueDate, wordLimit: def.wordLimit, lane: 2,
    settings: Object.assign(Engine.applyPreset(Engine.defaultSettings(), def.preset), { ai: Object.assign({}, Engine.DEFAULT_AI, { sensitivity: Engine.SENSITIVITY_FOR_PRESET[def.preset] }) }),
    rubric: def.rubric, markingBands: Engine.normaliseBands(),
    // Grading rubric for the work itself (Excellent / Good / Okay / Not good per criterion).
    marking: def.grading };
  const subs = course.roster.map((entry, k) => buildSubmission(a, def, entry, k));
  if (def.id === 'a-bus201-ev') {
    const noah = subs.find((s) => s.studentId === 'p16');
    Object.assign(noah, {
      stage: 'handed_in', declaration: 'ai_used',
      logsAttachedAt: '2026-09-29T20:52:00+13:00', handedInAt: '2026-09-29T21:38:00+13:00',
      sources: [{ type: 'pasted', tool: 'ChatGPT', url: '', attachedAt: '2026-09-29T20:52:00+13:00' }],
      interactions: [], chatLog: NOAH_EV_LOG, submission: NOAH_EV_ESSAY
    });
  }
  const handedIn = subs.filter((s) => s.stage === 'handed_in' && s.interactions.length);
  const nFull = Math.round(handedIn.length * def.reviewed);
  handedIn.forEach((s, k) => {
    if (k < nFull) simulateReview(s, a, 'full');
    else if (def.reviewed > 0 && k === nFull) simulateReview(s, a, 'partial');
  });
  if (def.reviewed === 1) subs.filter((s) => s.stage === 'handed_in' && !s.interactions.length && !s.chatLog).forEach((s) => { s.review.status = 'reviewed'; s.review.decision = 'approve'; s.review.seconds = 45; simulateGrading(s, a); });
  // Every student who used AI handed in a written critique, long enough for this assignment's minimum.
  const minWords = a.settings.rules.critiqueShort.enabled ? a.settings.rules.critiqueShort.minWords : 0;
  subs.forEach((s) => {
    const c = writeCritique(s, def);
    if (!c) return;
    const words = Engine.wordCount(Engine.critiqueText(c));
    if (words < minWords) throw new Error(s.id + ' (' + s.pattern + ') critique is ' + words + ' words; ' + a.short + ' needs ' + minWords + '.');
    s.critique = Object.assign({}, c, { writtenAt: s.handedInAt });
  });
  // Gemini's saved answers (data/precompute-ai.js), attached exactly as the app does after a live run.
  subs.forEach((s) => { if (AI_RESULTS[s.id]) attachAiEvaluation(s, AI_RESULTS[s.id]); });
  assignments.push(a);
  submissions.push(...subs);
});

const excludedStudentIds = new Set(submissions.filter((s) => s.declaration === 'no_ai').map((s) => s.studentId));
const includedCourses = COURSES.map((course) => Object.assign({}, course, {
  roster: course.roster.filter((entry) => !excludedStudentIds.has(entry.studentId))
}));
const includedSubmissions = submissions.filter((submission) => !excludedStudentIds.has(submission.studentId));

const seedData = {
  version: 3,
  generatedAt: '2026-10-01T09:00:00+13:00',
  teacher: { name: 'Mina Khoshmehr', first: 'Mina', initials: 'MK', role: 'Course administrator', email: 'mina.khoshmehr@example.ac.nz' },
  staff: [
    { name: 'Mina Khoshmehr', initials: 'MK', role: 'Course administrator', courses: ['c-im399', 'c-bus201', 'c-is222'] },
    { name: 'Dr. Harriet Cole', initials: 'HC', role: 'Course coordinator', courses: ['c-im399'] },
    { name: 'Tom Ruatapu', initials: 'TR', role: 'Marker', courses: ['c-bus201', 'c-is222'] }
  ],
  courses: includedCourses,
  // Only students enrolled in at least one course.
  students: students.filter((s) => includedCourses.some((c) => c.roster.some((r) => r.studentId === s.id))).map(({ pattern, ...s }) => s),
  assignments,
  submissions: includedSubmissions
};

fs.writeFileSync(path.join(__dirname, 'seed.json'), JSON.stringify(seedData, null, 2));

// Browser copy, so the app still runs without the server (e.g. VS Code Live Server).
fs.writeFileSync(path.join(__dirname, '..', 'public', 'js', 'seed-data.js'),
  '/* Generated by data/generate-seed.js. Do not edit by hand. */\n' +
  'window.SEED_DATA = ' + JSON.stringify(seedData) + ';\n');

const n = (f) => includedSubmissions.filter(f).length;
const words = includedSubmissions.filter((s) => s.submission).map((s) => s.submission.split(/\s+/).length);
console.log('Wrote data/seed.json: ' + COURSES.length + ' courses, ' + assignments.length + ' assignments, ' +
  seedData.students.length + ' students, ' + includedSubmissions.length + ' submissions (' + n((s) => s.stage === 'handed_in') + ' handed in, ' +
  n((s) => s.stage === 'logs_attached') + ' logs only, ' + n((s) => s.stage === 'not_started') + ' not started), ' +
  includedSubmissions.reduce((k, s) => k + s.interactions.length, 0) + ' interactions, ' +
  Math.min(...words) + '-' + Math.max(...words) + ' words per submission.');
