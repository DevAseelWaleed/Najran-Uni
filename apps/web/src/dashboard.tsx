import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  GraduationCap,
  UserCheck,
  Users,
  Building2,
  ArrowUpLeft,
  Plus,
  Clock3,
} from 'lucide-react';
import { api } from './api';
import { useApp } from './context';
import { Loading, ErrorState, Empty, formatDate, actionLabel } from './components';
export function Dashboard() {
  const app = useApp();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api('/dashboard') });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = q.data;
  const cards = [
    ['إجمالي أعضاء هيئة التدريس', d.totalFaculty, GraduationCap],
    ['الأعضاء النشطون', d.activeFaculty, UserCheck],
    ['عدد الأقسام', d.totalDepartments, Building2],
    ['أعضاء جدد خلال 30 يومًا', d.recentFacultyCount, Clock3],
    ...(d.totalUsers !== null
      ? [
          ['حسابات المستخدمين', d.totalUsers, Users],
          ['الحسابات النشطة', d.activeUsers, UserCheck],
        ]
      : []),
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">نظرة عامة</div>
          <h1>مرحبًا، {app.user.fullName.split(' ')[0]}</h1>
          <p>{app.brand?.universityName} | {app.brand?.collegeName}</p>
        </div>
        {app.can('faculty.write') && (
          <Link className="btn btn-primary" to="/faculty/new">
            <Plus size={18} /> إضافة عضو
          </Link>
        )}
      </div>
      <div className="welcome-banner">
        <div>
          <span>{app.brand?.systemName}</span>
          <h2>بيانات منظّمة، قرارات أوضح.</h2>
          <p>سجل موحّد للمعلومات الأكاديمية والوظيفية.</p>
        </div>
        <GraduationCap size={96} strokeWidth={1} />
      </div>
      <div className="stats-grid">
        {cards.map(([label, value, Icon]: any) => (
          <div className="stat-card" key={label}>
            <div className="stat-top">
              <span>{label}</span>
              <Icon size={22} />
            </div>
            <strong>{Number(value).toLocaleString('ar-SA')}</strong>
            <small>من السجلات الحالية</small>
          </div>
        ))}
      </div>
      <div className="chart-grid">
        {[
          ['academicRank', 'التوزيع حسب الرتبة العلمية'],
          ['highestQualification', 'المؤهلات العلمية'],
          ['employmentStatus', 'الحالة الوظيفية'],
          ['department', 'التوزيع حسب القسم'],
        ].map(([key, title]) => (
          <section className="panel" key={key}>
            <h2>{title}</h2>
            {d.distributions[key].length ? (
              <div className="bar-chart">
                {d.distributions[key].map((r: any) => {
                  const label = r[key] || r.name;
                  return (
                    <div className="chart-row" key={label}>
                      <div>
                        <span>{label}</span>
                        <b>{r._count}</b>
                      </div>
                      <div className="bar-track">
                        <span
                          style={{
                            width: `${d.totalFaculty ? (r._count / d.totalFaculty) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty text="لا توجد بيانات لعرض المؤشر" />
            )}
          </section>
        ))}
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>أحدث أعضاء هيئة التدريس</h2>
          <Link to="/faculty">
            عرض الكل <ArrowUpLeft size={16} />
          </Link>
        </div>
        {d.recentFaculty.length ? (
          <div className="recent-list">
            {d.recentFaculty.map((f: any) => (
              <Link key={f.id} to={`/faculty/${f.id}`}>
                <div className="avatar">{f.fullName[0]}</div>
                <div>
                  <strong>{f.fullName}</strong>
                  <small>
                    {f.department.name} · {f.academicRank}
                  </small>
                </div>
                <span>{formatDate(f.createdAt)}</span>
              </Link>
            ))}
          </div>
        ) : (
          <Empty />
        )}
      </section>
      {d.activity.length > 0 && (
        <section className="panel">
          <h2>النشاط الأخير</h2>
          {d.activity.map((a: any) => (
            <div className="activity" key={a.id}>
              <Clock3 size={18} />
              <span>
                {a.actor?.fullName || 'النظام'} · {actionLabel(a.action)}
              </span>
              <small>{formatDate(a.createdAt)}</small>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
