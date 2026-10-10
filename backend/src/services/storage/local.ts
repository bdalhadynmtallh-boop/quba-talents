import { mkdir, writeFile, unlink, stat, readdir, readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import { AppError } from '../../lib/errors.js';
import { ManagedStorage, validateKey, type StoredFile } from './base.js';
export class LocalStorage extends ManagedStorage {
  readonly root: string;
  constructor(root: string) {
    super();
    this.root = resolve(root);
  }
  private path(key: string) {
    return resolve(this.root, validateKey(key));
  }
  async initialize() {
    await mkdir(this.root, { recursive: true });
  }
  protected async write(bytes: Buffer, file: StoredFile) {
    await this.initialize();
    await writeFile(this.path(file.storageKey), bytes, { flag: 'wx' });
  }
  async remove(key: string) {
    try {
      await unlink(this.path(key));
    } catch (error: unknown) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'))
        throw error;
    }
  }
  async read(key: string) {
    return readFile(this.path(key));
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
  protected async list() {
    await this.initialize();
    const result = [];
    for (const key of await readdir(this.root)) {
      if (!/^[-a-f0-9]{36}\.(png|jpg|webp|pdf)$/.test(key)) continue;
      const info = await stat(this.path(key)).catch(() => null);
      if (info) result.push({ key, modifiedAt: info.mtimeMs });
    }
    return result;
  }
}
