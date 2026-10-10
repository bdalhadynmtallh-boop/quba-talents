import { z } from 'zod';
import { AppError } from './errors.js';
export function paramId(params: unknown, key: string) {
  const values = z.record(z.string(), z.uuid()).parse(params);
  const id = values[key];
  if (!id) throw new AppError(400, 'INVALID_ID', 'معرف غير صالح.');
  return id;
}
