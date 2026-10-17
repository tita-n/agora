"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

/** Repository-owned toast queue (no dependency): aria-live announcements,
 * auto-dismiss, stack capped at 3. Inline form errors remain the primary
 * error surface — toasts are for action feedback (saved/deleted/etc.). */
type Toast = { id: number; text: string; kind: "info" | "success" | "error" };
type ToastApi = { toast: (text: string, kind?: Toast["kind"]) => void };

const Ctx = createContext<ToastApi>({ toast: () => undefined });
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);

  const toast = useCallback((text: string, kind: Toast["kind"] = "info") => {
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-2), { id, text, kind }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4200);
  }, []);
  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="ag-toast-stack" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} data-kind={t.kind} className="ag-toast">
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

/** Suspense-free skeleton blocks for action rows / lists. */
export function Skeleton({ className = "h-5 w-full" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-rule/70 ${className}`} aria-hidden />;
}

/** Standard empty state: one line of why + one action (DESIGN.md). */
export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-rule-strong bg-card p-8 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
