import type { FastifyInstance } from 'fastify';
import { cvEditSchema, cvGenerateSchema, cvApprovalSchema, cvBatchSchema } from '@quba/shared';
import type { Environment } from '../../config/env.js';
import { paramId } from '../../lib/params.js';
import type { TextAi } from '../../services/ai/qwen.js';
import type { PdfRenderer } from '../../services/pdf/chromium.js';
import { createCvService } from './service.js';
export async function cvRoutes(
  app: FastifyInstance,
  env: Environment,
  services: { ai: TextAi; pdf: PdfRenderer },
) {
  const auth = { preHandler: app.requireAdmin },
    cv = createCvService(app.db, app.storage, env, services);
  app.get('/students/:studentId/cv/source', auth, (request) =>
    cv.getSource(paramId(request.params, 'studentId')),
  );
  app.get('/students/:studentId/cv', auth, (request) =>
    cv.state(paramId(request.params, 'studentId')),
  );
  app.get('/students/:studentId/cv/ai-preview', auth, (request) =>
    cv.previewAi(paramId(request.params, 'studentId')),
  );
  app.post(
    '/students/:studentId/cv/generate',
    { ...auth, config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } },
    (request) => {
      const input = cvGenerateSchema.parse(request.body);
      return cv.generate(paramId(request.params, 'studentId'), input.revision, input.sourceHash);
    },
  );
  app.put('/students/:studentId/cv/draft', { ...auth, bodyLimit: 524288 }, (request) =>
    cv.saveDraft(paramId(request.params, 'studentId'), cvEditSchema.parse(request.body)),
  );
  app.post('/students/:studentId/cv/approve', auth, (request) =>
    cv.approve(
      paramId(request.params, 'studentId'),
      cvApprovalSchema.parse(request.body).revision,
      request.admin!.id,
    ),
  );
  app.get(
    '/students/:studentId/cv/pdf',
    { ...auth, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) =>
      reply
        .type('application/pdf')
        .header('Content-Disposition', 'attachment; filename="student-cv.pdf"')
        .send(await cv.exportOne(paramId(request.params, 'studentId'))),
  );
  app.post(
    '/cv/export',
    { ...auth, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) =>
      reply
        .type('application/pdf')
        .header('Content-Disposition', 'attachment; filename="student-cvs.pdf"')
        .send(await cv.exportBatch(cvBatchSchema.parse(request.body))),
  );
}
