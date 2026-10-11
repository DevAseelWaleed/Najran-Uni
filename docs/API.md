# عقود API

GET /documents/:id?view=true يعرض المستند في المتصفح مع فحص الجلسة والصلاحيات. POST /settings/logo يرفع PNG/JPEG حتى 1MB للشعار الرسمي، بصلاحية settings.manage.

العنوان الأساسي `/api`. cookie `portal_session` HttpOnly/SameSite=Strict. لا يوجد JWT أو تخزين أسرار في localStorage. Origin للعمليات الكتابية يجب أن يطابق APP_ORIGIN. بعد OTP اطلب GET /auth/me واستخدم قيمة csrf في X-CSRF-Token. طلبات FormData بدون Content-Type يدوي.

| الطريقة والمسار                 | البيانات/النتيجة                                     | الصلاحية                      |
| ------------------------------- | ---------------------------------------------------- | ----------------------------- |
| GET /branding                   | universityName,collegeName,primaryColor,logoUrl      | عام                           |
| POST /auth/login                | identifier,password → challengeId,expiresAt,resendAt | عام                           |
| POST /auth/verify               | challengeId,code → csrf + cookie                     | عام                           |
| POST /auth/resend               | challengeId → challenge جديد                         | عام                           |
| POST /auth/forgot-password      | email → رسالة عامة                                   | عام                           |
| POST /auth/reset-password       | token,password                                       | عام                           |
| GET /auth/me                    | معلومات الحساب الآمنة، permissions,csrf              | جلسة                          |
| POST /auth/logout               | إبطال الجلسة                                         | جلسة + CSRF                   |
| GET /references                 | كليات وأقسام ورتب ومؤهلات وحالات                     | جلسة                          |
| GET /dashboard                  | مؤشرات وتوزيعات وسجلات حديثة                         | dashboard.read                |
| GET,POST /users                 | قائمة مرقمة / إنشاء وإرسال تهيئة                     | users.manage                  |
| GET,PATCH,DELETE /users/:id     | تفاصيل / استبدال الحقول / تعطيل                      | users.manage                  |
| POST /users/:id/reset           | إرسال رابط تهيئة                                     | users.manage                  |
| GET,POST /faculty               | قائمة مرقمة / إنشاء                                  | faculty.read / faculty.write  |
| GET,PATCH,DELETE /faculty/:id   | تفاصيل / تحديث / حذف منطقي                           | read / write / delete         |
| POST /faculty/:id/restore       | استعادة                                              | faculty.delete                |
| POST /documents/:facultyId      | file,category (FormData)                             | document.write                |
| GET,DELETE /documents/:id       | ملف محمي / إزالة منطقية                              | faculty.read / document.write |
| GET /imports/template           | قالب XLSX                                            | data.import                   |
| POST /imports/inspect           | file → id,sheets,fields                              | data.import                   |
| POST /imports/:id/preview       | sheet,mapping (حقل→رقم العمود من الصفر)              | data.import ومالك المهمة      |
| POST /imports/:id/commit        | يحفظ الصفوف الصالحة مرة واحدة                        | data.import ومالك المهمة      |
| GET /imports/:id/errors         | XLSX الأخطاء                                         | data.import ومالك المهمة      |
| GET /exports/xlsx, /exports/pdf | نتائج مطابقة للمرشحات                                | data.export                   |
| GET /exports/profile/:id        | PDF عضو                                              | data.export                   |
| POST /colleges                  | name                                                 | settings.manage               |
| POST /departments               | collegeId,name                                       | settings.manage               |
| PUT /settings                   | الهوية المؤسسية                                      | settings.manage               |
| GET /audit                      | قائمة مرقمة                                          | audit.read                    |

GET faculty يقبل search,collegeId,departmentId,highestQualification,academicRank,employmentStatus,employmentType,graduationYear,appointmentFrom,appointmentTo,sort,direction,page,pageSize. الفلاتر AND؛ البحث في الاسم والرقم والبريد والتخصص OR. deleted=true للمسؤول فقط. pageSize = 10/25/50. التصدير يستخدم المرشحات نفسها؛ XLSX يقبل columns قائمة مفاتيح مفصولة بفاصلة.

User payload: fullName,username,email,roleId,active. Faculty payload موثق في src/validation.ts وجميع الحقول ظاهرة في واجهة الإضافة؛ qualifications قائمة degree,university,country,year. College/department علاقة مركبة تمنع اختيار قسم من كلية أخرى.

الحالات: 400 تحقق، 401 جلسة/اعتماد غير صالح، 403 صلاحية/CSRF/Origin، 404 سجل غير متاح، 409 تكرار، 429 تقييد معدل، 503 بريد غير متاح، 500 خطأ عام بدون تفاصيل داخلية.
