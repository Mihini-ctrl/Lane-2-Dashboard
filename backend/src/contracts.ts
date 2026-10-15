export type ReviewStatus = 'not_reviewed' | 'in_progress' | 'reviewed';
export type ReviewDecision = 'approve' | 'flag' | null;

export interface AuthUser {
  id: string;
  email: string | null;
  displayName: string;
}

export interface ReviewInput {
  status?: ReviewStatus;
  decision?: ReviewDecision;
  comment?: string;
  secondsSpent?: number;
  expectedUpdatedAt?: string;
}

export interface Lane2Repository {
  listCourses(): Promise<unknown[]>;
  listAssignments(courseId: string): Promise<unknown[]>;
  listSubmissions(assignmentId: string): Promise<unknown[]>;
  getSubmission(submissionId: string): Promise<unknown>;
  saveOwnReview(submissionId: string, reviewerId: string, input: ReviewInput): Promise<unknown>;
}

export interface BackendServices {
  authenticate(accessToken: string): Promise<AuthUser>;
  repositoryFor(accessToken: string): Lane2Repository;
}
