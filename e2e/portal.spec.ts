import { test, expect } from '@playwright/test';
import { spawn, execFileSync, ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
// @ts-ignore shared native helper
import Postgres from '../scripts/postgres.mjs';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { SMTPServer } from 'smtp-server';
import { permissions, roles } from '../apps/api/src/policy';
import { decodeTestMail } from '../scripts/test-mail';
let pg: any, db: PrismaClient, api: ChildProcess, web: ChildProcess, smtp: SMTPServer;
const mails: string[] = [];
const password = randomBytes(20).toString('hex') + 'Aa1!';
test.beforeAll(async () => {
  test.setTimeout(120000);
  const url = 'postgresql://portal_test:' + password + '@127.0.0.1:5498/portal_e2e';
  pg = new Postgres({
    databaseDir: resolve(tmpdir(), 'portal-e2e-' + randomUUID()),
    port: 5498,
    user: 'portal_test',
    password,
    persistent: true,
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('portal_e2e');
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: resolve('apps/api'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  db = new PrismaClient({ datasources: { db: { url } } });
  for (const id of permissions) await db.permission.create({ data: { id } });
  for (const [id, ps] of Object.entries(roles))
    await db.role.create({
      data: {
        id,
        label: id,
        permissions: { create: ps.map((permissionId) => ({ permissionId })) },
      },
    });
  await db.user.create({
    data: {
      fullName: 'مدير الاختبار',
      username: 'testadmin',
      email: 'testadmin@example.edu',
      roleId: 'SUPER_ADMIN',
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
    },
  });
  const college = await db.college.create({ data: { name: 'كلية الشريعة وأصول الدين' } });
  await db.department.create({ data: { collegeId: college.id, name: 'علوم الحاسب' } });
  smtp = new SMTPServer({
    authOptional: true,
    disabledCommands: ['STARTTLS'],
    onData(stream, session, cb) {
      let message = '';
      stream.on('data', (c) => (message += c));
      stream.on('end', () => {
        mails.push(message);
        cb();
      });
    },
  });
  await new Promise<void>((r) => smtp.listen(1098, '127.0.0.1', r));
  api = spawn(process.execPath, ['dist/main.js'], {
    cwd: resolve('apps/api'),
    env: {
      ...process.env,
      DATABASE_URL: url,
      SESSION_SECRET: randomBytes(48).toString('hex'),
      PORT: '3098',
      APP_ORIGIN: 'http://localhost:5198',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1098',
      SMTP_FROM: 'test@example.edu',
      SMTP_USER: '',
      SMTP_SECURE: 'false',
      NODE_ENV: 'test',
      STORAGE_DIR: resolve(tmpdir(), 'portal-e2e-files-' + randomUUID()),
    },
    stdio: 'ignore',
  });
  web = spawn(
    process.execPath,
    [
      resolve(require.resolve('vite/package.json'), '../bin/vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      '5198',
    ],
    {
      cwd: resolve('apps/web'),
      env: { ...process.env, API_PROXY_TARGET: 'http://127.0.0.1:3098' },
      stdio: 'ignore',
    },
  );
  const startupDeadline = Date.now() + 60000;
  while (Date.now() < startupDeadline) {
    if (api.exitCode !== null || web.exitCode !== null)
      throw new Error('E2E service exited before becoming ready');
    try {
      const r = await fetch('http://localhost:5198/api/branding');
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('E2E services did not start');
});
test.afterAll(async () => {
  api?.kill();
  web?.kill();
  await db?.$disconnect();
  await new Promise<void>((r) => (smtp ? smtp.close(() => r()) : r()));
  await pg?.stop();
});
test('Arabic portal: protected route, real login, OTP, CRUD, documents and mobile', async ({
  page,
}) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/login/);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'الكشاف الأكاديمي لأعضاء هيئة التدريس بكلية الشريعة وأصول الدين' })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/landing.png', fullPage: true });
  await page.getByRole('link', { name: 'الدخول إلى النظام' }).click();
  await expect(page.getByText('جامعة نجران', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/login.png', fullPage: true });
  await page.getByLabel('البريد الإلكتروني أو اسم المستخدم').fill('testadmin');
  await page.getByLabel('كلمة المرور', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page).toHaveURL(/verify-otp/);
  await page.screenshot({ path: 'docs/screenshots/otp.png', fullPage: true });
  const code = decodeTestMail(mails.at(-1)!).match(/letter-spacing:8px">(\d{6})/)![1];
  for (let i = 0; i < 6; i++) await page.getByLabel('الرقم ' + (i + 1)).fill(code[i]);
  await page.getByRole('button', { name: 'تحقق وادخل' }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByText('مرحبًا، مدير')).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/dashboard.png', fullPage: true });
  expect(await page.locator('.sidebar').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(49, 93, 144)');
  await page.getByRole('link', { name: 'إضافة عضو', exact: true }).click();
  await page.getByLabel('الرقم الوظيفي *', { exact: true }).fill('E2E-101');
  await page.getByLabel('الاسم الكامل بالعربية *').fill('عضو اختبار المتصفح');
  await page.getByLabel('البريد الجامعي *').fill('faculty-e2e@example.edu');
  await expect(page.getByLabel('الكلية *', { exact: true }).locator('option:checked')).toHaveText('كلية الشريعة وأصول الدين');
  await page.getByLabel('القسم *', { exact: true }).selectOption({ label: 'علوم الحاسب' });
  await page.getByLabel('أعلى مؤهل *').selectOption({ label: 'دكتوراه' });
  await page.getByLabel('الرتبة العلمية *').selectOption({ label: 'أستاذ مساعد' });
  await page.getByRole('button', { name: 'حفظ بيانات العضو' }).click();
  await expect(page.getByRole('heading', { name: 'عضو اختبار المتصفح' })).toBeVisible();
  expect(await db.facultyMember.count()).toBe(1);
  await page.getByRole('tab', { name: 'المرفقات', exact: true }).click();
  await page.getByLabel('الملف · PDF أو PNG أو JPEG · حتى 10 MB').setInputFiles({
    name: 'document.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\n%%EOF'),
  });
  await page.getByRole('button', { name: 'رفع المستند' }).click();
  await expect(page.getByText('document.pdf', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'تعديل', exact: true }).click();
  await page.getByLabel('الاسم الكامل بالعربية *').fill('عضو محدّث');
  await page.getByRole('button', { name: 'حفظ بيانات العضو' }).click();
  await expect(page.getByRole('heading', { name: 'عضو محدّث' })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/profile.png', fullPage: true });
  for (const [route, name] of [['/users', 'users'], ['/settings', 'settings'], ['/faculty/import', 'import']]) {
    await page.goto(route);
    await expect(page.locator('.brand small')).toHaveText('كلية الشريعة وأصول الدين');
    await page.screenshot({ path: `docs/screenshots/${name}.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.setViewportSize({ width: 1280, height: 720 });
  }
  await page.goto('/faculty');
  await page.getByRole('link', { name: 'أعضاء هيئة التدريس', exact: true }).first().click();
  await page.getByLabel('بحث أعضاء هيئة التدريس').fill('E2E-101');
  await expect(page.getByRole('link', { name: 'ع عضو محدّث' })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/faculty.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'فتح القائمة' })).toBeVisible();
  await page.getByRole('button', { name: 'فتح القائمة' }).click();
  await expect(page.getByRole('link', { name: 'الإعدادات', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'لوحة التحكم', exact: true }).click();
  await expect(page.getByText('مرحبًا، مدير')).toBeVisible();
  await expect(page.getByRole('link', { name: /عضو محدّث/ })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'فتح القائمة' }).click();
  await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await expect(page).toHaveURL(/login/);
  await expect(page.getByText('جامعة نجران', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/mobile-login.png', fullPage: true });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto('/');
  await page.screenshot({ path: 'docs/screenshots/mobile-landing.png', fullPage: true });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
