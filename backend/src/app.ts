import Fastify, { type FastifyError, type FastifyInstance, type FastifyRequest } from 'fastify';
import type { AuthUser, BackendServices, Lane2Repository, ReviewInput } from './contracts.js';
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
    if (request.routeOptions.url === '/api/v1/health') return;
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

  app.get('/api/v1/me', async (request) => ({ user: auth(request).user }));

  app.get('/api/v1/courses', async (request) => ({
    courses: await auth(request).repository.listCourses()
  }));

  app.get<{ Params: { id: string } }>('/api/v1/courses/:id/assignments', {
    schema: { params: idParamsSchema }
  }, async (request) => ({
    assignments: await auth(request).repository.listAssignments(request.params.id)
  }));

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
          decision: { anyOf: [{ type: 'string', enum: ['approve', 'flag'] }, { type: 'null' }] },
          comment: { type: 'string', maxLength: 5000 },
          secondsSpent: { type: 'integer', minimum: 0, maximum: 864000 },
          expectedUpdatedAt: { type: 'string', format: 'date-time' }
        }
      }
    }
  }, async (request) => {
    const context = auth(request);
    return {
      review: await context.repository.saveOwnReview(request.params.id, context.user.id, request.body)
    };
  });

  return app;
}
