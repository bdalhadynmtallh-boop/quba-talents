import type { DashboardView } from '@quba/shared';
import { gradeLabels } from '@quba/shared';
import { ResourceState } from '../../components/ui/ResourceState';
import { useResource } from '../../lib/useResource';
import { useEffect } from 'react';
export function Dashboard({
  onRequests,
  onFilter,
}: {
  onRequests: () => void;
  onFilter: (key: string, value: string) => void;
}) {
  const resource = useResource<DashboardView>('/dashboard');
  const { reload } = resource;
  useEffect(() => {
    const update = () => reload();
    window.addEventListener('school-data-changed', update);
    return () => window.removeEventListener('school-data-changed', update);
  }, [reload]);
  if (resource.loading || resource.error)
    return <ResourceState {...resource} onRetry={resource.reload} />;
  if (!resource.data) return null;
  const data = resource.data;
  return (
    <section className="dashboard" aria-label="لوحة المسؤول">
      <h2>السنة المفتوحة: {data.academicYear.label}</h2>
      <p className="muted">
        الأرقام للطلاب النشطين في السنة المفتوحة فقط. الطلبات المعلّقة تشمل الطلبات السابقة التي لم
        تُراجع.
      </p>
      <div className="dashboard-grid">
        <button className="dashboard-card" onClick={onRequests}>
          <strong>{data.pendingRequests}</strong>
          <span>طلبات بانتظار المراجعة</span>
        </button>
        <button className="dashboard-card" onClick={() => onFilter('approved', 'true')}>
          <strong>{data.approvedCvs}</strong>
          <span>سير معتمدة</span>
        </button>
        {(Object.keys(gradeLabels) as Array<keyof typeof gradeLabels>).map((grade) => (
          <button className="dashboard-card" key={grade} onClick={() => onFilter('grade', grade)}>
            <strong>{data.grades[grade]}</strong>
            <span>{gradeLabels[grade]}</span>
          </button>
        ))}
        {data.talents.map((t) => (
          <button className="dashboard-card" key={t.id} onClick={() => onFilter('talent', t.id)}>
            <strong>{t.count}</strong>
            <span>{t.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
