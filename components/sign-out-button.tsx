"use client";

import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

/** The logout button (the old one was a plain link that never killed the
 * session — kept fixed here on the new shell). */
export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" }).then(() => router.refresh())}
      className="min-h-11 rounded-md border border-rule-strong px-3 text-sm font-medium text-ink hover:bg-ink/5"
    >
      Sign out
    </button>
  );
}
