import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Inbox, Copy } from 'lucide-react';
import {
  gradeLabels,
  type PageResult,
  type StudentView,
  type YearSettings,
  type CatalogView,
} from '@quba/shared';
import { RequireAdmin } from '../features/auth/RequireAdmin';
import { StudentCard } from '../features/students/StudentCard';
import { StudentForm } from '../features/students/StudentForm';
import { RegistrationsDialog } from '../features/registrations/RegistrationsDialog';
import { Modal } from '../components/ui/Modal';
import { ResourceState } from '../components/ui/ResourceState';
import { Pagination } from '../components/ui/Pagination';
import { StatusPanel } from '../components/ui/StatusPanel';
import { useResource } from '../lib/useResource';
import { api } from '../lib/api';
import { BatchExport } from '../features/cv/BatchExport';
import { Dashboard } from '../features/students/Dashboard';
import { notifySchoolChange } from '../features/school/AcademicYearSettings';
function StudentsContent() {
  const [params, setParams] = useSearchParams();
  const [selection, setSelection] = useState<{ scope: string; ids: string[] }>({
    scope: '',
    ids: [],
  });
  const selected = selection.scope === params.toString() ? selection.ids : [];
  const setSelected = (ids: string[]) => setSelection({ scope: params.toString(), ids });
  const resource = useResource<PageResult<StudentView>>(`/students?${params.toString()}`);
  const years = useResource<YearSettings>('/academic-years');
  const catalogs = useResource<CatalogView>('/school/catalogs');
  const { reload: reloadStudents } = resource,
    { reload: reloadYears } = years,
    { reload: reloadCatalogs } = catalogs;
  useEffect(() => {
    const update = () => {
      reloadStudents();
      reloadYears();
      reloadCatalogs();
      setSelection({ scope: '', ids: [] });
    };
    window.addEventListener('school-data-changed', update);
    return () => window.removeEventListener('school-data-changed', update);
  }, [reloadStudents, reloadYears, reloadCatalogs]);
  const [adding, setAdding] = useState(false),
    [requests, setRequests] = useState(false),
    [copyMessage, setCopyMessage] = useState('');
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${location.origin}/register`);
      setCopyMessage('تم نسخ رابط التسجيل.');
    } catch {
      setCopyMessage(`رابط التسجيل: ${location.origin}/register`);
    }
  }
  return (
    <>
      <Dashboard
        onRequests={() => setRequests(true)}
        onFilter={(key, value) => setParams({ [key]: value })}
      />
      <div className="management-actions">
        <button className="button" onClick={() => setAdding(true)}>
          <Plus size={18} />
          إضافة طالب
        </button>
        <button className="button button-secondary" onClick={() => setRequests(true)}>
          <Inbox size={18} />
          طلبات التسجيل
        </button>
        <button className="button button-secondary" onClick={() => void copy()}>
          <Copy size={17} />
          نسخ رابط التسجيل
        </button>
      </div>
      {copyMessage && (
        <p role="status" className="notice">
          {copyMessage}
        </p>
      )}
      <form
        key={params.toString()}
        className="page-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const next = new URLSearchParams();
          for (const key of [
            'search',
            'grade',
            'talent',
            'classroomId',
            'academicYearId',
            'status',
            'approved',
          ]) {
            const value = String(data.get(key) ?? '').trim();
            if (value) next.set(key, value);
          }
          setParams(next);
        }}
      >
        <div className="search-field">
          <Search size={20} />
          <input
            name="search"
            aria-label="البحث باسم الطالب"
            defaultValue={params.get('search') ?? ''}
            placeholder="ابحث باسم الطالب"
            maxLength={120}
          />
        </div>
        <select
          className="filter-select"
          name="grade"
          aria-label="تصفية بالصف"
          defaultValue={params.get('grade') ?? ''}
        >
          <option value="">كل الصفوف</option>
          {Object.entries(gradeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          name="talent"
          aria-label="تصفية بالموهبة"
          defaultValue={params.get('talent') ?? ''}
        >
          <option value="">كل المواهب</option>
          {(resource.data ?? resource.previousData)?.talents?.map((talent) => (
            <option key={talent.id} value={talent.id}>
              {talent.name}
              {!talent.active ? ' (معطلة)' : ''}
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          name="classroomId"
          aria-label="تصفية بالفصل"
          defaultValue={params.get('classroomId') ?? ''}
        >
          <option value="">كل الفصول</option>
          {catalogs.data?.classrooms.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {!c.active ? ' (معطل)' : ''}
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          name="academicYearId"
          aria-label="تصفية بالسنة"
          defaultValue={params.get('academicYearId') ?? ''}
        >
          <option value="">السنة المفتوحة</option>
          {years.data?.years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.label}
              {y.status === 'CLOSED' ? ' (مغلقة)' : ''}
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          name="status"
          aria-label="حالة الطالب"
          defaultValue={params.get('status') ?? ''}
        >
          <option value="">حسب السنة (نشط / مؤرشف)</option>
          <option value="ACTIVE">نشط</option>
          <option value="ARCHIVED">مؤرشف</option>
        </select>
        {params.get('approved') && <input type="hidden" name="approved" value="true" />}
        <button className="button" type="submit">
          بحث
        </button>
      </form>
      <BatchExport selected={selected} params={params} />
      {resource.loading || resource.error ? (
        <ResourceState {...resource} onRetry={resource.reload} />
      ) : (
        resource.data && (
          <>
            {resource.data.items.length ? (
              <div className="student-grid">
                {resource.data.items.map((student) => (
                  <div key={student.id}>
                    <label className="check-field">
                      <input
                        type="checkbox"
                        aria-label={`تحديد ${student.name} للتصدير`}
                        checked={selected.includes(student.id)}
                        disabled={!selected.includes(student.id) && selected.length >= 20}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, student.id]
                              : selected.filter((id) => id !== student.id),
                          )
                        }
                      />
                      تحديد للتصدير
                    </label>
                    <StudentCard student={student} />
                  </div>
                ))}
              </div>
            ) : (
              <StatusPanel
                title="لا توجد نتائج"
                description="أضف طالبًا جديدًا أو غيّر خيارات البحث والتصفية."
              />
            )}
            <Pagination
              {...resource.data}
              onChange={(page) => {
                const next = new URLSearchParams(params);
                next.set('page', String(page));
                setParams(next);
              }}
            />
          </>
        )
      )}
      {adding && (
        <Modal title="إضافة طالب" onClose={() => setAdding(false)}>
          <StudentForm
            onSave={async (input) => {
              await api('/students', { method: 'POST', body: JSON.stringify(input) });
              setAdding(false);
              resource.reload();
              notifySchoolChange();
            }}
          />
        </Modal>
      )}
      {requests && (
        <RegistrationsDialog
          onClose={() => {
            setRequests(false);
            notifySchoolChange();
          }}
          onApproved={() => {
            resource.reload();
            notifySchoolChange();
          }}
        />
      )}
    </>
  );
}
export function StudentsPage() {
  return (
    <div className="container page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">شغف اليوم، إبداع الغد</span>
          <h1>الطلاب الموهوبون</h1>
          <p>اكتشف مواهب طلاب ثانوية قباء</p>
        </div>
      </div>
      <RequireAdmin>
        <StudentsContent />
      </RequireAdmin>
    </div>
  );
}
