import type { PrismaClient } from '../../generated/prisma/client.js';
import type { LoginInput } from '@quba/shared';
import { AppError } from '../../lib/errors.js';
import { hashPassword, hashToken, newToken, verifyPassword } from '../../lib/password.js';
export async function createAuthService(db: PrismaClient, sessionHours: number) {
  const dummyHash = await hashPassword(newToken());
  async function login(input: LoginInput, previousSessionId: string | null) {
    const admin = await db.admin.findUnique({ where: { email: input.email } });

    const valid = await verifyPassword(input.password, admin?.passwordHash ?? dummyHash);

    if (!admin || !valid)
      throw new AppError(401, 'INVALID_CREDENTIALS', 'البريد الإلكتروني أو كلمة المرور غير صحيحة.');

    const token = newToken();

    const expiresAt = new Date(Date.now() + sessionHours * 3600000);

    const identity = { id: admin.id, name: admin.name, email: admin.email };

    await db.$transaction(async (tx) => {
      if (previousSessionId) await tx.session.deleteMany({ where: { id: previousSessionId } });
      await tx.session.deleteMany({
        where: { adminId: admin.id, expiresAt: { lte: new Date() } },
      });
      await tx.session.create({
        data: { adminId: admin.id, tokenHash: hashToken(token), expiresAt },
      });
    });

    return { identity, token, expiresAt };
  }
  const logout = (sessionId: string | null) =>
    db.session.deleteMany({ where: { id: sessionId ?? '' } });
  return { login, logout };
}
