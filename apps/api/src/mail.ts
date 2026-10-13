import nodemailer from 'nodemailer';
import { institutionIdentity } from './identity';
import { ServiceUnavailableException } from '@nestjs/common';
import { mailProvider } from './cloud-config';
export function developmentMailboxUrl() {
  return mailProvider() === 'smtp' &&
    process.env.NODE_ENV !== 'production' &&
    ['localhost', '127.0.0.1'].includes(process.env.SMTP_HOST || '') &&
    process.env.SMTP_PORT === '1025'
    ? 'http://localhost:8025/inbox'
    : null;
}
export function createMailTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) throw new ServiceUnavailableException('خدمة البريد لم تُهيأ');
  const gmail = host.toLowerCase() === 'smtp.gmail.com';
  const user = process.env.SMTP_USER?.trim();
  const pass = gmail ? process.env.SMTP_PASSWORD?.replace(/\s/g, '') : process.env.SMTP_PASSWORD;
  if (gmail && (!user || !pass))
    throw new ServiceUnavailableException(
      'إعدادات Gmail غير مكتملة: أضف حساب الإرسال وكلمة مرور التطبيق في ملف البيئة',
    );
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    requireTLS:
      (gmail || process.env.NODE_ENV === 'production') && process.env.SMTP_SECURE !== 'true',
    auth: user ? { user, pass } : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });
}
export async function sendBrevoMail(to: string, subject: string, htmlContent: string) {
  if (!process.env.BREVO_API_KEY || !process.env.SMTP_FROM)
    throw new ServiceUnavailableException('إعدادات Brevo غير مكتملة');
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: process.env.SMTP_FROM, name: institutionIdentity().systemName },
        to: [{ email: to }],
        subject,
        htmlContent,
      }),
      signal: AbortSignal.timeout(30000),
      redirect: 'error',
    });
    if (response.status !== 201) throw new Error('Brevo rejected the message');
  } catch {
    throw new ServiceUnavailableException('تعذر إرسال البريد، حاول لاحقًا');
  }
}
export async function verifyMailService() {
  if (mailProvider() === 'brevo') {
    if (!process.env.BREVO_API_KEY || !process.env.SMTP_FROM)
      throw new Error('Brevo requires BREVO_API_KEY and SMTP_FROM');
    const response = await fetch('https://api.brevo.com/v3/senders', {
      headers: { 'api-key': process.env.BREVO_API_KEY },
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Brevo authentication failed');
    const result = (await response.json()) as { senders?: { email: string; active: boolean }[] };
    if (
      !result.senders?.some(
        (sender) =>
          sender.active && sender.email.toLowerCase() === process.env.SMTP_FROM!.toLowerCase(),
      )
    )
      throw new Error('SMTP_FROM must be an active verified sender in Brevo');
    return;
  }
  const transport = createMailTransport();
  try {
    await transport.verify();
  } finally {
    transport.close();
  }
}
export async function sendMail(to: string, subject: string, body: string) {
  const brand = institutionIdentity();
  const escape = (v: string) =>
    v.replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
    );
  const html = `<html dir="rtl" lang="ar"><body style="font-family:Arial;line-height:2"><h2>${escape(brand.systemName)}</h2><p>${escape(brand.universityName)} | ${escape(brand.collegeName)}</p>${body}<p>إذا لم تطلب هذه العملية، تجاهل الرسالة.</p></body></html>`;
  if (mailProvider() === 'brevo') return sendBrevoMail(to, subject, html);
  const transport = createMailTransport();
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      html,
    });
  } catch {
    throw new ServiceUnavailableException('تعذر إرسال البريد، حاول لاحقًا');
  } finally {
    transport.close();
  }
}
