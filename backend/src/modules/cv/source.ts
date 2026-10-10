import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { cvSnapshotSchema, type CvSource } from '@quba/shared';
import { AppError } from '../../lib/errors.js';
import { schoolView, studentView } from '../students/serialization.js';
import { ensureSchool } from '../school/routes.js';
export async function cvSource(app: FastifyInstance, id: string): Promise<CvSource> {
  const student = await app.db.student.findUnique({
    where: { id },
    include: { cv: true, works: { include: { attachments: true }, orderBy: { id: 'asc' } } },
  });
  if (!student) throw new AppError(404, 'NOT_FOUND', 'الطالب غير موجود.');
  const school = schoolView(await ensureSchool(app));
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
  return createHash('sha256')
    .update(
      JSON.stringify(
        { student: source.student, school: source.school, supervisors: source.supervisors },
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
    supervisors: source.supervisors,
  });
}
