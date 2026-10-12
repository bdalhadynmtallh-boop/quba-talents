import type { PrismaClient } from '../../generated/prisma/client.js';
import type { ManagedStorage } from '../../services/storage/base.js';
import type { SchoolInput } from '@quba/shared';
import { AppError } from '../../lib/errors.js';
import { enqueueDeletion } from '../../services/storage/deletion.js';
import { schoolView } from './serialization.js';
import { ensureSchool } from './repository.js';
export function createSchoolService(db: PrismaClient, storage: ManagedStorage) {
  const get = async () => schoolView(await ensureSchool(db));
  async function update(input: SchoolInput) {
    await ensureSchool(db);

    const school = await db.schoolSettings.update({
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
  }
  async function setLogo(buffer: Buffer, name: string) {
    const stored = await storage.put(buffer, name, false);

    try {
      await ensureSchool(db);
      const school = await db.$transaction(async (tx) => {
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
      await storage.maintain(db).catch(() => {});
      return schoolView(school);
    } catch (error) {
      await storage.rollback(db, [stored.storageKey]);
      throw error;
    }
  }
  async function removeLogo() {
    await db.$transaction(async (tx) => {
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

    await storage.maintain(db).catch(() => {});

    return;
  }
  async function getLogo() {
    const school = await db.schoolSettings.findUnique({ where: { id: 'school' } });

    if (!school?.logoKey) throw new AppError(404, 'NOT_FOUND', 'لا يوجد شعار محفوظ.');

    return {
      mimeType: school.logoMimeType ?? 'application/octet-stream',
      stream: await storage.open(school.logoKey),
    };
  }
  return { get, update, setLogo, getLogo, removeLogo };
}
