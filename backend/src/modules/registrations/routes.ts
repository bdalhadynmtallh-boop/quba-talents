import type { FastifyInstance } from 'fastify';
import {
  registrationSubmissionSchema,
  registrationQuerySchema,
  registrationApprovalSchema,
} from '@quba/shared';
import { z } from 'zod';
import { paramId } from '../../lib/params.js';
import { createRegistrationService } from './service.js';
export async function registrationRoutes(app: FastifyInstance) {
  const registrations = createRegistrationService(app.db),
    auth = { preHandler: app.requireAdmin, bodyLimit: 131072 };
  app.post(
    '/registrations',
    { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          await registrations.submit(
            registrationSubmissionSchema.parse(request.body),
            z.uuid().optional().parse(request.headers['idempotency-key']),
          ),
        ),
  );
  app.get('/registrations', auth, (request) =>
    registrations.list(registrationQuerySchema.parse(request.query)),
  );
  app.post('/registrations/:id/approve', auth, (request) =>
    registrations.approve(
      paramId(request.params, 'id'),
      registrationApprovalSchema.parse(request.body),
      request.admin!.id,
    ),
  );
  app.post('/registrations/:id/reject', auth, (request) =>
    registrations.reject(paramId(request.params, 'id'), request.admin!.id),
  );
}
