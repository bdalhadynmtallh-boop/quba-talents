import { lockStudent } from '../students/repository.js';
import type { z } from 'zod';
import { MAX_ATTACHMENTS, workSchema } from '@quba/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { enqueueDeletion } from '../../services/storage/deletion.js';
import type { ManagedStorage, StoredFile } from '../../services/storage/base.js';
import { workView } from '../students/serialization.js';
export interface IncomingFile {
  buffer: Buffer;
  name: string;
}
export function createWorkService(db: PrismaClient, storage: ManagedStorage) {
  const storedFiles = async (
    files: Array<{ buffer: Buffer; name: string }>,
    stored: StoredFile[],
  ) => {
    for (const file of files) stored.push(await storage.put(file.buffer, file.name));
  };
  async function create(
    studentId: string,
    input: z.infer<typeof workSchema>,
    files: IncomingFile[],
  ) {
    const stored: StoredFile[] = [];

    try {
      await storedFiles(files, stored);
      const work = await db.$transaction(async (tx) => {
        await lockStudent(tx, studentId);
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
      return workView(work);
    } catch (error) {
      await storage.rollback(
        db,
        stored.map((file) => file.storageKey),
      );
      throw error;
    }
  }
  async function update(studentId: string, id: string, input: z.infer<typeof workSchema>) {
    return db.$transaction(async (tx) => {
      await lockStudent(tx, studentId);
      const work = await tx.work.findFirst({ where: { id, studentId } });

      if (!work) throw new AppError(404, 'NOT_FOUND', 'العمل غير موجود لدى هذا الطالب.');

      return workView(
        await tx.work.update({
          where: { id },
          data: {
            ...input,
            date: input.date ? new Date(input.date) : null,
            url: input.url || null,
          },
          include: { attachments: true },
        }),
      );
    });
  }
  async function remove(studentId: string, id: string) {
    await db.$transaction(async (tx) => {
      await lockStudent(tx, studentId);
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

    await storage.maintain(db).catch(() => {});

    return;
  }
  async function addAttachments(studentId: string, workId: string, files: IncomingFile[]) {
    const stored: StoredFile[] = [];

    try {
      await storedFiles(files, stored);
      const work = await db.$transaction(async (tx) => {
        await lockStudent(tx, studentId);
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
      return workView(work);
    } catch (error) {
      await storage.rollback(
        db,
        stored.map((file) => file.storageKey),
      );
      throw error;
    }
  }
  async function getAttachment(studentId: string, workId: string, id: string) {
    const file = await db.attachment.findFirst({
      where: { id, workId, work: { studentId } },
    });

    if (!file) throw new AppError(404, 'NOT_FOUND', 'المرفق غير موجود لدى هذا الطالب والعمل.');

    return { file, stream: await storage.open(file.storageKey) };
  }
  async function removeAttachment(studentId: string, workId: string, id: string) {
    await db.$transaction(async (tx) => {
      await lockStudent(tx, studentId);
      await tx.$queryRaw`SELECT id FROM "Work" WHERE id=${workId}::uuid FOR UPDATE`;
      const file = await tx.attachment.findFirst({ where: { id, workId, work: { studentId } } });
      if (!file) throw new AppError(404, 'NOT_FOUND', 'المرفق غير موجود.');
      await enqueueDeletion(tx, [file.storageKey]);
      await tx.attachment.delete({ where: { id } });
      await tx.work.update({ where: { id: workId }, data: { updatedAt: new Date() } });
      await tx.student.update({ where: { id: studentId }, data: { updatedAt: new Date() } });
    });

    await storage.maintain(db).catch(() => {});

    return;
  }
  return { create, update, remove, addAttachments, getAttachment, removeAttachment };
}
