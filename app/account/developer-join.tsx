"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

/** "Become a developer" — creates the DeveloperProfile. Additive: this
 * account keeps every business and capability it already had. */
export function DeveloperJoin() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/account/developer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: String(fd.get("displayName") ?? "") || undefined }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok || !data?.ok) {
      setError(data?.error ?? "Could not set up the developer profile.");
      return;
    }
    router.push("/developer");
    router.refresh();
  }

  return (
    <>
      <p className="mt-2 text-sm text-gray-500">
        Publish templates and earn 70% of whatever you price them at. You keep
        using Agora as a customer from this same account.
      </p>
      <form onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-52 flex-1">
          <label htmlFor="displayName" className="block text-sm font-medium text-gray-700">
            Display name (shown in the store)
          </label>
          <input id="displayName" name="displayName" maxLength={60} placeholder="Your studio name"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm focus:border-gray-900 focus:outline-none" />
        </div>
        <button type="submit" disabled={busy} className="rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50">
          {busy ? "Setting up…" : "Become a developer"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}
    </>
  );
}
