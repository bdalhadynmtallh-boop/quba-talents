import { useState, useRef, type FormEvent } from 'react';
import { registrationSchema, gradeLabels } from '@quba/shared';
import { CheckCircle2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { StatusPanel } from '../../components/ui/StatusPanel';
import { CatalogFields } from '../school/CatalogFields';
export function RegistrationForm() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(false);
  const submitting = useRef(false);
  const [available, setAvailable] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    const input = registrationSchema.safeParse({
      ...Object.fromEntries(form),
      additionalTalentIds: form.getAll('additionalTalentIds'),
    });
    if (!input.success) {
      setError('تحقق من البيانات المطلوبة واكتب وصفًا من 10 أحرف على الأقل.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      await api('/registrations', { method: 'POST', body: JSON.stringify(input.data) });
      setSuccess(true);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  if (success)
    return (
      <StatusPanel
        icon={CheckCircle2}
        title="وصلت موهبتك إلينا!"
        description="تم إرسال طلبك بنجاح. سيقوم مسؤول المدرسة بمراجعته. لا تحتاج إلى إنشاء حساب."
      />
    );
  return (
    <form className="registration-form" onSubmit={(event) => void submit(event)}>
      <fieldset disabled={busy}>
        <label className="field">
          اسم الطالب
          <input
            name="name"
            placeholder="الاسم الكامل"
            autoComplete="name"
            minLength={2}
            maxLength={120}
            required
          />
        </label>
        <div className="form-row">
          <label className="field">
            الصف
            <select aria-label="الصف" name="grade" required defaultValue="">
              <option value="" disabled>
                اختر الصف
              </option>
              {Object.entries(gradeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <CatalogFields publicForm onAvailability={setAvailable} />
        <label className="field">
          وصف مختصر للموهبة
          <textarea
            name="description"
            placeholder="حدّثنا عن شغفك وأبرز أعمالك…"
            rows={4}
            minLength={10}
            maxLength={1000}
            required
          />
        </label>
        <button className="button full" type="submit" disabled={!available}>
          {busy ? 'جارٍ إرسال الطلب…' : 'إرسال طلب التسجيل'}
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
    </form>
  );
}
