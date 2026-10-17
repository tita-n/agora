"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";

/**
 * Minimal account bar: brand link + the session's identity + Sign out.
 * Mounted on the authenticated surfaces (dashboard, dev portal). Uses
 * next-auth's client signOut — which clears the cookie server-side via
 * /api/auth/signout and lands the user on the (now session-aware) home
 * page, so there is exactly ONE place the truth about "who is signed in"
 * comes from. The email shown here also makes any stale-identity UX
 * immediately visible instead of silently confusing.
 */
export function UserNav() {
  const { data, status } = useSession();
  const email = data?.user?.email;

  return (
    <div className="mb-8 flex items-center justify-between">
      <Link href="/" className="text-sm font-bold tracking-tight text-gray-900">
        Agora
      </Link>
      <div className="flex items-center gap-3">
        {status === "authenticated" && email && (
          <span className="hidden text-xs text-gray-400 sm:inline">{email}</span>
        )}
        {status === "authenticated" ? (
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Sign out
          </button>
        ) : status === "unauthenticated" ? (
          <Link
            href="/login"
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gray-700"
          >
            Sign in
          </Link>
        ) : (
          <span className="h-7 w-16 animate-pulse rounded bg-gray-100" aria-hidden />
        )}
      </div>
    </div>
  );
}
