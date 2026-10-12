import type { Prisma } from '../../generated/prisma/client.js';

// All writers of student facts, CVs and works use this parent lock first.
// Acquire an academic-year lock before this one when both are needed.
export async function lockStudent(db: Prisma.TransactionClient, id: string) {
  await db.$queryRaw`SELECT id FROM "Student" WHERE id=${id}::uuid FOR UPDATE`;
}
