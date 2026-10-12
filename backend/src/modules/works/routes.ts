import type { FastifyInstance, FastifyRequest } from 'fastify';
import { MAX_ATTACHMENTS, workSchema } from '@quba/shared';
import { AppError } from '../../lib/errors.js';
import { paramId } from '../../lib/params.js';
import { createWorkService } from './service.js';
async function multipartInput(request: FastifyRequest, metadata: boolean) {
  let data: unknown;
  const files: Array<{ buffer: Buffer; name: string }> = [];
  for await (const part of request.parts()) {
    if (part.type === 'file') {
      if (part.fieldname !== 'files') throw new AppError(400, 'FILE_FIELD', 'حقل ملف غير صالح.');
      files.push({ buffer: await part.toBuffer(), name: part.filename });
    } else {
      if (
        !metadata ||
        part.fieldname !== 'data' ||
        data !== undefined ||
        typeof part.value !== 'string'
      )
        throw new AppError(400, 'INVALID_INPUT', 'بيانات العمل غير صالحة.');
      try {
        data = JSON.parse(part.value) as unknown;
      } catch {
        throw new AppError(400, 'INVALID_INPUT', 'بيانات العمل غير صالحة.');
      }
    }
  }
  if (files.length > MAX_ATTACHMENTS)
    throw new AppError(400, 'FILE_COUNT', 'الحد الأقصى ستة مرفقات لكل عمل.');
  return { files, data };
}
export async function workRoutes(app: FastifyInstance) {
  const works = createWorkService(app.db, app.storage),
    auth = { preHandler: app.requireAdmin };
  app.post('/students/:studentId/works', auth, async (request, reply) => {
    const studentId = paramId(request.params, 'studentId');
    const incoming = request.isMultipart()
      ? await multipartInput(request, true)
      : { data: request.body, files: [] };
    return reply
      .code(201)
      .send(await works.create(studentId, workSchema.parse(incoming.data), incoming.files));
  });
  app.put('/students/:studentId/works/:workId', auth, (request) =>
    works.update(
      paramId(request.params, 'studentId'),
      paramId(request.params, 'workId'),
      workSchema.parse(request.body),
    ),
  );
  app.delete('/students/:studentId/works/:workId', auth, async (request, reply) => {
    await works.remove(paramId(request.params, 'studentId'), paramId(request.params, 'workId'));
    return reply.code(204).send();
  });
  app.post('/students/:studentId/works/:workId/attachments', auth, async (request, reply) => {
    const studentId = paramId(request.params, 'studentId'),
      workId = paramId(request.params, 'workId');
    if (!request.isMultipart())
      throw new AppError(400, 'MULTIPART_REQUIRED', 'أرسل المرفقات بصيغة رفع الملفات.');

    const incoming = await multipartInput(request, false);

    if (!incoming.files.length)
      throw new AppError(400, 'FILE_REQUIRED', 'اختر ملفًا واحدًا على الأقل.');

    return reply.code(201).send(await works.addAttachments(studentId, workId, incoming.files));
  });
  app.get(
    '/students/:studentId/works/:workId/attachments/:attachmentId',
    auth,
    async (request, reply) => {
      const { file, stream } = await works.getAttachment(
        paramId(request.params, 'studentId'),
        paramId(request.params, 'workId'),
        paramId(request.params, 'attachmentId'),
      );
      reply
        .type(file.mimeType)
        .header('X-Content-Type-Options', 'nosniff')
        .header(
          'Content-Disposition',
          `${file.mimeType === 'application/pdf' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
        );

      if (file.mimeType === 'application/pdf')
        reply.header('Content-Security-Policy', "sandbox; default-src 'none'");

      return reply.send(stream);
    },
  );
  app.delete(
    '/students/:studentId/works/:workId/attachments/:attachmentId',
    auth,
    async (request, reply) => {
      await works.removeAttachment(
        paramId(request.params, 'studentId'),
        paramId(request.params, 'workId'),
        paramId(request.params, 'attachmentId'),
      );
      return reply.code(204).send();
    },
  );
}
