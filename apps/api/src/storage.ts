import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  BadRequestException,
  ServiceUnavailableException,
  NotFoundException,
} from '@nestjs/common';
import { storageProvider, supabaseStorageConfig } from './cloud-config';
export interface Storage {
  put(data: Buffer): Promise<string>;
  get(key: string): Promise<Buffer>;
}
function validateKey(key: string) {
  if (!/^[a-f0-9-]{36}$/.test(key)) throw new BadRequestException('الملف غير صالح');
}
async function scan(data: Buffer) {
  if (!process.env.MALWARE_SCANNER) return;
  const directory = await mkdtemp(join(tmpdir(), 'portal-scan-'));
  try {
    const path = join(directory, 'upload');
    await writeFile(path, data);
    await promisify(execFile)(process.env.MALWARE_SCANNER, [path], { timeout: 60000 });
  } catch {
    throw new BadRequestException('رفض فحص الملف');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
export class LocalStorage implements Storage {
  private root = resolve(process.env.STORAGE_DIR || 'storage');
  async put(data: Buffer) {
    await scan(data);
    await mkdir(this.root, { recursive: true });
    const key = randomUUID();
    await writeFile(join(this.root, key), data, { flag: 'wx' });
    return key;
  }
  async get(key: string) {
    validateKey(key);
    return readFile(join(this.root, key));
  }
}
export class SupabaseStorage implements Storage {
  private async request(path: string, options: RequestInit = {}) {
    const { origin, key } = supabaseStorageConfig();
    try {
      const response = await fetch(`${origin}/storage/v1${path}`, {
        ...options,
        headers: { apikey: key, Authorization: `Bearer ${key}`, ...options.headers },
        signal: AbortSignal.timeout(60000),
        redirect: 'error',
      });
      if (response.status === 404) throw new NotFoundException('الملف غير موجود');
      if (!response.ok) throw new ServiceUnavailableException('تعذر الوصول إلى تخزين الملفات');
      return response;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ServiceUnavailableException)
        throw error;
      throw new ServiceUnavailableException('تعذر الاتصال بتخزين الملفات');
    }
  }
  async put(data: Buffer) {
    const mime = detectMime(data);
    await scan(data);
    const { bucket } = supabaseStorageConfig();
    const key = randomUUID();
    await this.request(`/object/${bucket}/${key}`, {
      method: 'POST',
      headers: { 'Content-Type': mime, 'x-upsert': 'false', 'Cache-Control': 'no-store' },
      body: new Uint8Array(data),
    });
    return key;
  }
  async get(key: string) {
    validateKey(key);
    const { bucket } = supabaseStorageConfig();
    const response = await this.request(`/object/authenticated/${bucket}/${key}`);
    return Buffer.from(await response.arrayBuffer());
  }
}
// Resolve after dotenv has loaded; never fall back to ephemeral local storage on cloud errors.
export const storage: Storage = {
  put: (data) =>
    (storageProvider() === 'supabase' ? new SupabaseStorage() : new LocalStorage()).put(data),
  get: (key) =>
    (storageProvider() === 'supabase' ? new SupabaseStorage() : new LocalStorage()).get(key),
};
export function detectMime(data: Buffer) {
  if (data.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png';
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) return 'image/jpeg';
  throw new BadRequestException('يسمح بملفات PDF وPNG وJPEG فقط');
}
