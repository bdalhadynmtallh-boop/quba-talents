import { Sparkles, LoaderCircle, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
export function StatusPanel({
  title,
  description,
  action,
  icon: Icon = Sparkles,
  loading = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: LucideIcon;
  loading?: boolean;
}) {
  return (
    <div className="status-panel" role={loading ? 'status' : undefined}>
      <span className="status-icon">
        {loading ? <LoaderCircle className="spin" /> : <Icon size={28} />}
      </span>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
