import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BadRequestException } from '@nestjs/common';
export interface Storage {
  put(data: Buffer): Promise<string>;
  get(key: string): Promise<Buffer>;
}
export class LocalStorage implements Storage {
  private root = resolve(process.env.STORAGE_DIR || 'storage');
  async put(data: Buffer) {
    await mkdir(this.root, { recursive: true });
    const key = randomUUID();
    await writeFile(join(this.root, key), data, { flag: 'wx' });
    if (process.env.MALWARE_SCANNER) {
      try {
        await promisify(execFile)(process.env.MALWARE_SCANNER, [join(this.root, key)], {
          timeout: 60000,
        });
      } catch {
        throw new BadRequestException('رفض فحص الملف');
      }
    }
    return key;
  }
  async get(key: string) {
    if (!/^[a-f0-9-]{36}$/.test(key)) throw new BadRequestException('الملف غير صالح');
    return readFile(join(this.root, key));
  }
}
export const storage: Storage = new LocalStorage();
export function detectMime(data: Buffer) {
  if (data.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png';
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) return 'image/jpeg';
  throw new BadRequestException('يسمح بملفات PDF وPNG وJPEG فقط');
}
