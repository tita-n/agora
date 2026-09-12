"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary (finding M-12): renders for exceptions thrown
 * inside any page in this layout tree (e.g. a Prisma failure when the DB is
 * down) instead of Next's bare production error page.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The error's digest above correlates with the server-side log entry.
    console.error("[app-error]", error);
  }, [error]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center text-center px-4">
      <h1 className="text-2xl font-bold text-gray-900">Something went wrong</h1>
      <p className="mt-2 text-gray-500">
        We could not load this page. Please try again in a moment.
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-md bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-700"
      >
        Try again
      </button>
    </main>
  );
}
