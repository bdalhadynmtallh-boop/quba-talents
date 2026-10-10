import 'dotenv/config';
import { createDatabase } from '../../src/plugins/database.js';
import { catalogNameKey, normalizeArabic } from '@quba/shared';
async function seed() {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEMO_SEED !== 'yes')
    throw new Error('يتطلب seed بيئة غير إنتاجية وALLOW_DEMO_SEED=yes.');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL مطلوب.');
  const db = createDatabase(process.env.DATABASE_URL);
  try {
    await db.schoolSettings.upsert({
      where: { id: 'school' },
      create: { id: 'school' },
      update: {},
    });
    await db.student.upsert({
      where: { id: '00000000-0000-4000-8000-000000000001' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000001',
        name: 'طالب تجريبي — أحمد',
        grade: 'SECOND',
        nameSearch: normalizeArabic('طالب تجريبي — أحمد'),
        academicYear: {
          connect: {
            id: (await db.academicYear.findFirstOrThrow({ where: { status: 'OPEN' } })).id,
          },
        },
        classroom: {
          connectOrCreate: {
            where: { schoolId_nameKey: { schoolId: 'school', nameKey: catalogNameKey('أ') } },
            create: { name: 'أ', nameKey: catalogNameKey('أ') },
          },
        },
        primaryTalent: {
          connectOrCreate: {
            where: { schoolId_nameKey: { schoolId: 'school', nameKey: catalogNameKey('البرمجة') } },
            create: { name: 'البرمجة', nameKey: catalogNameKey('البرمجة') },
          },
        },
        skills: ['حل المشكلات', 'العمل الجماعي'],
        notes: 'بيانات تجريبية اختيارية؛ ليست بيانات طالب حقيقي.',
      },
    });
    console.log('أضيف طالب تجريبي خاص. لا ينشئ seed مسؤولًا أو كلمة مرور.');
  } finally {
    await db.$disconnect();
  }
}
seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'تعذر seed.');
  process.exitCode = 1;
});
