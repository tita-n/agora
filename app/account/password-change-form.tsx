"use client";

import { FormEvent, useState } from "react";

export function PasswordChangeForm() {
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        currentPassword: String(fd.get("current") ?? ""),
        newPassword: String(fd.get("next") ?? ""),
      }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok || !data?.ok) {
      setError(data?.error ?? "Could not change the password.");
      return;
    }
    setDone(true);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3">
      <div>
        <label htmlFor="current" className="block text-sm font-medium text-ink">Current password</label>
        <input id="current" name="current" type="password" autoComplete="current-password" required maxLength={200}
          className="mt-1 block w-full rounded-md border border-rule-strong px-3 py-2.5 text-sm focus:border-ink focus:outline-none" />
      </div>
      <div>
        <label htmlFor="next" className="block text-sm font-medium text-ink">New password</label>
        <input id="next" name="next" type="password" autoComplete="new-password" required minLength={12} maxLength={128}
          className="mt-1 block w-full rounded-md border border-rule-strong px-3 py-2.5 text-sm focus:border-ink focus:outline-none" />
      </div>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      {done && <p className="text-sm text-success" role="status">Password changed.</p>}
      <button type="submit" disabled={busy} className="rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-50">
        {busy ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
