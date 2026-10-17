"use client";

import { FormEvent, useState } from "react";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    await fetch("/api/auth/forgot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: String(fd.get("email") ?? "") }),
    }).catch(() => undefined);
    // Whatever the answer, the copy is identical — unknown emails get the
    // same "check your inbox" message (no enumeration, by construction).
    setSent(true);
    setBusy(false);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-ink">Reset your password</h1>
        {sent ? (
          <p className="mt-4 rounded-md bg-paper p-4 text-sm text-ink" role="status">
            If an Agora account exists for that address, a reset link is on its
            way (it expires in 30 minutes). Check spam too.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-ink">Email</label>
              <input
                id="email" name="email" type="email" autoComplete="email" required maxLength={254}
                className="mt-1 block w-full rounded-md border border-rule-strong px-3 py-2.5 text-sm focus:border-ink focus:outline-none"
              />
            </div>
            <button type="submit" disabled={busy} className="w-full rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-50">
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}
        <p className="mt-6 text-sm text-ink-muted">
          <a href="/login" className="font-medium text-ink underline">Back to sign in</a>
        </p>
      </div>
    </main>
  );
}
