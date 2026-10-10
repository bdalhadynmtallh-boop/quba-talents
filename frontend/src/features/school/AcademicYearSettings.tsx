import { useState, useRef, type FormEvent } from 'react';
import type { YearSettings } from '@quba/shared';
import { api, errorMessage } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import { ResourceState } from '../../components/ui/ResourceState';
export const notifySchoolChange = () => window.dispatchEvent(new Event('school-data-changed'));
export function AcademicYearSettings() {
  const resource = useResource<YearSettings>('/academic-years');
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const attempt = useRef<{ yearId: string; label: string; requestId: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>, rollover: boolean) {
    event.preventDefault();
    if (busy || !resource.data) return;
    const label = String(new FormData(event.currentTarget).get('label') ?? '').trim();
    setBusy(true);
    setError('');
    try {
      if (rollover) {
        if (
          !attempt.current ||
          attempt.current.yearId !== resource.data.current.id ||
          attempt.current.label !== label
        )
          attempt.current = {
            yearId: resource.data.current.id,
            label,
            requestId: crypto.randomUUID(),
          };
        await api('/academic-years/rollover', {
          method: 'POST',
          body: JSON.stringify(attempt.current),
        });
        attempt.current = null;
        setConfirm(false);
      } else
        await api('/academic-years/current', { method: 'PUT', body: JSON.stringify({ label }) });
      resource.reload();
      notifySchoolChange();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-section">
      <h3>السنة الدراسية</h3>
      {resource.loading || resource.error ? (
        <ResourceState {...resource} onRetry={resource.reload} />
      ) : (
        resource.data && (
          <>
            <form
              key={resource.data.current.id + resource.data.current.label}
              onSubmit={(e) => void submit(e, false)}
            >
              <fieldset disabled={busy}>
                <label className="field">
                  اسم السنة المفتوحة
                  <input
                    name="label"
                    defaultValue={resource.data.current.label}
                    minLength={2}
                    maxLength={40}
                    required
                  />
                </label>
                <button className="button button-secondary">حفظ اسم السنة</button>
              </fieldset>
            </form>
            <button
              type="button"
              className="button spaced"
              disabled={busy}
              onClick={() => {
                resource.reload();
                setConfirm(true);
              }}
            >
              إغلاق السنة وترحيل الطلاب
            </button>
            {confirm && (
              <form className="notice spaced" onSubmit={(e) => void submit(e, true)}>
                <fieldset disabled={busy}>
                  <h4>تأكيد إغلاق {resource.data.current.label}</h4>
                  <p>
                    أول إلى ثانٍ: {resource.data.counts.FIRST} · ثانٍ إلى ثالث:{' '}
                    {resource.data.counts.SECOND} · ثالث إلى الأرشيف: {resource.data.counts.THIRD}
                  </p>
                  <p>
                    تُحفظ ملفات المؤرشفين وأعمالهم وسيرهم ومرفقاتهم. قد تتغير الأعداد إذا عُدّلت
                    الملفات قبل التنفيذ.
                  </p>
                  <label className="field">
                    اسم السنة الجديدة
                    <input
                      name="label"
                      minLength={2}
                      maxLength={40}
                      required
                      placeholder="أدخل اسم السنة الجديدة"
                    />
                  </label>
                  <div className="dialog-actions">
                    <button className="button">
                      {busy ? 'جارٍ الترحيل…' : 'تأكيد الإغلاق والترحيل'}
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => setConfirm(false)}
                    >
                      إلغاء
                    </button>
                  </div>
                </fieldset>
              </form>
            )}
          </>
        )
      )}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
    </section>
  );
}
