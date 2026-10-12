import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Star, UserRound, ChevronDown, LogOut, Settings } from 'lucide-react';
import { ThemeToggle } from '../../app/ThemeToggle';
import { useAuth } from '../../features/auth/AuthProvider';
import { SchoolDialog } from '../../features/school/SchoolDialog';
export function Layout() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function signOut() {
    setBusy(true);
    setError('');
    try {
      await auth.logout();
      navigate('/');
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'تعذر تسجيل الخروج.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <a className="skip-link" href="#main">
        انتقل إلى المحتوى
      </a>
      <header className="site-header">
        <div className="nav-shell">
          <Link className="brand" to="/" aria-label="موهوبين مجمع ثانوية قباء — الرئيسية">
            <Star className="brand-star" size={34} />
            <span>موهوبين مجمع ثانوية قباء</span>
          </Link>
          <nav className="main-nav" aria-label="التنقل الرئيسي">
            <NavLink to="/" end>
              الرئيسية
            </NavLink>
            <NavLink to="/students">الطلاب الموهوبون</NavLink>
          </nav>
          <div className="nav-actions">
            <ThemeToggle />
            <span className="nav-separator" />
            {auth.admin ? (
              <details className="account-menu">
                <summary aria-label={`حساب الإدارة: ${auth.admin.name}`}>
                  <span className="avatar-small">
                    <UserRound size={19} />
                  </span>
                  <span className="account-label">{auth.admin.name}</span>
                  <ChevronDown size={15} />
                </summary>
                <div className="dropdown">
                  <button onClick={() => setSettings(true)}>
                    <Settings size={17} />
                    إعدادات المدرسة
                  </button>
                  <button disabled={busy} onClick={() => void signOut()}>
                    <LogOut size={17} />
                    {busy ? 'جارٍ الخروج…' : 'تسجيل الخروج'}
                  </button>
                </div>
              </details>
            ) : (
              <Link className="account-link" to="/login" aria-label="تسجيل دخول الإدارة">
                <span className="avatar-small">
                  <UserRound size={19} />
                </span>
                <span>المسؤول</span>
              </Link>
            )}
          </div>
        </div>
      </header>
      {error && (
        <div role="alert" className="inline-error container">
          {error}
        </div>
      )}
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site-footer">
        <Link className="footer-brand" to="/">
          <Star size={22} />
          <strong>موهوبين مجمع ثانوية قباء</strong>
        </Link>
        <p>لكل موهبة حكاية تستحق أن تُروى.</p>
        <small>جميع الحقوق محفوظة © {new Date().getFullYear()} مجمع ثانوية قباء</small>
      </footer>
      {settings && <SchoolDialog onClose={() => setSettings(false)} />}
    </>
  );
}
