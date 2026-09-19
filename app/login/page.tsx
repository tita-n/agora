"use client";

import { signIn, useSession } from "next-auth/react";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const { status } = useSession();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Already signed in? Don't show the form. Rendering it over a live
  // session is what let a second sign-in swap the cookie while other tabs
  // and already-hydrated components still held the FIRST account — the
  // "two accounts logged in at once" illusion. after-login routes by role,
  // so the signed-in user lands exactly where their own session says.
  useEffect(() => {
    if (status === "authenticated") router.replace("/api/auth/after-login");
  }, [status, router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false,
      redirectTo: "/api/auth/after-login",
    });

    setLoading(false);

    if (res?.error) {
      setError("Invalid email or password");
    } else {
      // Redirect to role-appropriate page on next navigation
      router.push("/api/auth/after-login");
      router.refresh();
    }
  }

  if (status === "authenticated") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4 text-sm text-gray-500">
        Already signed in — taking you where you belong…
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-6">Sign in</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 text-center">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
