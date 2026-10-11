import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { db } from './db';
import { Permit } from './security';
import { parse, paging, userSchema } from './validation';
import { userSelect } from './policy';
import { audit } from './audit';
import { createReset } from './auth';
@Controller('users')
@Permit('users.manage')
export class UsersController {
  @Get() async list(@Query() q: any) {
    const p = paging(q);
    const where: Prisma.UserWhereInput = {
      ...(q.search
        ? {
            OR: ['fullName', 'username', 'email'].map((key) => ({
              [key]: { contains: String(q.search).slice(0, 200), mode: 'insensitive' },
            })),
          }
        : {}),
      ...(q.roleId ? { roleId: q.roleId } : {}),
      ...(q.active ? { active: q.active === 'true' } : {}),
    };
    const orderBy = {
      [['fullName', 'createdAt'].includes(q.sort) ? q.sort : 'createdAt']:
        q.direction === 'asc' ? 'asc' : 'desc',
    };
    const [items, total] = await db.$transaction([
      db.user.findMany({ where, orderBy, skip: p.skip, take: p.take, select: userSelect }),
      db.user.count({ where }),
    ]);
    return { items, total, page: p.page, pageSize: p.pageSize };
  }
  @Get(':id') async get(@Param('id') id: string) {
    return db.user.findUniqueOrThrow({ where: { id }, select: userSelect });
  }
  @Post() async create(@Body() body: unknown, @Req() req: any) {
    const data = parse(userSchema, body);
    const u = await db.user.create({ data, select: userSelect });
    await audit(req.user.id, 'USER_CREATE', u.id);
    try {
      await createReset(u.id);
      return { ...u, invitationSent: true };
    } catch {
      return {
        ...u,
        invitationSent: false,
        message: 'تم إنشاء الحساب، لكن تعذر إرسال رسالة التهيئة. أعد الإرسال من تفاصيل الحساب.',
      };
    }
  }
  @Patch(':id') async update(@Param('id') id: string, @Body() body: unknown, @Req() req: any) {
    const data = parse(userSchema, body);
    const result = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE "roleId" = 'SUPER_ADMIN' ORDER BY id FOR UPDATE`;
      const old = await tx.user.findUniqueOrThrow({ where: { id } });
      if (
        old.active &&
        old.roleId === 'SUPER_ADMIN' &&
        (!data.active || data.roleId !== 'SUPER_ADMIN') &&
        (await tx.user.count({ where: { active: true, roleId: 'SUPER_ADMIN' } })) <= 1
      )
        throw new BadRequestException('لا يمكن تعطيل أو تغيير دور آخر مدير نشط');
      const u = await tx.user.update({ where: { id }, data, select: userSelect });
      if (!data.active || old.roleId !== data.roleId || old.email !== data.email) {
        await tx.session.deleteMany({ where: { userId: id } });
        await tx.oTPChallenge.updateMany({
          where: { userId: id, consumedAt: null },
          data: { consumedAt: new Date() },
        });
        await tx.passwordReset.updateMany({
          where: { userId: id, consumedAt: null },
          data: { consumedAt: new Date() },
        });
      }
      return u;
    });
    await audit(req.user.id, 'USER_UPDATE', id, { fields: Object.keys(data) });
    return result;
  }
  @Delete(':id') async remove(@Param('id') id: string, @Req() req: any) {
    const u = await db.user.findUniqueOrThrow({ where: { id }, select: userSelect });
    return this.update(
      id,
      {
        fullName: u.fullName,
        username: u.username,
        email: u.email,
        roleId: u.roleId,
        active: false,
      },
      req,
    );
  }
  @Post(':id/reset') async reset(@Param('id') id: string, @Req() req: any) {
    await createReset(id);
    await audit(req.user.id, 'USER_RESET_REQUEST', id);
    return { message: 'تم إرسال رابط التهيئة' };
  }
}
