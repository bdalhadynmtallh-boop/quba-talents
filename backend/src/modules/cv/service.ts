import { lockStudent } from '../students/repository.js';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import {
  cvSchema,
  cvSnapshotSchema,
  cvEditSchema,
  cvBatchSchema,
  listQuerySchema,
} from '@quba/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Environment } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { aiInput, validateAiFacts, type TextAi } from '../../services/ai/qwen.js';
import type { PdfRenderer } from '../../services/pdf/chromium.js';
import type { ManagedStorage } from '../../services/storage/base.js';
import { cvSource, lockCvSource, sourceHash, snapshot } from './source.js';
import { studentScope } from '../academic-years/service.js';
export function createCvService(
  db: PrismaClient,
  storage: ManagedStorage,
  env: Environment,
  services: { ai: TextAi; pdf: PdfRenderer },
) {
  let activeAi = 0;
  const getSource = (id: string) =>
    db.$transaction((tx) => cvSource(tx, id), { isolationLevel: 'RepeatableRead' });
  async function state(id: string) {
    return db.$transaction(
      async (tx) => {
        const source = await cvSource(tx, id),
          hash = sourceHash(source);

        const cv = await tx.studentCv.findUnique({
          where: { studentId: id },
          include: { reviews: { orderBy: { approvedAt: 'desc' }, take: 1 } },
        });

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
          generating:
            !!cv?.generationToken && (cv.generationExpiresAt?.getTime() ?? 0) > Date.now(),
          aiConfigured: env.NODE_ENV === 'test' || !!(env.AI_API_KEY && env.AI_BASE_URL),
          latestReview: cv?.reviews[0]
            ? {
                revision: cv.reviews[0].revision,
                reviewerName: cv.reviews[0].reviewerName,
                approvedAt: cv.reviews[0].approvedAt,
                studentReviewedAt: cv.reviews[0].studentReviewedAt,
              }
            : null,
          legacyApproval: !!cv?.approved && !cv.reviews.length,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async function generate(id: string, revision: number, reviewedSourceHash?: string) {
    if (activeAi >= 2) throw new AppError(429, 'AI_BUSY', 'طلبات الصياغة مشغولة. انتظر قليلًا.');

    activeAi++;

    const token = randomUUID();

    try {
      await db.$transaction(async (tx) => {
        await lockStudent(tx, id);
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
          throw new AppError(409, 'CV_CONFLICT', 'تغيرت السيرة أو يوجد توليد جارٍ. حدّث المعاينة.');
        await tx.studentCv.update({
          where: { studentId: id },
          data: {
            generationToken: token,
            generationExpiresAt: new Date(Date.now() + env.AI_TIMEOUT_MS + 30000),
          },
        });
      });
      const source = await getSource(id),
        hash = sourceHash(source);
      if (reviewedSourceHash && reviewedSourceHash !== hash)
        throw new AppError(
          409,
          'CV_SOURCE_CHANGED',
          'تغيرت البيانات بعد معاينة الإرسال. راجعها مجددًا قبل الصياغة.',
        );
      const input = aiInput(source);
      const generated = cvSchema.parse(await services.ai.generate(input));
      validateAiFacts(input, generated);
      await db.$transaction(async (tx) => {
        await lockStudent(tx, id);
        const latest = await lockCvSource(tx, id);
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
      await db.studentCv
        .updateMany({
          where: { studentId: id, generationToken: token },
          data: { generationToken: null, generationExpiresAt: null },
        })
        .catch(() => {});
    }
  }
  async function saveDraft(id: string, input: z.infer<typeof cvEditSchema>) {
    await db.$transaction(async (tx) => {
      await lockStudent(tx, id);
      const source = await lockCvSource(tx, id);
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
  }
  async function approve(id: string, revision: number, adminId: string) {
    await db.$transaction(async (tx) => {
      await lockStudent(tx, id);
      const source = await lockCvSource(tx, id);
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
      const reviewer = await tx.admin.findUniqueOrThrow({ where: { id: adminId } });
      const reviewedAt = new Date();
      await tx.cvReview.create({
        data: {
          cvId: cv.id,
          revision,
          sourceHash: cv.draftSourceHash!,
          reviewerId: adminId,
          reviewerName: reviewer.name,
          studentReviewedAt: reviewedAt,
          approvedAt: reviewedAt,
        },
      });
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
  }
  async function logo() {
    const school = await db.schoolSettings.findUnique({ where: { id: 'school' } });

    if (!school?.logoKey) return undefined;

    if (!/^[-a-f0-9]{36}\.(png|jpg|webp)$/.test(school.logoKey))
      throw new AppError(500, 'LOGO', 'الشعار المخزن غير صالح.');

    try {
      return `data:${school.logoMimeType};base64,${(await storage.read(school.logoKey)).toString('base64')}`;
    } catch {
      throw new AppError(
        503,
        'LOGO_MISSING',
        'الشعار محفوظ في البيانات لكن ملفه مفقود. أعد رفعه أو احذفه من الإعدادات.',
      );
    }
  }
  async function printable(ids: string[]) {
    const rows = await db.student.findMany({
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
  }
  async function exportBatch(input: z.infer<typeof cvBatchSchema>) {
    let ids: string[];

    if ('studentIds' in input) {
      ids = [...new Set(input.studentIds)];
      const where = await studentScope(db, listQuerySchema.parse(input.scope ?? {}));
      const count = await db.student.count({ where: { ...where, id: { in: ids } } });
      if (count !== ids.length)
        throw new AppError(
          409,
          'PDF_SCOPE',
          'بعض الطلاب خارج نطاق السنة والحالة المختارتين. حدّث القائمة والتحديد.',
        );
    } else {
      const q = input.filters;
      const scope = await studentScope(db, listQuerySchema.parse(q));
      const rows = await db.student.findMany({
        where: {
          ...scope,
          cv: { approvedAt: { not: null } },
        },
        select: { id: true },
        take: 21,
      });
      ids = rows.map((s) => s.id);
    }

    if (!ids.length || ids.length > 20)
      throw new AppError(400, 'PDF_BATCH', 'اختر من 1 إلى 20 سيرة معتمدة، أو ضيّق نتائج التصفية.');

    return services.pdf.render(await printable(ids), await logo());
  }
  const exportOne = async (id: string) => services.pdf.render(await printable([id]), await logo());
  const previewAi = async (id: string) => {
    const source = await getSource(id);
    return { ...aiInput(source), sourceHash: sourceHash(source) };
  };
  return { getSource, previewAi, state, generate, saveDraft, approve, exportOne, exportBatch };
}
