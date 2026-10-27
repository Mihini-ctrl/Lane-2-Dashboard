'use strict';

const { createHash } = require('node:crypto');

/** Stable UUIDs make the import idempotent without leaking prototype string ids into UUID columns. */
function stableUuid(kind, legacyId) {
  const bytes = createHash('sha256').update(`lane2-synthetic:${kind}:${legacyId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function buildSeedPlan(seed, ownerId) {
  if (!seed || !Array.isArray(seed.courses) || !Array.isArray(seed.students)
    || !Array.isArray(seed.assignments) || !Array.isArray(seed.submissions)) {
    throw new Error('The seed must contain courses, students, assignments and submissions arrays.');
  }
  if (!/^[0-9a-f-]{36}$/i.test(ownerId || '')) throw new Error('A valid owner profile UUID is required.');

  const courseId = new Map(seed.courses.map((row) => [row.id, stableUuid('course', row.id)]));
  const studentId = new Map(seed.students.map((row) => [row.id, stableUuid('student', row.id)]));
  const assignmentId = new Map(seed.assignments.map((row) => [row.id, stableUuid('assignment', row.id)]));
  const submissionId = new Map(seed.submissions.map((row) => [row.id, stableUuid('submission', row.id)]));
  const interactionId = new Map();
  const criterionId = new Map();
  seed.submissions.forEach((submission) => (submission.interactions || []).forEach((interaction) => {
    interactionId.set(interaction.id, stableUuid('interaction', interaction.id));
  }));
  seed.assignments.forEach((assignment) => (assignment.rubric || []).forEach((criterion) => {
    criterionId.set(`${assignment.id}:${criterion.id}`, stableUuid('criterion', `${assignment.id}:${criterion.id}`));
  }));

  const plan = {
    courses: seed.courses.map((course) => ({
      id: courseId.get(course.id), legacy_id: course.id, code: course.code, name: course.name,
      semester: course.semester || '', badge: course.badge || '', created_by: ownerId
    })),
    course_memberships: seed.courses.map((course) => ({
      course_id: courseId.get(course.id), user_id: ownerId, role: 'course_admin'
    })),
    students: seed.students.map((student) => ({
      id: studentId.get(student.id), legacy_id: student.id, auth_user_id: null,
      institutional_id: student.upi || null, first_name: student.firstName,
      last_name: student.lastName, email: student.email || '', avatar: student.avatar || '', created_by: ownerId
    })),
    enrolments: seed.courses.flatMap((course) => (course.roster || []).map((entry) => ({
      course_id: courseId.get(course.id), student_id: studentId.get(entry.studentId), group_name: entry.group || ''
    }))),
    assignments: seed.assignments.map((assignment) => ({
      id: assignmentId.get(assignment.id), legacy_id: assignment.id,
      course_id: courseId.get(assignment.courseId), title: assignment.title,
      short_name: assignment.short, description: assignment.description || '',
      due_date: assignment.dueDate || null, word_limit: Number(assignment.wordLimit) || 0,
      lane: Number(assignment.lane) || 2,
      settings: {
        ...(assignment.settings || {}),
        gradingRubric: assignment.marking || [],
        gradingBands: assignment.markingBands || {},
        syntheticSeed: { version: seed.version || 1, sourceId: assignment.id }
      },
      created_by: ownerId
    })),
    rubric_criteria: seed.assignments.flatMap((assignment) => (assignment.rubric || []).map((criterion, position) => ({
      id: criterionId.get(`${assignment.id}:${criterion.id}`), legacy_id: criterion.id,
      assignment_id: assignmentId.get(assignment.id), criterion_type: criterion.type,
      rule_key: criterion.type === 'rule' ? criterion.ruleKey : null,
      name: criterion.type === 'custom' ? criterion.name : null,
      description: criterion.description || '', max_score: Number(criterion.maxScore) || 10, position
    }))),
    submissions: seed.submissions.map((submission) => {
      const interactions = submission.interactions || [];
      const firstTool = submission.sources?.[0]?.tool || interactions[0]?.tool || '';
      return {
        id: submissionId.get(submission.id), legacy_id: submission.id,
        assignment_id: assignmentId.get(submission.assignmentId), student_id: studentId.get(submission.studentId),
        stage: submission.stage, declaration: submission.declaration ?? null,
        logs_attached_at: submission.logsAttachedAt || null, handed_in_at: submission.handedInAt || null,
        final_text: submission.submission || '', revision: 1, chat_log: submission.chatLog || '',
        ai_tool: firstTool, ai_split: Boolean(submission.chatLog && interactions.length),
        hand_in_count: submission.stage === 'handed_in' ? 1 : 0
      };
    }),
    interaction_sources: seed.submissions.flatMap((submission) => (submission.sources || []).map((source, index) => ({
      id: stableUuid('source', `${submission.id}:${index}`), submission_id: submissionId.get(submission.id),
      source_type: source.type || 'link', tool: source.tool || '', url: source.url || '',
      storage_path: null, attached_at: source.attachedAt || submission.logsAttachedAt || null
    }))),
    interactions: seed.submissions.flatMap((submission) => (submission.interactions || []).map((interaction) => ({
      id: interactionId.get(interaction.id), legacy_id: interaction.id,
      submission_id: submissionId.get(submission.id), step: interaction.step,
      task: interaction.task || '', tool: interaction.tool || '', prompt: interaction.prompt || '',
      output: interaction.output || '', critique: interaction.critique || '',
      critique_source: interaction.critiqueSource || '', pushback: Boolean(interaction.pushback),
      pushback_text: interaction.pushbackText || '', student_decision: interaction.decision || 'unrecorded',
      occurred_at: interaction.timestamp || null
    }))),
    submission_critiques: seed.submissions.filter((submission) => submission.critique).map((submission) => ({
      submission_id: submissionId.get(submission.id), used_for: submission.critique.used,
      checked: submission.critique.checked, changed: submission.critique.changed,
      written_at: submission.critique.writtenAt || submission.handedInAt || new Date(0).toISOString()
    })),
    submission_reviews: [],
    rubric_marks: []
  };

  for (const submission of seed.submissions) {
    const review = submission.review || {};
    const meaningful = review.status && review.status !== 'not_reviewed'
      || review.decision || review.comment || review.feedback
      || Object.keys(review.marks || {}).length || Object.keys(review.content || {}).length;
    if (!meaningful) continue;
    const reviewId = stableUuid('review', `${submission.id}:${ownerId}`);
    plan.submission_reviews.push({
      id: reviewId, submission_id: submissionId.get(submission.id), reviewer_id: ownerId,
      status: review.status || 'not_reviewed', decision: review.decision || null,
      comment: review.comment || '', seconds_spent: Number(review.seconds) || 0,
      started_at: submission.logsAttachedAt || null,
      completed_at: review.status === 'reviewed' ? (review.contentSavedAt || submission.handedInAt || null) : null,
      content_marks: review.content || {}, feedback: review.feedback || '',
      content_saved_at: review.contentSavedAt || null
    });
    for (const [legacyInteractionId, byCriterion] of Object.entries(review.marks || {})) {
      for (const [legacyCriterionId, item] of Object.entries(byCriterion || {})) {
        const mappedInteraction = interactionId.get(legacyInteractionId);
        const mappedCriterion = criterionId.get(`${submission.assignmentId}:${legacyCriterionId}`);
        if (!mappedInteraction || !mappedCriterion) continue;
        plan.rubric_marks.push({
          id: stableUuid('mark', `${submission.id}:${legacyInteractionId}:${legacyCriterionId}:${ownerId}`),
          review_id: reviewId, interaction_id: mappedInteraction, criterion_id: mappedCriterion,
          mark: item.mark || null, comment: item.comment || ''
        });
      }
    }
  }

  return plan;
}

module.exports = { buildSeedPlan, stableUuid };
