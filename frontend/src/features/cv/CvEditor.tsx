import { useRef, useState, useCallback, type FormEvent } from 'react';
import { useBeforeUnload, useBlocker } from 'react-router-dom';
import { cvSchema, type CvData } from '@quba/shared';
import { Modal } from '../../components/ui/Modal';
import { api, errorMessage } from '../../lib/api';
export function CvEditor({
  studentId,
  initial,
  revision,
  onSaved,
  onClose,
}: {
  studentId: string;
  initial: CvData;
  revision: number;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const submitted = useRef(false),
    dirty = JSON.stringify(value) !== JSON.stringify(initial);
  const blocker = useBlocker(dirty);
  useBeforeUnload(
    useCallback(
      (event) => {
        if (dirty) {
          event.preventDefault();
          event.returnValue = '';
        }
      },
      [dirty],
    ),
  );
  const close = () => {
    if (!busy && (!dirty || window.confirm('هناك تعديل غير محفوظ. هل تريد المغادرة دون حفظ؟')))
      onClose();
  };
  async function save(event: FormEvent) {
    event.preventDefault();
    if (submitted.current) return;
    const valid = cvSchema.safeParse({
      ...value,
      talents: value.talents.map((s) => s.trim()).filter(Boolean),
      skills: value.skills.map((s) => s.trim()).filter(Boolean),
      missingInformation: value.missingInformation.map((s) => s.trim()).filter(Boolean),
    });
    if (!valid.success) {
      setError('تحقق من طول النصوص والعناوين والتواريخ.');
      return;
    }
    submitted.current = true;
    setBusy(true);
    setError('');
    try {
      await api(`/students/${studentId}/cv/draft`, {
        method: 'PUT',
        body: JSON.stringify({ revision, content: valid.data }),
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      submitted.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal title="تحرير مسودة السيرة" onClose={close}>
      <form onSubmit={(event) => void save(event)}>
        <fieldset disabled={busy}>
          <label className="field">
            النبذة
            <textarea
              aria-label="النبذة"
              rows={5}
              maxLength={5000}
              value={value.summary}
              onChange={(e) => setValue({ ...value, summary: e.target.value })}
            />
          </label>
          {(['talents', 'skills', 'missingInformation'] as const).map((key) => (
            <label className="field" key={key}>
              {key === 'talents'
                ? 'المواهب والاهتمامات'
                : key === 'skills'
                  ? 'المهارات'
                  : 'ملاحظات استكمال البيانات (لا تُطبع)'}
              <textarea
                rows={3}
                value={value[key].join('\n')}
                onChange={(e) => setValue({ ...value, [key]: e.target.value.split('\n') })}
              />
            </label>
          ))}
          <h3>الإنجازات والمشاركات</h3>
          {value.achievements.map((item, i) => (
            <div className="editor-item" key={i}>
              <label className="field">
                إنجاز {i + 1}
                <textarea
                  value={item.title}
                  maxLength={500}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      achievements: value.achievements.map((a, n) =>
                        n === i ? { ...a, title: e.target.value } : a,
                      ),
                    })
                  }
                />
              </label>
              <label className="field">
                تاريخ الإنجاز {i + 1}
                <input
                  type="date"
                  value={item.date ?? ''}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      achievements: value.achievements.map((a, n) =>
                        n === i ? { ...a, date: e.target.value || null } : a,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                className="button button-secondary"
                onClick={() =>
                  setValue({ ...value, achievements: value.achievements.filter((_, n) => i !== n) })
                }
              >
                حذف الإنجاز {i + 1}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="button button-secondary"
            disabled={value.achievements.length >= 40}
            onClick={() =>
              setValue({
                ...value,
                achievements: [...value.achievements, { title: '', date: null }],
              })
            }
          >
            إضافة إنجاز موثق
          </button>
          <h3 className="spaced">الأعمال والمشاريع</h3>
          {value.projects.map((p, i) => (
            <div className="editor-item" key={i}>
              {(['title', 'description', 'studentRole'] as const).map((key) => (
                <label className="field" key={key}>
                  {key === 'title'
                    ? 'عنوان المشروع'
                    : key === 'description'
                      ? 'وصف المشروع'
                      : 'دور الطالب'}{' '}
                  {i + 1}
                  <textarea
                    value={p[key]}
                    onChange={(e) =>
                      setValue({
                        ...value,
                        projects: value.projects.map((a, n) =>
                          n === i ? { ...a, [key]: e.target.value } : a,
                        ),
                      })
                    }
                  />
                </label>
              ))}
              <label className="field">
                تاريخ المشروع {i + 1}
                <input
                  type="date"
                  value={p.date ?? ''}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      projects: value.projects.map((a, n) =>
                        n === i ? { ...a, date: e.target.value || null } : a,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                className="button button-secondary"
                onClick={() =>
                  setValue({ ...value, projects: value.projects.filter((_, n) => n !== i) })
                }
              >
                حذف المشروع {i + 1}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="button button-secondary"
            disabled={value.projects.length >= 40}
            onClick={() =>
              setValue({
                ...value,
                projects: [
                  ...value.projects,
                  { title: '', description: '', studentRole: '', date: null },
                ],
              })
            }
          >
            إضافة مشروع موثق
          </button>
        </fieldset>
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <button type="submit" className="button full spaced" disabled={busy}>
          {busy ? 'جارٍ حفظ المسودة…' : 'حفظ المسودة'}
        </button>
      </form>
      {blocker.state === 'blocked' && (
        <div role="alert" className="notice">
          <p>هناك تعديل غير محفوظ. هل تريد مغادرة الصفحة؟</p>
          <div className="dialog-actions">
            <button className="button" onClick={() => blocker.reset()}>
              متابعة التحرير
            </button>
            <button className="button button-secondary" onClick={() => blocker.proceed()}>
              مغادرة دون حفظ
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
