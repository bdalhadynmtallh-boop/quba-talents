import { schoolSchema } from '@quba/shared';
import type { SchoolSettings, Supervisor } from '../../generated/prisma/client.js';
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
