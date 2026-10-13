import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import { SupabaseStorage, storage } from '../src/storage';
import { sendMail, verifyMailService } from '../src/mail';
import { validateCloudConfig } from '../src/cloud-config';
import { mountWeb } from '../src/web-host';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function cloudEnv() {
  vi.stubEnv('STORAGE_PROVIDER', 'supabase');
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'private-test-key');
  vi.stubEnv('SUPABASE_STORAGE_BUCKET', 'portal-documents');
  vi.stubEnv('MAIL_PROVIDER', 'brevo');
  vi.stubEnv('BREVO_API_KEY', 'private-mail-key');
  vi.stubEnv('SMTP_FROM', 'sender@example.edu');
  vi.stubEnv('MALWARE_SCANNER', '');
}
describe('cloud services', () => {
  it('stores bytes remotely and downloads through the private authenticated endpoint', async () => {
    cloudEnv();
    const bytes = Buffer.from('%PDF-1.7\nprivate faculty document');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response(bytes));
    vi.stubGlobal('fetch', fetchMock);
    const key = await storage.put(bytes);
    expect(await new SupabaseStorage().get(key)).toEqual(bytes);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://example.supabase.co/storage/v1/object/portal-documents/${key}`);
    expect(Buffer.from(options.body)).toEqual(bytes);
    expect(options.headers['Content-Type']).toBe('application/pdf');
    expect(options.headers.Authorization).toBe('Bearer private-test-key');
    expect(fetchMock.mock.calls[1][0]).toContain(`/object/authenticated/portal-documents/${key}`);
  });
  it('does not silently save files locally when the cloud rejects them', async () => {
    cloudEnv();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('provider secret details', { status: 403 })),
    );
    await expect(storage.put(Buffer.from('%PDF-1.7'))).rejects.toThrow(
      'تعذر الوصول إلى تخزين الملفات',
    );
    await expect(storage.get('../other-file')).rejects.toThrow('الملف غير صالح');
  });
  it('sends OTP through HTTPS without SMTP and checks the active sender without sending', async () => {
    cloudEnv();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ senders: [{ email: 'sender@example.edu', active: true }] })),
      )
      .mockResolvedValueOnce(new Response('{"messageId":"test"}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await verifyMailService();
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.brevo.com/v3/senders');
    await sendMail('client@example.edu', 'رمز الدخول', '<p>123456</p>');
    const [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    const message = JSON.parse(options.body);
    expect(message.to).toEqual([{ email: 'client@example.edu' }]);
    expect(message.sender.email).toBe('sender@example.edu');
    expect(message.htmlContent).toContain('<p>123456</p>');
  });
  it('does not claim a rejected message was delivered and rejects an unverified sender', async () => {
    cloudEnv();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('private provider error', { status: 401 }))
      .mockResolvedValueOnce(new Response('{"senders":[]}'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(sendMail('client@example.edu', 'OTP', '123456')).rejects.toThrow(
      'تعذر إرسال البريد',
    );
    await expect(verifyMailService()).rejects.toThrow('active verified sender');
  });
  it('rejects missing cloud secrets and ephemeral storage on Render', () => {
    cloudEnv();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ORIGIN', 'https://portal.onrender.com');
    vi.stubEnv('RENDER', 'true');
    expect(() => validateCloudConfig()).not.toThrow();
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(() => validateCloudConfig()).toThrow('SUPABASE_SERVICE_ROLE_KEY');
    vi.stubEnv('STORAGE_PROVIDER', 'local');
    expect(() => validateCloudConfig()).toThrow('requires Supabase storage');
  });
  it('serves SPA deep links without turning missing APIs or assets into HTML', async () => {
    const app = express();
    mountWeb(app);
    app.use((_req, res) => {
      res.status(404).json({ message: 'missing' });
    });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}`;
    try {
      const page = await fetch(`${base}/faculty/test/edit`);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain('id="root"');
      const api = await fetch(`${base}/api/unknown`);
      expect(api.status).toBe(404);
      expect(api.headers.get('content-type')).toContain('application/json');
      expect((await fetch(`${base}/assets/missing.js`)).status).toBe(404);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
