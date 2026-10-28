import assert from 'node:assert/strict';
import test from 'node:test';
import type { BackendServices, Lane2Repository, ReviewInput } from '../src/contracts.js';
import { buildApp } from '../src/app.js';
import { prepareHandInFile } from '../src/supabase-services.js';

const courseId = '11111111-1111-4111-8111-111111111111';
const assignmentId = '22222222-2222-4222-8222-222222222222';
const submissionId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';
const criterionId = '55555555-5555-4555-8555-555555555555';

function fakeServices(overrides: Partial<Lane2Repository> = {}): BackendServices {
  const repository: Lane2Repository = {
    async listCourses() { return [{ id: courseId, code: 'INFOMGMT 399' }]; },
    async listAssignments(id) { return [{ id: assignmentId, course_id: id }]; },
    async listSubmissions(id) { return [{ id: submissionId, assignment_id: id }]; },
    async getSubmission(id) { return { id, interactions: [] }; },
    async getWorkspace(user) { return { user, state: { courses: [], assignments: [], submissions: [], students: [] } }; },
    async createCourse(creatorId, input) { return { id: courseId, created_by: creatorId, ...input }; },
    async updateCourse(id, input) { return { id, ...input }; },
    async deleteCourse() {},
    async createAssignment(creatorId, input) { return { id: assignmentId, created_by: creatorId, ...input }; },
    async updateAssignment(id, input) { return { id, ...input }; },
    async deleteAssignment() {},
    async createEnrolment(id, creatorId, input) { return { course_id: id, creatorId, student_id: input.studentId }; },
    async updateEnrolment(id, studentId, groupName) { return { course_id: id, student_id: studentId, group_name: groupName }; },
    async deleteEnrolment() {},
    async updateStudent(id, input) { return { id, ...input }; },
    async deleteStudent() {},
    async saveOwnReview(id, reviewerId, input: ReviewInput) {
      return { id: 'review-1', submission_id: id, reviewer_id: reviewerId, ...input };
    },
    async handIn(id, input) { return { id, stage: 'handed_in', critique: input.critique }; },
    async submissionFileLink(id) { return { url: 'https://storage.example.test/' + id, name: 'essay.pdf' }; },
    async saveAiEvaluation(id, input) { return { id, model: input.model, critique: input.critique }; },
    ...overrides
  };
  return {
    async signIn(email) {
      return { accessToken: 'valid-token', refreshToken: 'refresh-token-long-enough', expiresAt: null, user: { id: userId, email, displayName: 'Marker' } };
    },
    async signUp(input) {
      return { accessToken: 'valid-token', refreshToken: 'refresh-token-long-enough', expiresAt: null, user: { id: userId, email: input.email, displayName: `${input.firstName} ${input.lastName}` } };
    },
    async refreshSession() {
      return { accessToken: 'valid-token', refreshToken: 'refresh-token-long-enough', expiresAt: null, user: { id: userId, email: 'marker@example.test', displayName: 'Marker' } };
    },
    async authenticate(token) {
      if (token !== 'valid-token') throw new Error('bad token');
      return { id: userId, email: 'marker@example.test', displayName: 'Marker' };
    },
    repositoryFor() { return repository; }
  };
}

test('health is public but data routes require a bearer token', async (t) => {
  const app = buildApp(fakeServices());
  t.after(() => app.close());

  const health = await app.inject({ method: 'GET', url: '/api/v1/health' });
  assert.equal(health.statusCode, 200);
  assert.deepEqual(health.json(), { ok: true, service: 'lane2-backend' });

  const courses = await app.inject({ method: 'GET', url: '/api/v1/courses' });
  assert.equal(courses.statusCode, 401);
  assert.equal(courses.json().error.code, 'UNAUTHORIZED');
});

test('login is public and returns a session for the frontend', async (t) => {
  const app = buildApp(fakeServices());
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST', url: '/api/v1/auth/login',
    payload: { email: 'marker@example.test', password: 'password123' }
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().session.accessToken, 'valid-token');
});

test('student sign-up is accepted and unsupported roles are rejected', async (t) => {
  const app = buildApp(fakeServices());
  t.after(() => app.close());
  const details = {
    email: 'student@aucklanduni.ac.nz', password: 'password123',
    firstName: 'Student', lastName: 'Tester', role: 'student'
  };

  const student = await app.inject({ method: 'POST', url: '/api/v1/auth/signup', payload: details });
  assert.equal(student.statusCode, 201);
  assert.equal(student.json().session.user.email, details.email);

  const invalid = await app.inject({
    method: 'POST', url: '/api/v1/auth/signup', payload: { ...details, role: 'super_admin' }
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.json().error.code, 'INVALID_REQUEST');
});

test('bootstrap returns a frontend-compatible workspace', async (t) => {
  const app = buildApp(fakeServices());
  t.after(() => app.close());

  const response = await app.inject({
    method: 'GET', url: '/api/v1/bootstrap', headers: { authorization: 'Bearer valid-token' }
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().state.courses, []);
});

test('authenticated course and assignment reads use the caller repository', async (t) => {
  const app = buildApp(fakeServices());
  t.after(() => app.close());
  const headers = { authorization: 'Bearer valid-token' };

  const courses = await app.inject({ method: 'GET', url: '/api/v1/courses', headers });
  assert.equal(courses.statusCode, 200);
  assert.equal(courses.json().courses[0].code, 'INFOMGMT 399');

  const assignments = await app.inject({
    method: 'GET', url: `/api/v1/courses/${courseId}/assignments`, headers
  });
  assert.equal(assignments.statusCode, 200);
  assert.equal(assignments.json().assignments[0].course_id, courseId);
});

test('course, assignment, student and enrolment writes use the authenticated repository', async (t) => {
  const calls: string[] = [];
  const app = buildApp(fakeServices({
    async createCourse(creatorId, input) { calls.push(`course:${creatorId}:${input.code}`); return { id: courseId, ...input }; },
    async createAssignment(creatorId, input) { calls.push(`assignment:${creatorId}:${input.short}`); return { id: assignmentId, ...input }; },
    async createEnrolment(id, creatorId, input) { calls.push(`enrolment:${id}:${creatorId}:${input.firstName}`); return { student_id: criterionId }; },
    async updateStudent(id, input) { calls.push(`student:${id}:${input.firstName}`); return { id, ...input }; }
  }));
  t.after(() => app.close());
  const headers = { authorization: 'Bearer valid-token' };

  const course = await app.inject({ method: 'POST', url: '/api/v1/courses', headers, payload: { code: 'LAW 101', name: 'Law', semester: 'S1', badge: 'LW' } });
  assert.equal(course.statusCode, 201);

  const assignment = await app.inject({
    method: 'POST', url: '/api/v1/assignments', headers,
    payload: { courseId, title: 'Essay', short: 'Essay 1', description: '', dueDate: '2026-10-20', wordLimit: 1000, lane: 2, settings: {}, rubric: [] }
  });
  assert.equal(assignment.statusCode, 201);

  const enrolment = await app.inject({
    method: 'POST', url: `/api/v1/courses/${courseId}/enrolments`, headers,
    payload: { firstName: 'Ana', lastName: 'Lee', institutionalId: 'alee001', email: 'ana@example.test', groupName: 'Tutorial A' }
  });
  assert.equal(enrolment.statusCode, 201);

  const student = await app.inject({ method: 'PATCH', url: `/api/v1/students/${criterionId}`, headers, payload: { firstName: 'Anna' } });
  assert.equal(student.statusCode, 200);
  assert.deepEqual(calls, [
    `course:${userId}:LAW 101`,
    `assignment:${userId}:Essay 1`,
    `enrolment:${courseId}:${userId}:Ana`,
    `student:${criterionId}:Anna`
  ]);
});

test('review updates attach the authenticated reviewer id', async (t) => {
  let received: unknown;
  const app = buildApp(fakeServices({
    async saveOwnReview(id, reviewerId, input) {
      received = { id, reviewerId, input };
      return { id: 'review-1', decision: input.decision };
    }
  }));
  t.after(() => app.close());

  const response = await app.inject({
    method: 'PUT',
    url: `/api/v1/submissions/${submissionId}/review`,
    headers: { authorization: 'Bearer valid-token' },
    payload: { status: 'reviewed', decision: 'approve', comment: 'Checked.' }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(received, {
    id: submissionId,
    reviewerId: userId,
    input: { status: 'reviewed', decision: 'approve', comment: 'Checked.' }
  });
});

test('review updates accept numeric rubric scores and clarification outcomes', async (t) => {
  let received: ReviewInput | undefined;
  const app = buildApp(fakeServices({
    async saveOwnReview(_id, _reviewerId, input) {
      received = input;
      return { id: 'review-1', ...input };
    }
  }));
  t.after(() => app.close());

  const response = await app.inject({
    method: 'PUT', url: `/api/v1/submissions/${submissionId}/review`,
    headers: { authorization: 'Bearer valid-token' },
    payload: {
      status: 'reviewed', decision: 'clarify', comment: 'Please explain how this source was checked.',
      scores: [{ criterionId, score: 7.5, comment: 'Evidence is relevant but incomplete.' }]
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(received?.decision, 'clarify');
  assert.equal(received?.scores?.[0]?.score, 7.5);
});

test('route schemas reject malformed ids and review fields', async (t) => {
  const app = buildApp(fakeServices());
  t.after(() => app.close());
  const headers = { authorization: 'Bearer valid-token' };

  const badId = await app.inject({ method: 'GET', url: '/api/v1/submissions/not-an-id', headers });
  assert.equal(badId.statusCode, 400);

  const badReview = await app.inject({
    method: 'PUT', url: `/api/v1/submissions/${submissionId}/review`, headers,
    payload: { decision: 'maybe', surprise: true }
  });
  assert.equal(badReview.statusCode, 400);
  assert.equal(badReview.json().error.code, 'INVALID_REQUEST');
});

/* ---------- Written critique: hand-in and AI evaluation routes ---------- */
const authHeader = { authorization: 'Bearer valid-token' };
const critique = { used: 'Brainstorming and a first draft.', checked: 'Checked the 85% figure against MBIE.', changed: 'Rewrote the charging paragraph.' };

test('hand-in requires all three critique answers and passes them to the database', async (t) => {
  let received: unknown = null;
  const app = buildApp(fakeServices({ async handIn(id, input) { received = { id, input }; return { id, stage: 'handed_in' }; } }));
  t.after(() => app.close());
  const url = `/api/v1/submissions/${submissionId}/hand-in`;
  const base = { finalText: 'My essay.', chatLog: 'You said: hi', tool: 'ChatGPT', critique };

  assert.equal((await app.inject({ method: 'PUT', url, payload: base })).statusCode, 401, 'needs a session');
  for (const bad of [
    { ...base, critique: { ...critique, checked: '' } },
    { ...base, critique: { ...critique, changed: '   ' } },
    { ...base, critique: { used: 'x', checked: 'y' } },
    { ...base, chatLog: '' }
  ]) {
    const response = await app.inject({ method: 'PUT', url, headers: authHeader, payload: bad });
    assert.equal(response.statusCode, 400, JSON.stringify(bad));
  }
  const ok = await app.inject({ method: 'PUT', url, headers: authHeader, payload: { ...base, expectedRevision: 3 } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().submission.stage, 'handed_in');
  assert.deepEqual(received, { id: submissionId, input: { ...base, expectedRevision: 3 } });
  await app.inject({ method: 'PUT', url, headers: authHeader, payload: { ...base, critique: { ...critique, level: 4 } } });
  assert.deepEqual((received as { input: { critique: unknown } }).input.critique, critique, 'unknown fields (e.g. a level) are dropped');
});

test('AI evaluation results are validated before they are saved', async (t) => {
  let received: unknown = null;
  const app = buildApp(fakeServices({ async saveAiEvaluation(id, input) { received = input; return { model: input.model }; } }));
  t.after(() => app.close());
  const url = `/api/v1/submissions/${submissionId}/ai-evaluation`;
  const body = {
    model: 'gemini-3.6-flash', detection: { sensitivity: 'balanced' }, summary: 's', textLength: 10,
    sentences: [{ text: 'One.', para: 0, source: 'unchanged', steps: [1] }],
    steps: [{ step: 1, task: 'Draft', purpose: 'drafting', use: 'unchanged' }],
    splitSteps: [{ step: 1, task: 'Draft', tool: 'ChatGPT', prompt: 'p', output: 'o', reaction: '', decision: 'unchanged' }],
    critique: { level: 1, writtenDepth: 4, chatDepth: 0, accuracy: 'does_not_match', aiWritten: 'unlikely', aiWrittenReason: 'r', summary: 's',
      claims: [{ claim: 'Checked MBIE', verdict: 'not_found', steps: [1] }] }
  };
  const ok = await app.inject({ method: 'PUT', url, headers: authHeader, payload: body });
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(received, body);
  assert.equal((await app.inject({ method: 'PUT', url, headers: authHeader, payload: { ...body, critique: null } })).statusCode, 200, 'no written critique is fine');
  for (const bad of [
    { ...body, critique: { ...body.critique, level: 5 } },
    { ...body, critique: { ...body.critique, accuracy: 'maybe' } },
    { ...body, critique: { ...body.critique, claims: [{ claim: 'x', verdict: 'supported', steps: [0] }] } },
    { ...body, sentences: [{ text: 'One.', para: 0, source: 'copied', steps: [] }] }
  ]) {
    assert.equal((await app.inject({ method: 'PUT', url, headers: authHeader, payload: bad })).statusCode, 400, JSON.stringify(bad).slice(0, 120));
  }
});

test('stored critique results map to the frontend and are dropped after a new hand-in', async () => {
  const { critiqueFields } = await import('../src/supabase-services.js');
  const stepA = '66666666-6666-4666-8666-666666666666';
  const row = {
    revision: 3, chat_log: 'log', ai_split: true, hand_in_count: 2,
    critique: { used_for: 'u', checked: 'c', changed: 'ch', word_count: 50, written_at: '2026-10-26T00:00:00Z' },
    ai_evaluation: { submission_revision: 3, model: 'm', detection: {}, summary: 's', sentences: [], step_info: {}, text_length: 4, ran_at: 't' },
    critique_assessment: [{ submission_revision: 3, level: 2, written_depth: 4, chat_depth: 0, accuracy: 'partly', ai_written: 'possible', ai_written_reason: 'r', summary: 'x',
      critique_claims: [
        { position: 1, claim: 'Second', verdict: 'contradicted', critique_claim_steps: [] },
        { position: 0, claim: 'First', verdict: 'supported', critique_claim_steps: [{ interaction_id: stepA }] }
      ] }]
  };
  const fields = critiqueFields(row);
  assert.deepEqual(fields.critique, { used: 'u', checked: 'c', changed: 'ch', writtenAt: '2026-10-26T00:00:00Z' });
  assert.equal(fields.aiEval?.critique?.level, 2);
  assert.deepEqual(fields.aiEval?.critique?.claims.map((c) => [c.claim, c.steps]), [['First', [stepA]], ['Second', []]]);
  const handedInAgain = critiqueFields({ ...row, revision: 4 });
  assert.equal(handedInAgain.aiEval, null, 'an evaluation of an earlier hand-in is not shown');
  assert.equal(critiqueFields({ revision: 1 }).critique, null);
});

/* ---------- Handed-in files and content marks ---------- */
const pdfBase64 = (bytes: number) => Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(Math.max(0, bytes - 9), 32)]).toString('base64');

test('hand-in accepts a PDF or Word file up to 10 MB and refuses other files', async (t) => {
  let received: { file?: { name: string; data: string } } | null = null;
  const app = buildApp(fakeServices({ async handIn(id, input) { received = input; return { id, stage: 'handed_in' }; } }));
  t.after(() => app.close());
  const url = `/api/v1/submissions/${submissionId}/hand-in`;
  const base = { finalText: 'My essay.', chatLog: 'You said: hi', tool: 'ChatGPT', critique };

  const big = await app.inject({ method: 'PUT', url, headers: authHeader, payload: { ...base, file: { name: 'EV Essay.pdf', type: 'application/pdf', data: pdfBase64(9.5 * 1024 * 1024) } } });
  assert.equal(big.statusCode, 200, big.body);
  assert.equal(received!.file!.name, 'EV Essay.pdf', 'a 9.5 MB file gets through the body limit');

  const exe = await app.inject({ method: 'PUT', url, headers: authHeader, payload: { ...base, file: { name: 'virus.exe', data: 'AAAA' } } });
  assert.equal(exe.statusCode, 400);
  const tooBig = await app.inject({ method: 'PUT', url, headers: authHeader, payload: { ...base, file: { name: 'huge.pdf', data: pdfBase64(10.5 * 1024 * 1024) } } });
  assert.ok([400, 413].includes(tooBig.statusCode), 'a file over 10 MB is refused: ' + tooBig.statusCode);
});

test('a handed-in file must really be the type its name says', () => {
  assert.equal(prepareHandInFile({ name: 'essay.PDF', data: pdfBase64(2000) }).type, 'application/pdf');
  assert.equal(prepareHandInFile({ name: 'essay.docx', data: Buffer.from('PK\x03\x04rest').toString('base64') }).ext, '.docx');
  assert.equal(prepareHandInFile({ name: 'folder/../essay.pdf', data: pdfBase64(100) }).name, 'folder_.._essay.pdf');
  assert.throws(() => prepareHandInFile({ name: 'essay.pdf', data: Buffer.from('not a pdf').toString('base64') }), /does not look like a PDF/);
  assert.throws(() => prepareHandInFile({ name: 'essay.pdf', data: '' }), /empty/);
  assert.throws(() => prepareHandInFile({ name: 'essay.txt', data: pdfBase64(100) }), /PDF or Word/);
  assert.throws(() => prepareHandInFile({ name: 'essay.pdf', data: pdfBase64(10 * 1024 * 1024 + 1) }), /10 MB/);
});

test('the file route returns a download link to signed-in users only', async (t) => {
  const app = buildApp(fakeServices());
  t.after(() => app.close());
  const url = `/api/v1/submissions/${submissionId}/file`;
  assert.equal((await app.inject({ method: 'GET', url })).statusCode, 401);
  const ok = await app.inject({ method: 'GET', url, headers: authHeader });
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(ok.json().file, { url: 'https://storage.example.test/' + submissionId, name: 'essay.pdf' });
});

test('saving a review can include grading-rubric marks and feedback', async (t) => {
  let received: ReviewInput | null = null;
  const app = buildApp(fakeServices({ async saveOwnReview(_id, _reviewer, input) { received = input; return { id: 'r1' }; } }));
  t.after(() => app.close());
  const url = `/api/v1/submissions/${submissionId}/review`;
  const payload = { contentMarks: { 'mc-1': { score: 8, level: 'excellent', comment: 'Clear thesis.' } }, feedback: 'Well argued.' };
  const ok = await app.inject({ method: 'PUT', url, headers: authHeader, payload });
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(received, payload);
  const bad = await app.inject({ method: 'PUT', url, headers: authHeader, payload: { contentMarks: 'eight' } });
  assert.equal(bad.statusCode, 400);
});

test('a DELETE labelled as JSON but with no body still works (the browser client used to send these)', async (t) => {
  let deleted = '';
  const app = buildApp(fakeServices({ async deleteCourse(id) { deleted = id; } }));
  t.after(() => app.close());
  const response = await app.inject({ method: 'DELETE', url: `/api/v1/courses/${courseId}`, headers: { ...authHeader, 'content-type': 'application/json' } });
  assert.equal(response.statusCode, 204, response.body);
  assert.equal(deleted, courseId);
});

test('a request over the size limit gets a clear 413, not a server error', async (t) => {
  const app = buildApp(fakeServices());
  t.after(() => app.close());
  const response = await app.inject({ method: 'PUT', url: `/api/v1/submissions/${submissionId}/review`, headers: authHeader, payload: { comment: 'x'.repeat(2 * 1024 * 1024) } });
  assert.equal(response.statusCode, 413);
  assert.equal(response.json().error.code, 'REQUEST_TOO_LARGE');
});
