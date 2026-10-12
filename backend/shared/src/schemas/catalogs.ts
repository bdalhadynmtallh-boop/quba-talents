import { z } from 'zod';
import { catalogNameKey } from '../normalization.js';

export const catalogSchema = z
  .object({
    name: z.string().trim().min(1).max(30),
    sortOrder: z.number().int().min(0).max(10000).default(0),
    active: z.boolean().default(true),
  })
  .strict();

export const talentCatalogSchema = catalogSchema
  .extend({ name: z.string().trim().min(2).max(80) })
  .strict();

export interface CatalogItem {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
}

export interface CatalogView {
  classrooms: CatalogItem[];
  talents: CatalogItem[];
}

export const namedCatalogFields = {
  classroom: z
    .string()
    .trim()
    .min(1)
    .max(30)
    .refine((name) => !!catalogNameKey(name)),
  primaryTalent: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .refine((name) => !!catalogNameKey(name)),
  additionalTalents: z
    .array(
      z
        .string()
        .trim()
        .min(2)
        .max(80)
        .refine((name) => !!catalogNameKey(name)),
    )
    .max(10)
    .default([]),
};

export function distinctTalentNames(value: { primaryTalent: string; additionalTalents: string[] }) {
  const keys = [value.primaryTalent, ...value.additionalTalents].map(catalogNameKey);
  return new Set(keys).size === keys.length;
}
