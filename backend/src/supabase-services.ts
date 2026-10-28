import { fromSupabaseUrl, type SupabaseEnv, type UserClaims } from '@supabase/server';
import { createContextClient, verifyCredentials } from '@supabase/server/core';
import { createClient, type AuthSession, type PostgrestError, type SupabaseClient, type User } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type {
  AiEvaluationInput, AssignmentCriterionInput, AssignmentInput, AuthSessionResult, AuthUser, BackendServices,
  CourseInput, CoursePatch, EnrolmentInput, HandInInput, Lane2Repository, ReviewInput, SignUpInput, StudentPatch
} from './contracts.js';
import type { BackendConfig } from './config.js';
import { requireUniversityEmail } from './auth-policy.js';
import { ApiError, conflict, notFound, unauthorized } from './errors.js';

type Row = Record<string, unknown>;

/** A one-to-one embed comes back as an object (or, from older PostgREST versions, a one-item array). */
function one(value: unknown): Row | null {
  if (Array.isArray(value)) return (value[0] as Row | undefined) ?? null;
  return (value as Row | null) ?? null;
}

// The hand-in content, the critique and the staff-only AI results, embedded in a submission select.
// Students' RLS hides ai_evaluations and critique_assessments, so those come back empty for them.
const CRITIQUE_EMBEDS = `
  chat_log, ai_tool, ai_split, hand_in_count,
  critique:submission_critiques(used_for, checked, changed, word_count, written_at),
  ai_evaluation:ai_evaluations(submission_revision, model, detection, summary, sentences, step_info, text_length, ran_at),
  critique_assessment:critique_assessments(
    submission_revision, level, written_depth, chat_depth, accuracy, ai_written, ai_written_reason, summary, model, assessed_at,
    critique_claims(id, position, claim, verdict, critique_claim_steps(interaction_id))
  )`;

/** Critique and AI evaluation in the frontend's shape. Results from before the latest hand-in are dropped. */
export function critiqueFields(submission: Row) {
  const critique = one(submission.critique);
  const evaluation = one(submission.ai_evaluation);
  const assessment = one(submission.critique_assessment);
  const current = (row: Row | null) => !!row && Number(row.submission_revision) === Number(submission.revision);
  return {
    chatLog: String(submission.chat_log || ''),
    aiSplit: !!submission.ai_split,
    handIns: Number(submission.hand_in_count || 0),
    revision: Number(submission.revision || 1),
    critique: critique ? {
      used: String(critique.used_for || ''), checked: String(critique.checked || ''), changed: String(critique.changed || ''),
      writtenAt: critique.written_at || null
    } : null,
    aiEval: current(evaluation) ? {
      model: evaluation!.model, ranAt: evaluation!.ran_at, summary: evaluation!.summary || '',
      detection: evaluation!.detection || {}, textLength: Number(evaluation!.text_length || 0),
      sentences: evaluation!.sentences || [], steps: evaluation!.step_info || {},
      critique: current(assessment) ? {
        level: Number(assessment!.level), writtenDepth: Number(assessment!.written_depth), chatDepth: Number(assessment!.chat_depth),
        accuracy: assessment!.accuracy, aiWritten: assessment!.ai_written,
        aiWrittenReason: String(assessment!.ai_written_reason || ''), summary: String(assessment!.summary || ''),
        claims: ((assessment!.critique_claims || []) as Row[])
          .sort((a, b) => Number(a.position) - Number(b.position))
          .map((claim) => ({
            claim: String(claim.claim), verdict: claim.verdict,
            steps: ((claim.critique_claim_steps || []) as Row[]).map((link) => String(link.interaction_id))
          }))
      } : null
    } : null
  };
}

function throwDatabaseError(error: PostgrestError): never {
  if (['PGRST200', 'PGRST205', '42P01'].includes(error.code)) {
    throw new ApiError(
      503,
      'The Lane2 database schema is not installed in this Supabase project. Apply the SQL migrations in supabase/migrations, then try again.',
      'SCHEMA_NOT_READY'
    );
  }
  if (error.code === '42501') throw new ApiError(403, 'You do not have access to this record.', 'FORBIDDEN');
  if (error.code === '23505') throw new ApiError(409, 'That record already exists.', 'CONFLICT');
  // Raised on purpose by the hand-in and AI evaluation functions; their messages are written for users.
  if (error.code === '23514') throw new ApiError(400, error.message, 'INVALID_SUBMISSION');
  if (error.code === '40001') throw new ApiError(409, error.message, 'CONFLICT');
  if (error.code === '21000') throw new ApiError(409, error.message, 'STUDENT_ACCOUNT_AMBIGUOUS');
  if (error.code === 'LN001') throw new ApiError(409, error.message, 'ASSIGNMENT_CLOSED');
  if (error.code === 'P0002') throw notFound(error.message);
  throw new ApiError(500, 'The database request failed.', 'DATABASE_ERROR');
}

class SupabaseRepository implements Lane2Repository {
  constructor(private readonly db: SupabaseClient) {}

  async listCourses(): Promise<unknown[]> {
    const { data, error } = await this.db
      .from('courses')
      .select('id, code, name, semester, badge, updated_at')
      .order('code');
    if (error) throwDatabaseError(error);
    return data ?? [];
  }

  async listAssignments(courseId: string): Promise<unknown[]> {
    const { data, error } = await this.db
      .from('assignments')
      .select('id, course_id, title, short_name, description, due_date, word_limit, lane, settings, updated_at')
      .eq('course_id', courseId)
      .order('due_date');
    if (error) throwDatabaseError(error);
    return data ?? [];
  }

  async listSubmissions(assignmentId: string): Promise<unknown[]> {
    const { data, error } = await this.db
      .from('submissions')
      .select(`
        id, assignment_id, student_id, stage, declaration, logs_attached_at,
        handed_in_at, revision, updated_at,
        student:students(id, first_name, last_name, institutional_id, email, avatar),
        reviews:submission_reviews(id, reviewer_id, status, decision, comment, seconds_spent, updated_at)
      `)
      .eq('assignment_id', assignmentId)
      .order('updated_at', { ascending: false });
    if (error) throwDatabaseError(error);
    return data ?? [];
  }

  async getSubmission(submissionId: string): Promise<unknown> {
    const { data, error } = await this.db
      .from('submissions')
      .select(`
        id, assignment_id, student_id, stage, declaration, logs_attached_at,
        handed_in_at, final_text, revision, updated_at, ${CRITIQUE_EMBEDS},
        student:students(id, first_name, last_name, institutional_id, email, avatar),
        assignment:assignments(
          id, course_id, title, short_name, description, due_date, word_limit, lane, settings,
          rubric_criteria(id, criterion_type, rule_key, name, description, max_score, position)
        ),
        interaction_sources(id, source_type, tool, url, storage_path, attached_at),
        interactions(
          id, step, task, tool, prompt, output, critique, critique_source,
          pushback, pushback_text, student_decision, occurred_at, updated_at
        ),
        reviews:submission_reviews(
          id, reviewer_id, status, decision, comment, seconds_spent, started_at,
          completed_at, content_marks, feedback, content_saved_at, updated_at,
          rubric_marks(id, interaction_id, criterion_id, mark, comment, updated_at),
          rubric_scores(id, criterion_id, score, comment, updated_at)
        )
      `)
      .eq('id', submissionId)
      .maybeSingle();
    if (error) throwDatabaseError(error);
    if (!data) throw notFound('Submission not found.');
    return data;
  }

  async getWorkspace(user: AuthUser): Promise<unknown> {
    const profileResult = await this.db.from('profiles')
      .select('id, display_name, first_name, initials, email, default_role')
      .eq('id', user.id).maybeSingle();
    if (profileResult.error) throwDatabaseError(profileResult.error);
    const profile = (profileResult.data || {}) as Row;
    const studentAccount = profile.default_role === 'student';
    let claimedStudentId: string | null = null;

    // The teacher creates the roster first. On the student's first confirmed
    // login, atomically connect their Auth identity to the record with the
    // same university email. Later requests simply return the existing link.
    if (studentAccount) {
      const claimResult = await this.db.rpc('claim_student_account');
      if (claimResult.error) throwDatabaseError(claimResult.error);
      claimedStudentId = String(claimResult.data || '') || null;
    }

    const [coursesResult, membershipsResult, enrolmentsResult, assignmentsResult, submissionsResult] = await Promise.all([
      this.db.from('courses').select('id, code, name, semester, badge, updated_at').order('code'),
      this.db.from('course_memberships').select('course_id, user_id, role, profile:profiles(id, display_name, first_name, initials, email, default_role)'),
      this.db.from('enrolments').select('course_id, student_id, group_name, student:students(id, first_name, last_name, institutional_id, email, avatar)'),
      this.db.from('assignments').select(`
        id, course_id, title, short_name, description, due_date, word_limit, lane, settings, updated_at,
        rubric_criteria(id, criterion_type, rule_key, name, description, max_score, position)
      `).order('due_date'),
      this.db.from('submissions').select(`
        id, assignment_id, student_id, stage, declaration, logs_attached_at, handed_in_at,
        final_text, revision, updated_at, ${CRITIQUE_EMBEDS},
        interaction_sources(id, source_type, tool, url, storage_path, attached_at),
        interactions(id, step, task, tool, prompt, output, critique, critique_source, pushback, pushback_text, student_decision, occurred_at),
        reviews:submission_reviews(id, reviewer_id, status, decision, comment, seconds_spent,
          content_marks, feedback, content_saved_at, updated_at,
          rubric_marks(id, interaction_id, criterion_id, mark, comment, updated_at),
          rubric_scores(id, criterion_id, score, comment, updated_at))
      `)
    ]);

    for (const result of [coursesResult, membershipsResult, enrolmentsResult, assignmentsResult, submissionsResult]) {
      if (result.error) throwDatabaseError(result.error);
    }

    const courses = (coursesResult.data || []) as Row[];
    const memberships = (membershipsResult.data || []) as Row[];
    const enrolments = (enrolmentsResult.data || []) as Row[];
    const assignments = (assignmentsResult.data || []) as Row[];
    const submissions = (submissionsResult.data || []) as Row[];
    const courseIds = studentAccount
      ? enrolments.map((item) => item.course_id as string)
      : memberships.filter((item) => item.user_id === user.id).map((item) => item.course_id as string);
    const displayName = String(profile.display_name || user.displayName);
    const firstName = String(profile.first_name || displayName.split(' ')[0] || (studentAccount ? 'Student' : 'Teacher'));
    const initials = String(profile.initials || displayName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase());

    const studentsById = new Map<string, Row>();
    enrolments.forEach((item) => {
      const student = item.student as Row | null;
      if (student?.id) studentsById.set(String(student.id), student);
    });
    const currentStudent = claimedStudentId ? studentsById.get(claimedStudentId) : undefined;
    if (studentAccount && !currentStudent) {
      throw new ApiError(404, 'Your student record could not be loaded. Ask your teacher to check your enrolment email.', 'STUDENT_ENROLMENT_NOT_FOUND');
    }
    const studentName = currentStudent
      ? `${String(currentStudent.first_name || '')} ${String(currentStudent.last_name || '')}`.trim()
      : displayName;
    const studentFirstName = currentStudent ? String(currentStudent.first_name || firstName) : firstName;
    const studentInitials = currentStudent
      ? `${String(currentStudent.first_name || '')[0] || ''}${String(currentStudent.last_name || '')[0] || ''}`.toUpperCase()
      : initials;
    const currentUser = studentAccount ? {
      id: user.id,
      type: 'student',
      studentId: claimedStudentId,
      username: user.email || '',
      name: studentName || displayName,
      first: studentFirstName,
      initials: studentInitials || initials,
      role: 'Student',
      email: user.email || '',
      courses: courseIds
    } : {
      id: user.id,
      username: user.email || '',
      name: displayName,
      first: firstName,
      initials,
      role: String(profile.default_role || 'lecturer'),
      email: user.email || '',
      courses: courseIds
    };

    const state = {
      version: 4,
      updatedAt: new Date().toISOString(),
      teacher: { name: displayName, first: firstName, initials, role: String(profile.default_role || 'lecturer'), email: user.email || '' },
      users: [currentUser],
      staff: memberships.map((item) => {
        const member = (item.profile || {}) as Row;
        return { id: item.user_id, name: member.display_name || 'Teaching staff', initials: member.initials || '', role: item.role, courses: [item.course_id] };
      }),
      courses: courses.map((course) => ({
        id: course.id, code: course.code, name: course.name, semester: course.semester, badge: course.badge,
        roster: enrolments.filter((item) => item.course_id === course.id).map((item) => ({ studentId: item.student_id, group: item.group_name || '' }))
      })),
      students: Array.from(studentsById.values()).map((student) => ({
        id: student.id, firstName: student.first_name, lastName: student.last_name,
        upi: student.institutional_id || '', email: student.email || '', avatar: student.avatar || ''
      })),
      assignments: assignments.map((assignment) => ({
        id: assignment.id, courseId: assignment.course_id, title: assignment.title,
        short: assignment.short_name, description: assignment.description || '', dueDate: assignment.due_date || '',
        wordLimit: assignment.word_limit || 0, lane: assignment.lane || 2, settings: assignment.settings || {},
        marking: ((assignment.settings || {}) as Row).gradingRubric || [],
        markingBands: ((assignment.settings || {}) as Row).gradingBands || {},
        rubricVersions: ((assignment.settings || {}) as Row).rubricVersions || [],
        rubric: ((assignment.rubric_criteria || []) as Row[]).sort((a, b) => Number(a.position) - Number(b.position)).map((criterion) => ({
          id: criterion.id, type: criterion.criterion_type, ruleKey: criterion.rule_key || undefined,
          name: criterion.name || undefined, description: criterion.description || '', maxScore: Number(criterion.max_score || 10)
        }))
      })),
      submissions: submissions.map((submission) => {
        const ownReview = ((submission.reviews || []) as Row[]).find((review) => review.reviewer_id === user.id);
        const marks: Record<string, Record<string, { mark: unknown; comment: string }>> = {};
        ((ownReview?.rubric_marks || []) as Row[]).forEach((item) => {
          const interactionId = String(item.interaction_id);
          marks[interactionId] ||= {};
          marks[interactionId]![String(item.criterion_id)] = { mark: item.mark || null, comment: String(item.comment || '') };
        });
        const scores: Record<string, { score: number | null; comment: string }> = {};
        ((ownReview?.rubric_scores || []) as Row[]).forEach((item) => {
          scores[String(item.criterion_id)] = { score: item.score == null ? null : Number(item.score), comment: String(item.comment || '') };
        });
        return {
          id: submission.id, assignmentId: submission.assignment_id, studentId: submission.student_id,
          stage: submission.stage, declaration: submission.declaration || null,
          logsAttachedAt: submission.logs_attached_at || null, handedInAt: submission.handed_in_at || null,
          submission: submission.final_text || '',
          ...critiqueFields(submission),
          sources: ((submission.interaction_sources || []) as Row[]).map((source) => ({
            id: source.id, type: source.source_type, tool: source.tool || '', url: source.url || '', attachedAt: source.attached_at || null
          })),
          interactions: ((submission.interactions || []) as Row[]).sort((a, b) => Number(a.step) - Number(b.step)).map((interaction) => ({
            id: interaction.id, step: interaction.step, task: interaction.task || '', tool: interaction.tool || '',
            prompt: interaction.prompt || '', output: interaction.output || '', critique: interaction.critique || '',
            critiqueSource: interaction.critique_source || '', pushback: !!interaction.pushback,
            pushbackText: interaction.pushback_text || '', decision: interaction.student_decision || 'unrecorded',
            timestamp: interaction.occurred_at || null
          })),
          review: {
            id: ownReview?.id || null, status: ownReview?.status || 'not_reviewed', decision: ownReview?.decision || null,
            comment: ownReview?.comment || '', marks, scores, seconds: ownReview?.seconds_spent || 0,
            content: ownReview?.content_marks || {}, feedback: ownReview?.feedback || '',
            contentSavedAt: ownReview?.content_saved_at || null,
            updatedAt: ownReview?.updated_at || null
          }
        };
      })
    };

    return { user, state };
  }

  async createCourse(creatorId: string, input: CourseInput): Promise<unknown> {
    const { data, error } = await this.db.from('courses').insert({
      code: input.code,
      name: input.name,
      semester: input.semester,
      badge: input.badge,
      created_by: creatorId
    }).select('id, code, name, semester, badge, updated_at').single();
    if (error) throwDatabaseError(error);
    return data;
  }

  async updateCourse(courseId: string, input: CoursePatch): Promise<unknown> {
    const fields: Row = {};
    if (input.code !== undefined) fields.code = input.code;
    if (input.name !== undefined) fields.name = input.name;
    if (input.semester !== undefined) fields.semester = input.semester;
    if (input.badge !== undefined) fields.badge = input.badge;
    const { data, error } = await this.db.from('courses').update(fields).eq('id', courseId)
      .select('id, code, name, semester, badge, updated_at').maybeSingle();
    if (error) throwDatabaseError(error);
    if (!data) throw notFound('Course not found.');
    return data;
  }

  async deleteCourse(courseId: string): Promise<void> {
    const { error } = await this.db.from('courses').delete().eq('id', courseId);
    if (error) throwDatabaseError(error);
  }

  async createAssignment(creatorId: string, input: AssignmentInput): Promise<unknown> {
    const { data, error } = await this.db.from('assignments').insert({
      course_id: input.courseId,
      title: input.title,
      short_name: input.short,
      description: input.description,
      due_date: input.dueDate,
      word_limit: input.wordLimit,
      lane: input.lane,
      settings: input.settings,
      created_by: creatorId
    }).select('id').single();
    if (error) throwDatabaseError(error);
    try {
      await this.syncRubric(data.id, input.rubric);
      await this.seedAssignmentSubmissions(data.id, input.courseId);
      return await this.readAssignment(data.id);
    } catch (caught) {
      await this.db.from('assignments').delete().eq('id', data.id);
      throw caught;
    }
  }

  async updateAssignment(assignmentId: string, input: AssignmentInput): Promise<unknown> {
    const { data: current, error: readError } = await this.db.from('assignments')
      .select('id, course_id').eq('id', assignmentId).maybeSingle();
    if (readError) throwDatabaseError(readError);
    if (!current) throw notFound('Assignment not found.');
    const moved = current.course_id !== input.courseId;
    if (moved) {
      const { data: started, error: startedError } = await this.db.from('submissions')
        .select('id').eq('assignment_id', assignmentId).neq('stage', 'not_started').limit(1);
      if (startedError) throwDatabaseError(startedError);
      if (started?.length) throw conflict('Students have already started this assignment, so it cannot move to another course.');
    }

    const { data, error } = await this.db.from('assignments').update({
      course_id: input.courseId,
      title: input.title,
      short_name: input.short,
      description: input.description,
      due_date: input.dueDate,
      word_limit: input.wordLimit,
      lane: input.lane,
      settings: input.settings
    }).eq('id', assignmentId).select('id').maybeSingle();
    if (error) throwDatabaseError(error);
    if (!data) throw notFound('Assignment not found.');

    if (moved) {
      const { error: deleteError } = await this.db.from('submissions').delete().eq('assignment_id', assignmentId);
      if (deleteError) throwDatabaseError(deleteError);
      await this.seedAssignmentSubmissions(assignmentId, input.courseId);
    }
    await this.syncRubric(assignmentId, input.rubric);
    return this.readAssignment(assignmentId);
  }

  async deleteAssignment(assignmentId: string): Promise<void> {
    const { error } = await this.db.from('assignments').delete().eq('id', assignmentId);
    if (error) throwDatabaseError(error);
  }

  async createEnrolment(courseId: string, creatorId: string, input: EnrolmentInput): Promise<unknown> {
    const studentId = input.studentId || randomUUID();
    const createdStudent = !input.studentId;
    if (createdStudent) {
      const { error: studentError } = await this.db.from('students').insert({
        id: studentId,
        first_name: input.firstName,
        last_name: input.lastName || '',
        institutional_id: input.institutionalId || null,
        email: input.email || '',
        avatar: '',
        created_by: creatorId
      });
      if (studentError) throwDatabaseError(studentError);
    }

    const { data, error } = await this.db.from('enrolments').insert({
      course_id: courseId,
      student_id: studentId,
      group_name: input.groupName
    }).select('course_id, student_id, group_name').single();
    if (error) {
      if (createdStudent) await this.db.from('students').delete().eq('id', studentId);
      throwDatabaseError(error);
    }
    await this.seedStudentSubmissions(courseId, studentId);
    return data;
  }

  async updateEnrolment(courseId: string, studentId: string, groupName: string): Promise<unknown> {
    const { data, error } = await this.db.from('enrolments').update({ group_name: groupName })
      .eq('course_id', courseId).eq('student_id', studentId)
      .select('course_id, student_id, group_name').maybeSingle();
    if (error) throwDatabaseError(error);
    if (!data) throw notFound('Enrolment not found.');
    return data;
  }

  async deleteEnrolment(courseId: string, studentId: string): Promise<void> {
    const { data: assignments, error: assignmentError } = await this.db.from('assignments').select('id').eq('course_id', courseId);
    if (assignmentError) throwDatabaseError(assignmentError);
    const assignmentIds = (assignments || []).map((item) => item.id);
    if (assignmentIds.length) {
      const { error: submissionError } = await this.db.from('submissions').delete()
        .eq('student_id', studentId).in('assignment_id', assignmentIds);
      if (submissionError) throwDatabaseError(submissionError);
    }
    const { error } = await this.db.from('enrolments').delete().eq('course_id', courseId).eq('student_id', studentId);
    if (error) throwDatabaseError(error);
  }

  async updateStudent(studentId: string, input: StudentPatch): Promise<unknown> {
    const fields: Row = {};
    if (input.firstName !== undefined) fields.first_name = input.firstName;
    if (input.lastName !== undefined) fields.last_name = input.lastName;
    if (input.institutionalId !== undefined) fields.institutional_id = input.institutionalId || null;
    if (input.email !== undefined) fields.email = input.email;
    const { data, error } = await this.db.from('students').update(fields).eq('id', studentId)
      .select('id, first_name, last_name, institutional_id, email, avatar').maybeSingle();
    if (error) throwDatabaseError(error);
    if (!data) throw notFound('Student not found.');
    return data;
  }

  async deleteStudent(studentId: string): Promise<void> {
    const { data: enrolments, error: readError } = await this.db.from('enrolments')
      .select('course_id').eq('student_id', studentId);
    if (readError) throwDatabaseError(readError);
    for (const enrolment of enrolments || []) await this.deleteEnrolment(enrolment.course_id, studentId);
    const { error } = await this.db.from('students').delete().eq('id', studentId);
    if (error) throwDatabaseError(error);
  }

  async saveOwnReview(submissionId: string, reviewerId: string, input: ReviewInput): Promise<unknown> {
    const { data: existing, error: readError } = await this.db
      .from('submission_reviews')
      .select('id, updated_at')
      .eq('submission_id', submissionId)
      .eq('reviewer_id', reviewerId)
      .maybeSingle();
    if (readError) throwDatabaseError(readError);

    if (existing && input.expectedUpdatedAt && existing.updated_at !== input.expectedUpdatedAt) {
      throw conflict('This review changed in another tab. Reload it before saving.');
    }

    const payload: Row = {};
    if (input.status !== undefined) payload.status = input.status;
    if (input.decision !== undefined) payload.decision = input.decision;
    if (input.comment !== undefined) payload.comment = input.comment;
    if (input.secondsSpent !== undefined) payload.seconds_spent = input.secondsSpent;

    if (existing) {
      let query = this.db
        .from('submission_reviews')
        .update(payload)
        .eq('id', existing.id)
        .eq('reviewer_id', reviewerId);
      if (input.expectedUpdatedAt) query = query.eq('updated_at', input.expectedUpdatedAt);
      const { data, error } = await query.select().maybeSingle();
      if (error) throwDatabaseError(error);
      if (!data) throw conflict('This review changed while it was being saved. Reload and try again.');
      if (input.marks) await this.saveMarks(data.id, input.marks);
      if (input.scores) await this.saveScores(data.id, input.scores);
      return this.readReview(data.id);
    }

    const { data, error } = await this.db
      .from('submission_reviews')
      .insert({ submission_id: submissionId, reviewer_id: reviewerId, ...payload })
      .select()
      .single();
    if (error) throwDatabaseError(error);
    if (input.marks) await this.saveMarks(data.id, input.marks);
    if (input.scores) await this.saveScores(data.id, input.scores);
    return this.readReview(data.id);
  }

  async handIn(submissionId: string, input: HandInInput): Promise<unknown> {
    const { data, error } = await this.db.rpc('hand_in_submission', {
      target_submission_id: submissionId,
      final_text: input.finalText,
      chat_log: input.chatLog,
      ai_tool: input.tool,
      used_for: input.critique.used,
      checked: input.critique.checked,
      changed: input.critique.changed,
      expected_revision: input.expectedRevision ?? null
    });
    if (error) throwDatabaseError(error);
    const row = (Array.isArray(data) ? data[0] : data) as Row | null;
    if (!row) throw notFound('Submission not found.');
    return {
      id: row.id, stage: row.stage, handedInAt: row.handed_in_at, logsAttachedAt: row.logs_attached_at,
      revision: row.revision, handIns: row.hand_in_count
    };
  }

  async saveAiEvaluation(submissionId: string, input: AiEvaluationInput): Promise<unknown> {
    const { error } = await this.db.rpc('save_ai_evaluation', { target_submission_id: submissionId, payload: input });
    if (error) throwDatabaseError(error);
    const submission = (await this.getSubmission(submissionId)) as Row;
    return critiqueFields(submission).aiEval;
  }

  private async saveMarks(reviewId: string, marks: NonNullable<ReviewInput['marks']>): Promise<void> {
    if (!marks.length) return;
    const rows = marks.map((item) => ({
      review_id: reviewId,
      interaction_id: item.interactionId,
      criterion_id: item.criterionId,
      mark: item.mark,
      comment: item.comment
    }));
    const { error } = await this.db.from('rubric_marks').upsert(rows, {
      onConflict: 'review_id,interaction_id,criterion_id'
    });
    if (error) throwDatabaseError(error);
  }

  private async saveScores(reviewId: string, scores: NonNullable<ReviewInput['scores']>): Promise<void> {
    if (!scores.length) return;
    const rows = scores.map((item) => ({
      review_id: reviewId,
      criterion_id: item.criterionId,
      score: item.score,
      comment: item.comment
    }));
    const { error } = await this.db.from('rubric_scores').upsert(rows, {
      onConflict: 'review_id,criterion_id'
    });
    if (error) throwDatabaseError(error);
  }

  private async readReview(reviewId: string): Promise<unknown> {
    const { data, error } = await this.db
      .from('submission_reviews')
      .select('id, submission_id, reviewer_id, status, decision, comment, seconds_spent, updated_at, rubric_marks(id, interaction_id, criterion_id, mark, comment, updated_at), rubric_scores(id, criterion_id, score, comment, updated_at)')
      .eq('id', reviewId)
      .single();
    if (error) throwDatabaseError(error);
    return data;
  }

  private async readAssignment(assignmentId: string): Promise<unknown> {
    const { data, error } = await this.db.from('assignments').select(`
      id, course_id, title, short_name, description, due_date, word_limit, lane, settings, updated_at,
      rubric_criteria(id, criterion_type, rule_key, name, description, max_score, position)
    `).eq('id', assignmentId).single();
    if (error) throwDatabaseError(error);
    return data;
  }

  private async syncRubric(assignmentId: string, rubric: AssignmentCriterionInput[]): Promise<void> {
    const { data: existing, error: readError } = await this.db.from('rubric_criteria')
      .select('id').eq('assignment_id', assignmentId);
    if (readError) throwDatabaseError(readError);
    const existingIds = new Set((existing || []).map((item) => item.id));
    const keptIds = new Set<string>();
    const inserts: Row[] = [];

    for (const [position, criterion] of rubric.entries()) {
      const values = {
        assignment_id: assignmentId,
        criterion_type: criterion.type,
        rule_key: criterion.type === 'rule' ? criterion.ruleKey : null,
        name: criterion.type === 'custom' ? criterion.name : null,
        description: criterion.description || '',
        max_score: criterion.maxScore,
        position
      };
      if (criterion.id && existingIds.has(criterion.id)) {
        keptIds.add(criterion.id);
        const { error } = await this.db.from('rubric_criteria').update(values)
          .eq('id', criterion.id).eq('assignment_id', assignmentId);
        if (error) throwDatabaseError(error);
      } else inserts.push(values);
    }

    if (inserts.length) {
      const { error } = await this.db.from('rubric_criteria').insert(inserts);
      if (error) throwDatabaseError(error);
    }
    const removed = [...existingIds].filter((id) => !keptIds.has(id));
    if (removed.length) {
      const { error } = await this.db.from('rubric_criteria').delete().eq('assignment_id', assignmentId).in('id', removed);
      if (error) throwDatabaseError(error);
    }
  }

  private async seedAssignmentSubmissions(assignmentId: string, courseId: string): Promise<void> {
    const { data: enrolments, error } = await this.db.from('enrolments').select('student_id').eq('course_id', courseId);
    if (error) throwDatabaseError(error);
    const rows = (enrolments || []).map((item) => ({ assignment_id: assignmentId, student_id: item.student_id }));
    if (!rows.length) return;
    const { error: insertError } = await this.db.from('submissions').upsert(rows, {
      onConflict: 'assignment_id,student_id', ignoreDuplicates: true
    });
    if (insertError) throwDatabaseError(insertError);
  }

  private async seedStudentSubmissions(courseId: string, studentId: string): Promise<void> {
    const { data: assignments, error } = await this.db.from('assignments').select('id').eq('course_id', courseId);
    if (error) throwDatabaseError(error);
    const rows = (assignments || []).map((item) => ({ assignment_id: item.id, student_id: studentId }));
    if (!rows.length) return;
    const { error: insertError } = await this.db.from('submissions').upsert(rows, {
      onConflict: 'assignment_id,student_id', ignoreDuplicates: true
    });
    if (insertError) throwDatabaseError(insertError);
  }
}

function authUser(user: User): AuthUser {
  const metadata = user.user_metadata as Record<string, unknown>;
  return {
    id: user.id,
    email: user.email ?? null,
    displayName: String(metadata.display_name || user.email?.split('@')[0] || 'User')
  };
}

function authUserFromClaims(claims: UserClaims): AuthUser {
  const metadata = claims.userMetadata ?? {};
  return {
    id: claims.id,
    email: claims.email ?? null,
    displayName: String(metadata.display_name || claims.email?.split('@')[0] || 'User')
  };
}

function sessionResult(session: AuthSession): AuthSessionResult {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? null,
    user: authUser(session.user)
  };
}

export function createSupabaseServices(config: BackendConfig): BackendServices {
  const publicAuthClient = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const secretKeys: Record<string, string> = {};
  if (config.supabaseSecretKey) secretKeys.default = config.supabaseSecretKey;
  const serverEnv: Partial<SupabaseEnv> = {
    url: config.supabaseUrl,
    publishableKeys: { default: config.supabasePublishableKey },
    secretKeys,
    jwks: new URL(config.supabaseJwksUrl)
  };

  return {
    async signIn(email: string, password: string): Promise<AuthSessionResult> {
      requireUniversityEmail(email);
      const { data, error } = await publicAuthClient.auth.signInWithPassword({ email, password });
      if (error || !data.session) throw new ApiError(401, 'That email and password do not match an account.', 'INVALID_CREDENTIALS');
      requireUniversityEmail(data.session.user.email);
      return sessionResult(data.session);
    },

    async signUp(input: SignUpInput): Promise<AuthSessionResult | null> {
      requireUniversityEmail(input.email);
      const displayName = `${input.firstName} ${input.lastName}`.trim();
      const initials = `${input.firstName[0] || ''}${input.lastName[0] || ''}`.toUpperCase();
      const { data, error } = await publicAuthClient.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          data: { display_name: displayName, first_name: input.firstName, initials, default_role: input.role },
          ...(config.supabaseAuthRedirectUrl ? { emailRedirectTo: config.supabaseAuthRedirectUrl } : {})
        }
      });
      if (error) throw new ApiError(400, error.message, 'SIGNUP_FAILED');
      if (!data.session) return null;
      requireUniversityEmail(data.session.user.email);
      return sessionResult(data.session);
    },

    async refreshSession(refreshToken: string): Promise<AuthSessionResult> {
      const { data, error } = await publicAuthClient.auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data.session) throw unauthorized('Your session has expired. Please log in again.');
      requireUniversityEmail(data.session.user.email);
      return sessionResult(data.session);
    },

    async authenticate(accessToken: string): Promise<AuthUser> {
      const { data, error } = await verifyCredentials(
        { token: accessToken, apikey: null },
        {
          auth: 'user',
          issuer: fromSupabaseUrl(config.supabaseUrl),
          env: serverEnv
        }
      );
      if (error || !data.userClaims) throw unauthorized('Your session is invalid or has expired.');
      requireUniversityEmail(data.userClaims.email);
      return authUserFromClaims(data.userClaims);
    },

    repositoryFor(accessToken: string): Lane2Repository {
      const client = createContextClient({
        auth: { token: accessToken },
        env: serverEnv
      });
      return new SupabaseRepository(client);
    }
  };
}
