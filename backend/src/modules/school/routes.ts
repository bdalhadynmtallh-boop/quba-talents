import type { FastifyInstance } from 'fastify';
import { schoolSchema } from '@quba/shared';
import { AppError } from '../../lib/errors.js';
import { createSchoolService } from './service.js';
export async function schoolRoutes(app: FastifyInstance) {
  const school = createSchoolService(app.db, app.storage),
    auth = { preHandler: app.requireAdmin };
  app.get('/school', auth, () => school.get());
  app.put('/school', auth, (request) => school.update(schoolSchema.parse(request.body)));
  app.post('/school/logo', auth, async (request) => {
    if (!request.isMultipart()) throw new AppError(400, 'MULTIPART_REQUIRED', 'اختر صورة شعار.');

    const files: Buffer[] = [];

    const names: string[] = [];

    for await (const part of request.parts({ limits: { files: 1, fields: 0, parts: 1 } })) {
      if (part.type !== 'file' || part.fieldname !== 'files')
        throw new AppError(400, 'FILE_FIELD', 'حقل ملف غير صالح.');
      files.push(await part.toBuffer());
      names.push(part.filename);
    }

    if (files.length !== 1) throw new AppError(400, 'FILE_REQUIRED', 'اختر صورة شعار واحدة.');

    return school.setLogo(files[0]!, names[0]!);
  });
  app.get('/school/logo', auth, async (_request, reply) => {
    const file = await school.getLogo();
    return reply.type(file.mimeType).header('X-Content-Type-Options', 'nosniff').send(file.stream);
  });
  app.delete('/school/logo', auth, async (_request, reply) => {
    await school.removeLogo();
    return reply.code(204).send();
  });
}
