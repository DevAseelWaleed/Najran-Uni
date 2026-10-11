import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { z } from 'zod';
import argon2 from 'argon2';
import { db } from './db';
import { Public } from './security';
import { hash, otp, otpHash, token, equal } from './crypto';
import { sendMail } from './mail';
import { parse, passwordSchema } from './validation';
import { audit } from './audit';
import { userSelect } from './policy';
const invalid = () => new UnauthorizedException('بيانات الدخول أو رمز التحقق غير صحيح');
const dummyHash = argon2.hash(token(), { type: argon2.argon2id });
const challengeInput = z.object({ challengeId: z.string().uuid() });
async function issue(userId: string) {
  const id = crypto.randomUUID();
  const code = otp();
  const expiresAt = new Date(Date.now() + 300000);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    await tx.oTPChallenge.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await tx.oTPChallenge.create({
      data: { id, userId, secretHash: otpHash(id, code), expiresAt },
    });
  });
  try {
    await sendMail(
      user.email,
      'رمز التحقق من الدخول',
      `<p>رمز التحقق:</p><p dir="ltr" style="font-size:32px;letter-spacing:8px">${code}</p><p>صالح لمدة خمس دقائق ويستخدم مرة واحدة.</p>`,
    );
  } catch (e) {
    await db.oTPChallenge.update({ where: { id }, data: { consumedAt: new Date() } });
    throw e;
  }
  return { challengeId: id, expiresAt, resendAt: new Date(Date.now() + 60000) };
}
export async function createReset(userId: string) {
  const raw = token();
  await db.$transaction(async (tx) => {
    await tx.passwordReset.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await tx.passwordReset.create({
      data: { userId, tokenHash: hash(raw), expiresAt: new Date(Date.now() + 1800000) },
    });
  });
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const link = `${process.env.APP_ORIGIN}/reset-password?token=${raw}`;
  await sendMail(
    user.email,
    'تهيئة أو استعادة كلمة المرور',
    `<p>الرابط صالح لمدة 30 دقيقة:</p><a href="${link}">تعيين كلمة المرور</a>`,
  );
}
@Controller('auth')
export class AuthController {
  @Public() @Post('login') async login(@Body() body: unknown) {
    const input = parse(
      z.object({ identifier: z.string().trim().max(254), password: z.string().max(128) }),
      body,
    );
    const identifier = input.identifier.toLowerCase();
    const user = await db.user.findFirst({
      where: { OR: [{ email: identifier }, { username: identifier }] },
    });
    const valid = await argon2
      .verify(user?.passwordHash || (await dummyHash), input.password)
      .catch(() => false);
    if (!valid || !user?.active || !user.passwordHash) {
      await audit(null, 'LOGIN_FAILED');
      throw invalid();
    }
    return issue(user.id);
  }
  @Public() @Post('verify') async verify(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = parse(challengeInput.extend({ code: z.string().regex(/^\d{6}$/) }), body);
    const challenge = await db.oTPChallenge.findUnique({
      where: { id: input.challengeId },
      include: { user: true },
    });
    if (
      !challenge ||
      challenge.consumedAt ||
      challenge.expiresAt < new Date() ||
      challenge.attempts >= 5 ||
      !challenge.user.active
    )
      throw invalid();
    const match = equal(otpHash(challenge.id, input.code), challenge.secretHash);
    const raw = token();
    const csrf = token();
    const won = await db.$transaction(async (tx) => {
      const updated = await tx.oTPChallenge.updateMany({
        where: {
          id: challenge.id,
          secretHash: challenge.secretHash,
          consumedAt: null,
          expiresAt: { gt: new Date() },
          attempts: { lt: 5 },
        },
        data: { attempts: { increment: 1 }, ...(match ? { consumedAt: new Date() } : {}) },
      });
      if (!updated.count || !match) return false;
      await tx.session.create({
        data: {
          tokenHash: hash(raw),
          csrf,
          userId: challenge.userId,
          expiresAt: new Date(Date.now() + 8 * 3600000),
        },
      });
      await tx.user.update({ where: { id: challenge.userId }, data: { lastLogin: new Date() } });
      return true;
    });
    if (!won) {
      await audit(challenge.userId, 'OTP_FAILED', challenge.id);
      throw invalid();
    }
    res.cookie('portal_session', raw, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 8 * 3600000,
      path: '/api',
    });
    await audit(challenge.userId, 'LOGIN_SUCCESS');
    return { csrf };
  }
  @Public() @Post('resend') async resend(@Body() body: unknown) {
    const { challengeId } = parse(challengeInput, body);
    const c = await db.oTPChallenge.findUnique({
      where: { id: challengeId },
      include: { user: true },
    });
    if (!c || c.consumedAt || !c.user.active) throw invalid();
    const claimed = await db.oTPChallenge.updateMany({
      where: { id: challengeId, consumedAt: null, sentAt: { lte: new Date(Date.now() - 60000) } },
      data: { consumedAt: new Date() },
    });
    if (!claimed.count) throw new BadRequestException('انتظر 60 ثانية قبل إعادة الإرسال');
    return issue(c.userId);
  }
  @Get('me') async me(@Req() req: any) {
    const user = await db.user.findUniqueOrThrow({
      where: { id: req.user.id },
      select: userSelect,
    });
    return {
      ...user,
      permissions: req.user.role.permissions.map((p: any) => p.permissionId),
      csrf: req.session.csrf,
    };
  }
  @Post('logout') async logout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    await db.session.delete({ where: { id: req.session.id } });
    res.clearCookie('portal_session', { path: '/api' });
    return { message: 'تم تسجيل الخروج' };
  }
  @Public() @Post('forgot-password') async forgot(@Body() body: unknown) {
    const { email } = parse(z.object({ email: z.string().email().max(254) }), body);
    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (user?.active) {
      try {
        await createReset(user.id);
      } catch {
        await audit(null, 'RESET_EMAIL_FAILED');
      }
    }
    return { message: 'إذا كان الحساب متاحًا، سيصلك رابط الاستعادة' };
  }
  @Public() @Post('reset-password') async reset(@Body() body: unknown) {
    const input = parse(
      z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: passwordSchema }),
      body,
    );
    const c = await db.passwordReset.findUnique({
      where: { tokenHash: hash(input.token) },
      include: { user: true },
    });
    if (!c || c.consumedAt || c.expiresAt < new Date() || !c.user.active)
      throw new BadRequestException('الرابط غير صالح أو منتهي');
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    await db.$transaction(async (tx) => {
      const claim = await tx.passwordReset.updateMany({
        where: { id: c.id, consumedAt: null, expiresAt: { gt: new Date() } },
        data: { consumedAt: new Date() },
      });
      if (!claim.count) throw new BadRequestException('الرابط غير صالح');
      await tx.user.update({ where: { id: c.userId }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId: c.userId } });
      await tx.oTPChallenge.updateMany({
        where: { userId: c.userId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
    });
    await audit(c.userId, 'PASSWORD_RESET');
    return { message: 'تم تغيير كلمة المرور' };
  }
}
