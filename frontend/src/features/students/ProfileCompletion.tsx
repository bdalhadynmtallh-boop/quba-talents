import { Check, Circle, ClipboardCheck } from 'lucide-react';
import type { StudentView } from '@quba/shared';

export function ProfileCompletion({ student }: { student: StudentView }) {
  const checks = [
    {
      label: 'البيانات الأساسية والموهبة الرئيسية',
      done: !!(student.name && student.grade && student.classroom && student.primaryTalent),
    },
    { label: 'نبذة عن الاهتمامات والخبرات', done: !!student.notes.trim() },
    { label: 'مهارات مكتسبة موثقة', done: student.skills.length > 0 },
    { label: 'إضافة عمل للطالب', done: student.works.length > 0 },
    {
      label: 'توثيق عمل بمرفق أو رابط',
      done: student.works.some((work) => work.attachments.length > 0 || !!work.url),
    },
  ];
  const completed = checks.filter((item) => item.done).length;
  const percentage = Math.round((completed / checks.length) * 100);
  return (
    <section className="profile-completion" aria-labelledby="completion-heading">
      <div className="completion-title">
        <ClipboardCheck size={22} />
        <h2 id="completion-heading">اكتمال توثيق الملف</h2>
        <strong>{percentage}%</strong>
      </div>
      <progress value={completed} max={checks.length} aria-label="اكتمال بيانات الملف" />
      <p>
        مؤشر للبيانات المتاحة فقط، وليس تقييمًا لموهبة الطالب. أضف ما يتوفر فعلًا؛ لا يلزم اختلاق
        بيانات لإكمال المؤشر.
      </p>
      <details>
        <summary>
          {completed === checks.length
            ? 'البيانات الأساسية والتوثيق مكتملة'
            : `عرض البيانات الناقصة (${checks.length - completed})`}
        </summary>
        <ul>
          {checks.map((item) => (
            <li key={item.label} className={item.done ? 'complete' : ''}>
              {item.done ? <Check size={16} /> : <Circle size={16} />}
              <span>{item.label}</span>
              <small>{item.done ? 'متوفر' : 'غير مضاف'}</small>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
