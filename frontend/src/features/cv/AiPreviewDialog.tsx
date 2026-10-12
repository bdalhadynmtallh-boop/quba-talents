import { useState } from 'react';
import type { CvData } from '@quba/shared';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ResourceState } from '../../components/ui/ResourceState';
import { useResource } from '../../lib/useResource';
type Preview = Pick<CvData, 'skills' | 'achievements' | 'projects'> & {
  primaryTalent: string;
  additionalTalents: string[];
  notes: string;
  sourceHash: string;
};
export function AiPreviewDialog({
  studentId,
  onClose,
  onConfirm,
}: {
  studentId: string;
  onClose: () => void;
  onConfirm: (sourceHash: string) => Promise<void>;
}) {
  const resource = useResource<Preview>(`/students/${studentId}/cv/ai-preview`);
  const [reviewedHash, setReviewedHash] = useState('');
  const checked = !!resource.data && reviewedHash === resource.data.sourceHash;
  return (
    <ConfirmDialog
      title="مراجعة البيانات قبل الصياغة"
      message="تُرسل البيانات التالية إلى مزود الصياغة الخارجي. حُذفت الأسماء المعروفة وأرقام التواصل والبريد والروابط آليًا؛ راجع النص لإزالة أي معلومات شخصية أخرى من ملف الطالب قبل المتابعة."
      onClose={onClose}
      onConfirm={() => onConfirm(resource.data!.sourceHash)}
      disabled={!resource.data || !checked}
      confirmLabel="بدء الصياغة"
    >
      {resource.loading || resource.error ? (
        <ResourceState {...resource} onRetry={resource.reload} />
      ) : (
        resource.data && (
          <div className="pre-wrap">
            <p>
              المواهب:{' '}
              {[resource.data.primaryTalent, ...resource.data.additionalTalents].join('، ')}
            </p>
            <p>المهارات: {resource.data.skills.join('، ') || 'لا توجد'}</p>
            <p>الملاحظات: {resource.data.notes || 'لا توجد'}</p>
            {resource.data.achievements.map((a, i) => (
              <p key={i}>
                إنجاز: {a.title} {a.date}
              </p>
            ))}
            {resource.data.projects.map((p, i) => (
              <p key={i}>
                مشروع: {p.title} · {p.description} · {p.studentRole} · {p.date}
              </p>
            ))}
          </div>
        )
      )}
      <label className="check-field">
        <input
          type="checkbox"
          checked={checked}
          disabled={!resource.data}
          onChange={(e) => setReviewedHash(e.target.checked ? resource.data!.sourceHash : '')}
        />
        راجعت البيانات المرسلة وهي مناسبة للصياغة الخارجية.
      </label>
    </ConfirmDialog>
  );
}
