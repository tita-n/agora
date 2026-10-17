"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { normalizeEmail } from "@/lib/auth-errors";

/**
 * Public signup (Phase 0). Creates the account (email + password — no role
 * choice, ever), then signs straight in so onboarding can continue; the
 * VERIFY gate sits on the payment step, not on authentication, and the dev
 * server logs the verify link when email is not configured.
 */
export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "");
    const password = String(fd.get("password") ?? "");

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.status === 429) {
      setError("Too many attempts — wait a few minutes and try again.");
      setBusy(false);
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const first = data?.issues?.[0]?.message;
      setError(first ?? data?.error ?? "Could not create the account — check the details and try again.");
      setBusy(false);
      return;
    }

    setCreated(true);
    // Sign in with the same credentials (best-effort; the user can always
    // use /login). Then hand off to onboarding.
    const signin = await signIn("credentials", {
      email: normalizeEmail(email),
      password,
      redirect: false,
    });
    if (!signin?.error) {
      router.push("/onboard");
      router.refresh();
    } else {
      router.push("/login");
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-900">Create your Agora account</h1>
        <p className="mt-1 text-sm text-gray-500">
          One account for everything — your sites, and building templates for
          others if you want.
        </p>
        {created ? (
          <p className="mt-6 rounded-md bg-green-50 p-4 text-sm text-green-800" role="status">
            Account created. Check your inbox to verify your email — until then
            your site stays in onboarding (nothing is charged).
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm focus:border-gray-900 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm focus:border-gray-900 focus:outline-none"
              />
              <p className="mt-1 text-xs text-gray-400">At least 12 characters. Longer is stronger.</p>
            </div>
            {error && (
              <p className="text-sm text-red-600" role="alert">{error}</p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create account"}
            </button>
          </form>
        )}
        <p className="mt-6 text-sm text-gray-500">
          Already have an account?{" "}
          <a href="/login" className="font-medium text-gray-900 underline">Sign in</a>
        </p>
      </div>
    </main>
  );
}
