import { useRef, useState } from 'react';
import { Modal } from './Modal';
import { errorMessage } from '../../lib/api';
export function ConfirmDialog({
  title,
  message,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
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
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button className="button danger" disabled={busy} onClick={() => void confirm()}>
          {busy ? 'جارٍ الحذف…' : 'تأكيد'}
        </button>
        <button className="button button-secondary" disabled={busy} onClick={onClose}>
          إلغاء
        </button>
      </div>
    </Modal>
  );
}
