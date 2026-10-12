import { useState, useRef, type FormEvent } from 'react';
import { namedRegistrationSchema, gradeLabels } from '@quba/shared';
import { CheckCircle2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { StatusPanel } from '../../components/ui/StatusPanel';
import { TalentEntryFields } from '../school/TalentEntryFields';
export function RegistrationForm() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(false);
  const submitting = useRef(false);
  const attemptRef = useRef<{ digest: string; key: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    const input = namedRegistrationSchema.safeParse({
      ...Object.fromEntries(form),
      additionalTalents: String(form.get('additionalTalents') ?? '')
        .split('\n')
        .map((name) => name.trim())
        .filter(Boolean),
    });
    if (!input.success) {
      setError(
        input.error.issues.find((issue) => issue.path[0] === 'phoneNumber')?.message ??
          'تحقق من الحقول المطلوبة، ولا تكرر المواهب أو تتجاوز 10 مواهب إضافية. اكتب وصفًا من 10 أحرف على الأقل.',
      );
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const body = JSON.stringify(input.data);
      const digest = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))),
        (n) => n.toString(16).padStart(2, '0'),
      ).join('');
      let attempt = attemptRef.current;
      if (!attempt)
        try {
          attempt = JSON.parse(sessionStorage.getItem('quba-registration-attempt') ?? 'null');
        } catch {
          /* A restricted browser can still retry during this page session. */
        }
      if (!attempt || attempt.digest !== digest) attempt = { digest, key: crypto.randomUUID() };
      attemptRef.current = attempt;
      try {
        sessionStorage.setItem('quba-registration-attempt', JSON.stringify(attempt));
      } catch {
        /* Storage is optional. */
      }
      await api('/registrations', {
        method: 'POST',
        headers: { 'Idempotency-Key': attempt.key },
        body,
      });
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
        <label className="field">
          رقم الجوال
          <input
            type="tel"
            name="phoneNumber"
            placeholder="05xxxxxxxx"
            autoComplete="tel"
            inputMode="tel"
            dir="ltr"
            maxLength={40}
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
        <TalentEntryFields />
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
        <button className="button full" type="submit">
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
