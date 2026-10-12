import { createHash } from 'node:crypto';
import { cvSnapshotSchema, type CvSource } from '@quba/shared';
import { AppError } from '../../lib/errors.js';
import { studentView } from '../students/serialization.js';
import { schoolView } from '../school/serialization.js';
import { ensureSchool } from '../school/repository.js';
import { studentRelations } from '../students/catalog.js';
import type { Prisma } from '../../generated/prisma/client.js';
export async function cvSource(db: Prisma.TransactionClient, id: string): Promise<CvSource> {
  const student = await db.student.findUnique({
    where: { id },
    include: {
      ...studentRelations,
      cv: true,
      works: { include: { attachments: true }, orderBy: { id: 'asc' } },
    },
  });
  if (!student) throw new AppError(404, 'NOT_FOUND', 'الطالب غير موجود.');
  const existing = await db.schoolSettings.findUnique({
    where: { id: 'school' },
    include: { supervisors: { orderBy: { sortOrder: 'asc' } } },
  });
  const school = schoolView(existing ?? (await ensureSchool(db)));
  const view = studentView(student);
  return {
    student: view,
    school,
    supervisors: view.supervisorOverrides ?? school.supervisors,
    sourceUpdatedAt: new Date(
      Math.max(
        student.updatedAt.getTime(),
        new Date(school.updatedAt).getTime(),
        ...student.works.map((work) => work.updatedAt.getTime()),
      ),
    ).toISOString(),
  };
}
export function sourceHash(source: CvSource) {
  const s = source.student;
  // Preserve the original hash shape/order. IDs, year and archive state are not CV source facts.
  const student = {
    name: s.name,
    grade: s.grade,
    classroom: s.classroom,
    primaryTalent: s.primaryTalent,
    additionalTalents: s.additionalTalents,
    skills: s.skills,
    achievements: s.achievements,
    notes: s.notes,
    supervisorOverrides: s.supervisorOverrides,
    id: s.id,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    cv: s.cv,
    works: s.works,
    ...(s.phoneNumber ? { phoneNumber: s.phoneNumber } : {}),
  };
  return createHash('sha256')
    .update(
      JSON.stringify(
        { student, school: source.school, supervisors: source.supervisors },
        (key, value: unknown) => (key === 'cv' ? undefined : value),
      ),
    )
    .digest('hex');
}
export function snapshot(source: CvSource) {
  return cvSnapshotSchema.parse({
    name: source.student.name,
    phoneNumber: source.student.phoneNumber,
    grade: source.student.grade,
    classroom: source.student.classroom,
    primaryTalent: source.student.primaryTalent,
    schoolName: source.school.name,
    academicYearLabel: source.student.academicYearLabel,
    supervisors: source.supervisors,
  });
}

// The parent Student is already locked by the writer. Lock all other source facts until commit.
export async function lockCvSource(db: Prisma.TransactionClient, id: string): Promise<CvSource> {
  await db.$queryRaw`SELECT id FROM "SchoolSettings" WHERE id='school' FOR SHARE`;
  const student = await db.student.findUnique({
    where: { id },
    select: {
      classroomId: true,
      primaryTalentId: true,
      additionalTalents: { select: { talentId: true } },
    },
  });
  if (!student) throw new AppError(404, 'NOT_FOUND', 'الطالب غير موجود.');
  await db.$queryRaw`SELECT id FROM "Classroom" WHERE id=${student.classroomId}::uuid FOR SHARE`;
  const talents = [
    ...new Set([student.primaryTalentId, ...student.additionalTalents.map((t) => t.talentId)]),
  ].sort();
  for (const talent of talents)
    await db.$queryRaw`SELECT id FROM "Talent" WHERE id=${talent}::uuid FOR SHARE`;
  return cvSource(db, id);
}
