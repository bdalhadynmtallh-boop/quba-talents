import { useState } from 'react';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowRight, Pencil, Trash2 } from 'lucide-react';
import { gradeLabels, type StudentView } from '@quba/shared';
import { RequireAdmin } from '../features/auth/RequireAdmin';
import { StudentForm } from '../features/students/StudentForm';
import { ProfileCompletion } from '../features/students/ProfileCompletion';
import { CvPreview } from '../features/cv/CvPreview';
import { WorksPanel } from '../features/works/WorksPanel';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ResourceState } from '../components/ui/ResourceState';
import { useResource } from '../lib/useResource';
import { api } from '../lib/api';
function ProfileContent({ id }: { id: string }) {
  const resource = useResource<StudentView>(`/students/${id}`),
    navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(false),
    [deleting, setDeleting] = useState(false),
    [restoring, setRestoring] = useState(false);
  const active = params.get('tab') === 'works' ? 'works' : 'cv';
  if (resource.loading || resource.error)
    return <ResourceState {...resource} onRetry={resource.reload} />;
  const student = resource.data;
  if (!student) return null;
  return (
    <>
      <section className="profile-heading">
        <div className="student-summary">
          <div className="student-avatar blue">{student.name.charAt(0)}</div>
          <div>
            <h1>{student.name}</h1>
            <p>
              {gradeLabels[student.grade]} · الفصل {student.classroom}
            </p>
            <span className="talent-tag blue">{student.primaryTalent}</span>
            <p>
              {student.academicYearLabel} · {student.status === 'ARCHIVED' ? 'مؤرشف' : 'نشط'}
            </p>
          </div>
        </div>
        <div className="management-actions">
          {student.status === 'ARCHIVED' && (
            <button className="button" onClick={() => setRestoring(true)}>
              استعادة للسنة المفتوحة
            </button>
          )}
          <button className="button button-secondary" onClick={() => setEditing(true)}>
            <Pencil size={17} />
            تعديل الطالب
          </button>
          <button className="icon-button" aria-label="حذف الطالب" onClick={() => setDeleting(true)}>
            <Trash2 size={18} />
          </button>
        </div>
      </section>
      <ProfileCompletion student={student} />
      <div className="profile-tabs">
        <nav aria-label="تبويبات ملف الطالب">
          <button
            aria-current={active === 'cv' ? 'page' : undefined}
            onClick={() => setParams({ tab: 'cv' })}
          >
            السيرة الذاتية
          </button>
          <button
            aria-current={active === 'works' ? 'page' : undefined}
            onClick={() => setParams({ tab: 'works' })}
          >
            أعمال الطالب
          </button>
        </nav>
      </div>
      {active === 'cv' ? (
        <CvPreview studentId={id} />
      ) : (
        <WorksPanel studentId={id} works={student.works} onChanged={resource.reload} />
      )}
      <span className="sr-only" role="status">
        تم تحميل ملف {student.name}
      </span>
      {editing && (
        <Modal title="تعديل الطالب" onClose={() => setEditing(false)}>
          <StudentForm
            initial={student}
            onSave={async (input) => {
              await api(`/students/${id}`, { method: 'PUT', body: JSON.stringify(input) });
              setEditing(false);
              resource.reload();
            }}
          />
        </Modal>
      )}
      {deleting && (
        <ConfirmDialog
          title="حذف الطالب"
          message={`سيُحذف ملف ${student.name} وجميع أعماله ومرفقاته نهائيًا. هل تريد المتابعة؟`}
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            await api(`/students/${id}`, { method: 'DELETE' });
            navigate('/students');
          }}
        />
      )}
      {restoring && (
        <ConfirmDialog
          title="استعادة طالب مؤرشف"
          message={`سيعود ${student.name} نشطًا في الصف الثالث بالسنة المفتوحة الحالية. هل تريد الاستعادة؟`}
          onClose={() => setRestoring(false)}
          onConfirm={async () => {
            await api(`/students/${id}/restore`, { method: 'POST' });
            resource.reload();
          }}
        />
      )}
    </>
  );
}
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
