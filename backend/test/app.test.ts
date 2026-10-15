import assert from 'node:assert/strict';
import test from 'node:test';
import type { BackendServices, Lane2Repository, ReviewInput } from '../src/contracts.js';
import { buildApp } from '../src/app.js';

const courseId = '11111111-1111-4111-8111-111111111111';
const assignmentId = '22222222-2222-4222-8222-222222222222';
const submissionId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';

function fakeServices(overrides: Partial<Lane2Repository> = {}): BackendServices {
  const repository: Lane2Repository = {
    async listCourses() { return [{ id: courseId, code: 'INFOMGMT 399' }]; },
    async listAssignments(id) { return [{ id: assignmentId, course_id: id }]; },
    async listSubmissions(id) { return [{ id: submissionId, assignment_id: id }]; },
    async getSubmission(id) { return { id, interactions: [] }; },
    async saveOwnReview(id, reviewerId, input: ReviewInput) {
      return { id: 'review-1', submission_id: id, reviewer_id: reviewerId, ...input };
    },
    ...overrides
  };
  return {
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
