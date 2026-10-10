import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { LockKeyhole, ArrowLeft, LoaderCircle } from 'lucide-react';
import { useAuth } from '../features/auth/AuthProvider';
export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (auth.admin) return <Navigate to="/students" replace />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await auth.login({
        email: String(form.get('email')),
        password: String(form.get('password')),
      });
      navigate('/students', { replace: true });
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'تعذر تسجيل الدخول.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container page narrow login-page">
      <div className="center-heading">
        <span className="feature-icon">
          <LockKeyhole />
        </span>
        <h1>أهلًا بك، مشرف المواهب</h1>
        <p>سجّل الدخول للوصول إلى مساحة الطلاب.</p>
      </div>
      <form className="form-card login-form" onSubmit={(event) => void submit(event)}>
        <label className="field">
          البريد الإلكتروني
          <input
            name="email"
            type="email"
            dir="ltr"
            autoComplete="username"
            maxLength={254}
            placeholder="admin@example.com"
            required
          />
        </label>
        <label className="field">
          كلمة المرور
          <input
            name="password"
            type="password"
            dir="ltr"
            autoComplete="current-password"
            maxLength={256}
            placeholder="••••••••••••"
            required
          />
        </label>
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <button className="button full" disabled={busy} type="submit">
          {busy ? (
            <>
              <LoaderCircle className="spin" size={19} />
              جارٍ تسجيل الدخول…
            </>
          ) : (
            <>
              تسجيل الدخول
              <ArrowLeft size={19} />
            </>
          )}
        </button>
        <p className="form-footnote">هذه المساحة مخصصة لمسؤولي المدرسة.</p>
      </form>
    </div>
  );
}
