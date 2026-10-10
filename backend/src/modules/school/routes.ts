import type { FastifyInstance } from 'fastify';
import { schoolSchema } from '@quba/shared';
import { AppError } from '../../lib/errors.js';
import { enqueueDeletion } from '../../services/storage/deletion.js';
import { schoolView } from '../students/serialization.js';
export async function ensureSchool(app: FastifyInstance) {
  return app.db.schoolSettings.upsert({
    where: { id: 'school' },
    create: {
      id: 'school',
      supervisors: {
        create: [
          { name: 'مشرف تجريبي أول', role: 'منسق الموهوبين', sortOrder: 0 },
          { name: 'مشرف تجريبي ثانٍ', role: 'مشرف المشاريع', sortOrder: 1 },
        ],
      },
    },
    update: {},
    include: { supervisors: { orderBy: { sortOrder: 'asc' } } },
  });
}
export async function schoolRoutes(app: FastifyInstance) {
  const protectedRoute = { preHandler: app.requireAdmin };
  app.get('/school', protectedRoute, async () => schoolView(await ensureSchool(app)));
  app.put('/school', protectedRoute, async (request) => {
    const input = schoolSchema.parse(request.body);
    await ensureSchool(app);
    const school = await app.db.schoolSettings.update({
      where: { id: 'school' },
      data: {
        name: input.name,
        supervisors: {
          deleteMany: {},
          create: input.supervisors.map((item, sortOrder) => ({ ...item, sortOrder })),
        },
      },
      include: { supervisors: { orderBy: { sortOrder: 'asc' } } },
    });
    return schoolView(school);
  });
  app.post('/school/logo', protectedRoute, async (request) => {
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
    const stored = await app.storage.put(files[0]!, names[0]!, false);
    try {
      await ensureSchool(app);
      const school = await app.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "SchoolSettings" WHERE id='school' FOR UPDATE`;
        const existing = await tx.schoolSettings.findUniqueOrThrow({ where: { id: 'school' } });
        if (existing.logoKey) await enqueueDeletion(tx, [existing.logoKey]);
        return tx.schoolSettings.update({
          where: { id: 'school' },
          data: {
            logoKey: stored.storageKey,
            logoName: stored.originalName,
            logoMimeType: stored.mimeType,
          },
          include: { supervisors: { orderBy: { sortOrder: 'asc' } } },
        });
      });
      await app.storage.maintain(app.db).catch(() => {});
      return schoolView(school);
    } catch (error) {
      await app.storage.rollback(app.db, [stored.storageKey]);
      throw error;
    }
  });
  app.get('/school/logo', protectedRoute, async (_request, reply) => {
    const school = await app.db.schoolSettings.findUnique({ where: { id: 'school' } });
    if (!school?.logoKey) throw new AppError(404, 'NOT_FOUND', 'لا يوجد شعار محفوظ.');
    reply
      .type(school.logoMimeType ?? 'application/octet-stream')
      .header('X-Content-Type-Options', 'nosniff');
    return reply.send(await app.storage.open(school.logoKey));
  });
  app.delete('/school/logo', protectedRoute, async (_request, reply) => {
    await app.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "SchoolSettings" WHERE id='school' FOR UPDATE`;
      const school = await tx.schoolSettings.findUnique({ where: { id: 'school' } });
      if (school?.logoKey) {
        await enqueueDeletion(tx, [school.logoKey]);
        await tx.schoolSettings.update({
          where: { id: 'school' },
          data: { logoKey: null, logoName: null, logoMimeType: null },
        });
      }
    });
    await app.storage.maintain(app.db).catch(() => {});
    return reply.code(204).send();
  });
}
