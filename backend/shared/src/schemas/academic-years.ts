import { z } from 'zod';

export const academicYearLabelSchema = z
  .object({ label: z.string().trim().min(2).max(40) })
  .strict();

export const rolloverSchema = academicYearLabelSchema
  .extend({ yearId: z.uuid(), requestId: z.uuid() })
  .strict();

export interface AcademicYearView {
  id: string;
  label: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt: string | null;
}

export interface YearSettings {
  years: AcademicYearView[];
  current: AcademicYearView;
  counts: { FIRST: number; SECOND: number; THIRD: number };
}

export interface DashboardView {
  academicYear: AcademicYearView;
  pendingRequests: number;
  approvedCvs: number;
  grades: { FIRST: number; SECOND: number; THIRD: number };
  talents: { id: string; name: string; count: number }[];
}
