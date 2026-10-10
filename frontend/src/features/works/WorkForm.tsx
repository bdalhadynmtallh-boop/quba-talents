import { useState, useRef, type FormEvent } from 'react';
import { workSchema, FILE_LIMIT, MAX_ATTACHMENTS, type WorkView } from '@quba/shared';
import { api, errorMessage } from '../../lib/api';
export function WorkForm({
  studentId,
  initial,
  onSaved,
}: {
  studentId: string;
  initial?: WorkView;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const submitting = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    const files = form
      .getAll('files')
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);
    const parsed = workSchema.safeParse({
      title: form.get('title'),
      description: form.get('description'),
      date: String(form.get('date') ?? '') || null,
      studentRole: form.get('studentRole'),
      url: String(form.get('url') ?? ''),
    });
    if (!parsed.success) {
      setError('تحقق من العنوان والتاريخ والرابط. يُقبل http وhttps فقط.');
      return;
    }
    if (
      files.length + (initial?.attachments.length ?? 0) > MAX_ATTACHMENTS ||
      files.some((file) => file.size > FILE_LIMIT)
    ) {
      setError('الحد الأقصى 6 مرفقات لكل عمل و10 ميغابايت لكل ملف.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError('');
    let metadataSaved = false;
    try {
      const base = `/students/${studentId}/works`;
      if (initial) {
        await api(`${base}/${initial.id}`, { method: 'PUT', body: JSON.stringify(parsed.data) });
        metadataSaved = true;
        if (files.length) {
          const upload = new FormData();
          files.forEach((file) => upload.append('files', file));
          await api(`${base}/${initial.id}/attachments`, { method: 'POST', body: upload });
        }
      } else {
        const upload = new FormData();
        upload.append('data', JSON.stringify(parsed.data));
        files.forEach((file) => upload.append('files', file));
        await api(base, { method: 'POST', body: upload });
      }
      onSaved();
    } catch (error) {
      setError(
        (metadataSaved ? 'حُفظت بيانات العمل، لكن لم تكتمل إضافة المرفقات. ' : '') +
          errorMessage(error),
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <form onSubmit={(event) => void submit(event)}>
      <fieldset disabled={busy}>
        <label className="field">
          عنوان العمل
          <input
            name="title"
            defaultValue={initial?.title}
            required
            minLength={2}
            maxLength={150}
          />
        </label>
        <label className="field">
          وصف العمل
          <textarea
            name="description"
            defaultValue={initial?.description}
            rows={4}
            maxLength={3000}
          />
        </label>
        <label className="field">
          دور الطالب في العمل
          <textarea
            name="studentRole"
            defaultValue={initial?.studentRole}
            rows={2}
            maxLength={500}
            placeholder="مثال: تطوير الواجهة ضمن فريق المشروع"
          />
        </label>
        <label className="field">
          التاريخ (اختياري)
          <input name="date" type="date" defaultValue={initial?.date ?? ''} />
        </label>
        <label className="field">
          رابط العمل أو المقطع (اختياري)
          <input
            name="url"
            type="url"
            dir="ltr"
            defaultValue={initial?.url}
            maxLength={2048}
            placeholder="https://"
          />
        </label>
        <label className="field">
          المرفقات
          <input
            name="files"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
          />
        </label>
        <p className="form-footnote">
          صور JPEG وPNG وWebP أو PDF. حتى 6 مرفقات و10 ميغابايت لكل ملف. الروابط للمقاطع بدل رفع
          الفيديو.
        </p>
      </fieldset>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <button className="button full spaced" disabled={busy} type="submit">
        {busy ? 'جارٍ الحفظ والرفع…' : 'حفظ العمل'}
      </button>
    </form>
  );
}
