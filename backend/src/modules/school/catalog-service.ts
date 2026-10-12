import type { z } from 'zod';
import { catalogSchema, catalogNameKey } from '@quba/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { ensureSchool } from './repository.js';
export function createCatalogService(db: PrismaClient) {
  const select = { id: true, name: true, sortOrder: true, active: true };
  const orderBy = [{ sortOrder: 'asc' as const }, { name: 'asc' as const }];
  const read = async (activeOnly: boolean) => ({
    classrooms: await db.classroom.findMany({
      where: { schoolId: 'school', ...(activeOnly ? { active: true } : {}) },
      select,
      orderBy,
    }),
    talents: await db.talent.findMany({
      where: { schoolId: 'school', ...(activeOnly ? { active: true } : {}) },
      select,
      orderBy,
    }),
  });
  async function create(kind: 'classrooms' | 'talents', input: z.infer<typeof catalogSchema>) {
    const nameKey = catalogNameKey(input.name);
    if (!nameKey) throw new AppError(400, 'CATALOG_NAME', 'أدخل اسمًا واضحًا يحتوي على حروف.');

    await ensureSchool(db);

    const data = { ...input, nameKey, schoolId: 'school' };

    const item =
      kind === 'classrooms'
        ? await db.classroom.create({ data, select })
        : await db.talent.create({ data, select });

    return item;
  }
  async function update(
    kind: 'classrooms' | 'talents',
    id: string,
    input: z.infer<typeof catalogSchema>,
  ) {
    const nameKey = catalogNameKey(input.name);
    if (!nameKey) throw new AppError(400, 'CATALOG_NAME', 'أدخل اسمًا واضحًا يحتوي على حروف.');

    const data = { ...input, nameKey };

    return kind === 'classrooms'
      ? db.classroom.update({ where: { id, schoolId: 'school' }, data, select })
      : db.talent.update({ where: { id, schoolId: 'school' }, data, select });
  }
  return { read, create, update };
}
