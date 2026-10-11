import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
export const token = () => randomBytes(32).toString('hex');
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const otp = () => randomInt(0, 1000000).toString().padStart(6, '0');
export const otpHash = (id: string, code: string) =>
  createHmac('sha256', process.env.SESSION_SECRET!).update(`${id}:${code}`).digest('hex');
export function equal(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
