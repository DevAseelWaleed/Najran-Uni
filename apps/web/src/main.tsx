import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource/cairo/arabic-400.css';
import '@fontsource/cairo/arabic-600.css';
import '@fontsource/cairo/arabic-700.css';
import './styles.css';
import './account-menu.css';
import { ToastProvider } from './components';
import { AppProvider } from './context';
import { Landing, Login, Verify, Recovery } from './auth-pages';
import { Protected, Layout, Require } from './layout';
import { Dashboard } from './dashboard';
import { FacultyList, FacultyForm, FacultyProfile } from './faculty-pages';
import { UsersList, UserForm, UserDetails } from './user-pages';
import { ImportPage, SettingsPage } from './admin-pages';
const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
});
function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/verify-otp" element={<Verify />} />
      <Route path="/forgot-password" element={<Recovery />} />
      <Route path="/reset-password" element={<Recovery reset />} />
      <Route element={<Protected />}>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/faculty" element={<FacultyList />} />
          <Route path="/faculty/new" element={<FacultyForm />} />
          <Route path="/faculty/:id/edit" element={<FacultyForm />} />
          <Route path="/faculty/:id" element={<FacultyProfile />} />
          <Route
            path="/faculty/import"
            element={
              <Require permission="data.import">
                <ImportPage />
              </Require>
            }
          />
          <Route
            path="/users"
            element={
              <Require permission="users.manage">
                <UsersList />
              </Require>
            }
          />
          <Route
            path="/users/new"
            element={
              <Require permission="users.manage">
                <UserForm />
              </Require>
            }
          />
          <Route
            path="/users/:id/edit"
            element={
              <Require permission="users.manage">
                <UserForm />
              </Require>
            }
          />
          <Route
            path="/users/:id"
            element={
              <Require permission="users.manage">
                <UserDetails />
              </Require>
            }
          />
          <Route
            path="/settings"
            element={
              <Require permission="settings.manage">
                <SettingsPage />
              </Require>
            }
          />
        </Route>
      </Route>
      <Route
        path="*"
        element={
          <div className="state">
            <h1>404 · الصفحة غير موجودة</h1>
            <Link to="/">العودة إلى الرئيسية</Link>
          </div>
        }
      />
    </Routes>
  );
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <ToastProvider>
        <BrowserRouter>
          <AppProvider>
            <App />
          </AppProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
