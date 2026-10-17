import Image from "next/image";

/**
 * The "Minimal" theme (Phase 1 — the only real theme).
 *
 * Pure props → JSX: no prisma, no env, no next-auth — which is what lets
 * the onboarding wizard render the customer's *actual* theme live from
 * draft state in the browser, while the server page renders the same
 * component from DB state.
 *
 * Every optional field is genuinely optional: with only `name`, this still
 * renders a complete, intentional-looking page (no empty labels, no
 * dangling separators).
 */

export interface MinimalSiteData {
  name: string;
  description?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  address?: string | null;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export function MinimalSite({
  data,
  agoraHref,
}: {
  data: MinimalSiteData;
  agoraHref: string;
}) {
  const raw = data.primaryColor ?? "";
  const accent = HEX.test(raw) ? raw : "#111827";

  const hasContact = Boolean(data.contactEmail || data.contactPhone || data.address);

  return (
    <div className="min-h-screen bg-paper flex flex-col text-ink">
      <main className="flex-1">
        {/* Hero */}
        <section className="px-4 pt-20 pb-16 text-center">
          <div className="mx-auto max-w-xl">
            {data.logoUrl && (
              <Image
                src={data.logoUrl}
                alt={`${data.name} logo`}
                width={128}
                height={128}
                className="mx-auto h-24 w-24 rounded-xl object-contain"
              />
            )}
            <h1 className="mt-6 text-4xl font-bold tracking-tight">{data.name}</h1>
            <div
              className="mx-auto mt-4 h-1 w-16 rounded-full"
              style={{ backgroundColor: accent }}
              aria-hidden
            />
            {data.description && (
              <p className="mx-auto mt-6 max-w-md text-lg leading-relaxed text-ink-muted">
                {data.description}
              </p>
            )}
            {data.contactEmail && (
              <a
                href={`mailto:${data.contactEmail}`}
                className="mt-8 inline-block rounded-md px-6 py-2.5 text-sm font-semibold text-white"
                style={{ backgroundColor: accent }}
              >
                Get in touch
              </a>
            )}
          </div>
        </section>

        {/* Contact — rendered only if at least one field exists; rows
            render per-field so there are never empty labels. */}
        {hasContact && (
          <section className="border-t border-rule bg-card px-4 py-12">
            <div className="mx-auto max-w-xl">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-faint">
                Contact
              </h2>
              <dl className="mt-4 space-y-3 text-sm">
                {data.contactEmail && (
                  <div className="flex gap-3">
                    <dt className="w-20 shrink-0 font-medium text-ink-muted">Email</dt>
                    <dd>
                      <a href={`mailto:${data.contactEmail}`} className="underline">
                        {data.contactEmail}
                      </a>
                    </dd>
                  </div>
                )}
                {data.contactPhone && (
                  <div className="flex gap-3">
                    <dt className="w-20 shrink-0 font-medium text-ink-muted">Phone</dt>
                    <dd>{data.contactPhone}</dd>
                  </div>
                )}
                {data.address && (
                  <div className="flex gap-3">
                    <dt className="w-20 shrink-0 font-medium text-ink-muted">Address</dt>
                    <dd>{data.address}</dd>
                  </div>
                )}
              </dl>
            </div>
          </section>
        )}
      </main>

      {/* The platform billboard — every live site advertises Agora. */}
      <footer className="border-t border-rule bg-card px-4 py-6 text-center">
        <a
          href={agoraHref}
          className="text-xs text-ink-faint transition-colors hover:text-ink-muted"
        >
          Powered by <span className="font-semibold">Agora</span>
        </a>
      </footer>
    </div>
  );
}
