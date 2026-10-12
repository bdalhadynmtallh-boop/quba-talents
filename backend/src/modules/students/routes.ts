import type { FastifyInstance } from 'fastify';
import { listQuerySchema, studentSubmissionSchema } from '@quba/shared';
import { paramId } from '../../lib/params.js';
import { createStudentService } from './service.js';
export async function studentRoutes(app: FastifyInstance) {
  const auth = { preHandler: app.requireAdmin, bodyLimit: 131072 };
  const students = createStudentService(app.db, app.storage);
  app.get('/students', auth, (request) => students.list(listQuerySchema.parse(request.query)));
  app.get('/students/:studentId', auth, (request) =>
    students.get(paramId(request.params, 'studentId')),
  );
  app.post('/students', auth, async (request, reply) =>
    reply.code(201).send(await students.create(studentSubmissionSchema.parse(request.body))),
  );
  app.put('/students/:studentId', auth, (request) =>
    students.update(
      paramId(request.params, 'studentId'),
      studentSubmissionSchema.parse(request.body),
    ),
  );
  app.post('/students/:studentId/restore', auth, (request) =>
    students.restore(paramId(request.params, 'studentId')),
  );
  app.delete('/students/:studentId', auth, async (request, reply) => {
    await students.remove(paramId(request.params, 'studentId'));
    return reply.code(204).send();
  });
}
