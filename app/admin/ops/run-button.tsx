"use client";

import { useState } from "react";

/**
 * One "Run now" control + live result panel per cron job (client). The
 * result is transient on purpose (this tab only) — the durable record of
 * what a run did is the server log line each cron prints and the DB rows
 * it wrote, not this widget.
 */
export function RunButton({ job, label }: { job: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/ops/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        status?: number;
        summary?: unknown;
        error?: string;
      };
      if (!res.ok) {
        setResult({ ok: false, text: json.error ?? `HTTP ${res.status}` });
        return;
      }
      setResult({
        ok: json.ok === true,
        text:
          typeof json.summary === "string"
            ? json.summary
            : JSON.stringify(json.summary, null, 2),
      });
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : "network error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        onClick={run}
        disabled={busy}
        className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {busy ? `Running ${label}…` : `Run now`}
      </button>
      {result && (
        <pre
          className={`mt-3 max-h-64 overflow-auto rounded-md border px-3 py-2 text-[11px] leading-relaxed ${
            result.ok
              ? "border-green-200 bg-green-50 text-green-900"
              : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          {result.text}
        </pre>
      )}
    </div>
  );
}
