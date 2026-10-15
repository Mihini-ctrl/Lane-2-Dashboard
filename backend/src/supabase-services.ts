import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js';
import type { AuthUser, BackendServices, Lane2Repository, ReviewInput } from './contracts.js';
import type { BackendConfig } from './config.js';
import { ApiError, conflict, notFound, unauthorized } from './errors.js';

type Row = Record<string, unknown>;

function throwDatabaseError(error: PostgrestError): never {
  if (error.code === '42501') throw new ApiError(403, 'You do not have access to this record.', 'FORBIDDEN');
  if (error.code === '23505') throw new ApiError(409, 'That record already exists.', 'CONFLICT');
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
        handed_in_at, final_text, revision, updated_at,
        student:students(id, first_name, last_name, institutional_id, email, avatar),
        assignment:assignments(
          id, course_id, title, short_name, description, due_date, word_limit, lane, settings,
          rubric_criteria(id, criterion_type, rule_key, name, description, position)
        ),
        interaction_sources(id, source_type, tool, url, storage_path, attached_at),
        interactions(
          id, step, task, tool, prompt, output, critique, critique_source,
          pushback, pushback_text, student_decision, occurred_at, updated_at
        ),
        reviews:submission_reviews(
          id, reviewer_id, status, decision, comment, seconds_spent, started_at,
          completed_at, updated_at,
          rubric_marks(id, interaction_id, criterion_id, mark, comment, updated_at)
        )
      `)
      .eq('id', submissionId)
      .maybeSingle();
    if (error) throwDatabaseError(error);
    if (!data) throw notFound('Submission not found.');
    return data;
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
      return data;
    }

    const { data, error } = await this.db
      .from('submission_reviews')
      .insert({ submission_id: submissionId, reviewer_id: reviewerId, ...payload })
      .select()
      .single();
    if (error) throwDatabaseError(error);
    return data;
  }
}

export function createSupabaseServices(config: BackendConfig): BackendServices {
  const authClient = createClient(config.supabaseUrl, config.supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  return {
    async authenticate(accessToken: string): Promise<AuthUser> {
      const { data, error } = await authClient.auth.getUser(accessToken);
      if (error || !data.user) throw unauthorized('Your session is invalid or has expired.');
      const metadata = data.user.user_metadata as Record<string, unknown>;
      return {
        id: data.user.id,
        email: data.user.email ?? null,
        displayName: String(metadata.display_name || data.user.email?.split('@')[0] || 'User')
      };
    },

    repositoryFor(accessToken: string): Lane2Repository {
      const client = createClient(config.supabaseUrl, config.supabasePublishableKey, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: { autoRefreshToken: false, persistSession: false }
      });
      return new SupabaseRepository(client);
    }
  };
}
