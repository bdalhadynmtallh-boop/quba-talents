import { useState, useRef, type FormEvent } from 'react';
import { schoolSchema, FILE_LIMIT, type SchoolView } from '@quba/shared';
import { Modal } from '../../components/ui/Modal';
import { ResourceState } from '../../components/ui/ResourceState';
import { api, errorMessage } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import { SupervisorFields } from './SupervisorFields';
function SchoolForm({ initial, onSaved }: { initial: SchoolView; onSaved: () => void }) {
  const [supervisors, setSupervisors] = useState(initial.supervisors),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const submitting = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    const input = schoolSchema.safeParse({ name: form.get('name'), supervisors });
    const logo = form.get('logo');
    if (!input.success) {
      setError('تحقق من اسم المدرسة وأسماء المشرفين ومسمياتهم.');
      return;
    }
    if (logo instanceof File && logo.size > FILE_LIMIT) {
      setError('حجم الشعار يجب ألا يتجاوز 10 ميغابايت.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError('');
    let saved = false;
    try {
      await api('/school', { method: 'PUT', body: JSON.stringify(input.data) });
      saved = true;
      if (logo instanceof File && logo.size) {
        const upload = new FormData();
        upload.append('files', logo);
        await api('/school/logo', { method: 'POST', body: upload });
      } else if (form.get('removeLogo')) await api('/school/logo', { method: 'DELETE' });
      onSaved();
    } catch (error) {
      setError((saved ? 'حُفظت الإعدادات، لكن لم يكتمل تعديل الشعار. ' : '') + errorMessage(error));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <form onSubmit={(event) => void submit(event)}>
      <fieldset disabled={busy}>
        <label className="field">
          اسم المدرسة
          <input name="name" defaultValue={initial.name} minLength={2} maxLength={150} required />
        </label>
        {initial.hasLogo && (
          <>
            <img
              className="school-logo large"
              src={`/api/school/logo?v=${encodeURIComponent(initial.updatedAt)}`}
              alt="الشعار الحالي"
            />
            <label className="check-field">
              <input type="checkbox" name="removeLogo" />
              حذف الشعار الحالي عند الحفظ
            </label>
          </>
        )}
        <label className="field">
          الشعار (اختياري)
          <input name="logo" type="file" accept="image/jpeg,image/png,image/webp" />
        </label>
        <h3 className="form-section-title">المشرفون وترتيب أسمائهم</h3>
        <p className="form-footnote">
          الأسماء التجريبية قابلة للاستبدال بالأسماء الحقيقية. يمكن تخصيص مشرفين من ملف الطالب.
        </p>
        <SupervisorFields value={supervisors} onChange={setSupervisors} />
      </fieldset>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <button className="button full spaced" disabled={busy} type="submit">
        {busy ? 'جارٍ الحفظ…' : 'حفظ الإعدادات'}
      </button>
    </form>
  );
}
export function SchoolDialog({ onClose }: { onClose: () => void }) {
  const resource = useResource<SchoolView>('/school');
  return (
    <Modal title="إعدادات المدرسة" onClose={onClose}>
      {resource.loading || resource.error ? (
        <ResourceState {...resource} onRetry={resource.reload} />
      ) : (
        resource.data && <SchoolForm initial={resource.data} onSaved={onClose} />
      )}
    </Modal>
  );
}
