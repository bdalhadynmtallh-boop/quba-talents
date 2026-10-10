import { useState, useEffect } from 'react';
import type { CatalogView, StudentInput } from '@quba/shared';
import { useResource } from '../../lib/useResource';
import { ResourceState } from '../../components/ui/ResourceState';
export function CatalogFields({
  initial,
  publicForm = false,
  onAvailability,
}: {
  initial?: Pick<StudentInput, 'classroomId' | 'primaryTalentId' | 'additionalTalentIds'>;
  publicForm?: boolean;
  onAvailability?: (available: boolean) => void;
}) {
  const resource = useResource<CatalogView>(
    publicForm ? '/registration-options' : '/school/catalogs',
  );
  const [primary, setPrimary] = useState(initial?.primaryTalentId ?? '');
  const [additional, setAdditional] = useState(initial?.additionalTalentIds ?? []);
  const available = !!resource.data?.classrooms.length && !!resource.data?.talents.length;
  useEffect(() => {
    onAvailability?.(available);
  }, [available, onAvailability]);
  if (resource.loading || resource.error)
    return <ResourceState {...resource} onRetry={resource.reload} />;
  const data = resource.data;
  if (!data) return null;
  const classrooms = data.classrooms.filter(
    (c) => c.active !== false || c.id === initial?.classroomId,
  );
  const talents = data.talents.filter(
    (t) =>
      t.active !== false ||
      t.id === initial?.primaryTalentId ||
      initial?.additionalTalentIds.includes(t.id),
  );
  if (!classrooms.length || !talents.length)
    return (
      <p role="alert" className="notice">
        التسجيل غير متاح حتى يضبط المسؤول الفصول والمواهب من إعدادات المدرسة.
      </p>
    );
  return (
    <>
      <label className="field">
        الفصل
        <select
          aria-label="الفصل"
          name="classroomId"
          required
          defaultValue={initial?.classroomId ?? ''}
        >
          <option value="" disabled>
            اختر الفصل
          </option>
          {classrooms.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.active === false ? ' (معطل)' : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        الموهبة الرئيسية
        <select
          aria-label="الموهبة الرئيسية"
          name="primaryTalentId"
          required
          value={primary}
          onChange={(e) => {
            setPrimary(e.target.value);
            setAdditional(additional.filter((id) => id !== e.target.value));
          }}
        >
          <option value="" disabled>
            اختر الموهبة
          </option>
          {talents
            .filter((t) => t.active !== false || t.id === initial?.primaryTalentId)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.active === false ? ' (معطلة)' : ''}
              </option>
            ))}
        </select>
      </label>
      <fieldset className="catalog-choices">
        <legend>مواهب إضافية (اختياري، حتى 10)</legend>
        {talents
          .filter(
            (t) =>
              t.id !== primary &&
              (t.active !== false || initial?.additionalTalentIds.includes(t.id)),
          )
          .map((t) => (
            <label key={t.id} className="check-field">
              <input
                type="checkbox"
                name="additionalTalentIds"
                value={t.id}
                checked={additional.includes(t.id)}
                disabled={!additional.includes(t.id) && additional.length >= 10}
                onChange={(e) =>
                  setAdditional(
                    e.target.checked
                      ? [...additional, t.id]
                      : additional.filter((id) => id !== t.id),
                  )
                }
              />
              {t.name}
              {t.active === false ? ' (معطلة)' : ''}
            </label>
          ))}
      </fieldset>
    </>
  );
}
