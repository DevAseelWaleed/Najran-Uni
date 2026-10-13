# بوابة إدارة أعضاء هيئة التدريس

تطبيق عربي RTL: React/TypeScript/Vite + NestJS + PostgreSQL/Prisma. لا توجد بيانات أعضاء أو حسابات إنتاج افتراضية.

## تشغيل محلي

Node.js 22.12+، npm، Docker اختياري. إذا كان Node العالمي أقدم على Windows، تحاول أوامر الجذر استعمال Node المضمن في Codex عند توفره.

```powershell
npm ci
Copy-Item .env.example .env
docker compose up -d
npm run db:generate
npm run db:migrate
npx playwright install chromium
```

اضبط SESSION_SECRET إلى سر عشوائي لا يقل عن 32 حرفًا. اضبط ADMIN_EMAIL وADMIN_USERNAME وADMIN_PASSWORD بنفسك (12 حرفًا على الأقل، حروف لاتينية وأرقام). لا ترسل هذه القيم في مستودع أو رسالة عامة.

```powershell
npm run db:init
npm run dev
```

الواجهة http://localhost:5173. اضبط إرسال Gmail كما هو موضح أدناه قبل تسجيل الدخول. احذف ADMIN_PASSWORD من .env بعد التهيئة. أضف القسم من الإعدادات قبل إضافة أول عضو.

### بدون Docker (تطوير فقط)

قبل إنشاء .env شغّل `npm run dev:services` في طرفية مستقلة. يشغّل PostgreSQL أصليًا محليًا ويولد ملف .env بأسرار عشوائية إذا لم يكن موجودًا. إن كان .env موجودًا فحدّث كلمة مرور DATABASE_URL من الملف المحلي `storage/dev/database-password`؛ لا تطبعها في السجلات. ثم نفّذ أوامر الترحيل والتهيئة أعلاه. يشغّل أيضًا مستقبل بريد محليًا اختياريًا؛ لا تشغّله في الإنتاج.

## إرسال رموز التحقق عبر Gmail

إعدادات المثال تستخدم `smtp.gmail.com` على المنفذ `465` مع `SMTP_SECURE=true`. أضف في `.env` حساب الإرسال إلى `SMTP_USER` و`SMTP_FROM`، وكلمة مرور تطبيق Google إلى `SMTP_PASSWORD`. هذه كلمة مرور تطبيق وليست كلمة مرور الحساب المعتادة. تُنشأ بعد تفعيل التحقق بخطوتين وفق [تعليمات Google](https://support.google.com/accounts/answer/185833). لا ترفع `.env` أو كلمة مرور التطبيق إلى GitHub.

نفّذ `npm run mail:verify` لفحص الاتصال والمصادقة دون إرسال رسالة، ثم أعد تشغيل الخادم بعد تعديل `.env`. نجاح الفحص لا يثبت وصول رسالة إلى صندوق المستلم؛ اختبر تسجيل الدخول ورمز البريد بعدها. عند غياب بيانات Gmail يعرض الخادم رسالة إعدادات واضحة ولا يدّعي إرسال الرمز. [إعدادات SMTP الرسمية](https://developers.google.com/workspace/gmail/imap/imap-smtp).

للاختبار المحلي فقط، اضبط `SMTP_HOST=localhost` و`SMTP_PORT=1025` و`SMTP_SECURE=false` واترك بيانات SMTP_USER وSMTP_PASSWORD فارغة، مع عنوان مرسل تجريبي. تظهر الرسائل على http://localhost:8025/inbox بدل إرسالها إلى Gmail؛ يظهر رابط الصندوق في صفحة التحقق خارج وضع الإنتاج فقط.

## التحقق

```powershell
npm run build
npm test
npm run test:e2e
npm audit
```

اختبارات التكامل تنشئ PostgreSQL معزولًا في مجلد مؤقت، على 5499، وقاعدة portal_test. تستعمل SMTP محليًا على 1099 وAPI على 3099. لا تستخدم DATABASE_URL الإنتاج أو تمسح بياناته. اختبار المتصفح يستعمل قاعدة مستقلة على 5498. Chromium مطلوب لاختبارات PDF والمتصفح.

## الوثائق

إذا تعذر تشغيل Chromium المنزّل على Windows، اضبط `PDF_BROWSER_CHANNEL=msedge` في .env، وشغّل اختبار المتصفح باستخدام `$env:TEST_BROWSER_CHANNEL='msedge'; npm run test:e2e`. هذا هو المسار الذي تم التحقق منه على جهاز العمل الحالي.

- [الخطة والمعمارية](docs/ARCHITECTURE.md)
- [عقود API](docs/API.md)
- [دليل النشر](docs/DEPLOYMENT.md)
- [النشر التجريبي المجاني على Render وSupabase وBrevo](docs/FREE_DEPLOYMENT.md)
- [دليل المدير](docs/ADMIN.md)
- [تقرير التنفيذ والتحقق](docs/REPORT.md)

المراجع التقنية: [NestJS Sessions](https://docs.nestjs.com/http/session)، [Prisma 6 Migrate](https://www.prisma.io/docs/orm/v6/prisma-migrate/getting-started)، [Native embedded PostgreSQL](https://github.com/leinelissen/embedded-postgres).
