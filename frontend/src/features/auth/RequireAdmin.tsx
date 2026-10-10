import { Link } from 'react-router-dom';
import { LockKeyhole } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import { StatusPanel } from '../../components/ui/StatusPanel';
export function RequireAdmin({ children }: { children: ReactNode }) {
  const auth = useAuth();
  if (auth.status === 'loading') return <StatusPanel title="جارٍ التحقق من الجلسة…" loading />;
  if (auth.status === 'error')
    return (
      <StatusPanel
        title="تعذر الاتصال بالخادم"
        description={auth.error}
        action={
          <button className="button" onClick={() => void auth.refresh()}>
            إعادة المحاولة
          </button>
        }
      />
    );
  if (!auth.admin)
    return (
      <StatusPanel
        icon={LockKeyhole}
        title="ملفات الطلاب خاصة"
        description="يتطلب الاطلاع على ملفات الطلاب تسجيل دخول المسؤول. يمكنك التعرف على المبادرة من الصفحة الرئيسية."
        action={
          <Link className="button" to="/login">
            تسجيل دخول المسؤول
          </Link>
        }
      />
    );
  return children;
}
