import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { cvSnapshotSchema, type CvSource } from '@quba/shared';
import { AppError } from '../../lib/errors.js';
import { schoolView, studentView } from '../students/serialization.js';
import { ensureSchool } from '../school/routes.js';
import { studentRelations } from '../students/catalog.js';
import type { Prisma } from '../../generated/prisma/client.js';
export async function cvSource(
  app: FastifyInstance,
  id: string,
  db: Prisma.TransactionClient = app.db,
): Promise<CvSource> {
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
  const school = schoolView(existing ?? (await ensureSchool(app)));
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
    grade: source.student.grade,
    classroom: source.student.classroom,
    primaryTalent: source.student.primaryTalent,
    schoolName: source.school.name,
    academicYearLabel: source.student.academicYearLabel,
    supervisors: source.supervisors,
  });
}
