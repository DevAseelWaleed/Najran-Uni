import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Search,
  SlidersHorizontal,
  Download,
  FileInput,
  Pencil,
  Trash2,
  ArrowRight,
  FileText,
  Printer,
  Upload,
  RotateCcw,
  X,
  UserRound,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { api, send, params, download } from './api';
import {
  Button,
  Field,
  Loading,
  ErrorState,
  Empty,
  Pager,
  Confirm,
  useToast,
  formatDate,
} from './components';
import { useApp } from './context';
import { Require } from './layout';
export const fieldLabels: Record<string, string> = {
  employeeNumber: 'الرقم الوظيفي',
  fullName: 'الاسم الكامل بالعربية',
  englishName: 'الاسم بالإنجليزية',
  gender: 'الجنس',
  birthDate: 'تاريخ الميلاد',
  nationality: 'الجنسية',
  mobile: 'رقم الجوال',
  email: 'البريد الجامعي',
  collegeId: 'الكلية',
  departmentId: 'القسم',
  highestQualification: 'أعلى مؤهل',
  generalSpecialization: 'التخصص العام',
  specificSpecialization: 'التخصص الدقيق',
  academicRank: 'الرتبة العلمية',
  awardingUniversity: 'الجامعة المانحة',
  awardingCountry: 'الدولة المانحة',
  graduationYear: 'سنة التخرج',
  researchInterests: 'الاهتمامات البحثية',
  jobTitle: 'المسمى الوظيفي',
  appointmentDate: 'تاريخ التعيين',
  joiningDate: 'تاريخ المباشرة',
  employmentType: 'نوع التوظيف',
  employmentStatus: 'الحالة الوظيفية',
  administrativePosition: 'المنصب الإداري',
  officeNumber: 'رقم المكتب',
  officePhone: 'هاتف المكتب',
};
const sections = [
  [
    'المعلومات الشخصية',
    [
      'employeeNumber',
      'fullName',
      'englishName',
      'gender',
      'birthDate',
      'nationality',
      'mobile',
      'email',
    ],
  ],
  [
    'المعلومات الأكاديمية',
    [
      'collegeId',
      'departmentId',
      'highestQualification',
      'academicRank',
      'generalSpecialization',
      'specificSpecialization',
      'awardingUniversity',
      'awardingCountry',
      'graduationYear',
      'researchInterests',
    ],
  ],
  [
    'المعلومات الوظيفية',
    [
      'jobTitle',
      'appointmentDate',
      'joiningDate',
      'employmentType',
      'employmentStatus',
      'administrativePosition',
      'officeNumber',
      'officePhone',
    ],
  ],
] as [string, string[]][];
const required = [
  'employeeNumber',
  'fullName',
  'email',
  'collegeId',
  'departmentId',
  'highestQualification',
  'academicRank',
  'employmentType',
  'employmentStatus',
];
export function useReferences() {
  return useQuery({
    queryKey: ['references'],
    queryFn: () => api('/references'),
    staleTime: 300000,
  });
}
function Photo({ faculty }: { faculty: any }) {
  const doc = faculty.documents?.find((d: any) => d.category === 'صورة شخصية');
  return doc ? (
    <img className="avatar photo" src={`/api/documents/${doc.id}`} alt={faculty.fullName} />
  ) : (
    <div className="avatar">{faculty.fullName?.[0] || <UserRound />}</div>
  );
}
export function FacultyList() {
  const app = useApp();
  const toast = useToast();
  const cache = useQueryClient();
  const refs = useReferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = Object.fromEntries(searchParams);
  const [search, setSearch] = useState(filters.search || '');
  const [showFilters, setShowFilters] = useState(false);
  const [deleting, setDeleting] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ['faculty', filters],
    queryFn: () => api(`/faculty?${params(filters)}`),
  });
  function set(key: string, value: string) {
    setSearchParams((old) => {
      const next = new URLSearchParams(old);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'page') next.set('page', '1');
      return next;
    });
  }
  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== (filters.search || '')) set('search', search);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);
  async function remove() {
    setBusy(true);
    try {
      await api(`/faculty/${deleting.id}`, send('DELETE'));
      toast('تم نقل السجل إلى المحذوفات');
      setDeleting(null);
      cache.invalidateQueries({ queryKey: ['faculty'] });
      cache.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function exportData(format: string) {
    try {
      await download(`/exports/${format}?${params(filters)}`, `faculty.${format}`);
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  const departments =
    refs.data?.colleges
      .filter((c: any) => !filters.collegeId || c.id === filters.collegeId)
      .flatMap((c: any) => c.departments) || [];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">السجل الأكاديمي</div>
          <h1>أعضاء هيئة التدريس</h1>
          <p>إدارة معلومات أعضاء الكلية ومؤهلاتهم ومستنداتهم.</p>
        </div>
        <div className="actions">
          {app.can('data.import') && (
            <Link className="btn btn-outline" to="/faculty/import">
              <FileInput size={18} /> استيراد
            </Link>
          )}
          {app.can('faculty.write') && (
            <Link className="btn btn-primary" to="/faculty/new">
              <Plus size={18} /> إضافة عضو
            </Link>
          )}
        </div>
      </div>
      <section className="panel">
        <div className="table-toolbar">
          <div className="search-box">
            <Search size={18} />
            <input
              aria-label="بحث أعضاء هيئة التدريس"
              placeholder="الاسم، الرقم الوظيفي، البريد أو التخصص…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={() => setShowFilters(!showFilters)}>
            <SlidersHorizontal size={17} /> تصفية متقدمة
          </Button>
          {app.can('data.export') && (
            <>
              <Button variant="ghost" onClick={() => exportData('xlsx')}>
                <Download size={16} /> Excel
              </Button>
              <Button variant="ghost" onClick={() => exportData('pdf')}>
                <FileText size={16} /> PDF
              </Button>
            </>
          )}
        </div>
        {showFilters && (
          <div className="filters-grid">
            {[
              ['collegeId', 'الكلية', (refs.data?.colleges || []).map((c: any) => [c.id, c.name])],
              ['departmentId', 'القسم', departments.map((d: any) => [d.id, d.name])],
              ['academicRank', 'الرتبة', (refs.data?.ranks || []).map((v: string) => [v, v])],
              [
                'highestQualification',
                'المؤهل',
                (refs.data?.degrees || []).map((v: string) => [v, v]),
              ],
              [
                'employmentStatus',
                'الحالة',
                (refs.data?.statuses || []).map((v: string) => [v, v]),
              ],
              [
                'employmentType',
                'نوع التوظيف',
                (refs.data?.employmentTypes || []).map((v: string) => [v, v]),
              ],
            ].map(([key, label, options]: any) => (
              <Field key={key} label={label}>
                <select value={filters[key] || ''} onChange={(e) => set(key, e.target.value)}>
                  <option value="">الكل</option>
                  {options.map(([v, l]: string[]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
            {[
              ['appointmentFrom', 'التعيين من', 'date'],
              ['appointmentTo', 'التعيين إلى', 'date'],
              ['graduationYear', 'سنة التخرج', 'number'],
            ].map(([key, label, type]) => (
              <Field key={key} label={label}>
                <input
                  type={type}
                  value={filters[key] || ''}
                  onChange={(e) => set(key, e.target.value)}
                />
              </Field>
            ))}
            {app.can('faculty.delete') && (
              <Field label="السجلات">
                <select
                  value={filters.deleted || ''}
                  onChange={(e) => set('deleted', e.target.value)}
                >
                  <option value="">الحالية</option>
                  <option value="true">المحذوفة</option>
                </select>
              </Field>
            )}
            <Field label="ترتيب حسب">
              <select
                value={filters.sort || 'createdAt'}
                onChange={(e) => set('sort', e.target.value)}
              >
                {[
                  ['createdAt', 'تاريخ الإضافة'],
                  ['fullName', 'الاسم'],
                  ['employeeNumber', 'الرقم الوظيفي'],
                  ['academicRank', 'الرتبة'],
                  ['graduationYear', 'سنة التخرج'],
                ].map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="اتجاه الترتيب">
              <select
                value={filters.direction || 'desc'}
                onChange={(e) => set('direction', e.target.value)}
              >
                <option value="desc">تنازلي</option>
                <option value="asc">تصاعدي</option>
              </select>
            </Field>
          </div>
        )}
        {Object.entries(filters).some(([k]) => !['page', 'pageSize'].includes(k)) && (
          <div className="filter-chips">
            {Object.entries(filters)
              .filter(([k]) => !['page', 'pageSize'].includes(k))
              .map(([k, v]) => (
                <button key={k} onClick={() => set(k, '')}>
                  {fieldLabels[k] ||
                    (
                      {
                        search: 'البحث',
                        appointmentFrom: 'التعيين من',
                        appointmentTo: 'التعيين إلى',
                        sort: 'الترتيب',
                        direction: 'الاتجاه',
                        deleted: 'المحذوفات',
                      } as Record<string, string>
                    )[k] ||
                    'المرشح'}
                  :{' '}
                  {refs.data?.colleges
                    .flatMap((c: any) => [c, ...c.departments])
                    .find((x: any) => x.id === v)?.name || v}
                  <X size={12} />
                </button>
              ))}
            <Button
              variant="ghost"
              onClick={() => {
                setSearch('');
                setSearchParams({});
              }}
            >
              مسح الكل
            </Button>
          </div>
        )}
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : (
          <>
            {q.data.items.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>عضو هيئة التدريس</th>
                      <th>الرقم الوظيفي</th>
                      <th>القسم</th>
                      <th>الرتبة / المؤهل</th>
                      <th>البريد الجامعي</th>
                      <th>الحالة</th>
                      <th>الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.items.map((f: any) => (
                      <tr key={f.id}>
                        <td>
                          <Link className="person-cell" to={`/faculty/${f.id}`}>
                            <Photo faculty={f} />
                            <strong>{f.fullName}</strong>
                          </Link>
                        </td>
                        <td dir="ltr">{f.employeeNumber}</td>
                        <td>{f.department.name}</td>
                        <td>
                          {f.academicRank}
                          <small>{f.highestQualification}</small>
                        </td>
                        <td dir="ltr">{f.email}</td>
                        <td>
                          <span className={`badge ${f.employmentStatus === 'نشط' ? 'green' : ''}`}>
                            {f.deletedAt ? 'محذوف' : f.employmentStatus}
                          </span>
                        </td>
                        <td>
                          <div className="actions">
                            {app.can('faculty.write') && !f.deletedAt && (
                              <Link aria-label={`تعديل ${f.fullName}`} to={`/faculty/${f.id}/edit`}>
                                <Pencil size={16} />
                              </Link>
                            )}
                            {app.can('faculty.delete') &&
                              (f.deletedAt ? (
                                <button
                                  aria-label="استعادة"
                                  onClick={async () => {
                                    try {
                                      await api(`/faculty/${f.id}/restore`, send('POST'));
                                      cache.invalidateQueries({ queryKey: ['faculty'] });
                                      toast('تمت الاستعادة');
                                    } catch (e) {
                                      toast((e as Error).message, true);
                                    }
                                  }}
                                >
                                  <RotateCcw size={16} />
                                </button>
                              ) : (
                                <button
                                  aria-label={`حذف ${f.fullName}`}
                                  onClick={() => setDeleting(f)}
                                >
                                  <Trash2 size={16} />
                                </button>
                              ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty text="لا توجد سجلات مطابقة" />
            )}
            <Pager
              data={q.data}
              onPage={(p) => set('page', String(p))}
              onSize={(s) => set('pageSize', String(s))}
            />
          </>
        )}
      </section>
      <Confirm
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        busy={busy}
        title="حذف عضو هيئة التدريس"
        description={`هل تريد نقل ${deleting?.fullName || ''} إلى المحذوفات؟ يمكن لمدير النظام استعادته.`}
      />
    </>
  );
}
function optionsFor(key: string, refs: any, collegeId: string) {
  switch (key) {
    case 'collegeId':
      return refs?.colleges.map((c: any) => [c.id, c.name]);
    case 'departmentId':
      return (
        refs?.colleges
          .find((c: any) => c.id === collegeId)
          ?.departments.map((d: any) => [d.id, d.name]) || []
      );
    case 'gender':
      return ['ذكر', 'أنثى'].map((v) => [v, v]);
    default:
      const name: Record<string, string> = {
        academicRank: 'ranks',
        highestQualification: 'degrees',
        employmentStatus: 'statuses',
        employmentType: 'employmentTypes',
      };
      return name[key] ? refs?.[name[key]].map((v: string) => [v, v]) : undefined;
  }
}
export function FacultyForm() {
  const { id } = useParams();
  const edit = !!id;
  const nav = useNavigate();
  const refs = useReferences();
  const q = useQuery({
    queryKey: ['faculty', id],
    queryFn: () => api(`/faculty/${id}`),
    enabled: edit,
  });
  const toast = useToast();
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [qualifications, setQualifications] = useState<any[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<any>({ defaultValues: { employmentStatus: 'نشط', employmentType: 'دائم' } });
  const { brand } = useApp();
  const collegeId = watch('collegeId');
  useEffect(() => {
    if (!edit && !collegeId) {
      const college = refs.data?.colleges.find((c: any) => c.name === brand?.collegeName);
      if (college) setValue('collegeId', college.id);
    }
  }, [edit, collegeId, refs.data, brand?.collegeName, setValue]);
  useEffect(() => {
    if (q.data) {
      const fields = Object.fromEntries(
        Object.keys(fieldLabels).map((k) => [
          k,
          k.endsWith('Date') ? q.data[k]?.slice(0, 10) || '' : (q.data[k] ?? ''),
        ]),
      );
      reset(fields);
      setQualifications(
        q.data.qualifications.map((v: any) => ({
          degree: v.degree,
          university: v.university,
          country: v.country || '',
          year: v.year || '',
        })),
      );
    }
  }, [q.data, reset]);
  async function submit(data: any) {
    setBusy(true);
    try {
      for (const [key, value] of Object.entries(data))
        if (value === '') data[key] = required.includes(key) ? '' : null;
      data.graduationYear = data.graduationYear ? Number(data.graduationYear) : null;
      data.qualifications = qualifications.map((q) => ({
        ...q,
        year: q.year ? Number(q.year) : null,
      }));
      const result = await api(
        edit ? `/faculty/${id}` : '/faculty',
        send(edit ? 'PATCH' : 'POST', data),
      );
      if (photo) {
        const fd = new FormData();
        fd.append('file', photo);
        fd.append('category', 'صورة شخصية');
        try {
          await api(`/documents/${result.id}`, send('POST', fd));
        } catch (e) {
          toast(`تم حفظ السجل، وتعذر رفع الصورة: ${(e as Error).message}`, true);
        }
      }
      cache.invalidateQueries({ queryKey: ['faculty'] });
      cache.invalidateQueries({ queryKey: ['dashboard'] });
      toast('تم حفظ بيانات عضو هيئة التدريس');
      nav(`/faculty/${result.id}`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  if (refs.isPending || (edit && q.isPending)) return <Loading />;
  if (refs.error || q.error) return <ErrorState error={refs.error || q.error} />;
  return (
    <Require permission="faculty.write">
      <div className="page-heading">
        <div>
          <Link className="back-link" to={edit ? `/faculty/${id}` : '/faculty'}>
            <ArrowRight size={16} /> العودة
          </Link>
          <h1>{edit ? 'تعديل بيانات العضو' : 'إضافة عضو هيئة تدريس'}</h1>
          <p>الحقول المميزة بنجمة مطلوبة.</p>
        </div>
      </div>
      <form onSubmit={handleSubmit(submit)}>
        {sections.map(([title, keys], index) => (
          <section className="panel" key={title}>
            <h2>
              <span className="section-number">0{index + 1}</span>
              {title}
            </h2>
            <div className="form-grid">
              {keys.map((key) => {
                const opts = optionsFor(key, refs.data, collegeId);
                return (
                  <Field
                    key={key}
                    label={`${fieldLabels[key]}${required.includes(key) ? ' *' : ''}`}
                    error={errors[key]?.message as string}
                  >
                    {opts ? (
                      <select
                        {...register(key, {
                          required: required.includes(key) ? 'هذا الحقل مطلوب' : false,
                          onChange:
                            key === 'collegeId' ? () => setValue('departmentId', '') : undefined,
                        })}
                      >
                        <option value="">اختر…</option>
                        {opts.map(([v, label]: string[]) => (
                          <option key={v} value={v}>
                            {label}
                          </option>
                        ))}
                      </select>
                    ) : key === 'researchInterests' ? (
                      <textarea {...register(key)} rows={3} />
                    ) : (
                      <input
                        dir={
                          ['email', 'mobile', 'englishName', 'employeeNumber'].includes(key)
                            ? 'auto'
                            : undefined
                        }
                        type={
                          key.endsWith('Date')
                            ? 'date'
                            : key === 'email'
                              ? 'email'
                              : key === 'graduationYear'
                                ? 'number'
                                : 'text'
                        }
                        maxLength={key === 'researchInterests' ? 2000 : 200}
                        {...register(key, {
                          required: required.includes(key) ? 'هذا الحقل مطلوب' : false,
                        })}
                      />
                    )}
                  </Field>
                );
              })}
              {index === 0 && (
                <Field label="الصورة الشخصية (اختياري · PNG/JPEG)">
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={(e) => setPhoto(e.target.files?.[0] || null)}
                  />
                </Field>
              )}
            </div>
          </section>
        ))}
        <section className="panel">
          <div className="section-heading">
            <h2>المؤهلات العلمية الإضافية</h2>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setQualifications([
                  ...qualifications,
                  { degree: '', university: '', country: '', year: '' },
                ])
              }
            >
              <Plus size={16} /> إضافة مؤهل
            </Button>
          </div>
          {qualifications.map((q, i) => (
            <div className="qualification-row" key={i}>
              {[
                ['degree', 'المؤهل'],
                ['university', 'الجامعة'],
                ['country', 'الدولة'],
                ['year', 'السنة'],
              ].map(([k, label]) => (
                <Field key={k} label={label}>
                  <input
                    required={['degree', 'university'].includes(k)}
                    type={k === 'year' ? 'number' : 'text'}
                    value={q[k] || ''}
                    onChange={(e) =>
                      setQualifications((qs) =>
                        qs.map((q, j) => (j === i ? { ...q, [k]: e.target.value } : q)),
                      )
                    }
                  />
                </Field>
              ))}
              <Button
                type="button"
                variant="ghost"
                onClick={() => setQualifications((qs) => qs.filter((_, j) => i !== j))}
              >
                <Trash2 size={18} />
              </Button>
            </div>
          ))}
        </section>
        <section className="panel">
          <h2>المستندات الداعمة</h2>
          <p>
            بعد حفظ السجل، يمكنك رفع السيرة الذاتية والشهادات وقرارات التعيين والترقية من صفحة
            المرفقات.
          </p>
        </section>
        <div className="form-footer">
          <Button disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ بيانات العضو'}</Button>
          <Link className="btn btn-outline" to="/faculty">
            إلغاء
          </Link>
        </div>
      </form>
    </Require>
  );
}
export function FacultyProfile() {
  const { id } = useParams();
  const app = useApp();
  const q = useQuery({ queryKey: ['faculty', id], queryFn: () => api(`/faculty/${id}`) });
  const [tab, setTab] = useState(0);
  const toast = useToast();
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const f = q.data;
  return (
    <>
      <Link className="back-link" to="/faculty">
        <ArrowRight size={16} /> أعضاء هيئة التدريس
      </Link>
      <section className="panel profile-header">
        <Photo faculty={f} />
        <div>
          <span className="eyebrow">الملف الأكاديمي</span>
          <h1>{f.fullName}</h1>
          <p>
            {f.academicRank} · {f.department.name} · {f.employeeNumber}
          </p>
          <span className="badge green">{f.employmentStatus}</span>
          {f.deletedAt && <span className="badge">سجل محذوف</span>}
        </div>
        <div className="actions">
          {app.can('faculty.write') && !f.deletedAt && (
            <Link className="btn btn-primary" to={`/faculty/${id}/edit`}>
              <Pencil size={17} /> تعديل
            </Link>
          )}
          {app.can('data.export') && (
            <>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await download(`/exports/profile/${id}`, 'faculty-profile.pdf');
                  } catch (e) {
                    toast((e as Error).message, true);
                  }
                }}
              >
                <Download size={16} /> PDF
              </Button>
              <Button variant="ghost" onClick={() => window.print()}>
                <Printer size={17} /> طباعة
              </Button>
            </>
          )}
        </div>
      </section>
      <div className="tabs" role="tablist">
        {[...sections.map((s) => s[0]), 'المؤهلات العلمية', 'المرفقات'].map((label, i) => (
          <button
            role="tab"
            aria-selected={tab === i}
            key={label}
            className={tab === i ? 'active' : ''}
            onClick={() => setTab(i)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab < 3 ? (
        <section className="panel">
          <h2>{sections[tab][0]}</h2>
          <dl className="details-grid">
            {sections[tab][1].map((key) => (
              <div key={key}>
                <dt>{fieldLabels[key]}</dt>
                <dd>
                  {key === 'collegeId'
                    ? f.college.name
                    : key === 'departmentId'
                      ? f.department.name
                      : key.endsWith('Date')
                        ? formatDate(f[key])
                        : f[key] || '—'}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : tab === 3 ? (
        <section className="panel">
          <h2>المؤهلات العلمية</h2>
          {f.qualifications.length ? (
            f.qualifications.map((v: any) => (
              <div className="qualification-card" key={v.id}>
                <strong>{v.degree}</strong>
                <p>
                  {v.university} · {v.country} · {v.year}
                </p>
              </div>
            ))
          ) : (
            <Empty text="لم تُضف مؤهلات إضافية" />
          )}
        </section>
      ) : (
        <Documents faculty={f} refresh={() => q.refetch()} />
      )}
    </>
  );
}
function Documents({ faculty, refresh }: { faculty: any; refresh: () => void }) {
  const app = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<any>(null);
  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    try {
      await api(`/documents/${faculty.id}`, send('POST', new FormData(form)));
      toast('تم رفع المستند');
      form.reset();
      refresh();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>المرفقات والمستندات</h2>
      {app.can('document.write') && !faculty.deletedAt && (
        <form className="upload-form" onSubmit={upload}>
          <Field label="نوع المستند">
            <select name="category">
              {[
                'السيرة الذاتية',
                'شهادة علمية',
                'قرار تعيين',
                'قرار ترقية',
                'أخرى',
                'صورة شخصية',
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="الملف · PDF أو PNG أو JPEG · حتى 10 MB">
            <input type="file" name="file" accept=".pdf,.png,.jpg,.jpeg" required />
          </Field>
          <Button disabled={busy}>
            <Upload size={16} /> رفع المستند
          </Button>
        </form>
      )}
      {faculty.documents.length ? (
        <div className="document-list">
          {faculty.documents.map((d: any) => (
            <div key={d.id}>
              <FileText />
              <div>
                <strong>{d.originalName}</strong>
                <small>
                  {d.category} · {(d.size / 1024).toFixed(0)} KB · {formatDate(d.createdAt)} ·{' '}
                  {d.uploader.fullName}
                </small>
              </div>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await download(`/documents/${d.id}`, d.originalName);
                  } catch (e) {
                    toast((e as Error).message, true);
                  }
                }}
              >
                تنزيل
              </Button>
              <a
                className="btn btn-outline"
                href={`/api/documents/${d.id}?view=true`}
                target="_blank"
                rel="noopener noreferrer"
              >
                عرض
              </a>
              {app.can('document.write') && !faculty.deletedAt && (
                <Button variant="ghost" onClick={() => setRemoving(d)} aria-label="إزالة المستند">
                  <Trash2 size={17} />
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Empty text="لا توجد مرفقات" />
      )}
      <Confirm
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="إزالة المرفق"
        description="سيُخفى المرفق مع الاحتفاظ بنسخته وفق سياسة الاحتفاظ."
        onConfirm={async () => {
          try {
            await api(`/documents/${removing.id}`, send('DELETE'));
            setRemoving(null);
            refresh();
            toast('تمت إزالة المرفق');
          } catch (e) {
            toast((e as Error).message, true);
          }
        }}
      />
    </section>
  );
}
