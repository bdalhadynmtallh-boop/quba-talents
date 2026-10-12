import type { FastifyInstance } from 'fastify';
import { academicYearLabelSchema, rolloverSchema } from '@quba/shared';
import { createAcademicYearService } from './service.js';
export async function academicYearRoutes(app: FastifyInstance) {
  const years = createAcademicYearService(app.db),
    auth = { preHandler: app.requireAdmin };
  app.get('/academic-years', auth, () => years.getSettings());
  app.put('/academic-years/current', auth, (request) =>
    years.rename(academicYearLabelSchema.parse(request.body)),
  );
  app.post('/academic-years/rollover', auth, (request) =>
    years.rollover(rolloverSchema.parse(request.body)),
  );
}
