import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Inbox, Copy } from 'lucide-react';
import { type PageResult, type StudentView, type YearSettings } from '@quba/shared';
import { StudentCard } from './StudentCard';
import { StudentForm } from './StudentForm';
import { RegistrationsDialog } from '../registrations/RegistrationsDialog';
import { Modal } from '../../components/ui/Modal';
import { ResourceState } from '../../components/ui/ResourceState';
import { Pagination } from '../../components/ui/Pagination';
import { StatusPanel } from '../../components/ui/StatusPanel';
import { useResource } from '../../lib/useResource';
import { api } from '../../lib/api';
import { BatchExport } from '../cv/BatchExport';
import { Dashboard } from './Dashboard';
import { notifySchoolChange } from '../../lib/events';
export function StudentsContent() {
  const [params, setParams] = useSearchParams();
  const [selection, setSelection] = useState<{ scope: string; ids: string[] }>({
    scope: '',
    ids: [],
  });
  const selected = selection.scope === params.toString() ? selection.ids : [];
  const setSelected = (ids: string[]) => setSelection({ scope: params.toString(), ids });
  const resource = useResource<PageResult<StudentView>>(`/students?${params.toString()}`);
  const years = useResource<YearSettings>('/academic-years');
  const { reload: reloadStudents } = resource,
    { reload: reloadYears } = years;
  useEffect(() => {
    const update = () => {
      reloadStudents();
      reloadYears();
      setSelection({ scope: '', ids: [] });
    };
    window.addEventListener('school-data-changed', update);
    return () => window.removeEventListener('school-data-changed', update);
  }, [reloadStudents, reloadYears]);
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
          const next = new URLSearchParams(params);
          next.delete('page');
          const search = String(data.get('search') ?? '').trim();
          if (search) next.set('search', search);
          else next.delete('search');
          const academicYearId = String(data.get('academicYearId') ?? '');
          if (academicYearId) next.set('academicYearId', academicYearId);
          else next.delete('academicYearId');
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
          name="academicYearId"
          aria-label="تصفية بالسنة"
          defaultValue={params.get('academicYearId') ?? ''}
        >
          <option value="">السنة المفتوحة</option>
          {years.data?.years.map((year) => (
            <option key={year.id} value={year.id}>
              {year.label}
              {year.status === 'CLOSED' ? ' (مغلقة)' : ''}
            </option>
          ))}
        </select>
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
                description="أضف طالبًا جديدًا أو غيّر اسم البحث."
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
