"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VERCEL_CNAME_TARGET } from "@/lib/domains";

/**
 * Custom domain card on the owner dashboard (Phase 2). Thin client over
 * /api/business/domain[/check] — ownership, validation, and Vercel calls
 * all happen server-side.
 *
 * The plain-language explanation below was copy-approved for real
 * non-technical owners — keep the wording verbatim unless it's re-approved.
 */
export interface DomainPanelProps {
  domain: string | null;
  status: string; // none | pending | verified
  error: string | null;
  checkedAt: Date | null;
}

function statusBadge(status: string, domain: string | null) {
  if (!domain) return null;
  if (status === "verified")
    return (
      <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-success ring-1 ring-inset ring-green-600/20">
        Live — verified
      </span>
    );
  return (
    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-warn ring-1 ring-inset ring-amber-600/20">
      Waiting for your domain to point here
    </span>
  );
}

export function DomainPanel(props: DomainPanelProps) {
  const router = useRouter();
  const [input, setInput] = useState(props.domain ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // Exact records learned from Vercel on the last check (override the
  // generic guidance values below when present):
  const [records, setRecords] = useState<{ cname?: string }>({});

  async function call(url: string, method: "POST" | "DELETE", body?: unknown) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        note?: string;
        reason?: string;
        verified?: boolean;
        cname?: string;
      };
      if (!res.ok) {
        setMessage({ ok: false, text: json.error ?? "Something went wrong" });
        return null;
      }
      if (json.cname) setRecords({ cname: json.cname });
      const note = json.note ?? json.reason;
      setMessage({
        ok: true,
        text:
          json.verified === true
            ? "Verified — your domain is live and your Agora subdomain now redirects to it."
            : json.ok
              ? note ?? "Saved. Come back and press Check after a few minutes."
              : "Done.",
      });
      router.refresh();
      return json;
    } catch {
      setMessage({ ok: false, text: "Network error — try again" });
      return null;
    } finally {
      setBusy(false);
    }
  }

  const hasDomain = Boolean(props.domain);
  const labels: Record<string, string> = {
    pending: "Waiting for your domain to point here",
    verified: "Live — verified",
    failed: "Couldn't verify yet (check spelling, wait 15 minutes, retry)",
  };

  return (
    <section className="mt-8 rounded-md border border-rule bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Custom domain</h2>
        {statusBadge(props.status, props.domain)}
      </div>

      {hasDomain ? (
        <p className="mt-2 text-sm text-ink-muted">
          <span className="font-mono">{props.domain}</span>
          {props.checkedAt && (
            <span className="ml-2 text-xs text-ink-faint">
              last checked {new Date(props.checkedAt).toLocaleString("en-NG")}
            </span>
          )}
        </p>
      ) : (
        <p className="mt-2 text-sm text-ink-muted">
          You can serve your site at a domain you own — like yourshop.com —
          instead of (or alongside) your agora subdomain.
        </p>
      )}

      {props.error && hasDomain && (
        <p className="mt-2 rounded bg-warn/10 px-3 py-2 text-xs text-warn">{props.error}</p>
      )}
      {props.domain && props.status === "pending" && (
        <p className="mt-2 text-xs text-warn">{labels.pending}</p>
      )}

      <div className="mt-4 rounded border border-rule/60 bg-paper p-4 text-sm text-ink">
        <p>
          This is a one-time setting at the company where you bought your
          domain (for example Namecheap, Whogohost) — it takes about 5 minutes
          and needs no coding. Sign in there, open your domain&apos;s DNS
          settings, and add a record with exactly these values. Once we
          detect it, your secure certificate activates automatically — usually
          a few minutes, up to 24 hours.
        </p>
        <p className="mt-3 font-mono text-xs text-ink">
          Type: CNAME · Name: the part before your domain · Value:{" "}
          {records.cname ?? VERCEL_CNAME_TARGET}
        </p>
        <p className="mt-2 text-xs text-ink-muted">
          If your provider complains about a conflicting record, delete the
          old record for that name first. Not sure? Forward this page to
          whoever set your domain up.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="shop.example.com"
          className="w-64 rounded-md border border-rule-strong px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
          disabled={busy}
        />
        <button
          onClick={() => call("/api/business/domain", "POST", { domain: input })}
          disabled={busy || !input.trim()}
          className="rounded-md bg-ink px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {props.domain ? "Update" : "Save domain"}
        </button>
        {hasDomain && (
          <>
            <button
              onClick={() => call("/api/business/domain/check", "POST")}
              disabled={busy}
              className="rounded-md border border-rule-strong bg-card px-3 py-2 text-sm font-medium text-ink hover:bg-paper disabled:opacity-50"
            >
              Check now
            </button>
            <button
              onClick={() => call("/api/business/domain", "DELETE")}
              disabled={busy}
              className="rounded-md border border-danger/40 bg-card px-3 py-2 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
            >
              Remove
            </button>
          </>
        )}
      </div>

      {message && (
        <p className={`mt-3 text-sm ${message.ok ? "text-success" : "text-danger"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
