import { useState, useRef } from 'react';
import { downloadPdf, errorMessage } from '../../lib/api';
export function BatchExport({ selected, params }: { selected: string[]; params: URLSearchParams }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const pending = useRef(false);
  async function exportCvs(selection: boolean) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    const filters = {
      search: params.get('search') ?? '',
      ...(params.get('grade') ? { grade: params.get('grade') } : {}),
      ...(params.get('talent') ? { talent: params.get('talent') } : {}),
      ...(params.get('classroomId') ? { classroomId: params.get('classroomId') } : {}),
      ...(params.get('academicYearId') ? { academicYearId: params.get('academicYearId') } : {}),
      ...(params.get('status') ? { status: params.get('status') } : {}),
      ...(params.get('approved') ? { approved: params.get('approved') } : {}),
    };
    try {
      await downloadPdf('/cv/export', 'سير-الطلاب.pdf', {
        method: 'POST',
        body: JSON.stringify(
          selection
            ? {
                studentIds: selected,
                scope: {
                  ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
                  ...(filters.status ? { status: filters.status } : {}),
                },
              }
            : { filters },
        ),
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="batch-export">
      <div className="management-actions">
        <button
          className="button button-secondary"
          disabled={busy || !selected.length}
          onClick={() => void exportCvs(true)}
        >
          تصدير المحددين ({selected.length})
        </button>
        <button
          className="button button-secondary"
          disabled={busy}
          onClick={() => void exportCvs(false)}
        >
          تصدير السير المعتمدة لنتائج التصفية
        </button>
      </div>
      <p className="form-footnote">
        حتى 20 سيرة في الدفعة. نتائج التصفية تشمل الصفحات كلها والسير المعتمدة فقط.
      </p>
      {busy && <p role="status">جارٍ تجهيز الملف المجمع…</p>}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
    </div>
  );
}
