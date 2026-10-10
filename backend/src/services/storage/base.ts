import { randomUUID } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { FILE_LIMIT } from '@quba/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
export interface StoredFile {
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}
export function validateKey(key: string) {
  if (!/^[-a-f0-9]{36}\.(png|jpg|webp|pdf)$/.test(key))
    throw new AppError(400, 'INVALID_FILE', 'مسار ملف غير صالح.');
  return key;
}
export async function prepareFile(buffer: Buffer, name: string, allowPdf = true) {
  if (!buffer.length || buffer.length > FILE_LIMIT)
    throw new AppError(413, 'FILE_SIZE', 'حجم الملف يجب أن يكون بين 1 بايت و10 ميغابايت.');
  const type = await fileTypeFromBuffer(buffer).catch(() => undefined);
  const filename = name.toLowerCase();
  const suffix = filename.split('.').pop();
  if (!suffix || !['jpg', 'jpeg', 'png', 'webp', ...(allowPdf ? ['pdf'] : [])].includes(suffix))
    throw new AppError(400, 'FILE_TYPE', 'امتداد الملف غير مسموح.');
  const allowed = [
    'image/jpeg',
    'image/png',
    'image/webp',
    ...(allowPdf ? ['application/pdf'] : []),
  ];
  if (!type || !allowed.includes(type.mime))
    throw new AppError(400, 'FILE_TYPE', 'الأنواع المسموحة: JPEG وPNG وWebP وPDF فقط.');
  let bytes = buffer;
  let extension = type.ext;
  try {
    if (type.mime === 'application/pdf') {
      const document = await PDFDocument.load(buffer, { ignoreEncryption: false });
      if (!document.getPageCount()) throw new Error('Empty PDF');
    } else {
      const image = sharp(buffer, { limitInputPixels: 16000000, failOn: 'error' }).rotate();
      bytes =
        type.mime === 'image/jpeg'
          ? await image.jpeg({ quality: 90 }).toBuffer()
          : type.mime === 'image/png'
            ? await image.png().toBuffer()
            : await image.webp({ quality: 90 }).toBuffer();
      extension = type.mime === 'image/jpeg' ? 'jpg' : type.ext;
    }
  } catch {
    throw new AppError(400, 'FILE_INVALID', 'الملف تالف أو محمي أو يتجاوز حدود الصورة المسموحة.');
  }
  if (bytes.length > FILE_LIMIT)
    throw new AppError(413, 'FILE_SIZE', 'حجم الملف بعد المعالجة أكبر من الحد المسموح.');
  const originalName =
    (name.split(/[\\/]/).pop() ?? 'ملف')
      .split('')
      .filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
      .join('')
      .slice(0, 200) || 'ملف';
  const storageKey = `${randomUUID()}.${extension}`;
  return {
    bytes,
    file: { storageKey, originalName, mimeType: type.mime, sizeBytes: bytes.length },
  };
}
export abstract class ManagedStorage {
  abstract initialize(): Promise<void>;
  protected abstract write(bytes: Buffer, file: StoredFile): Promise<void>;
  abstract read(key: string): Promise<Buffer>;
  abstract open(key: string): Promise<import('node:stream').Readable>;
  abstract remove(key: string): Promise<void>;
  protected abstract list(): Promise<{ key: string; modifiedAt: number }[]>;
  async put(buffer: Buffer, name: string, allowPdf = true): Promise<StoredFile> {
    const { bytes, file } = await prepareFile(buffer, name, allowPdf);
    try {
      await this.write(bytes, file);
    } catch (error) {
      await this.remove(file.storageKey).catch(() => {});
      throw error;
    }
    return file;
  }
  async rollback(db: PrismaClient, keys: string[]) {
    for (const key of keys) {
      try {
        await this.remove(key);
      } catch {
        await db.storageDeletion
          .createMany({ data: [{ storageKey: key }], skipDuplicates: true })
          .catch(() => {});
      }
    }
  }
  async maintain(db: PrismaClient) {
    const pending = await db.storageDeletion.findMany({ take: 100 });
    for (const row of pending) {
      try {
        await this.remove(row.storageKey);
        await db.storageDeletion.deleteMany({ where: { id: row.id } });
      } catch {
        /* Retained for retry. */
      }
    }
    const [attachments, schools] = await Promise.all([
      db.attachment.findMany({ select: { storageKey: true } }),
      db.schoolSettings.findMany({ select: { logoKey: true } }),
    ]);
    const referenced = new Set([
      ...attachments.map((file) => file.storageKey),
      ...schools.map((school) => school.logoKey).filter(Boolean),
    ]);
    for (const item of await this.list()) {
      if (!/^[-a-f0-9]{36}\.(png|jpg|webp|pdf)$/.test(item.key) || referenced.has(item.key))
        continue;
      if (item.modifiedAt < Date.now() - 3600000) await this.remove(item.key);
    }
  }
}
