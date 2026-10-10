import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import {
  cvSchema,
  cvSnapshotSchema,
  cvEditSchema,
  cvRevisionSchema,
  cvBatchSchema,
} from '@quba/shared';
import type { Environment } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { paramId } from '../../lib/params.js';
import { aiInput, type TextAi } from '../../services/ai/qwen.js';
import type { PdfRenderer } from '../../services/pdf/chromium.js';
import { cvSource, sourceHash, snapshot } from './source.js';
export async function cvRoutes(
  app: FastifyInstance,
  env: Environment,
  services: { ai: TextAi; pdf: PdfRenderer },
) {
  const protectedRoute = { preHandler: app.requireAdmin };
  let activeAi = 0;
  const state = async (id: string) => {
    const source = await cvSource(app, id),
      hash = sourceHash(source);
    const cv = await app.db.studentCv.findUnique({ where: { studentId: id } });
    const draft = cvSchema.safeParse(cv?.draft),
      approved = cvSchema.safeParse(cv?.approved);
    const ds = cvSnapshotSchema.safeParse(cv?.draftSnapshot),
      as = cvSnapshotSchema.safeParse(cv?.approvedSnapshot);
    return {
      draft: draft.success ? draft.data : null,
      approved: approved.success ? approved.data : null,
      draftSnapshot: ds.success ? ds.data : null,
      approvedSnapshot: as.success ? as.data : null,
      revision: cv?.revision ?? 0,
      draftUpdatedAt: cv?.draftUpdatedAt ?? null,
      approvedAt: cv?.approvedAt ?? null,
      draftStale: !!cv?.draft && cv.draftSourceHash !== hash,
      approvedStale: !!cv?.approved && cv.approvedSourceHash !== hash,
      generating: !!cv?.generationToken && (cv.generationExpiresAt?.getTime() ?? 0) > Date.now(),
      aiConfigured: env.NODE_ENV === 'test' || !!(env.AI_API_KEY && env.AI_BASE_URL),
    };
  };
  app.get('/students/:studentId/cv/source', protectedRoute, async (request) =>
    cvSource(app, paramId(request.params, 'studentId')),
  );
  app.get('/students/:studentId/cv', protectedRoute, async (request) =>
    state(paramId(request.params, 'studentId')),
  );
  app.post(
    '/students/:studentId/cv/generate',
    { ...protectedRoute, config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } },
    async (request) => {
      const id = paramId(request.params, 'studentId');
      const { revision } = cvRevisionSchema.parse(request.body);
      if (activeAi >= 2) throw new AppError(429, 'AI_BUSY', 'طلبات الصياغة مشغولة. انتظر قليلًا.');
      activeAi++;
      const token = randomUUID();
      try {
        await app.db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Student" WHERE id=${id}::uuid FOR UPDATE`;
          if (!(await tx.student.findUnique({ where: { id } })))
            throw new AppError(404, 'NOT_FOUND', 'الطالب غير موجود.');
          const current = await tx.studentCv.upsert({
            where: { studentId: id },
            create: { studentId: id },
            update: {},
          });
          if (
            current.revision !== revision ||
            (current.generationToken && (current.generationExpiresAt?.getTime() ?? 0) > Date.now())
          )
            throw new AppError(
              409,
              'CV_CONFLICT',
              'تغيرت السيرة أو يوجد توليد جارٍ. حدّث المعاينة.',
            );
          await tx.studentCv.update({
            where: { studentId: id },
            data: {
              generationToken: token,
              generationExpiresAt: new Date(Date.now() + env.AI_TIMEOUT_MS + 30000),
            },
          });
        });
        const source = await cvSource(app, id),
          hash = sourceHash(source);
        const generated = cvSchema.parse(await services.ai.generate(aiInput(source)));
        await app.db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Student" WHERE id=${id}::uuid FOR UPDATE`;
          const latest = await cvSource(app, id);
          if (sourceHash(latest) !== hash)
            throw new AppError(
              409,
              'CV_SOURCE_CHANGED',
              'تغيرت بيانات الطالب أثناء الصياغة. لم تُحفظ المسودة؛ أعد المحاولة بالبيانات الحالية.',
            );
          const saved = await tx.studentCv.updateMany({
            where: { studentId: id, revision, generationToken: token },
            data: {
              draft: generated,
              draftSnapshot: snapshot(source),
              draftSourceHash: hash,
              draftUpdatedAt: new Date(),
              generatedAt: new Date(),
              revision: { increment: 1 },
              generationToken: null,
              generationExpiresAt: null,
            },
          });
          if (!saved.count)
            throw new AppError(409, 'CV_CONFLICT', 'تغيرت السيرة أثناء الصياغة. حدّث المعاينة.');
        });
        return state(id);
      } finally {
        activeAi--;
        await app.db.studentCv
          .updateMany({
            where: { studentId: id, generationToken: token },
            data: { generationToken: null, generationExpiresAt: null },
          })
          .catch(() => {});
      }
    },
  );
  app.put(
    '/students/:studentId/cv/draft',
    { ...protectedRoute, bodyLimit: 524288 },
    async (request) => {
      const id = paramId(request.params, 'studentId'),
        input = cvEditSchema.parse(request.body);
      await app.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Student" WHERE id=${id}::uuid FOR UPDATE`;
        const source = await cvSource(app, id);
        await tx.studentCv.upsert({
          where: { studentId: id },
          create: { studentId: id },
          update: {},
        });
        const saved = await tx.studentCv.updateMany({
          where: { studentId: id, revision: input.revision },
          data: {
            draft: input.content,
            draftSnapshot: snapshot(source),
            draftSourceHash: sourceHash(source),
            draftUpdatedAt: new Date(),
            revision: { increment: 1 },
            generationToken: null,
            generationExpiresAt: null,
          },
        });
        if (!saved.count)
          throw new AppError(409, 'CV_CONFLICT', 'حُفظ تعديل آخر. حدّث المعاينة قبل الحفظ.');
      });
      return state(id);
    },
  );
  app.post('/students/:studentId/cv/approve', protectedRoute, async (request) => {
    const id = paramId(request.params, 'studentId'),
      { revision } = cvRevisionSchema.parse(request.body);
    await app.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Student" WHERE id=${id}::uuid FOR UPDATE`;
      const source = await cvSource(app, id);
      const cv = await tx.studentCv.findUnique({ where: { studentId: id } });
      if (!cv?.draft || cv.revision !== revision)
        throw new AppError(409, 'CV_CONFLICT', 'لا توجد مسودة بهذه النسخة. حدّث المعاينة.');
      if (cv.draftSourceHash !== sourceHash(source))
        throw new AppError(
          409,
          'CV_STALE',
          'تغيرت البيانات منذ المسودة. حدّث صياغتها أو راجعها واحفظها قبل الاعتماد.',
        );
      const content = cvSchema.parse(cv.draft),
        identity = cvSnapshotSchema.parse(cv.draftSnapshot);
      await tx.studentCv.update({
        where: { studentId: id },
        data: {
          approved: content,
          approvedSnapshot: identity,
          approvedSourceHash: cv.draftSourceHash,
          approvedAt: new Date(),
          revision: { increment: 1 },
          generationToken: null,
          generationExpiresAt: null,
        },
      });
    });
    return state(id);
  });
  const logo = async () => {
    const school = await app.db.schoolSettings.findUnique({ where: { id: 'school' } });
    if (!school?.logoKey) return undefined;
    if (!/^[-a-f0-9]{36}\.(png|jpg|webp)$/.test(school.logoKey))
      throw new AppError(500, 'LOGO', 'الشعار المخزن غير صالح.');
    try {
      return `data:${school.logoMimeType};base64,${(await readFile(resolve(app.storage.root, school.logoKey))).toString('base64')}`;
    } catch {
      throw new AppError(
        503,
        'LOGO_MISSING',
        'الشعار محفوظ في البيانات لكن ملفه مفقود. أعد رفعه أو احذفه من الإعدادات.',
      );
    }
  };
  const printable = async (ids: string[]) => {
    const rows = await app.db.student.findMany({
      where: { id: { in: ids }, cv: { approvedAt: { not: null } } },
      include: { cv: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    if (rows.length !== ids.length)
      throw new AppError(
        409,
        'CV_NOT_APPROVED',
        'بعض الطلاب غير موجودين أو ليس لديهم سيرة معتمدة.',
      );
    return rows.map((s) => ({
      content: cvSchema.parse(s.cv!.approved),
      identity: cvSnapshotSchema.parse(s.cv!.approvedSnapshot),
    }));
  };
  app.get(
    '/students/:studentId/cv/pdf',
    { ...protectedRoute, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const items = await printable([paramId(request.params, 'studentId')]);
      const buffer = await services.pdf.render(items, await logo());
      return reply
        .type('application/pdf')
        .header('Content-Disposition', 'attachment; filename="student-cv.pdf"')
        .send(buffer);
    },
  );
  app.post(
    '/cv/export',
    { ...protectedRoute, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = cvBatchSchema.parse(request.body);
      let ids: string[];
      if ('studentIds' in input) ids = [...new Set(input.studentIds)];
      else {
        const q = input.filters;
        const rows = await app.db.student.findMany({
          where: {
            ...(q.search ? { name: { contains: q.search, mode: 'insensitive' as const } } : {}),
            ...(q.grade ? { grade: q.grade } : {}),
            ...(q.talent ? { primaryTalent: q.talent } : {}),
            cv: { approvedAt: { not: null } },
          },
          select: { id: true },
          take: 21,
        });
        ids = rows.map((s) => s.id);
      }
      if (!ids.length || ids.length > 20)
        throw new AppError(
          400,
          'PDF_BATCH',
          'اختر من 1 إلى 20 سيرة معتمدة، أو ضيّق نتائج التصفية.',
        );
      return reply
        .type('application/pdf')
        .header('Content-Disposition', 'attachment; filename="student-cvs.pdf"')
        .send(await services.pdf.render(await printable(ids), await logo()));
    },
  );
}
