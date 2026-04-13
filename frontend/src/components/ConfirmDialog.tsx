import type { ReactNode } from "react";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  busy?: boolean;
};

/**
 * Confirmación en la propia app (sustituye window.confirm).
 */
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Continuar",
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel,
  busy = false,
}: ConfirmDialogProps) {
  if (!open) return null;

  async function handleConfirm() {
    await onConfirm();
  }

  return (
    <div
      className="modal-backdrop"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div className="modal stack" onClick={(e) => e.stopPropagation()}>
        <h3 id="confirm-dialog-title" style={{ marginTop: 0 }}>
          {title}
        </h3>
        <div id="confirm-dialog-desc">{children}</div>
        <div className="modal-actions modal-actions--row">
          <button
            type="button"
            className="btn btn--secondary"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn btn--accent"
            disabled={busy}
            onClick={() => void handleConfirm()}
          >
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
