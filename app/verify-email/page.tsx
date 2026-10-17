import { Suspense } from "react";
import { VerifyPanel } from "./verify-panel";

export const dynamic = "force-dynamic";

export default function VerifyEmailPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-ink">Email confirmation</h1>
        <Suspense fallback={<p className="mt-4 text-sm text-ink-muted">Checking your link…</p>}>
          <VerifyPanel />
        </Suspense>
      </div>
    </main>
  );
}
