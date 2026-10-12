import { z } from 'zod';
import { supervisorSchema } from './common.js';

export const schoolSchema = z
  .object({
    name: z.string().trim().min(2).max(150),
    supervisors: z.array(supervisorSchema).max(10),
  })
  .strict();

export type SchoolInput = z.infer<typeof schoolSchema>;

export interface SchoolView extends SchoolInput {
  hasLogo: boolean;
  updatedAt: string;
}
