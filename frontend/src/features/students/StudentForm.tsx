import { useRef, useState, type FormEvent } from 'react';
import { studentSchema, gradeLabels, type StudentInput } from '@quba/shared';
import { Plus, X } from 'lucide-react';
import { errorMessage } from '../../lib/api';
import { SupervisorFields } from '../school/SupervisorFields';
import { CatalogFields } from '../school/CatalogFields';
const empty: StudentInput = {
  name: '',
  grade: 'FIRST',
  classroomId: '',
  primaryTalentId: '',
  additionalTalentIds: [],
  skills: [],
  achievements: [],
  notes: '',
  supervisorOverrides: null,
};
const lines = (value: FormDataEntryValue | null) =>
  String(value ?? '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
export function StudentForm({
  initial,
  onSave,
  submitLabel = 'حفظ الطالب',
}: {
  initial?: StudentInput;
  onSave: (value: StudentInput) => Promise<void>;
  submitLabel?: string;
}) {
  const input = initial ?? empty;
  const [achievements, setAchievements] = useState(input.achievements),
    [overrides, setOverrides] = useState(input.supervisorOverrides),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const submitting = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const data = new FormData(event.currentTarget);
    const parsed = studentSchema.safeParse({
      name: data.get('name'),
      grade: data.get('grade'),
      classroomId: data.get('classroomId'),
      primaryTalentId: data.get('primaryTalentId'),
      additionalTalentIds: data.getAll('additionalTalentIds'),
      skills: lines(data.get('skills')),
      achievements,
      notes: String(data.get('notes') ?? ''),
      supervisorOverrides: overrides,
    });
    if (!parsed.success) {
      setError('تحقق من الحقول المطلوبة وحدود النصوص.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      await onSave(parsed.data);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <form onSubmit={(event) => void submit(event)}>
      <fieldset disabled={busy}>
        <label className="field">
          اسم الطالب
          <input name="name" defaultValue={input.name} required minLength={2} maxLength={120} />
        </label>
        <div className="form-row">
          <label className="field">
            الصف
            <select aria-label="الصف" name="grade" defaultValue={input.grade}>
              {Object.entries(gradeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <CatalogFields initial={initial} />
        <div className="form-row">
          <label className="field">
            المهارات (كل مهارة في سطر)
            <textarea name="skills" defaultValue={input.skills.join('\n')} rows={3} />
          </label>
        </div>
        <h3 className="form-section-title">المشاركات والإنجازات</h3>
        {achievements.map((item, index) => (
          <div className="achievement-row" key={index}>
            <label className="field">
              الإنجاز {index + 1}
              <input
                value={item.title}
                required
                maxLength={500}
                onChange={(event) =>
                  setAchievements(
                    achievements.map((entry, i) =>
                      i === index ? { ...entry, title: event.target.value } : entry,
                    ),
                  )
                }
              />
            </label>
            <label className="field">
              تاريخ الإنجاز {index + 1} (اختياري)
              <input
                type="date"
                value={item.date ?? ''}
                onChange={(event) =>
                  setAchievements(
                    achievements.map((entry, i) =>
                      i === index ? { ...entry, date: event.target.value || null } : entry,
                    ),
                  )
                }
              />
            </label>
            <button
              className="icon-button"
              type="button"
              onClick={() => setAchievements(achievements.filter((_, i) => i !== index))}
              aria-label={`حذف الإنجاز ${index + 1}`}
            >
              <X size={16} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="button button-secondary"
          disabled={achievements.length >= 30}
          onClick={() => setAchievements([...achievements, { title: '', date: null }])}
        >
          <Plus size={16} />
          إضافة إنجاز
        </button>
        <label className="field spaced">
          معلومات عن الطالب وإنجازاته
          <textarea
            name="notes"
            defaultValue={input.notes}
            maxLength={5000}
            rows={4}
            placeholder="معلومات تساعد في صياغة السيرة لاحقًا…"
          />
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={overrides === null}
            onChange={(event) => setOverrides(event.target.checked ? null : [])}
          />
          استخدام مشرفي المدرسة الافتراضيين
        </label>
        {overrides !== null && <SupervisorFields value={overrides} onChange={setOverrides} />}
      </fieldset>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <button className="button full spaced" type="submit" disabled={busy}>
        {busy ? 'جارٍ الحفظ…' : submitLabel}
      </button>
    </form>
  );
}
