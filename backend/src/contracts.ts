export type ReviewStatus = 'not_reviewed' | 'in_progress' | 'reviewed';
export type ReviewDecision = 'approve' | 'flag' | 'clarify' | null;

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
  marks?: ReviewMarkInput[];
  scores?: ReviewScoreInput[];
  /** Marks against the assignment's grading rubric, keyed by grading criterion id. */
  contentMarks?: Record<string, unknown>;
  /** Written feedback that goes with the content marks. */
  feedback?: string;
}

export interface ReviewMarkInput {
  interactionId: string;
  criterionId: string;
  mark: 'approve' | 'flag' | null;
  comment: string;
}

export interface ReviewScoreInput {
  criterionId: string;
  score: number | null;
  comment: string;
}

export interface AuthSessionResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  user: AuthUser;
}

export interface SignUpInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'course_admin' | 'coordinator' | 'lecturer' | 'teaching_assistant' | 'marker' | 'student';
}

export interface CourseInput {
  code: string;
  name: string;
  semester: string;
  badge: string;
}

export type CoursePatch = Partial<CourseInput>;

export interface AssignmentCriterionInput {
  id?: string;
  type: 'rule' | 'custom';
  ruleKey?: string;
  name?: string;
  description: string;
  maxScore: number;
}

export interface AssignmentInput {
  courseId: string;
  title: string;
  short: string;
  description: string;
  dueDate: string | null;
  wordLimit: number;
  lane: number;
  settings: Record<string, unknown>;
  rubric: AssignmentCriterionInput[];
}

export interface EnrolmentInput {
  studentId?: string;
  firstName?: string;
  lastName?: string;
  institutionalId?: string;
  email?: string;
  groupName: string;
}

export interface StudentPatch {
  firstName?: string;
  lastName?: string;
  institutionalId?: string;
  email?: string;
}

/** The three guided answers a student writes about their AI use. */
export interface CritiqueInput {
  used: string;
  checked: string;
  changed: string;
}

/** A student's hand-in: the work's text, the pasted AI chat and the critique. */
export interface HandInInput {
  finalText: string;
  chatLog: string;
  tool: string;
  critique: CritiqueInput;
  expectedRevision?: number;
  /** The handed-in PDF or Word file, base64 encoded. Left out when the student keeps their last file. */
  file?: HandInFile;
}

export interface HandInFile {
  name: string;
  type?: string;
  data: string;
}

/** A short-lived link to download a handed-in file. */
export interface SubmissionFileLink {
  url: string;
  name: string;
}

/** Step numbers refer to the submission's steps (1, 2, 3 …), not database ids. */
export interface AiEvaluationInput {
  model: string;
  detection: Record<string, unknown>;
  summary: string;
  textLength: number;
  sentences: { text: string; para: number; source: 'own' | 'changed' | 'unchanged' | 'unlogged'; steps: number[] }[];
  steps: { step: number; task: string; purpose: string; use: string }[];
  /** Present on the first run over a pasted log: the steps it was split into. */
  splitSteps?: { step: number; task: string; tool: string; prompt: string; output: string; reaction: string; decision: string }[];
  critique: CritiqueAssessmentInput | null;
}

export interface CritiqueAssessmentInput {
  level: number;
  writtenDepth: number;
  chatDepth: number;
  accuracy: 'matches' | 'partly' | 'does_not_match';
  aiWritten: 'unlikely' | 'possible' | 'likely';
  aiWrittenReason: string;
  summary: string;
  claims: { claim: string; verdict: 'supported' | 'not_found' | 'contradicted'; steps: number[] }[];
}

export interface Lane2Repository {
  listCourses(): Promise<unknown[]>;
  listAssignments(courseId: string): Promise<unknown[]>;
  listSubmissions(assignmentId: string): Promise<unknown[]>;
  getSubmission(submissionId: string): Promise<unknown>;
  getWorkspace(user: AuthUser): Promise<unknown>;
  createCourse(creatorId: string, input: CourseInput): Promise<unknown>;
  updateCourse(courseId: string, input: CoursePatch): Promise<unknown>;
  deleteCourse(courseId: string): Promise<void>;
  createAssignment(creatorId: string, input: AssignmentInput): Promise<unknown>;
  updateAssignment(assignmentId: string, input: AssignmentInput): Promise<unknown>;
  deleteAssignment(assignmentId: string): Promise<void>;
  createEnrolment(courseId: string, creatorId: string, input: EnrolmentInput): Promise<unknown>;
  updateEnrolment(courseId: string, studentId: string, groupName: string): Promise<unknown>;
  deleteEnrolment(courseId: string, studentId: string): Promise<void>;
  updateStudent(studentId: string, input: StudentPatch): Promise<unknown>;
  deleteStudent(studentId: string): Promise<void>;
  saveOwnReview(submissionId: string, reviewerId: string, input: ReviewInput): Promise<unknown>;
  handIn(submissionId: string, input: HandInInput): Promise<unknown>;
  submissionFileLink(submissionId: string): Promise<SubmissionFileLink>;
  saveAiEvaluation(submissionId: string, input: AiEvaluationInput): Promise<unknown>;
}

export interface BackendServices {
  signIn(email: string, password: string): Promise<AuthSessionResult>;
  signUp(input: SignUpInput): Promise<AuthSessionResult | null>;
  refreshSession(refreshToken: string): Promise<AuthSessionResult>;
  authenticate(accessToken: string): Promise<AuthUser>;
  repositoryFor(accessToken: string): Lane2Repository;
}
