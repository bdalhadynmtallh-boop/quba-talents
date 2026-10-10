import { StatusPanel } from './StatusPanel';
export function ResourceState({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  return loading ? (
    <StatusPanel title="جارٍ تحميل البيانات…" loading />
  ) : (
    <StatusPanel
      title="تعذر تحميل البيانات"
      description={error}
      action={
        <button className="button" onClick={onRetry}>
          إعادة المحاولة
        </button>
      }
    />
  );
}
