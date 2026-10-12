import type { Prisma } from '../../generated/prisma/client.js';

export const schoolRelations = {
  supervisors: { orderBy: { sortOrder: 'asc' as const } },
} satisfies Prisma.SchoolSettingsInclude;

// Receives the current client explicitly, including callers inside a transaction.
export function ensureSchool(db: Prisma.TransactionClient) {
  return db.schoolSettings.upsert({
    where: { id: 'school' },
    create: { id: 'school' },
    update: {},
    include: schoolRelations,
  });
}
