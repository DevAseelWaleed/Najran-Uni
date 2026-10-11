import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Eye, EyeOff, ShieldCheck, GraduationCap } from 'lucide-react';
import { api, send } from './api';
import { Button, Field, useToast } from './components';
import { useApp } from './context';
export function Brand() {
  const { brand } = useApp();
  return (
    <div className="brand">
      {brand?.logoDataUrl || brand?.logoUrl ? (
        <img src={brand.logoDataUrl || brand.logoUrl} alt="شعار الجامعة" />
      ) : (
        <span className="brand-placeholder" title="موضع شعار قابل للاستبدال">
          <GraduationCap />
        </span>
      )}
      <div>
        <strong>{brand?.universityName || 'جامعة نجران'}</strong>
        <small>{brand?.collegeName || 'كلية الشريعة وأصول الدين'}</small>
        <span className="brand-system">{brand?.systemName}</span>
      </div>
    </div>
  );
}
export function Landing() {
  const { brand } = useApp();
  return (
    <div className="landing">
      <header>
        <Brand />
        <Link className="btn btn-outline" to="/login">
          تسجيل الدخول <ArrowLeft size={16} />
        </Link>
      </header>
      <main className="hero">
        <div className="eyebrow">الإدارة الأكاديمية · في مكان واحد</div>
        <h1>{brand?.homeTitle}</h1>
        <p className="institution-subtitle">{brand?.universityName} | {brand?.collegeName}</p>
        <p>
          منصة موحّدة لتنظيم المعلومات الأكاديمية والوظيفية، إدارة الوثائق، ومتابعة أعمال الكلية
          بوضوح وكفاءة.
        </p>
        <Link className="btn btn-primary" to="/login">
          الدخول إلى النظام <ArrowLeft size={18} />
        </Link>
        <div className="hero-features">
          <span>
            <ShieldCheck /> وصول آمن
          </span>
          <span>
            <GraduationCap /> سجل أكاديمي متكامل
          </span>
        </div>
      </main>
      <div className="hero-art" aria-hidden="true">
        <div className="art-ring" />
        <div className="art-card">
          <GraduationCap size={68} />
          <strong>المعرفة تبدأ بالتنظيم</strong>
          <span>الكشاف الأكاديمي</span>
        </div>
      </div>
      <footer>
        © {new Date().getFullYear()} {brand?.universityName || 'جامعة نجران'} · جميع الحقوق محفوظة
      </footer>
    </div>
  );
}
function AuthFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const { brand } = useApp();
  return (
    <div className="auth-page">
      <div className="auth-side">
        <Brand />
        <div>
          <ShieldCheck size={44} />
          <h2>
            إدارة متكاملة.
            <br />
            وصول موثوق.
          </h2>
          <p>مساحة عمل آمنة للمعلومات الأكاديمية والوظيفية.</p>
        </div>
        <Link to="/">العودة إلى الصفحة الرئيسية</Link>
      </div>
      <main className="auth-main">
        <div className="auth-card">
          <p className="auth-institution">{brand?.homeTitle}</p>
          <h1>{title}</h1>
          <p>{description}</p>
          {children}
        </div>
      </main>
    </div>
  );
}
export function Login() {
  const [show, setShow] = useState(false);
  const toast = useToast();
  const nav = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ identifier: string; password: string }>({
    resolver: zodResolver(
      z.object({
        identifier: z.string().min(1, 'أدخل البريد أو اسم المستخدم'),
        password: z.string().min(1, 'أدخل كلمة المرور'),
      }),
    ),
  });
  async function submit(data: any) {
    try {
      const challenge = await api('/auth/login', send('POST', data));
      sessionStorage.setItem('otpChallenge', JSON.stringify(challenge));
      nav('/verify-otp');
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  return (
    <AuthFrame title="مرحبًا بعودتك" description="سجّل الدخول باستخدام حسابك المؤسسي">
      <form onSubmit={handleSubmit(submit)}>
        <Field label="البريد الإلكتروني أو اسم المستخدم" error={errors.identifier?.message}>
          <input autoComplete="username" dir="auto" {...register('identifier')} />
        </Field>
        <Field label="كلمة المرور" error={errors.password?.message}>
          <div className="password-field">
            <input
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              {...register('password')}
            />
            <button
              type="button"
              aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              onClick={() => setShow(!show)}
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </Field>
        <Link className="text-link" to="/forgot-password">
          نسيت كلمة المرور؟
        </Link>
        <Button className="full" disabled={isSubmitting}>
          {isSubmitting ? 'جارٍ التحقق…' : 'تسجيل الدخول'}
        </Button>
        <div className="security-note">
          <ShieldCheck size={16} /> يتطلب الدخول رمز تحقق يُرسل إلى بريدك
        </div>
      </form>
    </AuthFrame>
  );
}
export function Verify() {
  const nav = useNavigate();
  const toast = useToast();
  const app = useApp();
  const [challenge, setChallenge] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('otpChallenge') || 'null');
    } catch {
      return null;
    }
  });
  const [digits, setDigits] = useState(Array(6).fill(''));
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const remaining = challenge
    ? Math.max(0, Math.ceil((+new Date(challenge.expiresAt) - now) / 1000))
    : 0;
  const cooldown = challenge
    ? Math.max(0, Math.ceil((+new Date(challenge.resendAt) - now) / 1000))
    : 0;
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(
        '/auth/verify',
        send('POST', { challengeId: challenge.challengeId, code: digits.join('') }),
      );
      sessionStorage.removeItem('otpChallenge');
      await app.refresh();
      nav('/dashboard');
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    setBusy(true);
    try {
      const next = await api('/auth/resend', send('POST', { challengeId: challenge.challengeId }));
      setChallenge(next);
      sessionStorage.setItem('otpChallenge', JSON.stringify(next));
      setDigits(Array(6).fill(''));
      refs.current[0]?.focus();
      toast('تم إرسال رمز جديد');
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthFrame title="تحقق من بريدك" description="أدخل رمز التحقق المكوّن من ستة أرقام">
      {app.brand?.developmentMailboxUrl && (
        <div className="local-mail-note">
          <p>الإرسال التجريبي المحلي مفعّل. ستجد رمز التحقق في صندوق البريد المحلي.</p>
          <a className="text-link" href={app.brand.developmentMailboxUrl} target="_blank" rel="noopener noreferrer">فتح صندوق البريد المحلي</a>
        </div>
      )}
      {!challenge ? (
        <>
          <p>ابدأ تسجيل الدخول للحصول على رمز.</p>
          <Link to="/login">تسجيل الدخول</Link>
        </>
      ) : (
        <form onSubmit={verify}>
          <div
            className="otp"
            dir="ltr"
            onPaste={(e) => {
              e.preventDefault();
              const value = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
              setDigits(Array.from({ length: 6 }, (_, i) => value[i] || ''));
              refs.current[Math.min(value.length, 5)]?.focus();
            }}
          >
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                autoFocus={i === 0}
                aria-label={`الرقم ${i + 1}`}
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(-1);
                  setDigits((ds) => ds.map((v, j) => (j === i ? value : v)));
                  if (value) refs.current[i + 1]?.focus();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && !d) refs.current[i - 1]?.focus();
                }}
              />
            ))}
          </div>
          <p className="center">
            {remaining
              ? `ينتهي الرمز خلال ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`
              : 'انتهت صلاحية الرمز'}
          </p>
          <Button className="full" disabled={busy || digits.some((d) => !d) || !remaining}>
            تحقق وادخل
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="full"
            disabled={busy || cooldown > 0}
            onClick={resend}
          >
            إعادة إرسال الرمز {cooldown > 0 && `(${cooldown})`}
          </Button>
          <Link to="/login">العودة إلى تسجيل الدخول</Link>
        </form>
      )}
    </AuthFrame>
  );
}
export function Recovery({ reset = false }: { reset?: boolean }) {
  const [search] = useSearchParams();
  const toast = useToast();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    if (reset && (String(values.password).length < 12 || values.password !== values.confirm)) {
      toast('كلمة المرور لا تقل عن 12 حرفًا ويجب أن تتطابق مع التأكيد', true);
      return;
    }
    setBusy(true);
    try {
      const result = await api(
        reset ? '/auth/reset-password' : '/auth/forgot-password',
        send(
          'POST',
          reset
            ? { token: search.get('token'), password: values.password }
            : { email: values.email },
        ),
      );
      toast(result.message);
      setDone(true);
      if (reset) nav('/login');
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthFrame
      title={reset ? 'تعيين كلمة المرور' : 'استعادة الوصول'}
      description={
        reset
          ? 'استخدم 12 حرفًا على الأقل، مع حروف لاتينية وأرقام'
          : 'سنرسل رابط الاستعادة إلى البريد المسجّل'
      }
    >
      {done ? (
        <p>إذا كان الحساب متاحًا، سيصلك رابط الاستعادة.</p>
      ) : (
        <form onSubmit={submit}>
          {reset ? (
            <>
              <Field label="كلمة المرور الجديدة">
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  maxLength={128}
                  required
                  autoComplete="new-password"
                />
              </Field>
              <Field label="تأكيد كلمة المرور">
                <input name="confirm" type="password" required autoComplete="new-password" />
              </Field>
            </>
          ) : (
            <Field label="البريد الإلكتروني">
              <input name="email" type="email" required dir="ltr" autoComplete="email" />
            </Field>
          )}
          <Button className="full" disabled={busy}>
            {reset ? 'حفظ كلمة المرور' : 'إرسال رابط الاستعادة'}
          </Button>
        </form>
      )}
      <Link className="text-link" to="/login">
        العودة إلى تسجيل الدخول
      </Link>
    </AuthFrame>
  );
}
