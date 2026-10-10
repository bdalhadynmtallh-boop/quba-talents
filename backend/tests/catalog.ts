import { catalogNameKey } from '@quba/shared';
import type { PrismaClient } from '../src/generated/prisma/client.js';
export async function testCatalog(db: PrismaClient) {
  await db.schoolSettings.upsert({ where: { id: 'school' }, create: { id: 'school' }, update: {} });
  const classroom = await db.classroom.upsert({
    where: { schoolId_nameKey: { schoolId: 'school', nameKey: catalogNameKey('أ') } },
    create: { name: 'أ', nameKey: catalogNameKey('أ') },
    update: { active: true },
  });
  const secondClassroom = await db.classroom.upsert({
    where: { schoolId_nameKey: { schoolId: 'school', nameKey: catalogNameKey('ب') } },
    create: { name: 'ب', nameKey: catalogNameKey('ب') },
    update: { active: true },
  });
  async function talent(name: string) {
    return db.talent.upsert({
      where: { schoolId_nameKey: { schoolId: 'school', nameKey: catalogNameKey(name) } },
      create: { name, nameKey: catalogNameKey(name) },
      update: { active: true, name },
    });
  }
  return {
    classroom,
    secondClassroom,
    programming: await talent('البرمجة'),
    drawing: await talent('الرسم'),
    robotics: await talent('الروبوتات'),
    year: await db.academicYear.findFirstOrThrow({ where: { status: 'OPEN' } }),
  };
}
