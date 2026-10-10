import { Readable } from 'node:stream';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { FILE_LIMIT } from '@quba/shared';
import { AppError } from '../../lib/errors.js';
import { ManagedStorage, validateKey, type StoredFile } from './base.js';

export class SupabaseStorage extends ManagedStorage {
  private readonly client: SupabaseClient;
  constructor(
    url: string,
    key: string,
    private readonly bucket: string,
    client?: SupabaseClient,
  ) {
    super();
    this.client =
      client ??
      createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: {
          fetch: (input, init) =>
            fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(30000) }),
        },
      });
  }
  private failure() {
    return new AppError(503, 'STORAGE_UNAVAILABLE', 'تعذر الاتصال بمساحة المرفقات. حاول لاحقًا.');
  }
  async initialize() {
    const { data, error } = await this.client.storage.getBucket(this.bucket);
    if (error || !data || data.public)
      throw new Error('يلزم إنشاء حاوية Supabase خاصة للمرفقات؛ لا يمكن تشغيل التخزين العام.');
  }
  protected async write(bytes: Buffer, file: StoredFile) {
    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(validateKey(file.storageKey), bytes, {
        contentType: file.mimeType,
        upsert: false,
        cacheControl: '0',
      });
    if (error) throw this.failure();
  }
  async read(key: string) {
    const { data, error } = await this.client.storage.from(this.bucket).download(validateKey(key));
    if (error || !data)
      throw new AppError(404, 'FILE_MISSING', 'تعذر العثور على المرفق في مساحة التخزين.');
    if (!data.size || data.size > FILE_LIMIT) throw this.failure();
    return Buffer.from(await data.arrayBuffer());
  }
  async open(key: string) {
    return Readable.from(await this.read(key));
  }
  async remove(key: string) {
    const { error } = await this.client.storage.from(this.bucket).remove([validateKey(key)]);
    if (error) throw this.failure();
  }
  protected async list() {
    const result: { key: string; modifiedAt: number }[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await this.client.storage.from(this.bucket).list('', {
        limit: 500,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error || !data) throw this.failure();
      for (const file of data) {
        const modifiedAt = Date.parse(file.updated_at || file.created_at || '');
        if (Number.isFinite(modifiedAt)) result.push({ key: file.name, modifiedAt });
      }
      if (data.length < 500) break;
    }
    return result;
  }
}
