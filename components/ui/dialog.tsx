"use client";
import * as RadixDialog from "@radix-ui/react-dialog";

/** Modal for confirmations (destructive actions are typed-confirm dialogs,
 * never bare buttons — DESIGN.md). */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  busy?: boolean;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-ink/40" />
        <RadixDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-md border border-rule bg-card p-5 shadow-lift">
          <RadixDialog.Title className="text-base font-semibold text-ink">{title}</RadixDialog.Title>
          <div className="mt-2 text-sm text-ink-muted">{body}</div>
          <div className="mt-5 flex justify-end gap-2">
            <RadixDialog.Close className="min-h-11 rounded-md border border-rule-strong px-4 text-sm font-medium text-ink">
              Cancel
            </RadixDialog.Close>
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className="min-h-11 rounded-md bg-danger px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Working…" : confirmLabel}
            </button>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
