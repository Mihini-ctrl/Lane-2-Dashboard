import Fastify, { type FastifyError, type FastifyInstance, type FastifyRequest } from 'fastify';
import type {
  AiEvaluationInput, AssignmentInput, AuthUser, BackendServices, CourseInput, CoursePatch, EnrolmentInput,
  HandInInput, Lane2Repository, ReviewInput, SignUpInput, StudentPatch
} from './contracts.js';
import { ApiError, unauthorized } from './errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    lane2Auth?: { user: AuthUser; repository: Lane2Repository };
  }
}

const uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
const idParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: { type: 'string', pattern: uuidPattern } }
} as const;
const enrolmentParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'studentId'],
  properties: {
    id: { type: 'string', pattern: uuidPattern },
    studentId: { type: 'string', pattern: uuidPattern }
  }
} as const;
const criterionSchema = {
  type: 'object', additionalProperties: false,
  required: ['type', 'description', 'maxScore'],
  properties: {
    id: { type: 'string', pattern: uuidPattern },
    type: { type: 'string', enum: ['rule', 'custom'] },
    ruleKey: { type: 'string', minLength: 1, maxLength: 80 },
    name: { type: 'string', minLength: 1, maxLength: 80 },
    description: { type: 'string', maxLength: 2000 },
    maxScore: { type: 'number', exclusiveMinimum: 0, maximum: 10000 }
  }
} as const;
const assignmentBodySchema = {
  type: 'object', additionalProperties: false,
  required: ['courseId', 'title', 'short', 'description', 'dueDate', 'wordLimit', 'lane', 'settings', 'rubric'],
  properties: {
    courseId: { type: 'string', pattern: uuidPattern },
    title: { type: 'string', minLength: 1, maxLength: 250 },
    short: { type: 'string', minLength: 1, maxLength: 80 },
    description: { type: 'string', maxLength: 10000 },
    dueDate: { anyOf: [{ type: 'string', format: 'date' }, { type: 'null' }] },
    wordLimit: { type: 'integer', minimum: 0, maximum: 1000000 },
    lane: { type: 'integer', minimum: 1, maximum: 100 },
    settings: { type: 'object', additionalProperties: true },
    rubric: { type: 'array', maxItems: 200, items: criterionSchema }
  }
} as const;

function auth(request: FastifyRequest) {
  if (!request.lane2Auth) throw unauthorized();
  return request.lane2Auth;
}

function bearerToken(value: string | undefined): string | null {
  const match = /^Bearer\s+([^\s]+)$/i.exec(value || '');
  return match?.[1] ?? null;
}

export function buildApp(
  services: BackendServices,
  options: { logger?: boolean } = {}
): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 1024 * 1024 });

  app.addHook('preHandler', async (request) => {
    if (['/api/v1/health', '/api/v1/auth/login', '/api/v1/auth/signup', '/api/v1/auth/refresh'].includes(request.routeOptions.url || '')) return;
    const token = bearerToken(request.headers.authorization);
    if (!token) throw unauthorized();
    const user = await services.authenticate(token);
    request.lane2Auth = { user, repository: services.repositoryFor(token) };
  });

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
    }
    if (error.validation) {
      return reply.status(400).send({ error: { code: 'INVALID_REQUEST', message: error.message } });
    }
    app.log.error(error);
    return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed.' } });
  });

  app.get('/api/v1/health', async () => ({ ok: true, service: 'lane2-backend' }));

  app.post<{ Body: { email: string; password: string } }>('/api/v1/auth/login', {
    schema: {
      body: {
        type: 'object', additionalProperties: false, required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', maxLength: 320 },
          password: { type: 'string', minLength: 6, maxLength: 1024 }
        }
      }
    }
  }, async (request) => ({ session: await services.signIn(request.body.email, request.body.password) }));

  app.post<{ Body: SignUpInput }>('/api/v1/auth/signup', {
    schema: {
      body: {
        type: 'object', additionalProperties: false,
        required: ['email', 'password', 'firstName', 'lastName', 'role'],
        properties: {
          email: { type: 'string', format: 'email', maxLength: 320 },
          password: { type: 'string', minLength: 8, maxLength: 1024 },
          firstName: { type: 'string', minLength: 1, maxLength: 80 },
          lastName: { type: 'string', minLength: 1, maxLength: 80 },
          role: { type: 'string', enum: ['course_admin', 'coordinator', 'lecturer', 'teaching_assistant', 'marker', 'student'] }
        }
      }
    }
  }, async (request, reply) => {
    const session = await services.signUp(request.body);
    return reply.status(201).send({ session, requiresEmailConfirmation: !session });
  });

  app.post<{ Body: { refreshToken: string } }>('/api/v1/auth/refresh', {
    schema: {
      body: {
        type: 'object', additionalProperties: false, required: ['refreshToken'],
        properties: { refreshToken: { type: 'string', minLength: 20, maxLength: 4096 } }
      }
    }
  }, async (request) => ({ session: await services.refreshSession(request.body.refreshToken) }));

  app.get('/api/v1/me', async (request) => ({ user: auth(request).user }));

  app.get('/api/v1/bootstrap', async (request) => {
    const context = auth(request);
    return context.repository.getWorkspace(context.user);
  });

  app.get('/api/v1/courses', async (request) => ({
    courses: await auth(request).repository.listCourses()
  }));

  app.post<{ Body: CourseInput }>('/api/v1/courses', {
    schema: {
      body: {
        type: 'object', additionalProperties: false, required: ['code', 'name', 'semester', 'badge'],
        properties: {
          code: { type: 'string', minLength: 1, maxLength: 40 },
          name: { type: 'string', minLength: 1, maxLength: 250 },
          semester: { type: 'string', maxLength: 100 },
          badge: { type: 'string', maxLength: 10 }
        }
      }
    }
  }, async (request, reply) => {
    const context = auth(request);
    const course = await context.repository.createCourse(context.user.id, request.body);
    return reply.status(201).send({ course });
  });

  app.patch<{ Params: { id: string }; Body: CoursePatch }>('/api/v1/courses/:id', {
    schema: {
      params: idParamsSchema,
      body: {
        type: 'object', additionalProperties: false, minProperties: 1,
        properties: {
          code: { type: 'string', minLength: 1, maxLength: 40 },
          name: { type: 'string', minLength: 1, maxLength: 250 },
          semester: { type: 'string', maxLength: 100 },
          badge: { type: 'string', maxLength: 10 }
        }
      }
    }
  }, async (request) => ({ course: await auth(request).repository.updateCourse(request.params.id, request.body) }));

  app.delete<{ Params: { id: string } }>('/api/v1/courses/:id', {
    schema: { params: idParamsSchema }
  }, async (request, reply) => {
    await auth(request).repository.deleteCourse(request.params.id);
    return reply.status(204).send();
  });

  app.get<{ Params: { id: string } }>('/api/v1/courses/:id/assignments', {
    schema: { params: idParamsSchema }
  }, async (request) => ({
    assignments: await auth(request).repository.listAssignments(request.params.id)
  }));

  app.post<{ Body: AssignmentInput }>('/api/v1/assignments', {
    schema: { body: assignmentBodySchema }
  }, async (request, reply) => {
    const context = auth(request);
    const assignment = await context.repository.createAssignment(context.user.id, request.body);
    return reply.status(201).send({ assignment });
  });

  app.put<{ Params: { id: string }; Body: AssignmentInput }>('/api/v1/assignments/:id', {
    schema: { params: idParamsSchema, body: assignmentBodySchema }
  }, async (request) => ({ assignment: await auth(request).repository.updateAssignment(request.params.id, request.body) }));

  app.delete<{ Params: { id: string } }>('/api/v1/assignments/:id', {
    schema: { params: idParamsSchema }
  }, async (request, reply) => {
    await auth(request).repository.deleteAssignment(request.params.id);
    return reply.status(204).send();
  });

  app.post<{ Params: { id: string }; Body: EnrolmentInput }>('/api/v1/courses/:id/enrolments', {
    schema: {
      params: idParamsSchema,
      body: {
        type: 'object', additionalProperties: false, required: ['groupName'],
        properties: {
          studentId: { type: 'string', pattern: uuidPattern },
          firstName: { type: 'string', minLength: 1, maxLength: 100 },
          lastName: { type: 'string', maxLength: 100 },
          institutionalId: { type: 'string', maxLength: 100 },
          email: { type: 'string', maxLength: 320 },
          groupName: { type: 'string', maxLength: 100 }
        }
      }
    }
  }, async (request, reply) => {
    const context = auth(request);
    const enrolment = await context.repository.createEnrolment(request.params.id, context.user.id, request.body);
    return reply.status(201).send({ enrolment });
  });

  app.patch<{ Params: { id: string; studentId: string }; Body: { groupName: string } }>('/api/v1/courses/:id/enrolments/:studentId', {
    schema: {
      params: enrolmentParamsSchema,
      body: {
        type: 'object', additionalProperties: false, required: ['groupName'],
        properties: { groupName: { type: 'string', maxLength: 100 } }
      }
    }
  }, async (request) => ({
    enrolment: await auth(request).repository.updateEnrolment(request.params.id, request.params.studentId, request.body.groupName)
  }));

  app.delete<{ Params: { id: string; studentId: string } }>('/api/v1/courses/:id/enrolments/:studentId', {
    schema: { params: enrolmentParamsSchema }
  }, async (request, reply) => {
    await auth(request).repository.deleteEnrolment(request.params.id, request.params.studentId);
    return reply.status(204).send();
  });

  app.patch<{ Params: { id: string }; Body: StudentPatch }>('/api/v1/students/:id', {
    schema: {
      params: idParamsSchema,
      body: {
        type: 'object', additionalProperties: false, minProperties: 1,
        properties: {
          firstName: { type: 'string', minLength: 1, maxLength: 100 },
          lastName: { type: 'string', maxLength: 100 },
          institutionalId: { type: 'string', maxLength: 100 },
          email: { type: 'string', maxLength: 320 }
        }
      }
    }
  }, async (request) => ({ student: await auth(request).repository.updateStudent(request.params.id, request.body) }));

  app.delete<{ Params: { id: string } }>('/api/v1/students/:id', {
    schema: { params: idParamsSchema }
  }, async (request, reply) => {
    await auth(request).repository.deleteStudent(request.params.id);
    return reply.status(204).send();
  });

  app.get<{ Params: { id: string } }>('/api/v1/assignments/:id/submissions', {
    schema: { params: idParamsSchema }
  }, async (request) => ({
    submissions: await auth(request).repository.listSubmissions(request.params.id)
  }));

  app.get<{ Params: { id: string } }>('/api/v1/submissions/:id', {
    schema: { params: idParamsSchema }
  }, async (request) => ({
    submission: await auth(request).repository.getSubmission(request.params.id)
  }));

  app.put<{ Params: { id: string }; Body: ReviewInput }>('/api/v1/submissions/:id/review', {
    schema: {
      params: idParamsSchema,
      body: {
        type: 'object',
        additionalProperties: false,
        minProperties: 1,
        properties: {
          status: { type: 'string', enum: ['not_reviewed', 'in_progress', 'reviewed'] },
          decision: { anyOf: [{ type: 'string', enum: ['approve', 'flag', 'clarify'] }, { type: 'null' }] },
          comment: { type: 'string', maxLength: 5000 },
          secondsSpent: { type: 'integer', minimum: 0, maximum: 864000 },
          expectedUpdatedAt: { type: 'string', format: 'date-time' },
          marks: {
            type: 'array', maxItems: 5000,
            items: {
              type: 'object', additionalProperties: false,
              required: ['interactionId', 'criterionId', 'mark', 'comment'],
              properties: {
                interactionId: { type: 'string', pattern: uuidPattern },
                criterionId: { type: 'string', pattern: uuidPattern },
                mark: { anyOf: [{ type: 'string', enum: ['approve', 'flag'] }, { type: 'null' }] },
                comment: { type: 'string', maxLength: 5000 }
              }
            }
          },
          scores: {
            type: 'array', maxItems: 200,
            items: {
              type: 'object', additionalProperties: false,
              required: ['criterionId', 'score', 'comment'],
              properties: {
                criterionId: { type: 'string', pattern: uuidPattern },
                score: { anyOf: [{ type: 'number', minimum: 0, maximum: 10000 }, { type: 'null' }] },
                comment: { type: 'string', maxLength: 5000 }
              }
            }
          }
        }
      }
    }
  }, async (request) => {
    const context = auth(request);
    return {
      review: await context.repository.saveOwnReview(request.params.id, context.user.id, request.body)
    };
  });

  // A student hands in their work, their pasted AI chat and their critique.
  // The database checks that the caller is the student, the assignment is open
  // and the critique reaches the assignment's word minimum.
  const answer = { type: 'string', minLength: 1, maxLength: 4000, pattern: '\\S' } as const;
  app.put<{ Params: { id: string }; Body: HandInInput }>('/api/v1/submissions/:id/hand-in', {
    schema: {
      params: idParamsSchema,
      body: {
        type: 'object', additionalProperties: false,
        required: ['finalText', 'chatLog', 'tool', 'critique'],
        properties: {
          finalText: { type: 'string', maxLength: 200000 },
          chatLog: { type: 'string', minLength: 1, maxLength: 200000, pattern: '\\S' },
          tool: { type: 'string', maxLength: 60 },
          expectedRevision: { type: 'integer', minimum: 1 },
          critique: {
            type: 'object', additionalProperties: false, required: ['used', 'checked', 'changed'],
            properties: { used: answer, checked: answer, changed: answer }
          }
        }
      }
    }
  }, async (request) => ({
    submission: await auth(request).repository.handIn(request.params.id, request.body)
  }));

  // Teaching staff save an AI evaluation (Gemini's labels and its check of the critique).
  const level = { type: 'integer', minimum: 0, maximum: 4 } as const;
  const stepNumbers = { type: 'array', maxItems: 200, items: { type: 'integer', minimum: 1, maximum: 10000 } } as const;
  app.put<{ Params: { id: string }; Body: AiEvaluationInput }>('/api/v1/submissions/:id/ai-evaluation', {
    schema: {
      params: idParamsSchema,
      body: {
        type: 'object', additionalProperties: false,
        required: ['model', 'detection', 'summary', 'textLength', 'sentences', 'steps', 'critique'],
        properties: {
          model: { type: 'string', minLength: 1, maxLength: 100 },
          detection: { type: 'object', additionalProperties: true },
          summary: { type: 'string', maxLength: 2000 },
          textLength: { type: 'integer', minimum: 0, maximum: 1000000 },
          sentences: {
            type: 'array', maxItems: 5000,
            items: {
              type: 'object', additionalProperties: false, required: ['text', 'para', 'source', 'steps'],
              properties: {
                text: { type: 'string', maxLength: 5000 },
                para: { type: 'integer', minimum: 0 },
                source: { type: 'string', enum: ['own', 'changed', 'unchanged', 'unlogged'] },
                steps: stepNumbers
              }
            }
          },
          steps: {
            type: 'array', maxItems: 500,
            items: {
              type: 'object', additionalProperties: false, required: ['step', 'task', 'purpose', 'use'],
              properties: {
                step: { type: 'integer', minimum: 1 },
                task: { type: 'string', maxLength: 200 },
                purpose: { type: 'string', maxLength: 40 },
                use: { type: 'string', maxLength: 40 }
              }
            }
          },
          splitSteps: {
            type: 'array', maxItems: 500,
            items: {
              type: 'object', additionalProperties: false,
              required: ['step', 'task', 'tool', 'prompt', 'output', 'reaction', 'decision'],
              properties: {
                step: { type: 'integer', minimum: 1 },
                task: { type: 'string', maxLength: 200 },
                tool: { type: 'string', maxLength: 60 },
                prompt: { type: 'string', maxLength: 60000 },
                output: { type: 'string', maxLength: 60000 },
                reaction: { type: 'string', maxLength: 20000 },
                decision: { type: 'string', enum: ['changed', 'not_used', 'unchanged', 'unrecorded'] }
              }
            }
          },
          critique: {
            anyOf: [{ type: 'null' }, {
              type: 'object', additionalProperties: false,
              required: ['level', 'writtenDepth', 'chatDepth', 'accuracy', 'aiWritten', 'aiWrittenReason', 'summary', 'claims'],
              properties: {
                level, writtenDepth: level, chatDepth: level,
                accuracy: { type: 'string', enum: ['matches', 'partly', 'does_not_match'] },
                aiWritten: { type: 'string', enum: ['unlikely', 'possible', 'likely'] },
                aiWrittenReason: { type: 'string', maxLength: 600 },
                summary: { type: 'string', maxLength: 1200 },
                claims: {
                  type: 'array', maxItems: 20,
                  items: {
                    type: 'object', additionalProperties: false, required: ['claim', 'verdict', 'steps'],
                    properties: {
                      claim: { type: 'string', minLength: 1, maxLength: 300 },
                      verdict: { type: 'string', enum: ['supported', 'not_found', 'contradicted'] },
                      steps: stepNumbers
                    }
                  }
                }
              }
            }]
          }
        }
      }
    }
  }, async (request) => ({
    evaluation: await auth(request).repository.saveAiEvaluation(request.params.id, request.body)
  }));

  return app;
}
