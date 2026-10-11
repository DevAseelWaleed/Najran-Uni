import nodemailer from 'nodemailer';
import { institutionIdentity } from './identity';
import { ServiceUnavailableException } from '@nestjs/common';
export function developmentMailboxUrl() {
  return process.env.NODE_ENV !== 'production' &&
    ['localhost', '127.0.0.1'].includes(process.env.SMTP_HOST || '') &&
    process.env.SMTP_PORT === '1025'
    ? 'http://localhost:8025/inbox' : null;
}
export function createMailTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) throw new ServiceUnavailableException('خدمة البريد لم تُهيأ');
  const gmail = host.toLowerCase() === 'smtp.gmail.com';
  const user = process.env.SMTP_USER?.trim();
  const pass = gmail ? process.env.SMTP_PASSWORD?.replace(/\s/g, '') : process.env.SMTP_PASSWORD;
  if (gmail && (!user || !pass))
    throw new ServiceUnavailableException('إعدادات Gmail غير مكتملة: أضف حساب الإرسال وكلمة مرور التطبيق في ملف البيئة');
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    requireTLS: (gmail || process.env.NODE_ENV === 'production') && process.env.SMTP_SECURE !== 'true',
    auth: user ? { user, pass } : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });
}
export async function sendMail(to: string, subject: string, body: string) {
  const transport = createMailTransport();
  const brand = institutionIdentity();
  const escape = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      html: `<html dir="rtl" lang="ar"><body style="font-family:Arial;line-height:2"><h2>${escape(brand.systemName)}</h2><p>${escape(brand.universityName)} | ${escape(brand.collegeName)}</p>${body}<p>إذا لم تطلب هذه العملية، تجاهل الرسالة.</p></body></html>`,
    });
  } catch {
    throw new ServiceUnavailableException('تعذر إرسال البريد، حاول لاحقًا');
  }
}
