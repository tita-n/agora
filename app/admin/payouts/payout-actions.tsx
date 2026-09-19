"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Per-row "Mark as Paid" control for /admin/payouts — mirrors
 * PaymentRowActions: thin client over the role+origin-checked API; the
 * button is convenience, not enforcement.
 */
export function MarkPaidButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markPaid() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/payouts/mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={markPaid}
        disabled={busy}
        className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {busy ? "Recording…" : "Mark as Paid"}
      </button>
      {error && (
        <span className="flex items-center gap-2 text-xs text-red-600">
          {error}
          <button onClick={() => setError(null)} className="text-gray-400 underline">
            dismiss
          </button>
        </span>
      )}
    </div>
  );
}
