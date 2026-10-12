import { useRef, useState } from 'react';
import { Modal } from './Modal';
import { errorMessage } from '../../lib/api';
export function ConfirmDialog({
  title,
  message,
  onConfirm,
  onClose,
  danger = false,
  confirmLabel = 'تأكيد',
  busyLabel = 'جارٍ تنفيذ العملية…',
  children,
  disabled = false,
}: {
  title: string;
  message: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  danger?: boolean;
  confirmLabel?: string;
  busyLabel?: string;
  children?: import('react').ReactNode;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const submitting = useRef(false);
  async function confirm() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      title={title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p>{message}</p>
      {children}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button
          className={`button${danger ? ' danger' : ''}`}
          disabled={busy || disabled}
          onClick={() => void confirm()}
        >
          {busy ? busyLabel : confirmLabel}
        </button>
        <button className="button button-secondary" disabled={busy} onClick={onClose}>
          إلغاء
        </button>
      </div>
    </Modal>
  );
}
