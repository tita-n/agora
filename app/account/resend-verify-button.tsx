"use client";

import { useState } from "react";

export function ResendVerifyButton() {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function resend() {
    setBusy(true);
    const res = await fetch("/api/auth/resend-verify", { method: "POST" }).catch(() => null);
    setBusy(false);
    if (!res) setMsg("Network problem — try again.");
    else if (res.status === 429) setMsg("Too many attempts — wait a few minutes.");
    else setMsg((await res.json().catch(() => ({})))?.alreadyVerified ? "Email already verified — refresh this page." : "Verification email sent (dev servers log it).");
  }

  return (
    <span className="inline-flex items-center gap-3">
      <button onClick={resend} disabled={busy} className="rounded border border-warn/40 bg-card px-3 py-2 text-xs font-semibold text-warn hover:bg-amber-100 disabled:opacity-50">
        {busy ? "Sending…" : "Resend verification email"}
      </button>
      {msg && <span className="text-xs" role="status">{msg}</span>}
    </span>
  );
}
