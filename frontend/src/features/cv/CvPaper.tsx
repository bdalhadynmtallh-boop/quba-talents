import {
  cvHeaderLines,
  gradeLabels,
  type CvData,
  type CvSource,
  type cvSnapshotSchema,
} from '@quba/shared';
import type { z } from 'zod';
import ministryLogo from '../../assets/ministry-education.png';

export function CvPaper({
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
          <div className="cv-official-header">
            {cvHeaderLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
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
        {identity.academicYearLabel && <p>السنة الدراسية: {identity.academicYearLabel}</p>}
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
      {!!content.suggestedSkills?.length && (
        <section className="cv-development">
          <h3>مهارات مقترحة للتطوير</h3>
          <p className="cv-section-note">اقتراحات للتعلّم، لا تعبّر عن مهارات مكتسبة.</p>
          <ul>
            {content.suggestedSkills.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}
      {!!content.futureGoals?.length && (
        <section>
          <h3>الأهداف المستقبلية</h3>
          <ul>
            {content.futureGoals.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}
      {content.achievements.length > 0 && (
        <section>
          <h3>الإنجازات والمشاركات</h3>
          <ul>
            {content.achievements.map((a, i) => (
              <li key={i}>
                {a.title}
                {a.date && (
                  <>
                    {' '}
                    · <bdi dir="ltr">{a.date}</bdi>
                  </>
                )}
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
              {p.date && (
                <small>
                  <bdi dir="ltr">{p.date}</bdi>
                </small>
              )}
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
