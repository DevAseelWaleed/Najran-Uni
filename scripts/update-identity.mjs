import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { mkdirSync, writeFileSync } from 'node:fs';
config({ path: '.env', quiet: true });
const db = new PrismaClient();
try {
  const counts = async () => ({ users: await db.user.count(), faculty: await db.facultyMember.count(), departments: await db.department.count(), documents: await db.facultyDocument.count() });
  const before = await counts();
  const colleges = await db.college.findMany();
  const setting = await db.setting.findUnique({ where: { key: 'branding' } });
  const identity = Object.fromEntries(Object.entries({ universityName: 'UNIVERSITY_NAME', collegeName: 'COLLEGE_NAME', systemName: 'SYSTEM_NAME', homeTitle: 'HOME_TITLE', primaryColor: 'PRIMARY_COLOR', accentColor: 'ACCENT_COLOR' }).map(([key, env]) => {
    if (!process.env[env]) throw new Error(`Missing ${env}`);
    return [key, process.env[env]];
  }));
  mkdirSync('storage/dev', { recursive: true });
  writeFileSync(`storage/dev/identity-before-${Date.now()}.json`, JSON.stringify({ colleges, setting }, null, 2));
  await db.$transaction(async tx => {
    const existing = colleges.find(c => c.name === identity.collegeName);
    const placeholder = colleges.find(c => c.name === 'الكلية');
    if (!existing && placeholder) await tx.college.update({ where: { id: placeholder.id }, data: { name: identity.collegeName } });
    else if (!existing) await tx.college.create({ data: { name: identity.collegeName } });
    const value = { ...(setting?.value || {}), ...identity, logoUrl: setting?.value?.logoUrl || '' };
    await tx.setting.upsert({ where: { key: 'branding' }, create: { key: 'branding', value }, update: { value } });
  });
  console.log(JSON.stringify({ before, after: await counts(), collegeNames: (await db.college.findMany()).map(c => c.name) }));
} finally { await db.$disconnect(); }
