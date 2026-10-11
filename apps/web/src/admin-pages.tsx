import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, Download, CheckCircle2, FileSpreadsheet, Plus } from 'lucide-react';
import { api, send, download } from './api';
import {
  Button,
  Field,
  Loading,
  ErrorState,
  Empty,
  useToast,
  Pager,
  formatDate,
  actionLabel,
} from './components';
import { useApp } from './context';
import { useReferences } from './faculty-pages';
export function ImportPage() {
  const toast = useToast();
  const cache = useQueryClient();
  const [job, setJob] = useState<any>(null);
  const [sheet, setSheet] = useState('');
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  async function inspect(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const job = await api('/imports/inspect', send('POST', new FormData(e.currentTarget)));
      setJob(job);
      setSheet(job.sheets[0].name);
      setMapping(
        Object.fromEntries(
          job.fields.flatMap(([key, label]: string[]) => {
            const i = job.sheets[0].headers.indexOf(label);
            return i >= 0 ? [[key, i]] : [];
          }),
        ),
      );
      setPreview(null);
      setResult(null);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">إدارة البيانات</div>
          <h1>استيراد أعضاء هيئة التدريس</h1>
          <p>ارفع ملف Excel، راجع الأعمدة والنتائج، ثم أكّد الاستيراد.</p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            download('/imports/template', 'faculty-template.xlsx').catch((e) =>
              toast(e.message, true),
            )
          }
        >
          <Download size={17} /> تنزيل القالب
        </Button>
      </div>
      <div className="import-steps">
        {['رفع الملف', 'ربط الأعمدة', 'مراجعة البيانات', 'الاستيراد'].map((s, i) => (
          <div key={s} className={(result ? 3 : preview ? 2 : job ? 1 : 0) >= i ? 'active' : ''}>
            <span>{i + 1}</span>
            {s}
          </div>
        ))}
      </div>
      <section className="panel">
        <h2>ملف المصدر</h2>
        <p>
          حد أقصى 10MB و2000 صف. أدخل أسماء الكلية والقسم كما تظهر في الإعدادات. تتخطى السجلات
          المكررة دون تعديلها.
        </p>
        <form className="upload-form" onSubmit={inspect}>
          <FileSpreadsheet size={38} />
          <Field label="ملف Excel (.xlsx)">
            <input name="file" type="file" accept=".xlsx" required />
          </Field>
          <Button disabled={busy}>
            <Upload size={17} /> قراءة الملف
          </Button>
        </form>
      </section>
      {job && !preview && !result && (
        <section className="panel">
          <h2>ربط الأعمدة</h2>
          <Field label="ورقة العمل">
            <select
              value={sheet}
              onChange={(e) => {
                setSheet(e.target.value);
                setMapping({});
              }}
            >
              {job.sheets.map((s: any) => (
                <option key={s.name}>{s.name}</option>
              ))}
            </select>
          </Field>
          <div className="form-grid">
            {job.fields.map(([key, label]: string[]) => (
              <Field key={key} label={label}>
                <select
                  value={mapping[key] ?? ''}
                  onChange={(e) =>
                    setMapping((m) => {
                      const next = { ...m };
                      if (e.target.value === '') delete next[key];
                      else next[key] = Number(e.target.value);
                      return next;
                    })
                  }
                >
                  <option value="">غير مربوط</option>
                  {job.sheets
                    .find((s: any) => s.name === sheet)
                    ?.headers.map((h: string, i: number) => (
                      <option value={i} key={i}>
                        {h || `عمود ${i + 1}`}
                      </option>
                    ))}
                </select>
              </Field>
            ))}
          </div>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                setPreview(
                  await api(`/imports/${job.id}/preview`, send('POST', { sheet, mapping })),
                );
              } catch (e) {
                toast((e as Error).message, true);
              } finally {
                setBusy(false);
              }
            }}
          >
            التحقق وعرض المعاينة
          </Button>
        </section>
      )}
      {preview && !result && (
        <section className="panel">
          <h2>مراجعة البيانات</h2>
          <div className="notice">
            {preview.validCount} سجل صالح · {preview.errors.length} صف مرفوض أو مكرر
          </div>
          {preview.preview.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>الرقم</th>
                    <th>الاسم</th>
                    <th>البريد</th>
                    <th>الرتبة</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((r: any) => (
                    <tr key={`${r.collegeId}:${r.employeeNumber}`}>
                      <td>{r.employeeNumber}</td>
                      <td>{r.fullName}</td>
                      <td>{r.email}</td>
                      <td>{r.academicRank}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {preview.errors.slice(0, 30).map((e: any) => (
            <p className="error" key={e.row}>
              الصف {e.row}: {e.message}
            </p>
          ))}
          <div className="actions">
            <Button
              disabled={busy || !preview.validCount}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await api(`/imports/${job.id}/commit`, send('POST'));
                  setResult(r);
                  cache.invalidateQueries({ queryKey: ['faculty'] });
                  cache.invalidateQueries({ queryKey: ['dashboard'] });
                  toast('اكتمل الاستيراد');
                } catch (e) {
                  toast((e as Error).message, true);
                } finally {
                  setBusy(false);
                }
              }}
            >
              تأكيد استيراد السجلات الصالحة
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                download(`/imports/${job.id}/errors`, 'import-errors.xlsx').catch((e) =>
                  toast(e.message, true),
                )
              }
            >
              تنزيل تقرير الأخطاء
            </Button>
          </div>
        </section>
      )}
      {result && (
        <section className="panel state">
          <CheckCircle2 size={42} />
          <h2>اكتمل الاستيراد</h2>
          <p>
            تم حفظ {result.imported} سجل · تكرار عند التنفيذ {result.skipped} · صفوف غير صالحة{' '}
            {result.invalid}
          </p>
          <Button
            onClick={() => {
              setResult(null);
              setPreview(null);
              setJob(null);
            }}
          >
            استيراد ملف آخر
          </Button>
        </section>
      )}
    </>
  );
}
export function SettingsPage() {
  const app = useApp();
  const refs = useReferences();
  const toast = useToast();
  const cache = useQueryClient();
  const [brand, setBrand] = useState<any>(app.brand);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const logs = useQuery({
    queryKey: ['audit', page, size],
    queryFn: () => api(`/audit?page=${page}&pageSize=${size}`),
  });
  useEffect(() => setBrand(app.brand), [app.brand]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(
        '/settings',
        send(
          'PUT',
          Object.fromEntries(
            ['universityName', 'collegeName', 'systemName', 'homeTitle', 'primaryColor', 'accentColor', 'logoUrl'].map((k) => [k, brand[k]]),
          ),
        ),
      );
      cache.invalidateQueries({ queryKey: ['branding'] });
      toast('تم حفظ الهوية المؤسسية');
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  async function add(e: React.FormEvent<HTMLFormElement>, path: string) {
    e.preventDefault();
    const form = e.currentTarget;
    try {
      await api(path, send('POST', Object.fromEntries(new FormData(form))));
      form.reset();
      cache.invalidateQueries({ queryKey: ['references'] });
      toast('تمت الإضافة');
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">إدارة النظام</div>
          <h1>الإعدادات</h1>
          <p>الهوية المؤسسية والهيكل الأكاديمي وسجل التدقيق.</p>
        </div>
      </div>
      <section className="panel">
        <h2>الهوية المؤسسية</h2>
        {brand && (
          <form onSubmit={save}>
            <div className="form-grid">
              {[
                ['universityName', 'اسم الجامعة'],
                ['collegeName', 'اسم الكلية'],
                ['systemName', 'اسم النظام'],
                ['homeTitle', 'عنوان الصفحة الرئيسية'],
                ['accentColor', 'لون التمييز'],
                ['primaryColor', 'اللون الأساسي'],
                ['logoUrl', 'رابط شعار الجامعة (HTTPS)'],
              ].map(([key, label]) => (
                <Field label={label} key={key}>
                  <input
                    required={key !== 'logoUrl'}
                    type={['primaryColor', 'accentColor'].includes(key) ? 'color' : key === 'logoUrl' ? 'url' : 'text'}
                    value={brand[key]}
                    onChange={(e) => setBrand({ ...brand, [key]: e.target.value })}
                  />
                </Field>
              ))}
            </div>
            <Field label="رفع الشعار الرسمي · PNG/JPEG حتى 1MB">
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const fd = new FormData();
                  fd.append('file', file);
                  try {
                    await api('/settings/logo', send('POST', fd));
                    cache.invalidateQueries({ queryKey: ['branding'] });
                    toast('تم حفظ الشعار');
                  } catch (error) {
                    toast((error as Error).message, true);
                  }
                }}
              />
            </Field>
            <p>
              الشعار المرفوع يظهر في الواجهة وملفات PDF. الرابط الخارجي يظهر في الواجهة فقط. عند عدم
              توفير الشعار، يظهر موضع بديل مُعرّف بوضوح.
            </p>
            <Button>حفظ الإعدادات</Button>
          </form>
        )}
      </section>
      <section className="panel">
        <h2>الكليات والأقسام</h2>
        {refs.isPending ? (
          <Loading />
        ) : refs.error ? (
          <ErrorState error={refs.error} />
        ) : (
          <>
            {refs.data.colleges.map((c: any) => (
              <div className="college-item" key={c.id}>
                <strong>{c.name}</strong>
                <div className="filter-chips">
                  {c.departments.map((d: any) => (
                    <span className="badge" key={d.id}>
                      {d.name}
                    </span>
                  ))}
                  {!c.departments.length && <small>لا توجد أقسام بعد</small>}
                </div>
              </div>
            ))}
            <div className="form-grid">
              <form onSubmit={(e) => add(e, '/colleges')}>
                <Field label="كلية جديدة">
                  <input name="name" required minLength={2} />
                </Field>
                <Button variant="outline">
                  <Plus size={16} /> إضافة كلية
                </Button>
              </form>
              <form onSubmit={(e) => add(e, '/departments')}>
                <Field label="الكلية">
                  <select name="collegeId" required>
                    {refs.data.colleges.map((c: any) => (
                      <option value={c.id} key={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="قسم جديد">
                  <input name="name" required minLength={2} />
                </Field>
                <Button variant="outline">
                  <Plus size={16} /> إضافة قسم
                </Button>
              </form>
            </div>
          </>
        )}
      </section>
      <section className="panel">
        <h2>سجل التدقيق</h2>
        {logs.isPending ? (
          <Loading />
        ) : logs.error ? (
          <ErrorState error={logs.error} />
        ) : (
          <>
            {logs.data.items.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>الفاعل</th>
                      <th>العملية</th>
                      <th>معرّف السجل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.data.items.map((l: any) => (
                      <tr key={l.id}>
                        <td>{formatDate(l.createdAt)}</td>
                        <td>{l.actor?.fullName || 'النظام'}</td>
                        <td>{actionLabel(l.action)}</td>
                        <td className="mono">{l.target || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty />
            )}
            <Pager
              data={logs.data}
              onPage={setPage}
              onSize={(s) => {
                setSize(s);
                setPage(1);
              }}
            />
          </>
        )}
      </section>
    </>
  );
}
