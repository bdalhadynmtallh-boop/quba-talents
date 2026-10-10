import { useState, useRef } from 'react';
import { FileText, Sparkles, Download, Pencil, Check } from 'lucide-react';
import {
  gradeLabels,
  type CvSource,
  type CvState,
  type CvData,
  type cvSnapshotSchema,
} from '@quba/shared';
import type { z } from 'zod';
import { useResource } from '../../lib/useResource';
import { api, downloadPdf, errorMessage } from '../../lib/api';
import { ResourceState } from '../../components/ui/ResourceState';
import { StatusPanel } from '../../components/ui/StatusPanel';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { CvEditor } from './CvEditor';
import ministryLogo from '../../assets/ministry-education.png';
function CvPaper({
  content,
  identity,
  source,
}: {
  content: CvData;
  identity: z.infer<typeof cvSnapshotSchema>;
  source: CvSource;
}) {
  return (
    <article className="cv-paper">
      <div className="cv-school">
        <div className="cv-school-brand">
          {source.school.hasLogo && (
            <img
              className="school-logo"
              src={`/api/school/logo?v=${encodeURIComponent(source.school.updatedAt)}`}
              alt="شعار المدرسة"
            />
          )}
          {identity.schoolName}
        </div>
        <div className="ministry-mark">
          <img src={ministryLogo} alt="شعار وزارة التعليم" />
        </div>
      </div>
      <header>
        <h2>السيرة الذاتية — ملف الموهبة والإنجاز</h2>
        <h3>{identity.name}</h3>
        <p>
          {gradeLabels[identity.grade]} · الفصل {identity.classroom}
        </p>
        <p>الموهبة الرئيسية: {identity.primaryTalent}</p>
      </header>
      {content.summary && (
        <section>
          <h3>نبذة عن الطالب</h3>
          <p className="pre-wrap">{content.summary}</p>
        </section>
      )}
      {content.talents.length > 0 && (
        <section>
          <h3>المواهب والاهتمامات</h3>
          <div className="skills">
            {content.talents.map((s, i) => (
              <span key={i}>{s}</span>
            ))}
          </div>
        </section>
      )}
      {content.skills.length > 0 && (
        <section>
          <h3>المهارات</h3>
          <div className="skills">
            {content.skills.map((s, i) => (
              <span key={i}>{s}</span>
            ))}
          </div>
        </section>
      )}
      {content.achievements.length > 0 && (
        <section>
          <h3>الإنجازات والمشاركات</h3>
          <ul>
            {content.achievements.map((a, i) => (
              <li key={i}>
                {a.title}
                {a.date && ` · ${a.date}`}
              </li>
            ))}
          </ul>
        </section>
      )}
      {content.projects.length > 0 && (
        <section>
          <h3>الأعمال والمشاريع</h3>
          {content.projects.map((p, i) => (
            <div key={i} className="editor-item">
              <h4>{p.title}</h4>
              <p className="pre-wrap">{p.description}</p>
              {p.studentRole && <p>دور الطالب: {p.studentRole}</p>}
              {p.date && <small>{p.date}</small>}
            </div>
          ))}
        </section>
      )}
      {identity.supervisors.length > 0 && (
        <footer className="cv-supervisors">
          <h3>المشرفون</h3>
          {identity.supervisors.map((s, i) => (
            <p key={i}>
              <strong>{s.name}</strong> · {s.role}
            </p>
          ))}
        </footer>
      )}
    </article>
  );
}
export function CvPreview({ studentId }: { studentId: string }) {
  const source = useResource<CvSource>(`/students/${studentId}/cv/source`),
    resource = useResource<CvState>(`/students/${studentId}/cv`);
  const [editing, setEditing] = useState(false),
    [approving, setApproving] = useState(false),
    [view, setView] = useState<'draft' | 'approved'>('draft');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const pending = useRef(false);
  if (source.loading || source.error) return <ResourceState {...source} onRetry={source.reload} />;
  if (resource.loading || resource.error)
    return <ResourceState {...resource} onRetry={resource.reload} />;
  if (!source.data || !resource.data) return null;
  const state = resource.data;
  const newDraft =
    state.draft &&
    (!state.approved ||
      JSON.stringify(state.draft) !== JSON.stringify(state.approved) ||
      JSON.stringify(state.draftSnapshot) !== JSON.stringify(state.approvedSnapshot));
  const content = view === 'approved' ? state.approved : (state.draft ?? state.approved);
  const identity =
    view === 'approved' ? state.approvedSnapshot : (state.draftSnapshot ?? state.approvedSnapshot);
  async function generate() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await api(`/students/${studentId}/cv/generate`, {
        method: 'POST',
        body: JSON.stringify({ revision: state.revision }),
      });
      setView('draft');
      resource.reload();
      source.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function download() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await downloadPdf(`/students/${studentId}/cv/pdf`, 'ملف-الموهبة.pdf');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <div className="section-actions cv-actions">
        <div>
          <h2>السيرة الذاتية</h2>
          <span className="talent-tag blue">
            {newDraft ? 'مسودة' : state.approved ? 'معتمدة' : state.draft ? 'مسودة' : 'غير منشأة'}
          </span>
        </div>
        <div className="management-actions">
          <button
            className="button"
            disabled={busy || state.generating || !state.aiConfigured}
            onClick={() => void generate()}
          >
            <Sparkles size={17} />
            {busy
              ? 'جارٍ تنفيذ العملية…'
              : state.draft || state.approved
                ? 'إعادة الصياغة'
                : 'إنشاء السيرة بالذكاء الاصطناعي'}
          </button>
          {content && (
            <button
              className="button button-secondary"
              disabled={busy}
              onClick={() => setEditing(true)}
            >
              <Pencil size={17} />
              تحرير المسودة
            </button>
          )}
          {state.draft && (
            <button
              className="button button-secondary"
              disabled={busy || state.draftStale}
              onClick={() => setApproving(true)}
            >
              <Check size={17} />
              اعتماد وحفظ
            </button>
          )}
          {state.approved && (
            <button className="button" disabled={busy} onClick={() => void download()}>
              <Download size={17} />
              تنزيل PDF المعتمد
            </button>
          )}
        </div>
      </div>
      {!state.aiConfigured && (
        <p className="notice">
          الصياغة غير مهيأة: أضف مفتاح AI_API_KEY وعنوان AI_BASE_URL في إعدادات الخادم. لم يُنشأ أي
          نص تلقائي.
        </p>
      )}
      {state.generating && (
        <p role="status" className="notice">
          يوجد طلب صياغة جارٍ.{' '}
          <button className="button button-secondary" onClick={resource.reload}>
            تحديث الحالة
          </button>
        </p>
      )}
      {(state.approvedStale || state.draftStale) && (
        <p role="status" className="notice">
          تغيرت بيانات الطالب أو أعماله أو إعدادات المدرسة بعد إعداد السيرة. راجع المسودة وحدّثها ثم
          اعتمدها؛ السيرة المعتمدة الحالية محفوظة.
        </p>
      )}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {state.draft && state.approved && (
        <div className="management-actions spaced">
          <button
            className="button button-secondary"
            aria-pressed={view === 'draft'}
            disabled={busy}
            onClick={() => setView('draft')}
          >
            معاينة المسودة
          </button>
          <button
            className="button button-secondary"
            aria-pressed={view === 'approved'}
            disabled={busy}
            onClick={() => setView('approved')}
          >
            معاينة المعتمدة
          </button>
        </div>
      )}
      {!content && (
        <StatusPanel
          icon={FileText}
          title="لم تُنشأ السيرة بعد"
          description="أضف معلومات موثقة عن الطالب وأعماله، ثم أنشئ مسودة وراجعها قبل اعتمادها."
        />
      )}
      {content && identity && (
        <CvPaper content={content} identity={identity} source={source.data} />
      )}
      {view === 'draft' && state.draft?.missingInformation.length ? (
        <aside className="notice">
          <h3>ملاحظات استكمال البيانات — لا تُطبع</h3>
          <ul>
            {state.draft.missingInformation.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </aside>
      ) : null}
      {editing && content && (
        <CvEditor
          studentId={studentId}
          initial={content}
          revision={state.revision}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setView('draft');
            resource.reload();
          }}
        />
      )}
      {approving && (
        <ConfirmDialog
          title="اعتماد السيرة"
          message="راجعت النص والإنجازات والمشرفين. هل تريد اعتماد هذه المسودة وحفظها كسيرة رسمية؟"
          onClose={() => setApproving(false)}
          onConfirm={async () => {
            await api(`/students/${studentId}/cv/approve`, {
              method: 'POST',
              body: JSON.stringify({ revision: state.revision }),
            });
            setView('approved');
            resource.reload();
          }}
        />
      )}
    </>
  );
}
