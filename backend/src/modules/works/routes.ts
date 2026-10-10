import type { FastifyInstance, FastifyRequest } from 'fastify';
import { MAX_ATTACHMENTS, workSchema } from '@quba/shared';
import { AppError } from '../../lib/errors.js';
import { paramId } from '../../lib/params.js';
import { enqueueDeletion } from '../../services/storage/deletion.js';
import type { StoredFile } from '../../services/storage/local.js';
import { workView } from '../students/serialization.js';
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
  const protectedRoute = { preHandler: app.requireAdmin };
  const storedFiles = async (
    files: Array<{ buffer: Buffer; name: string }>,
    stored: StoredFile[],
  ) => {
    for (const file of files) stored.push(await app.storage.put(file.buffer, file.name));
  };
  app.post('/students/:studentId/works', protectedRoute, async (request, reply) => {
    const studentId = paramId(request.params, 'studentId');
    const incoming = request.isMultipart()
      ? await multipartInput(request, true)
      : { data: request.body, files: [] };
    const input = workSchema.parse(incoming.data);
    const stored: StoredFile[] = [];
    try {
      await storedFiles(incoming.files, stored);
      const work = await app.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Student" WHERE id=${studentId}::uuid FOR UPDATE`;
        if (!(await tx.student.findUnique({ where: { id: studentId } })))
          throw new AppError(404, 'NOT_FOUND', 'الطالب غير موجود.');
        await tx.student.update({ where: { id: studentId }, data: { updatedAt: new Date() } });
        return tx.work.create({
          data: {
            ...input,
            date: input.date ? new Date(input.date) : null,
            url: input.url || null,
            studentId,
            attachments: { create: stored },
          },
          include: { attachments: true },
        });
      });
      return reply.code(201).send(workView(work));
    } catch (error) {
      await app.storage.rollback(
        app.db,
        stored.map((file) => file.storageKey),
      );
      throw error;
    }
  });
  app.put('/students/:studentId/works/:workId', protectedRoute, async (request) => {
    const studentId = paramId(request.params, 'studentId'),
      id = paramId(request.params, 'workId');
    const input = workSchema.parse(request.body);
    const work = await app.db.work.findFirst({ where: { id, studentId } });
    if (!work) throw new AppError(404, 'NOT_FOUND', 'العمل غير موجود لدى هذا الطالب.');
    return workView(
      await app.db.work.update({
        where: { id },
        data: { ...input, date: input.date ? new Date(input.date) : null, url: input.url || null },
        include: { attachments: true },
      }),
    );
  });
  app.delete('/students/:studentId/works/:workId', protectedRoute, async (request, reply) => {
    const studentId = paramId(request.params, 'studentId'),
      id = paramId(request.params, 'workId');
    await app.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Student" WHERE id=${studentId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "Work" WHERE id=${id}::uuid FOR UPDATE`;
      const work = await tx.work.findFirst({
        where: { id, studentId },
        include: { attachments: true },
      });
      if (!work) throw new AppError(404, 'NOT_FOUND', 'العمل غير موجود لدى هذا الطالب.');
      await enqueueDeletion(
        tx,
        work.attachments.map((file) => file.storageKey),
      );
      await tx.work.delete({ where: { id } });
      await tx.student.update({ where: { id: studentId }, data: { updatedAt: new Date() } });
    });
    await app.storage.maintain(app.db).catch(() => {});
    return reply.code(204).send();
  });
  app.post(
    '/students/:studentId/works/:workId/attachments',
    protectedRoute,
    async (request, reply) => {
      const studentId = paramId(request.params, 'studentId'),
        workId = paramId(request.params, 'workId');
      if (!request.isMultipart())
        throw new AppError(400, 'MULTIPART_REQUIRED', 'أرسل المرفقات بصيغة رفع الملفات.');
      const incoming = await multipartInput(request, false);
      if (!incoming.files.length)
        throw new AppError(400, 'FILE_REQUIRED', 'اختر ملفًا واحدًا على الأقل.');
      const stored: StoredFile[] = [];
      try {
        await storedFiles(incoming.files, stored);
        const work = await app.db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Student" WHERE id=${studentId}::uuid FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM "Work" WHERE id=${workId}::uuid FOR UPDATE`;
          const existing = await tx.work.findFirst({
            where: { id: workId, studentId },
            include: { attachments: true },
          });
          if (!existing) throw new AppError(404, 'NOT_FOUND', 'العمل غير موجود لدى هذا الطالب.');
          if (existing.attachments.length + stored.length > MAX_ATTACHMENTS)
            throw new AppError(400, 'FILE_COUNT', 'الحد الأقصى ستة مرفقات لكل عمل.');
          await tx.student.update({ where: { id: studentId }, data: { updatedAt: new Date() } });
          return tx.work.update({
            where: { id: workId },
            data: { updatedAt: new Date(), attachments: { create: stored } },
            include: { attachments: true },
          });
        });
        return reply.code(201).send(workView(work));
      } catch (error) {
        await app.storage.rollback(
          app.db,
          stored.map((file) => file.storageKey),
        );
        throw error;
      }
    },
  );
  app.get(
    '/students/:studentId/works/:workId/attachments/:attachmentId',
    protectedRoute,
    async (request, reply) => {
      const studentId = paramId(request.params, 'studentId'),
        workId = paramId(request.params, 'workId'),
        id = paramId(request.params, 'attachmentId');
      const file = await app.db.attachment.findFirst({
        where: { id, workId, work: { studentId } },
      });
      if (!file) throw new AppError(404, 'NOT_FOUND', 'المرفق غير موجود لدى هذا الطالب والعمل.');
      reply
        .type(file.mimeType)
        .header('X-Content-Type-Options', 'nosniff')
        .header(
          'Content-Disposition',
          `${file.mimeType === 'application/pdf' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
        );
      if (file.mimeType === 'application/pdf')
        reply.header('Content-Security-Policy', "sandbox; default-src 'none'");
      return reply.send(await app.storage.open(file.storageKey));
    },
  );
  app.delete(
    '/students/:studentId/works/:workId/attachments/:attachmentId',
    protectedRoute,
    async (request, reply) => {
      const studentId = paramId(request.params, 'studentId'),
        workId = paramId(request.params, 'workId'),
        id = paramId(request.params, 'attachmentId');
      await app.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Student" WHERE id=${studentId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "Work" WHERE id=${workId}::uuid FOR UPDATE`;
        const file = await tx.attachment.findFirst({ where: { id, workId, work: { studentId } } });
        if (!file) throw new AppError(404, 'NOT_FOUND', 'المرفق غير موجود.');
        await enqueueDeletion(tx, [file.storageKey]);
        await tx.attachment.delete({ where: { id } });
        await tx.work.update({ where: { id: workId }, data: { updatedAt: new Date() } });
        await tx.student.update({ where: { id: studentId }, data: { updatedAt: new Date() } });
      });
      await app.storage.maintain(app.db).catch(() => {});
      return reply.code(204).send();
    },
  );
}
