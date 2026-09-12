"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type PanelState =
  | { kind: "confirming" }
  | { kind: "ready"; name?: string; siteUrl: string | null; pathUrl: string | null }
  | { kind: "waiting"; reason: string; attempts: number };

const POLL_MS = 4000;
const MAX_POLLS = 15;

/**
 * Confirms the payment server-side (which re-verifies with Paystack, so a
 * late webhook never matters for correctness) and polls while fulfillment
 * is still in flight.
 */
export function ConfirmPanel({ reference }: { reference: string }) {
  const [state, setState] = useState<PanelState>({ kind: "confirming" });
  const attempts = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runConfirm = useCallback(async () => {
    setState((s) => (s.kind === "ready" ? s : { kind: "confirming" }));
    try {
      const res = await fetch("/api/onboarding/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      });
      const json = (await res.json()) as {
        ready?: boolean;
        name?: string;
        siteUrl?: string | null;
        pathUrl?: string | null;
        reason?: string;
        error?: string;
      };
      if (res.ok && json.ready) {
        if (timer.current) clearTimeout(timer.current);
        setState({
          kind: "ready",
          name: json.name,
          siteUrl: json.siteUrl ?? null,
          pathUrl: json.pathUrl ?? null,
        });
        return;
      }
      setState({ kind: "waiting", reason: json.reason ?? json.error ?? "Still confirming", attempts: attempts.current });
    } catch {
      setState({ kind: "waiting", reason: "Network hiccup while confirming", attempts: attempts.current });
    }
    if (attempts.current < MAX_POLLS) {
      attempts.current += 1;
      timer.current = setTimeout(runConfirm, POLL_MS);
    }
  }, [reference]);

  useEffect(() => {
    timer.current = setTimeout(runConfirm, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [runConfirm]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
      {state.kind === "confirming" && (
        <>
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
          <h1 className="mt-6 text-2xl font-bold text-gray-900">Confirming your payment…</h1>
          <p className="mt-2 text-sm text-gray-500">
            This usually takes a few seconds. Your site goes live the moment
            it&apos;s verified.
          </p>
        </>
      )}

      {state.kind === "ready" && (
        <>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl">✓</div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">
            {state.name ? `${state.name} is live!` : "You're live!"}
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Your business was created and your subscription is active.
          </p>
          <div className="mt-6 flex gap-3">
            {state.siteUrl && (
              <a
                href={state.siteUrl}
                className="rounded-md bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-700"
              >
                Visit your site
              </a>
            )}
            {state.pathUrl && (
              <a
                href={state.pathUrl}
                className="rounded-md border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Preview ({state.pathUrl})
              </a>
            )}
            <Link
              href="/dashboard"
              className="rounded-md border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Dashboard
            </Link>
          </div>
          <p className="mt-4 text-xs text-gray-400">
            On your own domain the subdomain link works once DNS is set up; the
            preview link always works.
          </p>
        </>
      )}

      {state.kind === "waiting" && (
        <>
          <h1 className="text-2xl font-bold text-gray-900">Still confirming</h1>
          <p className="mt-2 max-w-sm text-sm text-gray-500">
            {state.reason}
            {state.attempts >= MAX_POLLS
              ? " — your payment is safe and processing continues in the background. Reload this page or check your dashboard shortly."
              : ""}
          </p>
          <button
            onClick={runConfirm}
            className="mt-6 rounded-md bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-700"
          >
            Check again
          </button>
        </>
      )}
    </main>
  );
}
