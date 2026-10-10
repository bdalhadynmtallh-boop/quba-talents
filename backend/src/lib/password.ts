import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    ),
  );
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt);
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, salt, hex] = encoded.split(':');
  if (
    algorithm !== 'scrypt' ||
    !salt ||
    !/^[a-f0-9]{32}$/.test(salt) ||
    !hex ||
    !/^[a-f0-9]{128}$/.test(hex)
  )
    return false;
  const key = await derive(password, salt);
  return timingSafeEqual(key, Buffer.from(hex, 'hex'));
}
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export function equalTokens(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
