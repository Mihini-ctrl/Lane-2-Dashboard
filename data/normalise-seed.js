/* Convert the nested prototype seed into rows for the PostgreSQL schema. */
'use strict';

const crypto = require('node:crypto');

function stableUuid(value) {
  const bytes = crypto.createHash('sha256').update(String(value)).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

function normaliseSeed(seed, reviewerId) {
  if (!seed || !Array.isArray(seed.courses) || !Array.isArray(seed.students) ||
      !Array.isArray(seed.assignments) || !Array.isArray(seed.submissions)) {
    throw new TypeError('Seed must contain courses, students, assignments and submissions arrays.');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reviewerId || '')) {
    throw new TypeError('reviewerId must be the UUID of an existing Supabase Auth user.');
  }

  const courseIds = new Map(seed.courses.map((x) => [x.id, stableUuid('course:' + x.id)]));
  const studentIds = new Map(seed.students.map((x) => [x.id, stableUuid('student:' + x.id)]));
  const assignmentIds = new Map(seed.assignments.map((x) => [x.id, stableUuid('assignment:' + x.id)]));
  const submissionIds = new Map(seed.submissions.map((x) => [x.id, stableUuid('submission:' + x.id)]));
  const interactionIds = new Map();
  const criterionIds = new Map();

  seed.submissions.forEach((submission) => {
    (submission.interactions || []).forEach((interaction) => {
      interactionIds.set(interaction.id, stableUuid('interaction:' + interaction.id));
    });
  });
  seed.assignments.forEach((assignment) => {
    (assignment.rubric || []).forEach((criterion) => {
      criterionIds.set(assignment.id + ':' + criterion.id, stableUuid('criterion:' + assignment.id + ':' + criterion.id));
    });
  });

  const rows = {
    courses: seed.courses.map((course) => ({
      id: courseIds.get(course.id), legacy_id: course.id, code: course.code,
      name: course.name, semester: course.semester || '', badge: course.badge || '', created_by: reviewerId
    })),
    students: seed.students.map((student) => ({
      id: studentIds.get(student.id), legacy_id: student.id, auth_user_id: null,
      institutional_id: student.upi || null, first_name: student.firstName,
      last_name: student.lastName, email: student.email || '', avatar: student.avatar || '', created_by: reviewerId
    })),
    enrolments: [],
    assignments: seed.assignments.map((assignment) => ({
      id: assignmentIds.get(assignment.id), legacy_id: assignment.id,
      course_id: courseIds.get(assignment.courseId), title: assignment.title,
      short_name: assignment.short, description: assignment.description || '',
      due_date: assignment.dueDate || null, word_limit: assignment.wordLimit || 0,
      lane: assignment.lane || 2, settings: assignment.settings || {}, created_by: reviewerId
    })),
    rubric_criteria: [],
    submissions: [],
    interaction_sources: [],
    interactions: [],
    submission_reviews: [],
    rubric_marks: []
  };

  seed.courses.forEach((course) => {
    (course.roster || []).forEach((entry) => {
      rows.enrolments.push({
        course_id: courseIds.get(course.id), student_id: studentIds.get(entry.studentId),
        group_name: entry.group || ''
      });
    });
  });

  seed.assignments.forEach((assignment) => {
    (assignment.rubric || []).forEach((criterion, position) => {
      rows.rubric_criteria.push({
        id: criterionIds.get(assignment.id + ':' + criterion.id), legacy_id: criterion.id,
        assignment_id: assignmentIds.get(assignment.id), criterion_type: criterion.type,
        rule_key: criterion.ruleKey || null, name: criterion.name || null,
        description: criterion.description || '', position
      });
    });
  });

  seed.submissions.forEach((submission) => {
    const submissionId = submissionIds.get(submission.id);
    rows.submissions.push({
      id: submissionId, legacy_id: submission.id,
      assignment_id: assignmentIds.get(submission.assignmentId),
      student_id: studentIds.get(submission.studentId), stage: submission.stage,
      declaration: submission.declaration || null, logs_attached_at: submission.logsAttachedAt || null,
      handed_in_at: submission.handedInAt || null, final_text: submission.submission || ''
    });

    (submission.sources || []).forEach((source, index) => {
      rows.interaction_sources.push({
        id: stableUuid('source:' + submission.id + ':' + index), submission_id: submissionId,
        source_type: source.type || 'link', tool: source.tool || '', url: source.url || '',
        storage_path: null, attached_at: source.attachedAt || null
      });
    });

    (submission.interactions || []).forEach((interaction) => {
      rows.interactions.push({
        id: interactionIds.get(interaction.id), legacy_id: interaction.id, submission_id: submissionId,
        step: interaction.step, task: interaction.task || '', tool: interaction.tool || '',
        prompt: interaction.prompt || '', output: interaction.output || '', critique: interaction.critique || '',
        critique_source: interaction.critiqueSource || '', pushback: !!interaction.pushback,
        pushback_text: interaction.pushbackText || '', student_decision: interaction.decision || 'unrecorded',
        occurred_at: interaction.timestamp || null
      });
    });

    const review = submission.review || {};
    const reviewId = stableUuid('review:' + submission.id + ':' + reviewerId);
    rows.submission_reviews.push({
      id: reviewId, submission_id: submissionId, reviewer_id: reviewerId,
      status: review.status || 'not_reviewed', decision: review.decision || null,
      comment: review.comment || '', seconds_spent: review.seconds || 0
    });

    Object.entries(review.marks || {}).forEach(([legacyInteractionId, byCriterion]) => {
      Object.entries(byCriterion || {}).forEach(([legacyCriterionId, mark]) => {
        const criterionId = criterionIds.get(submission.assignmentId + ':' + legacyCriterionId);
        const interactionId = interactionIds.get(legacyInteractionId);
        if (!criterionId || !interactionId) return;
        rows.rubric_marks.push({
          id: stableUuid('mark:' + reviewId + ':' + interactionId + ':' + criterionId),
          review_id: reviewId, interaction_id: interactionId, criterion_id: criterionId,
          mark: mark.mark || null, comment: mark.comment || ''
        });
      });
    });
  });

  return rows;
}

module.exports = { normaliseSeed, stableUuid };
