import { useState, type FormEvent } from 'react';
import type { CatalogItem, CatalogView } from '@quba/shared';
import { api, errorMessage } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import { ResourceState } from '../../components/ui/ResourceState';
import { notifySchoolChange } from '../../lib/events';
function ItemForm({
  kind,
  item,
  onSaved,
}: {
  kind: 'classrooms' | 'talents';
  item?: CatalogItem;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const label = kind === 'classrooms' ? 'الفصل' : 'الموهبة';
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget,
      data = new FormData(form);
    setBusy(true);
    setError('');
    try {
      await api(`/school/${kind}${item ? '/' + item.id : ''}`, {
        method: item ? 'PUT' : 'POST',
        body: JSON.stringify({
          name: data.get('name'),
          sortOrder: Number(data.get('sortOrder')),
          active: data.get('active') === 'on',
        }),
      });
      if (!item) form.reset();
      onSaved();
      notifySchoolChange('catalogs');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="catalog-settings-row" onSubmit={(e) => void save(e)}>
      <fieldset disabled={busy}>
        <label className="field">
          {item ? `اسم ${label}` : `إضافة ${label}`}
          <input
            name="name"
            aria-label={`${item ? 'تعديل' : 'إضافة'} ${label}${item ? ' ' + item.name : ''}`}
            defaultValue={item?.name ?? ''}
            minLength={kind === 'classrooms' ? 1 : 2}
            maxLength={kind === 'classrooms' ? 30 : 80}
            required
          />
        </label>
        <label className="field">
          الترتيب
          <input
            type="number"
            name="sortOrder"
            aria-label={`ترتيب ${item?.name ?? label}`}
            defaultValue={item?.sortOrder ?? 0}
            min={0}
            max={10000}
            required
          />
        </label>
        <label className="check-field">
          <input name="active" type="checkbox" defaultChecked={item?.active ?? true} />
          نشط
        </label>
        <button className="button button-secondary">
          {busy ? 'جارٍ الحفظ…' : item ? 'حفظ' : 'إضافة'}
        </button>
      </fieldset>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
export function CatalogSettings() {
  const resource = useResource<CatalogView>('/school/catalogs');
  return (
    <section className="settings-section">
      <h3>الفصول والمواهب</h3>
      <p className="muted">
        التعطيل يخفي الخيار من النماذج الجديدة ويحتفظ بالارتباطات القديمة. رقم الترتيب الأصغر يظهر
        أولًا.
      </p>
      {resource.loading || resource.error ? (
        <ResourceState {...resource} onRetry={resource.reload} />
      ) : (
        resource.data &&
        (['classrooms', 'talents'] as const).map((kind) => (
          <section key={kind}>
            <h4>{kind === 'classrooms' ? 'الفصول' : 'المواهب'}</h4>
            {resource.data![kind].map((item) => (
              <ItemForm
                key={item.id + item.name + item.active + item.sortOrder}
                kind={kind}
                item={item}
                onSaved={resource.reload}
              />
            ))}
            <ItemForm kind={kind} onSaved={resource.reload} />
          </section>
        ))
      )}
    </section>
  );
}
