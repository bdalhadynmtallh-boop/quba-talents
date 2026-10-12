import { z } from 'zod';

export const gradeSchema = z.enum(['FIRST', 'SECOND', 'THIRD']);

export const dateSchema = z.iso.date().nullable().optional();

export const achievementSchema = z
  .object({ title: z.string().trim().min(1).max(500), date: dateSchema })
  .strict();

export const supervisorSchema = z
  .object({ name: z.string().trim().min(2).max(100), role: z.string().trim().min(2).max(120) })
  .strict();

export const phoneNumberSchema = z
  .string()
  .trim()
  .max(40)
  .transform((value) =>
    value
      .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
      .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
      .replace(/[\s()-]/g, ''),
  )
  .refine((value) => !value || /^\+?[0-9]{8,15}$/.test(value), {
    message: 'أدخل رقم جوال صحيحًا من 8 إلى 15 رقمًا، مع رمز الدولة عند الحاجة.',
  });

export const requiredPhoneNumberSchema = phoneNumberSchema.refine((value) => !!value, {
  message: 'رقم الجوال مطلوب.',
});
