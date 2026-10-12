import { z } from 'zod';
import { dateSchema } from './common.js';

export const safeUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'أدخل رابط http أو https صحيحًا.');

export const workSchema = z
  .object({
    title: z.string().trim().min(2).max(150),
    description: z.string().trim().max(3000).default(''),
    date: dateSchema,
    studentRole: z.string().trim().max(500).default(''),
    url: safeUrlSchema.default(''),
  })
  .strict();

export type WorkInput = z.infer<typeof workSchema>;

export interface AttachmentView {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface WorkView extends Omit<WorkInput, 'date'> {
  id: string;
  studentId: string;
  date: string | null;
  attachments: AttachmentView[];
  createdAt: string;
  updatedAt: string;
}
