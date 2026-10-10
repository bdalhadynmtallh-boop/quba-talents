import { cvSchema, studentSchema, schoolSchema, type StudentInput } from '@quba/shared';
import {
  Prisma,
  type Student,
  type StudentCv,
  type Work,
  type Attachment,
  type Supervisor,
  type SchoolSettings,
} from '../../generated/prisma/client.js';
export function studentData(input: StudentInput) {
  return {
    ...input,
    achievements: input.achievements.map((item) => ({
      title: item.title,
      date: item.date ?? null,
    })),
    supervisorOverrides:
      input.supervisorOverrides === null ? Prisma.DbNull : input.supervisorOverrides,
  };
}
export function workView(work: Work & { attachments: Attachment[] }) {
  return {
    id: work.id,
    studentId: work.studentId,
    title: work.title,
    description: work.description,
    date: work.date?.toISOString().slice(0, 10) ?? null,
    studentRole: work.studentRole,
    url: work.url ?? '',
    createdAt: work.createdAt.toISOString(),
    updatedAt: work.updatedAt.toISOString(),
    attachments: work.attachments.map((file) => ({
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    })),
  };
}
export function studentView(
  student: Student & { cv?: StudentCv | null; works?: Array<Work & { attachments: Attachment[] }> },
) {
  const input = studentSchema.parse({
    name: student.name,
    grade: student.grade,
    classroom: student.classroom,
    primaryTalent: student.primaryTalent,
    additionalTalents: student.additionalTalents,
    skills: student.skills,
    achievements: student.achievements,
    notes: student.notes,
    supervisorOverrides: student.supervisorOverrides,
  });
  const draft = cvSchema.safeParse(student.cv?.draft),
    approved = cvSchema.safeParse(student.cv?.approved);
  return {
    ...input,
    id: student.id,
    createdAt: student.createdAt.toISOString(),
    updatedAt: student.updatedAt.toISOString(),
    cv: student.cv
      ? {
          draft: draft.success ? draft.data : null,
          approved: approved.success ? approved.data : null,
          approvedAt: student.cv.approvedAt?.toISOString() ?? null,
        }
      : null,
    works: student.works?.map(workView) ?? [],
  };
}
export function schoolView(school: SchoolSettings & { supervisors: Supervisor[] }) {
  return {
    ...schoolSchema.parse({
      name: school.name,
      supervisors: school.supervisors.map(({ name, role }) => ({ name, role })),
    }),
    hasLogo: !!school.logoKey,
    updatedAt: school.updatedAt.toISOString(),
  };
}
