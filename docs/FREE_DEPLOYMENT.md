# نشر تجريبي مجاني: Render + Supabase + Brevo

هذه نسخة لتجربة العميل. لا يلزم شراء نطاق؛ Render يوفر رابط HTTPS.
لا ترفع `.env` أو أسرار Supabase وBrevo إلى GitHub.

## 1. Supabase

1. أنشئ مشروعًا جديدًا على خطة Free، واحتفظ بكلمة مرور قاعدة البيانات داخل لوحة الإعدادات الخاصة.
2. افتح SQL Editor في المشروع التجريبي ونفذ `CREATE SCHEMA IF NOT EXISTS portal;`.
   جداول البوابة تبقى في هذا المخطط، خارج `public` وخارج المخططات المعروضة في Data API.
   لا تضف `portal` إلى Exposed schemas.
3. من Connect انسخ اتصال **Session pooler** على المنفذ **5432**، وليس Transaction pooler على 6543.
   أدخل كلمة المرور مع URL encoding إذا احتوت رموزًا خاصة، واجعل معاملات الرابط:
   `?schema=portal&sslmode=require&connection_limit=3`.
   ضعه في `DATABASE_URL` داخل Render. لا تستعمل قاعدة محلية أو قاعدة إنتاج الجامعة.
4. من Storage أنشئ bucket اسمه `portal-documents` واجعل **Public bucket = OFF**.
   حد الحجم 10MB، والأنواع: `application/pdf`, `image/png`, `image/jpeg`.
   لا تضف سياسة تسمح للزوار أو المستخدمين المجهولين بقراءة الملفات.
5. احفظ Project URL في `SUPABASE_URL`، ومن إعدادات API Keys خذ مفتاح **service_role (legacy JWT)**
   إلى `SUPABASE_SERVICE_ROLE_KEY` في Render فقط؛ لا تستعمل anon أو publishable key.
   هذا المفتاح لا يدخل بناء الواجهة ولا يرسل إلى متصفح العميل.

## 2. Brevo

1. أنشئ مفتاح API من SMTP & API، ثم API Keys. المطلوب مفتاح API وليس مفتاح SMTP.
2. أضف عنوان مرسل في Senders & Domains وتحقق منه برسالة التحقق.
   قد يتطلب الحساب تفعيل الإرسال أو توثيق نطاق حسب سياسات Brevo؛ افحص الحالة داخل الحساب.
3. ضع المفتاح في `BREVO_API_KEY` والعنوان الموثق نفسه في `SMTP_FROM` داخل Render.
4. التشغيل السحابي يستخدم `MAIL_PROVIDER=brevo`؛ إرسال HTTPS يتجاوز حظر SMTP في خطة Render المجانية.
   تبقى إعدادات Gmail الحالية صالحة للتطوير المحلي مع `MAIL_PROVIDER=smtp`.

## 3. Render

اختر New > Web Service، واربط مستودع GitHub للبوابة والفرع الذي يحتوي تغييرات النشر.
اختر Docker، ملف `./Dockerfile`، وخطة **Free**. لا تضف قرصًا مدفوعًا أو قاعدة Render مدفوعة.
يمكن استعمال `render.yaml`؛ إذا طلب Blueprint بطاقة، أنشئ الخدمة يدويًا.

اضبط Health Check Path إلى `/healthz` وأضف المتغيرات:

| المتغير                     | القيمة                                                       |
| --------------------------- | ------------------------------------------------------------ |
| `NODE_ENV`                  | `production`                                                 |
| `HOST`                      | `0.0.0.0`                                                    |
| `PORT`                      | `10000`                                                      |
| `SERVE_WEB`                 | `true`                                                       |
| `TRUST_PROXY_HOPS`          | `1`؛ هذا المسار خلف Render وحده                              |
| `STORAGE_PROVIDER`          | `supabase`                                                   |
| `SUPABASE_STORAGE_BUCKET`   | `portal-documents`                                           |
| `MAIL_PROVIDER`             | `brevo`                                                      |
| `PDF_BROWSER_CHANNEL`       | `chromium`                                                   |
| `SESSION_SECRET`            | قيمة عشوائية قوية، 32 حرفًا على الأقل، ثابتة بين إعادة النشر |
| `DATABASE_URL`              | Session pooler، مخطط portal، SSL                             |
| `SUPABASE_URL`              | رابط المشروع                                                 |
| `SUPABASE_SERVICE_ROLE_KEY` | مفتاح service_role الخاص                                     |
| `BREVO_API_KEY`             | مفتاح API الخاص                                              |
| `SMTP_FROM`                 | المرسل الموثق في Brevo                                       |
| `ADMIN_EMAIL`               | بريد حساب المدير التجريبي الذي يمكنه استقبال الرمز           |
| `ADMIN_USERNAME`            | اسم دخول المدير                                              |
| `ADMIN_PASSWORD`            | كلمة قوية 12 حرفًا على الأقل، حروف وأرقام                    |

`APP_ORIGIN` يؤخذ تلقائيًا من `RENDER_EXTERNAL_URL` الذي توفره Render.
عند استعمال نطاق مخصص، اضبطه إلى أصل HTTPS النهائي دون شرطة ختامية.

البناء يشمل الواجهة والخادم والشعار وخط Cairo وChromium.
بدء التشغيل يطبق الترحيلات ثم يهيئ المراجع والمدير الأول ثم يشغل الخادم.
إذا فشلت خطوة لا يبدأ التطبيق. إعدادات ناقصة للتخزين السحابي لا تؤدي إلى حفظ محلي مؤقت.
بعد أول نشر ناجح احذف `ADMIN_PASSWORD` من إعدادات Render وأعد النشر؛
تهيئة المدير لا تعيد تعيين حساب موجود. `/healthz` يتحقق من اتصال قاعدة البيانات فقط.

## 4. تحقق قبل تسليم الرابط

- افتح الصفحة العامة، ثم افتح رابطًا داخليًا مباشرة وتأكد أن React يعمل.
- ادخل بالمدير، وتأكد من وصول OTP إلى البريد، ثم تحقق من الدخول والخروج وإعادة الدخول.
- أضف قسمًا وسجلًا تجريبيًا، وارفع مرفقًا ثم نزله.
- أعد تشغيل الخدمة وتأكد أن السجل والمرفق باقيان.
- اختبر حساب العميل وصلاحياته؛ لا تعطِ حساب المدير لمن يحتاج المشاهدة فقط.
- اختبر XLSX وPDF على Render؛ ذاكرة الخطة المجانية محدودة وقد تحتاج التقارير الكبيرة موارد إضافية.
- خذ نسخة من البيانات التجريبية قبل حذف الخدمات أو انتهاء التجربة.

Render المجاني ينام بعد الخمول، وSupabase المجاني قد يتوقف بعد عدم النشاط.
تبقى حدود الخطط وتفعيل الحسابات خاضعة للوحات المزودين. لا يوجد نشر فعلي بمجرد إضافة هذه الملفات.

المراجع: [Render Free](https://render.com/docs/free)،
[Render Docker](https://render.com/docs/docker)،
[Supabase Prisma](https://supabase.com/docs/guides/database/prisma)،
[Supabase Storage](https://supabase.com/docs/guides/storage/buckets/fundamentals)،
[Brevo API](https://developers.brevo.com/docs/send-a-transactional-email).
