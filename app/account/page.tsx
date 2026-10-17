import { requireUser, userCapabilities } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tenantSiteUrl } from "@/lib/site-urls";
import { PasswordChangeForm } from "./password-change-form";
import { DeveloperJoin } from "./developer-join";
import { ResendVerifyButton } from "./resend-verify-button";

export const dynamic = "force-dynamic";

/**
 * Account settings (Phase 0): identity, email status, password, developer
 * identity, businesses. One account, many capabilities — nothing here says
 * "you chose a role at signup", because nobody does.
 */
export default async function AccountPage() {
  const user = await requireUser();
  const [caps, businesses] = await Promise.all([
    userCapabilities(user.id),
    prisma.business.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, subdomain: true, subscriptionStatus: true },
    }),
  ]);
  const profile = await prisma.developerProfile.findUnique({
    where: { userId: user.id },
    select: { displayName: true, bio: true },
  });

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-2xl space-y-8">
        <header>
          <h1 className="text-2xl font-bold text-gray-900">Account</h1>
          <p className="mt-1 text-sm text-gray-500">{user.email}</p>
        </header>

        {!caps.emailVerified && (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Email not verified yet.</p>
            <p className="mt-1">
              Your site stays in onboarding until you confirm the link we sent —
              nothing is charged before that.
            </p>
            <div className="mt-3">
              <ResendVerifyButton />
            </div>
          </section>
        )}

        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-900">Your sites</h2>
          {businesses.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">
              No sites yet — <a href="/onboard" className="underline">start onboarding</a>.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-gray-100">
              {businesses.map((b: { id: string; name: string; subdomain: string; subscriptionStatus: string }) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="font-medium text-gray-900">{b.name}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-gray-400">{b.subscriptionStatus}</span>
                    <a href={tenantSiteUrl(b.subdomain)} className="underline" target="_blank" rel="noreferrer">
                      {b.subdomain}
                    </a>
                    <a href="/dashboard" className="font-medium underline">Manage</a>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-900">Developer identity</h2>
          {profile ? (
            <p className="mt-2 text-sm text-gray-600">
              You are a developer{profile.displayName ? ` as “${profile.displayName}”` : ""}.{" "}
              <a href="/developer" className="underline">Open the developer console</a>.
            </p>
          ) : (
            <DeveloperJoin />
          )}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-900">Password</h2>
          <PasswordChangeForm />
        </section>
      </div>
    </main>
  );
}
