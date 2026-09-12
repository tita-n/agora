import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { ConfirmPanel } from "./confirm-panel";

export const dynamic = "force-dynamic";

/**
 * Landing page after Paystack redirects back (?reference=aos_…).
 * Trusts NOTHING in the redirect itself for payment truth — the panel
 * calls /api/onboarding/confirm, which re-verifies the charge against
 * Paystack's API server-side (same path the webhook uses, idempotent).
 * requireAuth() enforces the session gate (redirects to /login).
 */
export default async function CallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string }>;
}) {
  await requireAuth();
  const { reference } = await searchParams;

  if (!reference || !reference.startsWith("aos_")) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-bold text-gray-900">We could not find that payment</h1>
        <p className="mt-2 text-sm text-gray-500">
          The return link was missing or malformed. If your payment completed,
          your site will finish setting itself up automatically — this page
          normally does the checking for you.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 rounded-md bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-700"
        >
          Go to dashboard
        </Link>
      </main>
    );
  }

  return <ConfirmPanel reference={reference} />;
}
