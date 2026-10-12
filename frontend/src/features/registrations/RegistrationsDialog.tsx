import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  gradeLabels,
  type PageResult,
  type RegistrationView,
  type YearSettings,
} from '@quba/shared';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ResourceState } from '../../components/ui/ResourceState';
import { Pagination } from '../../components/ui/Pagination';
import { StatusPanel } from '../../components/ui/StatusPanel';
import { useResource } from '../../lib/useResource';
import { api } from '../../lib/api';
import { StudentForm } from '../students/StudentForm';
export function RegistrationsDialog({
  onClose,
  onApproved,
}: {
  onClose: () => void;
  onApproved: () => void;
}) {
  const [page, setPage] = useState(1),
    [status, setStatus] = useState('PENDING'),
    [review, setReview] = useState<RegistrationView | null>(null),
    [reject, setReject] = useState<RegistrationView | null>(null);
  const [placementConfirmed, setPlacementConfirmed] = useState(false);
  const years = useResource<YearSettings>('/academic-years');
  const resource = useResource<PageResult<RegistrationView>>(
    `/registrations?page=${page}&status=${status}`,
  );
  return (
    <Modal title={review ? 'مراجعة طلب التسجيل' : 'طلبات التسجيل'} onClose={onClose}>
      {review ? (
        <>
          <p className="notice">راجع بيانات الطالب وعدّلها قبل الاعتماد.</p>
          {review.requiresAcademicConfirmation && (
            <label className="check-field">
              <input
                type="checkbox"
                checked={placementConfirmed}
                onChange={(e) => setPlacementConfirmed(e.target.checked)}
              />
              راجعت الصف وأؤكد إلحاق الطالب بالسنة الحالية {years.data?.current.label}. سنة تقديم
              الطلب: {review.academicYearLabel ?? 'غير محددة'}
            </label>
          )}
          <StudentForm
            initial={{
              name: review.name,
              phoneNumber: review.phoneNumber,
              grade: review.grade,
              classroom: review.classroom,
              primaryTalent: review.primaryTalent,
              notes: review.description,
              additionalTalents: review.additionalTalents,
              skills: [],
              achievements: [],
              supervisorOverrides: null,
            }}
            submitLabel="قبول الطلب وإضافة الطالب"
            onSave={async (input) => {
              if (!years.data || (review.requiresAcademicConfirmation && !placementConfirmed))
                throw new Error('أكد الصف والسنة الحالية قبل القبول.');
              await api(`/registrations/${review.id}/approve`, {
                method: 'POST',
                body: JSON.stringify({
                  student: input,
                  targetAcademicYearId: years.data.current.id,
                  confirmAcademicPlacement: placementConfirmed,
                }),
              });
              setReview(null);
              resource.reload();
              onApproved();
            }}
          />
          <button className="button button-secondary full spaced" onClick={() => setReview(null)}>
            العودة إلى الطلبات
          </button>
        </>
      ) : (
        <>
          <label className="field">
            حالة الطلب
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="PENDING">بانتظار المراجعة</option>
              <option value="APPROVED">معتمدة</option>
              <option value="REJECTED">مرفوضة</option>
            </select>
          </label>
          {resource.loading || resource.error ? (
            <ResourceState {...resource} onRetry={resource.reload} />
          ) : (
            resource.data && (
              <>
                {resource.data.items.length ? (
                  resource.data.items.map((item) => (
                    <article className="registration-card" key={item.id}>
                      <h3>{item.name}</h3>
                      <p className="muted">
                        {gradeLabels[item.grade]} · {item.classroom} · {item.primaryTalent}
                      </p>
                      {item.phoneNumber && (
                        <p>
                          رقم الجوال: <bdi dir="ltr">{item.phoneNumber}</bdi>
                        </p>
                      )}
                      <p className="pre-wrap">{item.description}</p>
                      <small>{new Date(item.createdAt).toLocaleDateString('ar-SA')}</small>
                      <p className="muted">
                        سنة الطلب: {item.academicYearLabel ?? 'غير محددة — تحتاج مراجعة'}
                      </p>
                      {item.similarRequestCount > 0 && (
                        <p className="notice">
                          يوجد {item.similarRequestCount} طلب مشابه في الاسم أو رقم التواصل. راجعها؛
                          التشابه لا يعني أنها للطالب نفسه.
                        </p>
                      )}
                      {item.status === 'APPROVED' && !item.studentId && (
                        <p className="notice">
                          سجل قبول سابق؛ الطالب المرتبط غير موجود حاليًا.
                          {item.studentDeletedAt
                            ? ` حُذف بتاريخ ${new Date(item.studentDeletedAt).toLocaleDateString('ar-SA')}.`
                            : ''}
                        </p>
                      )}
                      {item.status === 'PENDING' ? (
                        <div className="dialog-actions">
                          <button
                            className="button"
                            onClick={() => {
                              setPlacementConfirmed(false);
                              setReview(item);
                            }}
                          >
                            مراجعة وقبول
                          </button>
                          <button
                            className="button button-secondary"
                            onClick={() => setReject(item)}
                          >
                            رفض الطلب
                          </button>
                        </div>
                      ) : (
                        item.studentId && (
                          <Link
                            className="back-link"
                            to={`/students/${item.studentId}`}
                            onClick={onClose}
                          >
                            عرض الطالب
                          </Link>
                        )
                      )}
                    </article>
                  ))
                ) : (
                  <StatusPanel title="لا توجد طلبات بهذه الحالة" />
                )}
                <Pagination {...resource.data} onChange={setPage} />
              </>
            )
          )}
        </>
      )}
      {reject && (
        <ConfirmDialog
          title="رفض طلب التسجيل"
          message={`هل تريد رفض طلب ${reject.name}؟`}
          onClose={() => setReject(null)}
          onConfirm={async () => {
            await api(`/registrations/${reject.id}/reject`, { method: 'POST' });
            resource.reload();
          }}
        />
      )}
    </Modal>
  );
}
