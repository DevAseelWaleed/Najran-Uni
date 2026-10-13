import 'reflect-metadata';
import { NestFactory, APP_GUARD } from '@nestjs/core';
import { Module, Catch, ExceptionFilter, ArgumentsHost, HttpException } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AuthController } from './auth';
import { UsersController } from './users';
import { FacultyController } from './faculty';
import { DocumentsController } from './documents';
import { AdminController } from './admin';
import { ImportController } from './imports';
import { ExportController } from './exports';
import { AccessGuard } from './security';
import { db } from './db';
import { validateCloudConfig } from './cloud-config';
import { mountWeb } from './web-host';
@Catch()
class Errors implements ExceptionFilter {
  catch(error: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : error.code === 'P2002'
          ? 409
          : error.code === 'P2025'
            ? 404
            : error.code === 'P2003'
              ? 400
              : 500;
    const message =
      error instanceof HttpException
        ? (error.getResponse() as any)?.message || error.message
        : status === 409
          ? 'البيانات مكررة'
          : status === 404
            ? 'السجل غير موجود'
            : status === 400
              ? 'القسم أو الكلية غير صالحين'
              : 'حدث خطأ داخلي';
    if (status === 500) console.error('Internal error', error.code || error.name);
    res.status(status).json({ message });
  }
}
@Module({
  controllers: [
    AuthController,
    UsersController,
    FacultyController,
    DocumentsController,
    AdminController,
    ImportController,
    ExportController,
  ],
  providers: [{ provide: APP_GUARD, useClass: AccessGuard }],
})
class AppModule {}
async function main() {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
    throw new Error('SESSION_SECRET must contain at least 32 characters');
  process.env.APP_ORIGIN ||= process.env.RENDER_EXTERNAL_URL;
  validateCloudConfig();
  await db.$connect();
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.setGlobalPrefix('api');
  const proxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
  if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 2)
    throw new Error('TRUST_PROXY_HOPS must be 0, 1 or 2');
  if (proxyHops) app.getHttpAdapter().getInstance().set('trust proxy', proxyHops);
  app.use(helmet());
  if (process.env.SERVE_WEB === 'true') mountWeb(app.getHttpAdapter().getInstance());
  app.use(cookieParser());
  app.enableCors({ origin: process.env.APP_ORIGIN, credentials: true });
  app.useGlobalFilters(new Errors());
  const buckets = new Map<string, { count: number; until: number }>();
  app.use((req: any, res: any, next: any) => {
    res.setHeader('Cache-Control', 'no-store');
    const auth = [
      '/api/auth/login',
      '/api/auth/verify',
      '/api/auth/resend',
      '/api/auth/forgot-password',
      '/api/auth/reset-password',
    ].includes(req.path);
    const key = `${req.ip}:${auth ? req.path : 'api'}`;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || b.until < now) {
      b = { count: 0, until: now + 60000 };
      buckets.set(key, b);
    }
    if (++b.count > (auth ? 20 : 180)) {
      res.setHeader('Retry-After', '60');
      return res.status(429).json({ message: 'طلبات كثيرة، حاول بعد دقيقة' });
    }
    if (buckets.size > 10000) for (const [k, v] of buckets) if (v.until < now) buckets.delete(k);
    next();
  });
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1');
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
