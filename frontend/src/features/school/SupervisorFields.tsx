import { Plus, ArrowUp, ArrowDown, X } from 'lucide-react';
import type { SchoolInput } from '@quba/shared';
type Supervisors = SchoolInput['supervisors'];
export function SupervisorFields({
  value,
  onChange,
}: {
  value: Supervisors;
  onChange: (value: Supervisors) => void;
}) {
  function move(index: number, step: number) {
    const next = [...value];
    const other = index + step;
    if (other < 0 || other >= next.length) return;
    [next[index], next[other]] = [next[other]!, next[index]!];
    onChange(next);
  }
  return (
    <div className="supervisor-fields">
      {value.map((item, index) => (
        <div className="supervisor-row" key={index}>
          <label className="field">
            اسم المشرف {index + 1}
            <input
              value={item.name}
              maxLength={100}
              required
              onChange={(event) =>
                onChange(
                  value.map((entry, i) =>
                    i === index ? { ...entry, name: event.target.value } : entry,
                  ),
                )
              }
            />
          </label>
          <label className="field">
            مسمى المشرف {index + 1}
            <input
              value={item.role}
              maxLength={120}
              required
              onChange={(event) =>
                onChange(
                  value.map((entry, i) =>
                    i === index ? { ...entry, role: event.target.value } : entry,
                  ),
                )
              }
            />
          </label>
          <div className="row-controls">
            <button
              className="icon-button"
              type="button"
              disabled={index === 0}
              onClick={() => move(index, -1)}
              aria-label={`تقديم المشرف ${index + 1}`}
            >
              <ArrowUp size={16} />
            </button>
            <button
              className="icon-button"
              type="button"
              disabled={index === value.length - 1}
              onClick={() => move(index, 1)}
              aria-label={`تأخير المشرف ${index + 1}`}
            >
              <ArrowDown size={16} />
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={() => onChange(value.filter((_, i) => i !== index))}
              aria-label={`حذف المشرف ${index + 1}`}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="button button-secondary"
        disabled={value.length >= 10}
        onClick={() => onChange([...value, { name: '', role: '' }])}
      >
        <Plus size={16} />
        إضافة مشرف
      </button>
    </div>
  );
}
