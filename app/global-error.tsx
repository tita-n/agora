"use client";

/**
 * Root-level error boundary (finding M-12). Must render its own <html> and
 * <body> because it replaces the root layout when that layout itself throws.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <main className="min-h-screen flex flex-col items-center justify-center text-center px-4">
          <h1 className="text-2xl font-bold text-gray-900">
            Agora is temporarily unavailable
          </h1>
          <p className="mt-2 text-gray-500">
            A server error occurred{error.digest ? ` (ref: ${error.digest})` : ""}.
            Please try again.
          </p>
          <button
            onClick={reset}
            className="mt-6 rounded-md bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-700"
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
