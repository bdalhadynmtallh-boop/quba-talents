import { RequireAdmin } from '../features/auth/RequireAdmin';
import { StudentsContent } from '../features/students/StudentsContent';

export function StudentsPage() {
  return (
    <div className="container page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">شغف اليوم، إبداع الغد</span>
          <h1>الطلاب الموهوبون</h1>
          <p>اكتشف مواهب طلاب مجمع ثانوية قباء</p>
        </div>
      </div>
      <RequireAdmin>
        <StudentsContent />
      </RequireAdmin>
    </div>
  );
}
