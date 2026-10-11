import { db } from './db';
import { permissions, roles } from './policy';
import { passwordSchema, userSchema, parse } from './validation';
import argon2 from 'argon2';
import { institutionIdentity } from './identity';
async function main() {
  for (const id of permissions)
    await db.permission.upsert({ where: { id }, create: { id }, update: {} });
  for (const [id, ps] of Object.entries(roles)) {
    await db.role.upsert({
      where: { id },
      create: {
        id,
        label: { SUPER_ADMIN: 'مدير النظام', STAFF: 'موظف إداري', VIEWER: 'مشاهد' }[id]!,
      },
      update: {},
    });
    for (const permissionId of ps)
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: id, permissionId } },
        create: { roleId: id, permissionId },
        update: {},
      });
  }
  if ((await db.college.count()) === 0) {
    await db.college.create({ data: { name: institutionIdentity().collegeName } });
  }
  if ((await db.user.count()) === 0 && !process.argv.includes('--references')) {
    const u = parse(userSchema, {
      fullName: 'مدير النظام',
      username: process.env.ADMIN_USERNAME,
      email: process.env.ADMIN_EMAIL,
      roleId: 'SUPER_ADMIN',
    });
    const password = parse(passwordSchema, process.env.ADMIN_PASSWORD);
    await db.user.create({
      data: { ...u, passwordHash: await argon2.hash(password, { type: argon2.argon2id }) },
    });
    console.log('تم إنشاء مدير النظام من الإعدادات الصريحة. احذف ADMIN_PASSWORD من البيئة.');
  }
  console.log('Reference data initialized. No fictional faculty data created.');
}
main().finally(() => db.$disconnect());
