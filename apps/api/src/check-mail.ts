import { config } from 'dotenv';
import { resolve } from 'node:path';
import { verifyMailService } from './mail';
config({ path: resolve(process.cwd(), '../../.env') });
async function main() {
  await verifyMailService();
  console.log('تم التحقق من الاتصال والمصادقة بخدمة البريد. لم تُرسل رسالة اختبار.');
}
main().catch((error) => {
  console.error(
    error.code
      ? `تعذر التحقق من خدمة البريد (${error.code}). راجع الإعدادات وكلمة مرور التطبيق.`
      : error.message,
  );
  process.exitCode = 1;
});
