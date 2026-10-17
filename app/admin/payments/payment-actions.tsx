"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Per-row Confirm / Reject controls for /admin/payments. Thin client over the
 * role-gated API routes — the buttons are convenience; the server re-checks
 * admin + origin on every click.
 */
export function PaymentRowActions({ id, disabled }: { id: string; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function act(kind: "confirm" | "reject", body?: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/payments/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Failed");
        return;
      }
      router.refresh(); // reload the server list
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="text-xs text-red-600">{error}</span>
        <button onClick={() => setError(null)} className="text-xs text-gray-400 underline">
          dismiss
        </button>
      </div>
    );
  }

  if (rejecting) {
    return (
      <div className="flex flex-col items-end gap-1">
        <input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (payer sees this)"
          className="w-52 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none"
        />
        <div className="flex gap-2">
          <button
            disabled={busy || reason.trim().length < 3}
            onClick={() => act("reject", { reason: reason.trim() })}
            className="rounded bg-red-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy ? "…" : "Confirm reject"}
          </button>
          <button
            disabled={busy}
            onClick={() => {
              setRejecting(false);
              setReason("");
            }}
            className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-600"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end gap-2">
      <button
        disabled={busy || disabled}
        onClick={() => act("confirm")}
        className="rounded bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
      >
        {busy ? "…" : "Confirm payment"}
      </button>
      <button
        disabled={busy || disabled}
        onClick={() => setRejecting(true)}
        className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
      >
        Reject
      </button>
    </div>
  );
}
