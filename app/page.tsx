import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";

/**
 * This page reads the request's session cookie (getCurrentUser →
 * getServerSession), so it must NEVER be statically prerendered: the old
 * build marked it `○` static — a logged-out snapshot baked at build time
 * and served identically to every visitor forever, which is exactly why
 * it ignored active sessions while /dashboard (force-dynamic) did not.
 * The session read makes it dynamic implicitly; the export below pins that
 * intent down so a future refactor can't silently revert it to prerendered.
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();

  const destination =
    user?.role === "developer" ? "/dev" : "/dashboard";

  return (
    <main className="min-h-screen flex flex-col items-center justify-center text-center px-4">
      <h1 className="text-5xl font-bold tracking-tight text-gray-900">
        Agora
      </h1>
      <p className="mt-4 max-w-xl text-lg text-gray-500">
        A marketplace where small businesses subscribe to website themes
        built by developers and get a live business website on a subdomain
        instantly — no upfront build fee.
      </p>
      <div className="mt-8 flex gap-4">
        {user ? (
          <>
            <Link
              href={destination}
              className="rounded-md bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-700"
            >
              Go to dashboard
            </Link>
            {user.email && (
              <span className="self-center text-xs text-gray-400">
                signed in as {user.email}
              </span>
            )}
          </>
        ) : (
          <>
            <Link
              href="/login"
              className="rounded-md bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-700"
            >
              Sign in
            </Link>
            <Link
              href="/dev"
              className="rounded-md border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50"
            >
              Developer portal
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
