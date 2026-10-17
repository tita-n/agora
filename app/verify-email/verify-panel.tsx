"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type State = { kind: "idle" } | { kind: "ok" } | { kind: "error"; message: string };

export function VerifyPanel() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<State>({ kind: "idle" });
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || !token) return;
    ran.current = true;
    fetch("/api/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (r.ok && data?.ok) setState({ kind: "ok" });
        else setState({ kind: "error", message: data?.error ?? "This link is invalid or has expired." });
      })
      .catch(() => setState({ kind: "error", message: "Network problem — try again." }));
  }, [token]);

  if (!token) {
    return <p className="mt-4 text-sm text-gray-500">This page needs the link from your verification email.</p>;
  }
  if (state.kind === "ok") {
    return (
      <div className="mt-4 space-y-4">
        <p className="rounded-md bg-green-50 p-4 text-sm text-green-800" role="status">
          Email confirmed — your account is fully active.
        </p>
        <button
          type="button"
          onClick={() => window.location.assign("/api/auth/after-login")}
          className="rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white"
        >
          Continue →
        </button>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="mt-4 space-y-2">
        <p className="text-sm text-red-600" role="alert">{state.message}</p>
        <a href="/account" className="text-sm underline">Resend from your account page</a>
      </div>
    );
  }
  return <p className="mt-4 text-sm text-gray-500">Checking your link…</p>;
}
