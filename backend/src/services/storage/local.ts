import { mkdir, writeFile, unlink, stat, readdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, basename } from 'node:path';
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
export class LocalStorage {
  readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }
  private path(key: string) {
    if (basename(key) !== key || !/^[-a-f0-9]{36}\.(png|jpg|webp|pdf)$/.test(key))
      throw new AppError(400, 'INVALID_FILE', 'مسار ملف غير صالح.');
    return resolve(this.root, key);
  }
  async put(buffer: Buffer, name: string, allowPdf = true): Promise<StoredFile> {
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
    await mkdir(this.root, { recursive: true });
    try {
      await writeFile(this.path(storageKey), bytes, { flag: 'wx' });
    } catch (error) {
      await this.remove(storageKey).catch(() => {});
      throw error;
    }
    return { storageKey, originalName, mimeType: type.mime, sizeBytes: bytes.length };
  }
  async remove(key: string) {
    try {
      await unlink(this.path(key));
    } catch (error: unknown) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'))
        throw error;
    }
  }
  async open(key: string) {
    const path = this.path(key);
    try {
      await stat(path);
    } catch {
      throw new AppError(404, 'FILE_MISSING', 'الملف غير موجود على مساحة التخزين.');
    }
    return createReadStream(path);
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
    await mkdir(this.root, { recursive: true });
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
    for (const key of await readdir(this.root)) {
      if (!/^[-a-f0-9]{36}\.(png|jpg|webp|pdf)$/.test(key) || referenced.has(key)) continue;
      const info = await stat(this.path(key)).catch(() => null);
      if (info && info.mtimeMs < Date.now() - 3600000) await this.remove(key);
    }
  }
}
