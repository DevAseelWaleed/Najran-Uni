import React, { createContext, useContext, useState, useId } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, AlertCircle, CheckCircle2, GraduationCap, LoaderCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
export const cn = (...values: any[]) => twMerge(clsx(values));
export function Button({
  variant = 'primary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) {
  return <button className={cn('btn', `btn-${variant}`, className)} {...props} />;
}
export function Field({
  label,
  error,
  children,
}: React.PropsWithChildren<{ label: string; error?: string }>) {
  const id = useId();
  const control =
    React.isValidElement(children) &&
    ['input', 'select', 'textarea'].includes(String(children.type))
      ? React.cloneElement(children as React.ReactElement<any>, {
          'aria-labelledby': id,
          'aria-describedby': error ? `${id}-error` : undefined,
          'aria-invalid': error ? true : undefined,
        })
      : children;
  return (
    <label className="field">
      <span id={id}>{label}</span>
      {control}
      {error && (
        <small id={`${id}-error`} className="error">
          {error}
        </small>
      )}
    </label>
  );
}
export function Loading() {
  return (
    <div className="state">
      <LoaderCircle className="spin" /> جارٍ تحميل البيانات…
    </div>
  );
}
export function ErrorState({ error, retry }: { error: any; retry?: () => void }) {
  return (
    <div className="state error" role="alert">
      <AlertCircle />
      {error?.message || 'تعذر تحميل البيانات'}
      {retry && (
        <Button variant="outline" onClick={retry}>
          إعادة المحاولة
        </Button>
      )}
    </div>
  );
}
export function Empty({ text = 'لا توجد بيانات حتى الآن' }: { text?: string }) {
  return (
    <div className="state">
      <GraduationCap size={40} />
      <strong>{text}</strong>
      <span>ستظهر السجلات هنا عند إضافتها إلى النظام.</span>
    </div>
  );
}
export function Confirm({
  open,
  onClose,
  onConfirm,
  title = 'تأكيد العملية',
  description = 'هل تريد تنفيذ هذه العملية؟',
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  busy?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="modal" dir="rtl">
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>{description}</Dialog.Description>
          <div className="actions">
            <Button disabled={busy} onClick={onConfirm}>
              تأكيد
            </Button>
            <Button variant="outline" onClick={onClose}>
              إلغاء
            </Button>
          </div>
          <Dialog.Close className="modal-close" aria-label="إغلاق">
            <X />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
const ToastContext = createContext<(message: string, error?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }: React.PropsWithChildren) {
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  function show(message: string, error = false) {
    setToast({ message, error });
    setTimeout(() => setToast(null), 6000);
  }
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div role="status" className={cn('toast', toast.error && 'toast-error')}>
          {toast.error ? <AlertCircle /> : <CheckCircle2 />}
          {toast.message}
          <button aria-label="إغلاق" onClick={() => setToast(null)}>
            <X size={18} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
export function Pager({
  data,
  onPage,
  onSize,
}: {
  data: any;
  onPage: (p: number) => void;
  onSize: (n: number) => void;
}) {
  const count = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <div className="pager">
      <span>
        {data.total.toLocaleString('ar-SA')} نتيجة · صفحة {data.page} من {count}
      </span>
      <div className="actions">
        <select
          aria-label="عدد السجلات"
          value={data.pageSize}
          onChange={(e) => onSize(Number(e.target.value))}
        >
          {[10, 25, 50].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        <Button variant="outline" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>
          السابق
        </Button>
        <Button
          variant="outline"
          disabled={data.page >= count}
          onClick={() => onPage(data.page + 1)}
        >
          التالي
        </Button>
      </div>
    </div>
  );
}
export const formatDate = (value?: string) =>
  value ? new Date(value).toLocaleDateString('ar-SA', { calendar: 'gregory' }) : '—';
export const roleLabel = (role: string) =>
  ({ SUPER_ADMIN: 'مدير النظام', STAFF: 'موظف إداري', VIEWER: 'مشاهد' })[role] || role;
export const actionLabel = (action: string) =>
  (
    ({
      LOGIN_SUCCESS: 'تسجيل دخول ناجح',
      LOGIN_FAILED: 'محاولة دخول غير ناجحة',
      OTP_FAILED: 'فشل التحقق من الرمز',
      USER_CREATE: 'إنشاء مستخدم',
      USER_UPDATE: 'تحديث مستخدم وصلاحياته',
      USER_RESET_REQUEST: 'طلب تهيئة كلمة المرور',
      PASSWORD_RESET: 'تغيير كلمة المرور',
      RESET_EMAIL_FAILED: 'تعذر إرسال رسالة الاستعادة',
      FACULTY_CREATE: 'إضافة عضو هيئة تدريس',
      FACULTY_UPDATE: 'تحديث عضو هيئة تدريس',
      FACULTY_DELETE: 'حذف عضو هيئة تدريس',
      FACULTY_RESTORE: 'استعادة عضو هيئة تدريس',
      FACULTY_IMPORT: 'استيراد بيانات أعضاء',
      DOCUMENT_UPLOAD: 'رفع مستند',
      DOCUMENT_DELETE: 'إزالة مستند',
      DATA_EXPORT: 'تصدير بيانات',
      PROFILE_EXPORT: 'تصدير ملف عضو',
      SETTINGS_UPDATE: 'تحديث إعدادات النظام',
      BRAND_LOGO_UPDATE: 'تحديث شعار الجامعة',
      COLLEGE_CREATE: 'إضافة كلية',
      DEPARTMENT_CREATE: 'إضافة قسم',
    }) as Record<string, string>
  )[action] || 'عملية إدارية';
