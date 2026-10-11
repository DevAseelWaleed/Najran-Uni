import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Search, Pencil, ArrowRight, Mail, UserRound, ShieldCheck } from 'lucide-react';
import { api, send, params } from './api';
import {
  Button,
  Field,
  Loading,
  ErrorState,
  Empty,
  Pager,
  useToast,
  formatDate,
  roleLabel,
  Confirm,
} from './components';
const roleIds = ['SUPER_ADMIN', 'STAFF', 'VIEWER'];
export function UsersList() {
  const [sp, setSp] = useSearchParams();
  const filters = Object.fromEntries(sp);
  const [search, setSearch] = useState(filters.search || '');
  const q = useQuery({
    queryKey: ['users', filters],
    queryFn: () => api(`/users?${params(filters)}`),
  });
  function set(key: string, value: string) {
    setSp((old) => {
      const p = new URLSearchParams(old);
      value ? p.set(key, value) : p.delete(key);
      if (key !== 'page') p.set('page', '1');
      return p;
    });
  }
  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== (filters.search || '')) set('search', search);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">إدارة الوصول</div>
          <h1>المستخدمون</h1>
          <p>إدارة الحسابات والصلاحيات المؤسسية.</p>
        </div>
        <Link className="btn btn-primary" to="/users/new">
          <Plus size={17} /> إنشاء مستخدم
        </Link>
      </div>
      <section className="panel">
        <div className="table-toolbar">
          <div className="search-box">
            <Search size={18} />
            <input
              value={search}
              placeholder="البحث بالاسم أو البريد…"
              aria-label="بحث المستخدمين"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label="الدور"
            value={filters.roleId || ''}
            onChange={(e) => set('roleId', e.target.value)}
          >
            <option value="">جميع الأدوار</option>
            {roleIds.map((v) => (
              <option key={v} value={v}>
                {roleLabel(v)}
              </option>
            ))}
          </select>
          <select
            aria-label="حالة الحساب"
            value={filters.active || ''}
            onChange={(e) => set('active', e.target.value)}
          >
            <option value="">جميع الحالات</option>
            <option value="true">نشط</option>
            <option value="false">معطل</option>
          </select>
          <select
            aria-label="ترتيب المستخدمين"
            value={filters.sort || 'createdAt'}
            onChange={(e) => set('sort', e.target.value)}
          >
            <option value="createdAt">تاريخ الإنشاء</option>
            <option value="fullName">الاسم</option>
          </select>
          <select
            aria-label="اتجاه الترتيب"
            value={filters.direction || 'desc'}
            onChange={(e) => set('direction', e.target.value)}
          >
            <option value="desc">تنازلي</option>
            <option value="asc">تصاعدي</option>
          </select>
        </div>
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} />
        ) : (
          <>
            {q.data.items.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {[
                        'المستخدم',
                        'اسم المستخدم',
                        'البريد',
                        'الدور',
                        'الحالة',
                        'تاريخ الإنشاء',
                        'آخر دخول',
                        'الإجراءات',
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.items.map((u: any) => (
                      <tr key={u.id}>
                        <td>
                          <Link to={`/users/${u.id}`} className="person-cell">
                            <div className="avatar">{u.fullName[0]}</div>
                            <strong>{u.fullName}</strong>
                          </Link>
                        </td>
                        <td>{u.username}</td>
                        <td dir="ltr">{u.email}</td>
                        <td>{roleLabel(u.roleId)}</td>
                        <td>
                          <span className={`badge ${u.active ? 'green' : ''}`}>
                            {u.active ? 'نشط' : 'معطل'}
                          </span>
                        </td>
                        <td>{formatDate(u.createdAt)}</td>
                        <td>{formatDate(u.lastLogin)}</td>
                        <td>
                          <Link to={`/users/${u.id}/edit`} aria-label="تعديل المستخدم">
                            <Pencil size={17} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty />
            )}
            <Pager
              data={q.data}
              onPage={(n) => set('page', String(n))}
              onSize={(n) => set('pageSize', String(n))}
            />
          </>
        )}
      </section>
    </>
  );
}
export function UserForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const cache = useQueryClient();
  const q = useQuery({ queryKey: ['user', id], queryFn: () => api(`/users/${id}`), enabled: !!id });
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState({
    fullName: '',
    username: '',
    email: '',
    roleId: 'VIEWER',
    active: true,
  });
  useEffect(() => {
    if (q.data)
      setData({
        fullName: q.data.fullName,
        username: q.data.username,
        email: q.data.email,
        roleId: q.data.roleId,
        active: q.data.active,
      });
  }, [q.data]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await api(id ? `/users/${id}` : '/users', send(id ? 'PATCH' : 'POST', data));
      toast(
        result.invitationSent === false ? result.message : 'تم حفظ الحساب',
        result.invitationSent === false,
      );
      cache.invalidateQueries({ queryKey: ['users'] });
      cache.invalidateQueries({ queryKey: ['user'] });
      nav(`/users/${result.id}`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  if (id && q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <>
      <div className="page-heading">
        <div>
          <Link className="back-link" to="/users">
            <ArrowRight size={16} /> المستخدمون
          </Link>
          <h1>{id ? 'تعديل حساب المستخدم' : 'إنشاء حساب جديد'}</h1>
          <p>يرسل النظام رابط تهيئة آمن إلى البريد الإلكتروني.</p>
        </div>
      </div>
      <form className="panel" onSubmit={submit}>
        <div className="form-grid">
          {[
            ['fullName', 'الاسم الكامل'],
            ['username', 'اسم المستخدم'],
            ['email', 'البريد الإلكتروني'],
          ].map(([key, label]) => (
            <Field key={key} label={`${label} *`}>
              <input
                type={key === 'email' ? 'email' : 'text'}
                required
                maxLength={200}
                pattern={key === 'username' ? '[a-zA-Z0-9_.-]{3,50}' : undefined}
                value={(data as any)[key]}
                onChange={(e) => setData({ ...data, [key]: e.target.value })}
              />
            </Field>
          ))}
          <Field label="الدور *">
            <select
              value={data.roleId}
              onChange={(e) => setData({ ...data, roleId: e.target.value })}
            >
              {roleIds.map((v) => (
                <option value={v} key={v}>
                  {roleLabel(v)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="حالة الحساب">
            <select
              value={String(data.active)}
              onChange={(e) => setData({ ...data, active: e.target.value === 'true' })}
            >
              <option value="true">نشط</option>
              <option value="false">معطل</option>
            </select>
          </Field>
        </div>
        <div className="form-footer">
          <Button disabled={busy}>حفظ الحساب</Button>
          <Link className="btn btn-outline" to="/users">
            إلغاء
          </Link>
        </div>
      </form>
    </>
  );
}
export function UserDetails() {
  const { id } = useParams();
  const toast = useToast();
  const q = useQuery({ queryKey: ['user', id], queryFn: () => api(`/users/${id}`) });
  const [confirm, setConfirm] = useState(false);
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const u = q.data;
  return (
    <>
      <Link className="back-link" to="/users">
        <ArrowRight size={16} /> المستخدمون
      </Link>
      <section className="panel">
        <div className="page-heading">
          <div>
            <UserRound size={36} />
            <h1>{u.fullName}</h1>
            <p>
              {roleLabel(u.roleId)} · {u.active ? 'حساب نشط' : 'حساب معطل'}
            </p>
          </div>
          <Link className="btn btn-primary" to={`/users/${id}/edit`}>
            <Pencil size={16} /> تعديل
          </Link>
        </div>
        <dl className="details-grid">
          {[
            ['اسم المستخدم', u.username],
            ['البريد', u.email],
            ['تاريخ الإنشاء', formatDate(u.createdAt)],
            ['آخر دخول', formatDate(u.lastLogin)],
          ].map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="actions">
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await api(`/users/${id}/reset`, send('POST'));
                toast('تم إرسال رابط التهيئة');
              } catch (e) {
                toast((e as Error).message, true);
              }
            }}
          >
            <Mail size={17} /> إرسال رابط تهيئة كلمة المرور
          </Button>
          <Button variant="ghost" onClick={() => setConfirm(true)}>
            <ShieldCheck size={17} />
            {u.active ? 'تعطيل الحساب' : 'إعادة تفعيل الحساب'}
          </Button>
        </div>
      </section>
      <Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        description={
          u.active ? 'هل تريد تعطيل الحساب وإنهاء جلساته؟' : 'هل تريد إعادة تفعيل الحساب؟'
        }
        onConfirm={async () => {
          try {
            await api(
              `/users/${id}`,
              send('PATCH', {
                fullName: u.fullName,
                username: u.username,
                email: u.email,
                roleId: u.roleId,
                active: !u.active,
              }),
            );
            setConfirm(false);
            q.refetch();
            toast('تم تحديث حالة الحساب');
          } catch (e) {
            toast((e as Error).message, true);
          }
        }}
      />
    </>
  );
}
