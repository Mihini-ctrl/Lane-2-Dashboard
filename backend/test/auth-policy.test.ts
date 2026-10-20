import assert from 'node:assert/strict';
import test from 'node:test';
import { isUniversityEmail, requireUniversityEmail } from '../src/auth-policy.js';
import { ApiError } from '../src/errors.js';

test('University of Auckland student and staff email domains are accepted', () => {
  assert.equal(isUniversityEmail('abcd123@aucklanduni.ac.nz'), true);
  assert.equal(isUniversityEmail('Teacher.Name@AUCKLAND.AC.NZ'), true);
});

test('lookalike, personal and subdomain email addresses are rejected', () => {
  assert.equal(isUniversityEmail('person@gmail.com'), false);
  assert.equal(isUniversityEmail('person@auckland.ac.nz.example.com'), false);
  assert.equal(isUniversityEmail('person@faculty.auckland.ac.nz'), false);
  assert.equal(isUniversityEmail('person@aucklanduni.ac.nz.example.com'), false);
});

test('the university email requirement returns a stable API error', () => {
  assert.throws(
    () => requireUniversityEmail('person@example.com'),
    (error: unknown) => error instanceof ApiError
      && error.statusCode === 403
      && error.code === 'UNIVERSITY_EMAIL_REQUIRED'
  );
});
