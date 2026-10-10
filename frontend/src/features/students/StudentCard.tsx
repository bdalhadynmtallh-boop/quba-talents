import { Link } from 'react-router-dom';
import { CodeXml, ArrowUpLeft } from 'lucide-react';
import { gradeLabels, type StudentView } from '@quba/shared';
export function StudentCard({ student }: { student: StudentView }) {
  return (
    <article className="student-card">
      <div className="student-summary">
        <div className="student-avatar blue">{student.name.charAt(0)}</div>
        <div>
          <h2>{student.name}</h2>
          <p>
            {gradeLabels[student.grade]} · الفصل {student.classroom}
          </p>
        </div>
      </div>
      <span className="talent-tag blue">
        <CodeXml size={18} />
        {student.primaryTalent}
      </span>
      <Link className="button card-link" to={`/students/${student.id}`}>
        عرض ملف الطالب
        <ArrowUpLeft size={18} />
      </Link>
    </article>
  );
}
