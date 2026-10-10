import { useState } from 'react';
import { Plus, FolderOpen, ExternalLink, Pencil, Trash2, FileText, Image } from 'lucide-react';
import type { WorkView } from '@quba/shared';
import { WorkForm } from './WorkForm';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { StatusPanel } from '../../components/ui/StatusPanel';
import { api } from '../../lib/api';
type DeleteTarget = { title: string; path: string };
export function WorksPanel({
  studentId,
  works,
  onChanged,
}: {
  studentId: string;
  works: WorkView[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<WorkView | 'new' | null>(null),
    [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const base = `/students/${studentId}/works`;
  return (
    <>
      <div className="section-actions">
        <h2>أعمال الطالب</h2>
        <button className="button" onClick={() => setEditing('new')}>
          <Plus size={17} />
          إضافة عمل
        </button>
      </div>
      {works.length ? (
        <div className="works-grid">
          {works.map((work) => (
            <article className="work-card" key={work.id}>
              {work.attachments.find((file) => file.mimeType.startsWith('image/')) && (
                <img
                  className="work-cover"
                  loading="lazy"
                  alt={`صورة من عمل ${work.title}`}
                  src={`/api${base}/${work.id}/attachments/${work.attachments.find((file) => file.mimeType.startsWith('image/'))!.id}`}
                />
              )}
              <div className="work-card-content">
                <h3>{work.title}</h3>
                <p className="pre-wrap">{work.description}</p>
                {work.studentRole && (
                  <p>
                    <strong>دور الطالب: </strong>
                    {work.studentRole}
                  </p>
                )}
                {work.date && (
                  <small className="muted">
                    {new Date(`${work.date}T12:00:00`).toLocaleDateString('ar-SA')}
                  </small>
                )}
                {work.url && (
                  <a
                    className="external-link"
                    href={work.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    عرض رابط العمل
                    <ExternalLink size={16} />
                  </a>
                )}
                <div className="attachment-list">
                  {work.attachments.map((file) => (
                    <div className="attachment-row" key={file.id}>
                      <a
                        href={`/api${base}/${work.id}/attachments/${file.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {file.mimeType === 'application/pdf' ? (
                          <FileText size={17} />
                        ) : (
                          <Image size={17} />
                        )}
                        <span>{file.originalName}</span>
                        <small>{(file.sizeBytes / 1024).toFixed(0)} KB</small>
                      </a>
                      <button
                        className="icon-button"
                        aria-label={`حذف المرفق ${file.originalName}`}
                        onClick={() =>
                          setDeleting({
                            title: file.originalName,
                            path: `${base}/${work.id}/attachments/${file.id}`,
                          })
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="dialog-actions">
                  <button className="button button-secondary" onClick={() => setEditing(work)}>
                    <Pencil size={15} />
                    تعديل العمل
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`حذف العمل ${work.title}`}
                    onClick={() => setDeleting({ title: work.title, path: `${base}/${work.id}` })}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <StatusPanel
          icon={FolderOpen}
          title="لم تُضف أعمال بعد"
          description="أضف أول عمل للطالب، مع وصف دوره وروابط أو مرفقات توثّق إنجازه."
        />
      )}
      {editing && (
        <Modal
          title={editing === 'new' ? 'إضافة عمل' : 'تعديل العمل'}
          onClose={() => setEditing(null)}
        >
          <WorkForm
            studentId={studentId}
            initial={editing === 'new' ? undefined : editing}
            onSaved={() => {
              setEditing(null);
              onChanged();
            }}
          />
        </Modal>
      )}
      {deleting && (
        <ConfirmDialog
          title="تأكيد الحذف"
          message={`هل تريد حذف «${deleting.title}»؟ سيُحذف من الملف نهائيًا.`}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await api(deleting.path, { method: 'DELETE' });
            onChanged();
          }}
        />
      )}
    </>
  );
}
