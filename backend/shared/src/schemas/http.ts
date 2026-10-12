import { z } from 'zod';
import type { CatalogItem } from './catalogs.js';

export const idParamsSchema = z.object({
  studentId: z.uuid().optional(),
  workId: z.uuid().optional(),
  attachmentId: z.uuid().optional(),
  id: z.uuid().optional(),
});

export interface ApiErrorBody {
  message: string;
  code: string;
}

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  talents?: CatalogItem[];
}
