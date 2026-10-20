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
  role: 'course_admin' | 'coordinator' | 'lecturer' | 'teaching_assistant' | 'marker';
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
}

export interface BackendServices {
  signIn(email: string, password: string): Promise<AuthSessionResult>;
  signUp(input: SignUpInput): Promise<AuthSessionResult | null>;
  refreshSession(refreshToken: string): Promise<AuthSessionResult>;
  authenticate(accessToken: string): Promise<AuthUser>;
  repositoryFor(accessToken: string): Lane2Repository;
}
