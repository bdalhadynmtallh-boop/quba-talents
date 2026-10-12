import { z } from 'zod';

export const loginSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    password: z.string().min(1).max(256),
  })
  .strict();

export const adminSetupSchema = loginSchema.extend({
  name: z.string().trim().min(2).max(100),
  password: z.string().min(14).max(256),
});

export type LoginInput = z.infer<typeof loginSchema>;

export interface AdminIdentity {
  id: string;
  name: string;
  email: string;
}

export interface SessionResponse {
  admin: AdminIdentity | null;
}
