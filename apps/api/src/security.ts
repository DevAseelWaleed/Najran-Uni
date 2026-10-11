import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Inject,
  SetMetadata,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { db } from './db';
import { hash, equal } from './crypto';
export const Public = () => SetMetadata('public', true);
export const Permit = (permission: string) => SetMetadata('permission', permission);
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(@Inject(Reflector) private reflector: Reflector) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (mutation && req.headers.origin !== process.env.APP_ORIGIN)
      throw new ForbiddenException('مصدر الطلب غير مسموح');
    if (this.reflector.getAllAndOverride('public', [ctx.getHandler(), ctx.getClass()])) return true;
    const secret = req.cookies?.portal_session;
    const session = secret
      ? await db.session.findUnique({
          where: { tokenHash: hash(secret) },
          include: { user: { include: { role: { include: { permissions: true } } } } },
        })
      : null;
    if (!session || session.expiresAt < new Date() || !session.user.active)
      throw new UnauthorizedException('يرجى تسجيل الدخول');
    if (
      mutation &&
      (!req.headers['x-csrf-token'] || !equal(session.csrf, String(req.headers['x-csrf-token'])))
    )
      throw new ForbiddenException('رمز حماية الطلب غير صحيح');
    req.user = session.user;
    req.session = session;
    const permission = this.reflector.getAllAndOverride<string>('permission', [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (permission && !session.user.role.permissions.some((p) => p.permissionId === permission))
      throw new ForbiddenException('لا تملك صلاحية هذه العملية');
    return true;
  }
}
