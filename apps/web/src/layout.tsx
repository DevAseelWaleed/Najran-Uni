import { useState } from 'react';
import { NavLink, Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  FileInput,
  Settings,
  LogOut,
  Menu,
  ChevronRight,
  ChevronLeft,
  Bell,
  ShieldCheck,
} from 'lucide-react';
import { useApp } from './context';
import { Brand } from './auth-pages';
import { Loading, ErrorState, roleLabel, Button } from './components';
import { api, send } from './api';
export function Protected() {
  const app = useApp();
  if (app.loading) return <Loading />;
  if (app.error) return <ErrorState error={app.error} retry={() => app.refresh()} />;
  return app.user ? <Outlet /> : <Navigate to="/login" replace />;
}
const navigation = [
  ['/dashboard', 'لوحة التحكم', LayoutDashboard, 'dashboard.read'],
  ['/users', 'المستخدمون', Users, 'users.manage'],
  ['/faculty', 'أعضاء هيئة التدريس', GraduationCap, 'faculty.read'],
  ['/faculty/import', 'استيراد البيانات', FileInput, 'data.import'],
  ['/settings', 'الإعدادات', Settings, 'settings.manage'],
] as const;
export function Layout() {
  const app = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const location = useLocation();
  const nav = useNavigate();
  const title = location.pathname.includes('/faculty/import')
    ? 'استيراد البيانات'
    : navigation.find(([path]) => location.pathname.startsWith(path))?.[1] || 'البوابة';
  async function logout() {
    await api('/auth/logout', send('POST'));
    await app.refresh();
    nav('/login');
  }
  return (
    <div
      className={`app-layout ${collapsed ? 'collapsed' : ''}`}
      style={{ '--primary': app.brand?.primaryColor || '#315D90' } as React.CSSProperties}
    >
      {mobile && (
        <button
          className="drawer-backdrop"
          aria-label="إغلاق القائمة"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={mobile ? 'sidebar mobile-open' : 'sidebar'}>
        <Link to="/dashboard" className="sidebar-brand">
          <Brand />
        </Link>
        <span className="nav-caption">مساحة العمل</span>
        <nav>
          {navigation
            .filter(([, , , p]) => app.can(p))
            .map(([path, label, Icon]) => (
              <NavLink
                key={path}
                to={path}
                end={path === '/faculty'}
                onClick={() => setMobile(false)}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon size={20} />
                <span>{label}</span>
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="account">
            <div className="avatar">{app.user.fullName.slice(0, 1)}</div>
            <div>
              <strong>{app.user.fullName}</strong>
              <small>{roleLabel(app.user.roleId)}</small>
            </div>
          </div>
          <button onClick={logout} className="logout">
            <LogOut size={18} />
            <span>تسجيل الخروج</span>
          </button>
        </div>
        <button
          className="collapse-btn"
          aria-label="طي القائمة"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </aside>
      <div className="workspace">
        <header className="app-header">
          <div className="actions">
            <button
              className="mobile-menu"
              aria-label="فتح القائمة"
              onClick={() => setMobile(true)}
            >
              <Menu />
            </button>
            <div>
              <small>{app.brand?.collegeName} / {title}</small>
              <strong>{title}</strong>
            </div>
          </div>
          <div className="header-user">
            <ShieldCheck size={18} />
            <span>جلسة آمنة</span>
            <details className="account-menu">
              <summary aria-label="قائمة حسابي">
                <div className="avatar">{app.user.fullName.slice(0, 1)}</div>
              </summary>
              <div className="account-popover">
                <strong>{app.user.fullName}</strong>
                <small>{roleLabel(app.user.roleId)}</small>
                <small dir="ltr">{app.user.email}</small>
                <button onClick={logout}>تسجيل الخروج</button>
              </div>
            </details>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
        <footer className="app-footer">
          {app.brand?.universityName} | {app.brand?.collegeName} · {app.brand?.systemName}
        </footer>
      </div>
    </div>
  );
}
export function Forbidden() {
  return (
    <div className="state">
      <ShieldCheck size={48} />
      <h1>403 · الوصول غير مسموح</h1>
      <p>لا تملك صلاحية فتح هذه الصفحة.</p>
      <Link className="btn btn-outline" to="/dashboard">
        العودة إلى لوحة التحكم
      </Link>
    </div>
  );
}
export function Require({
  permission,
  children,
}: {
  permission: string;
  children: React.ReactNode;
}) {
  return useApp().can(permission) ? <>{children}</> : <Forbidden />;
}
