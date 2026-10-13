import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { spawn, execFileSync, ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID, randomBytes } from 'node:crypto';
// @ts-ignore: shared native test/development helper
import EmbeddedPostgres from '../../../scripts/postgres.mjs';
import { SMTPServer } from 'smtp-server';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import ExcelJS from 'exceljs';
import { roles, permissions } from '../src/policy';
import { decodeTestMail } from '../../../scripts/test-mail';
const origin = 'http://localhost:5199';
const base = 'http://127.0.0.1:3099/api';
const password = randomBytes(20).toString('hex') + 'Aa1!';
let pg: any,
  server: ChildProcess,
  db: PrismaClient,
  smtp: SMTPServer,
  college: any,
  department: any,
  faculty: any;
const mails: string[] = [];
const account: Record<string, any> = {};
let admin: any, staff: any, viewer: any;
let serverErrors = '';
async function request(path: string, method = 'GET', body?: any, session?: any) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Origin: origin,
      ...(body instanceof FormData
        ? {}
        : body !== undefined
          ? { 'Content-Type': 'application/json' }
          : {}),
      ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrf } : {}),
    },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const type = response.headers.get('content-type') || '';
  return {
    status: response.status,
    body: type.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()),
    headers: response.headers,
  };
}
async function challenge(identifier: string) {
  const before = mails.length;
  const r = await request('/auth/login', 'POST', { identifier, password });
  expect(r.status).toBe(201);
  expect(mails.length).toBe(before + 1);
  const code = decodeTestMail(mails.at(-1)!).match(/letter-spacing:8px">(\d{6})/)![1];
  return { ...r.body, code };
}
async function login(role: string) {
  const c = await challenge(account[role].username);
  const v = await request('/auth/verify', 'POST', { challengeId: c.challengeId, code: c.code });
  expect(v.status).toBe(201);
  return { cookie: v.headers.get('set-cookie')!.split(';')[0], csrf: v.body.csrf };
}
beforeAll(async () => {
  const url = 'postgresql://portal_test:' + password + '@127.0.0.1:5499/portal_test';
  pg = new EmbeddedPostgres({
    databaseDir: resolve(tmpdir(), 'portal-test-' + randomUUID()),
    port: 5499,
    user: 'portal_test',
    password,
    persistent: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    postgresFlags: ['-h', '127.0.0.1'],
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('portal_test');
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: resolve(__dirname, '..'),
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
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  for (const roleId of Object.keys(roles))
    account[roleId] = await db.user.create({
      data: {
        fullName: roleId,
        username: roleId.toLowerCase(),
        email: roleId.toLowerCase() + '@example.edu',
        roleId,
        passwordHash,
      },
    });
  college = await db.college.create({ data: { name: 'كلية اختبار' } });
  department = await db.department.create({ data: { collegeId: college.id, name: 'قسم اختبار' } });
  smtp = new SMTPServer({
    authOptional: true,
    disabledCommands: ['STARTTLS'],
    onData(stream, session, callback) {
      let message = '';
      stream.on('data', (c) => (message += c));
      stream.on('end', () => {
        mails.push(message);
        callback();
      });
    },
  });
  await new Promise<void>((r) => smtp.listen(1099, '127.0.0.1', r));
  server = spawn(process.execPath, ['dist/main.js'], {
    cwd: resolve(__dirname, '..'),
    env: {
      ...process.env,
      DATABASE_URL: url,
      SESSION_SECRET: randomBytes(48).toString('hex'),
      APP_ORIGIN: origin,
      PORT: '3099',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1099',
      SMTP_SECURE: 'false',
      SMTP_USER: '',
      SMTP_FROM: 'test@example.edu',
      NODE_ENV: 'test',
      STORAGE_DIR: resolve(tmpdir(), 'portal-files-' + randomUUID()),
    },
    stdio: 'pipe',
  });
  server.stderr?.on('data', (chunk) => (serverErrors += chunk.toString()));
  server.on('error', () => (serverErrors += 'Unable to spawn test API'));
  let ready = false;
  const startupDeadline = Date.now() + 60000;
  while (Date.now() < startupDeadline) {
    if (server.exitCode !== null) {
      serverErrors += `Test API exited with code ${server.exitCode}`;
      break;
    }
    try {
      const r = await fetch(base + '/branding');
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready) throw new Error('Test API did not start: ' + serverErrors);
  admin = await login('SUPER_ADMIN');
  staff = await login('STAFF');
  viewer = await login('VIEWER');
}, 120000);
afterAll(async () => {
  server?.kill();
  await db?.$disconnect();
  await new Promise<void>((r) => (smtp ? smtp.close(() => r()) : r()));
  await pg?.stop();
});
describe('real PostgreSQL, SMTP, session APIs', () => {
  it('anonymous APIs are blocked; origin and CSRF checked', async () => {
    expect((await request('/faculty')).status).toBe(401);
    const r = await fetch(base + '/faculty', {
      method: 'POST',
      headers: { Cookie: admin.cookie, 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(r.status).toBe(403);
    expect(
      (await request('/faculty', 'POST', {}, { cookie: admin.cookie, csrf: 'wrong' })).status,
    ).toBe(403);
  });
  it('email login and OTP single-use, bad password and inactive account', async () => {
    const c = await challenge(account.SUPER_ADMIN.email);
    expect(
      (await request('/auth/verify', 'POST', { challengeId: c.challengeId, code: 'abcdef' }))
        .status,
    ).toBe(400);
    expect(
      (await request('/auth/verify', 'POST', { challengeId: c.challengeId, code: c.code })).status,
    ).toBe(201);
    expect(
      (await request('/auth/verify', 'POST', { challengeId: c.challengeId, code: c.code })).status,
    ).toBe(401);
    expect(
      (await request('/auth/login', 'POST', { identifier: 'missing', password: 'wrong' })).status,
    ).toBe(401);
    await db.user.update({ where: { id: account.VIEWER.id }, data: { active: false } });
    expect(
      (await request('/auth/login', 'POST', { identifier: account.VIEWER.username, password }))
        .status,
    ).toBe(401);
    await db.user.update({ where: { id: account.VIEWER.id }, data: { active: true } });
  });
  it('expired OTP is rejected', async () => {
    const c = await challenge(account.SUPER_ADMIN.username);
    await db.oTPChallenge.update({
      where: { id: c.challengeId },
      data: { expiresAt: new Date(0) },
    });
    expect(
      (await request('/auth/verify', 'POST', { challengeId: c.challengeId, code: c.code })).status,
    ).toBe(401);
  });
  it('OTP blocks after five incorrect attempts', async () => {
    const c = await challenge(account.SUPER_ADMIN.username);
    const wrong = c.code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++)
      expect(
        (await request('/auth/verify', 'POST', { challengeId: c.challengeId, code: wrong })).status,
      ).toBe(401);
    expect(
      (await request('/auth/verify', 'POST', { challengeId: c.challengeId, code: c.code })).status,
    ).toBe(401);
    expect(
      (await db.oTPChallenge.findUniqueOrThrow({ where: { id: c.challengeId } })).attempts,
    ).toBe(5);
  });
  it('resend cooldown enforced and previous challenge invalidated', async () => {
    const c = await challenge(account.SUPER_ADMIN.username);
    expect((await request('/auth/resend', 'POST', { challengeId: c.challengeId })).status).toBe(
      400,
    );
    await db.oTPChallenge.update({
      where: { id: c.challengeId },
      data: { sentAt: new Date(Date.now() - 61000) },
    });
    const r = await request('/auth/resend', 'POST', { challengeId: c.challengeId });
    expect(r.status).toBe(201);
    expect(r.body.challengeId).not.toBe(c.challengeId);
    expect(
      (await request('/auth/verify', 'POST', { challengeId: c.challengeId, code: c.code })).status,
    ).toBe(401);
  });
  it('faculty CRUD persists; combined filtering and sorting work', async () => {
    const body = {
      employeeNumber: '1001',
      fullName: 'أحمد اختبار',
      email: 'faculty@example.edu',
      collegeId: college.id,
      departmentId: department.id,
      highestQualification: 'دكتوراه',
      academicRank: 'أستاذ مساعد',
      employmentType: 'دائم',
      employmentStatus: 'نشط',
    };
    expect((await request('/faculty', 'POST', {}, staff)).status).toBe(400);
    const added = await request('/faculty', 'POST', body, staff);
    expect(added.status).toBe(201);
    faculty = added.body;
    expect(await db.facultyMember.count()).toBe(1);
    expect((await request('/faculty', 'POST', body, staff)).status).toBe(409);
    expect((await request('/faculty/' + faculty.id, 'GET', undefined, viewer)).body.fullName).toBe(
      body.fullName,
    );
    body.fullName = 'أحمد محدّث';
    expect((await request('/faculty/' + faculty.id, 'PATCH', body, staff)).status).toBe(200);
    expect(
      (
        await request(
          `/faculty?collegeId=${college.id}&departmentId=${department.id}&academicRank=${encodeURIComponent('أستاذ مساعد')}&highestQualification=${encodeURIComponent('دكتوراه')}&search=1001&sort=fullName&direction=asc&pageSize=25`,
          'GET',
          undefined,
          viewer,
        )
      ).body.total,
    ).toBe(1);
  });
  it('role permissions enforced on direct requests and last admin protected', async () => {
    expect((await request('/users', 'GET', undefined, staff)).status).toBe(403);
    expect((await request('/faculty', 'POST', {}, viewer)).status).toBe(403);
    expect((await request('/exports/xlsx', 'GET', undefined, viewer)).status).toBe(403);
    expect((await request('/imports/inspect', 'POST', {}, viewer)).status).toBe(403);
    expect(
      (await request('/users/' + account.SUPER_ADMIN.id, 'DELETE', undefined, admin)).status,
    ).toBe(400);
    expect((await request('/faculty/' + faculty.id, 'DELETE', undefined, staff)).status).toBe(403);
  });
  it('documents validate signatures and access; soft deletion and restoration', async () => {
    const bad = new FormData();
    bad.append('file', new Blob(['<script>']), 'fake.pdf');
    bad.append('category', 'أخرى');
    expect((await request('/documents/' + faculty.id, 'POST', bad, staff)).status).toBe(400);
    const fd = new FormData();
    fd.append('file', new Blob(['%PDF-1.7\n%%EOF']), 'test.pdf');
    fd.append('category', 'أخرى');
    const uploaded = await request('/documents/' + faculty.id, 'POST', fd, staff);
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.storageKey).toBeUndefined();
    const id = uploaded.body.id;
    expect((await request('/documents/' + id)).status).toBe(401);
    expect((await request('/documents/' + id, 'GET', undefined, viewer)).status).toBe(200);
    expect((await request('/documents/' + id, 'DELETE', undefined, viewer)).status).toBe(403);
    await request('/faculty/' + faculty.id, 'DELETE', undefined, admin);
    expect((await request('/faculty/' + faculty.id, 'GET', undefined, viewer)).status).toBe(404);
    expect((await request('/documents/' + id, 'GET', undefined, viewer)).status).toBe(404);
    await request('/faculty/' + faculty.id + '/restore', 'POST', undefined, admin);
    expect((await request('/faculty/' + faculty.id, 'GET', undefined, viewer)).status).toBe(200);
  });
  it('XLSX import preview, duplicates, error report and commit persist', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('بيانات');
    ws.addRow(['رقم', 'اسم', 'بريد', 'كلية', 'قسم', 'مؤهل', 'رتبة', 'نوع', 'حالة']);
    ws.addRow([
      '2001',
      'عضو مستورد',
      'import@example.edu',
      college.name,
      department.name,
      'دكتوراه',
      'أستاذ',
      'دائم',
      'نشط',
    ]);
    ws.addRow([
      '1001',
      'مكرر',
      'dup@example.edu',
      college.name,
      department.name,
      'دكتوراه',
      'أستاذ',
      'دائم',
      'نشط',
    ]);
    ws.addRow([
      '3001',
      'خطأ',
      'bad',
      college.name,
      department.name,
      'دكتوراه',
      'أستاذ',
      'دائم',
      'نشط',
    ]);
    const fd = new FormData();
    fd.append('file', new Blob([(await wb.xlsx.writeBuffer()) as any]), 'data.xlsx');
    const inspection = await request('/imports/inspect', 'POST', fd, staff);
    expect(inspection.status).toBe(201);
    const id = inspection.body.id;
    const mapping = Object.fromEntries(
      [
        'employeeNumber',
        'fullName',
        'email',
        'collegeId',
        'departmentId',
        'highestQualification',
        'academicRank',
        'employmentType',
        'employmentStatus',
      ].map((k, i) => [k, i]),
    );
    const p = await request(
      '/imports/' + id + '/preview',
      'POST',
      { sheet: 'بيانات', mapping },
      staff,
    );
    expect(p.body.validCount).toBe(1);
    expect(p.body.errors).toHaveLength(2);
    expect((await request('/imports/' + id + '/errors', 'GET', undefined, staff)).status).toBe(200);
    const c = await request('/imports/' + id + '/commit', 'POST', undefined, staff);
    expect(c.body.imported).toBe(1);
    expect(await db.facultyMember.count()).toBe(2);
    expect((await request('/imports/' + id + '/commit', 'POST', undefined, staff)).status).toBe(
      404,
    );
  });
  it('filtered XLSX and Arabic PDF generation', async () => {
    const r = await request('/exports/xlsx?search=2001', 'GET', undefined, staff);
    expect(r.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.body as any);
    expect(wb.worksheets[0].rowCount).toBe(2);
    const pdf = await request('/exports/pdf', 'GET', undefined, staff);
    expect(pdf.status).toBe(200);
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
    await mkdir(resolve(__dirname, '../../../docs/test-artifacts'), { recursive: true });
    await writeFile(resolve(__dirname, '../../../docs/test-artifacts/faculty-list.pdf'), pdf.body);
    const profile = await request('/exports/profile/' + faculty.id, 'GET', undefined, staff);
    expect(profile.status).toBe(200);
    expect(profile.body.subarray(0, 5).toString()).toBe('%PDF-');
    await writeFile(
      resolve(__dirname, '../../../docs/test-artifacts/faculty-profile.pdf'),
      profile.body,
    );
  });
  it('sorting directions, pagination and name filtering', async () => {
    const dashboard = await request('/dashboard', 'GET', undefined, admin);
    expect(dashboard.body.totalFaculty).toBe(2);
    expect(dashboard.body.activeFaculty).toBe(2);
    expect(dashboard.body.recentFacultyCount).toBe(2);
    expect(dashboard.body.distributions.academicRank).toHaveLength(2);
    const asc = await request(
      '/faculty?sort=employeeNumber&direction=asc&pageSize=10',
      'GET',
      undefined,
      viewer,
    );
    const desc = await request(
      '/faculty?sort=employeeNumber&direction=desc&pageSize=10',
      'GET',
      undefined,
      viewer,
    );
    expect(asc.body.items[0].employeeNumber).toBe('1001');
    expect(desc.body.items[0].employeeNumber).toBe('2001');
    expect(
      (await request('/faculty?page=2&pageSize=10', 'GET', undefined, viewer)).body.items,
    ).toHaveLength(0);
    expect(
      (await request('/faculty?search=' + encodeURIComponent('أحمد'), 'GET', undefined, viewer))
        .body.total,
    ).toBe(1);
  });
  it('user CRUD, unique identifiers and activation', async () => {
    const body = {
      fullName: 'مستخدم اختبار',
      username: 'testuser',
      email: 'new@example.edu',
      roleId: 'VIEWER',
      active: true,
    };
    const c = await request('/users', 'POST', body, admin);
    expect(c.status).toBe(201);
    expect(c.body.invitationSent).toBe(true);
    expect((await request('/users', 'POST', body, admin)).status).toBe(409);
    expect(
      (await request('/users/' + c.body.id, 'GET', undefined, admin)).body.passwordHash,
    ).toBeUndefined();
    expect(
      (await request('/users/' + c.body.id, 'PATCH', { ...body, active: false }, admin)).body
        .active,
    ).toBe(false);
    expect((await request('/users/' + c.body.id, 'PATCH', body, admin)).body.active).toBe(true);
  });
  it('session expiry, logout, password hashes absent', async () => {
    const me = await request('/auth/me', 'GET', undefined, admin);
    expect(me.body.passwordHash).toBeUndefined();
    const expired = await db.session.findFirstOrThrow({ where: { userId: account.VIEWER.id } });
    await db.session.update({ where: { id: expired.id }, data: { expiresAt: new Date(0) } });
    expect((await request('/auth/me', 'GET', undefined, viewer)).status).toBe(401);
    expect((await request('/auth/logout', 'POST', undefined, staff)).status).toBe(201);
    expect((await request('/auth/me', 'GET', undefined, staff)).status).toBe(401);
  });
  it('password reset delivery, single use and session revocation', async () => {
    expect(
      (await request('/auth/forgot-password', 'POST', { email: account.SUPER_ADMIN.email })).status,
    ).toBe(201);
    const message = decodeTestMail(mails.at(-1)!);
    const raw = message.match(/token=([a-f0-9]{64})/)![1];
    const reset = await request('/auth/reset-password', 'POST', {
      token: raw,
      password: 'NewStrongPassword123!',
    });
    expect(reset.status).toBe(201);
    expect((await request('/auth/me', 'GET', undefined, admin)).status).toBe(401);
    expect(
      (
        await request('/auth/reset-password', 'POST', {
          token: raw,
          password: 'NewStrongPassword123!',
        })
      ).status,
    ).toBe(400);
  });
  it('login is rate limited', async () => {
    let last = 0;
    for (let i = 0; i < 21; i++) {
      last = (await request('/auth/login', 'POST', { identifier: 'unknown', password: 'wrong' }))
        .status;
      if (last === 429) break;
    }
    expect(last).toBe(429);
  });
});
