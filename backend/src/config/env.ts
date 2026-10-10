import 'dotenv/config';
import { z } from 'zod';
const environmentSchema = z.object({
  AI_API_KEY: z.string().optional(),
  AI_BASE_URL: z.string().default(''),
  AI_MODEL: z.string().default('qwen3.8-max'),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(60000),
  AI_OUTPUT_MODE: z.enum(['auto', 'json_schema', 'json_object', 'prompt']).default('auto'),
  CHROMIUM_EXECUTABLE_PATH: z
    .string()
    .transform((value) => value || undefined)
    .optional(),
  STORAGE_DIR: z.string().default('.data/uploads'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url(),
  COOKIE_SECRET: z.string().min(32),
  APP_ORIGIN: z.url(),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  SESSION_HOURS: z.coerce.number().int().min(1).max(24).default(8),
});
export type Environment = z.infer<typeof environmentSchema>;
export function loadEnvironment(): Environment {
  const parsed = environmentSchema.safeParse(process.env);
  if (!parsed.success)
    throw new Error(
      'إعدادات البيئة غير مكتملة. راجع backend/.env.example: ' +
        parsed.error.issues.map((issue) => issue.path.join('.')).join(', '),
    );
  if (new URL(parsed.data.APP_ORIGIN).origin !== parsed.data.APP_ORIGIN)
    throw new Error('APP_ORIGIN يجب أن يكون أصلًا دون مسار أو شرطة أخيرة.');
  if (parsed.data.NODE_ENV === 'production' && !parsed.data.APP_ORIGIN.startsWith('https://'))
    throw new Error('الإنتاج يتطلب HTTPS.');
  return parsed.data;
}
