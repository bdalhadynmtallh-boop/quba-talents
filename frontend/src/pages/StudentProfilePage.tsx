import { Link, useParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { RequireAdmin } from '../features/auth/RequireAdmin';
import { ProfileContent } from '../features/students/ProfileContent';

export function StudentProfilePage() {
  const { id } = useParams();
  return (
    <div className="container page">
      <Link className="back-link" to="/students">
        <ArrowRight size={17} />
        العودة إلى الطلاب
      </Link>
      <RequireAdmin>
        <ProfileContent id={id ?? ''} />
      </RequireAdmin>
    </div>
  );
}
