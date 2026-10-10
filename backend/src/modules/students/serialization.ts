import {
  cvSchema,
  studentSchema,
  schoolSchema,
  normalizeArabic,
  type StudentInput,
} from '@quba/shared';
import {
  Prisma,
  type Student,
  type StudentCv,
  type Work,
  type Attachment,
  type Supervisor,
  type SchoolSettings,
  type Classroom,
  type Talent,
  type AcademicYear,
  type StudentTalent,
} from '../../generated/prisma/client.js';
export function studentData(input: StudentInput) {
  const { additionalTalentIds, ...fields } = input;
  return {
    ...fields,
    nameSearch: normalizeArabic(input.name),
    additionalTalents: {
      create: additionalTalentIds.map((talentId, sortOrder) => ({ talentId, sortOrder })),
    },
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
  student: Student & {
    classroom: Classroom;
    primaryTalent: Talent;
    academicYear: AcademicYear;
    additionalTalents: Array<StudentTalent & { talent: Talent }>;
    cv?: StudentCv | null;
    works?: Array<Work & { attachments: Attachment[] }>;
  },
) {
  const input = studentSchema.parse({
    name: student.name,
    grade: student.grade,
    classroomId: student.classroomId,
    primaryTalentId: student.primaryTalentId,
    additionalTalentIds: student.additionalTalents.map((item) => item.talentId),
    skills: student.skills,
    achievements: student.achievements,
    notes: student.notes,
    supervisorOverrides: student.supervisorOverrides,
  });
  const draft = cvSchema.safeParse(student.cv?.draft),
    approved = cvSchema.safeParse(student.cv?.approved);
  return {
    ...input,
    classroom: student.classroom.name,
    primaryTalent: student.primaryTalent.name,
    additionalTalents: student.additionalTalents.map((item) => item.talent.name),
    academicYearId: student.academicYearId,
    academicYearLabel: student.academicYear.label,
    status: student.status,
    archivedAt: student.archivedAt?.toISOString() ?? null,
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
