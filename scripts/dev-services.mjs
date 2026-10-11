// Development-only native PostgreSQL and SMTP catcher, for hosts without Docker.
import EmbeddedPostgres from './postgres.mjs';
import { SMTPServer } from 'smtp-server';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
if (process.env.NODE_ENV === 'production')
  throw new Error('Development services are disabled in production');
const root = resolve('storage/dev');
const databaseDir =
  process.platform === 'win32'
    ? resolve(
        process.env.LOCALAPPDATA,
        'FacultyPortal',
        createHash('sha256').update(process.cwd()).digest('hex').slice(0, 12),
        'postgres',
      )
    : resolve(root, 'postgres');
await mkdir(root, { recursive: true });
const secretFile = resolve(root, 'database-password');
let password;
try {
  password = await readFile(secretFile, 'utf8');
} catch {
  password = randomBytes(32).toString('hex');
  await writeFile(secretFile, password, { mode: 0o600, flag: 'wx' });
}
const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'portal',
  password,
  port: 5432,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => {},
  onError: (e) => console.error(String(e)),
});
try {
  await readFile(resolve(databaseDir, 'PG_VERSION'));
} catch {
  await pg.initialise();
}
await pg.start();
const client = pg.getPgClient();
await client.connect();
const exists = await client.query("SELECT 1 FROM pg_database WHERE datname='faculty'");
if (!exists.rowCount) await pg.createDatabase('faculty');
await client.end();
const envFile = resolve('.env');
try {
  await readFile(envFile);
} catch {
  const example = await readFile('.env.example', 'utf8');
  await writeFile(
    envFile,
    example
      .replace('portal:local_development_only', 'portal:' + password)
      .replace('SESSION_SECRET=', 'SESSION_SECRET=' + randomBytes(48).toString('hex')),
    { flag: 'wx' },
  );
}
console.log(
  'Development PostgreSQL ready on 127.0.0.1:5432. If .env already exists, set DATABASE_URL password from storage/dev/database-password.',
);
const messages = [];
const smtp = new SMTPServer({
  authOptional: true,
  disabledCommands: ['STARTTLS'],
  onData(stream, session, callback) {
    let message = '';
    stream.on('data', (c) => (message += c));
    stream.on('end', () => {
      messages.unshift({
        date: new Date().toISOString(),
        to: session.envelope.rcptTo.map((r) => r.address),
        message,
      });
      if (messages.length > 100) messages.pop();
      callback();
    });
  },
});
smtp.listen(1025, '127.0.0.1');
const web = createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.url === '/inbox') {
    const escape = (value) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const body = (raw) => {
      const split = raw.search(/\r?\n\r?\n/);
      const headers = raw.slice(0, split);
      const content = raw.slice(split).trimStart();
      if (/Content-Transfer-Encoding:\s*base64/i.test(headers)) return Buffer.from(content.replace(/\s/g, ''), 'base64').toString('utf8');
      const bytes = content.replace(/=\r?\n/g, '').replace(/=([a-f0-9]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
      return Buffer.from(bytes, 'latin1').toString('utf8');
    };
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-src 'self'; base-uri 'none'; form-action 'none'");
    res.end(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="10"><title>صندوق البريد المحلي</title><style>body{font-family:Arial;line-height:1.8;background:#f5f7fa;color:#315D90;margin:0;padding:24px}main{max-width:850px;margin:auto}article{background:white;border:1px solid #dce4ef;border-radius:12px;padding:20px;margin:20px 0}iframe{width:100%;height:300px;border:0}p{overflow-wrap:anywhere}a{color:#315D90}</style><main><h1>صندوق البريد المحلي</h1><p>رسائل الاختبار تظهر هنا فقط ولا تصل إلى Gmail. تتحدث الصفحة تلقائيًا كل عشر ثوانٍ.</p><a href="/inbox">تحديث الرسائل</a>${messages.length ? messages.map(mail => `<article><p>إلى: <b dir="ltr">${escape(mail.to.join(', '))}</b> · ${escape(new Date(mail.date).toLocaleString('ar-SA'))}</p><iframe sandbox title="محتوى الرسالة" srcdoc="${escape(body(mail.message))}"></iframe></article>`).join('') : '<article>لا توجد رسائل بعد. سجّل الدخول في البوابة لإنشاء رمز تحقق جديد.</article>'}</main></html>`);
    return;
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(messages));
});
web.listen(8025, '127.0.0.1');
console.log('Development email catcher: http://127.0.0.1:8025 (local machine only).');
async function close() {
  web.close();
  smtp.close();
  await pg.stop();
  process.exit();
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
