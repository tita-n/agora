import Link from "next/link";
import type { MarketingState } from "@/lib/marketing";

/**
 * Header + footer for the marketing cluster (/, /how-it-works, /pricing,
 * /faq). Everything here is state-aware: a signed-in person never sees
 * "Sign in"; staff get /admin; owners get /dashboard. The mobile menu is a
 * CSS <details> disclosure (same mechanism as the app shell drawer): opens,
 * closes and toggles with keyboard for free — no client JS, no fake button.
 *
 * The control inventory lives in docs/HOMEPAGE-ACTIONS.md and e2e/homepage.spec.ts
 * fails if a control appears that isn't in that manifest.
 */

export const MARKETING_NAV = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
] as const;

const linkCls =
  "min-h-11 inline-flex items-center rounded-md px-3 text-sm font-medium text-ink-muted hover:text-ink";
const ctaCls =
  "min-h-11 inline-flex items-center rounded-md bg-brass px-4 text-sm font-semibold text-white hover:bg-brass-dark";
const footLinkCls = "min-h-11 inline-flex items-center underline-offset-4 hover:underline";

export function MarketingHeader({ state }: { state: MarketingState }) {
  return (
    <header className="border-b border-rule bg-card/80 backdrop-blur-sm">
      <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-3 px-4">
        <Link href="/" className="min-h-11 inline-flex items-center rounded-md font-display text-xl font-bold tracking-tight hover:opacity-80">
          Agora<span className="text-brass">.</span>
        </Link>

        {/* Desktop */}
        <nav aria-label="Main" className="hidden items-center gap-2 md:flex">
          {MARKETING_NAV.map((l) => (
            <Link key={l.href} href={l.href} className={linkCls}>
              {l.label}
            </Link>
          ))}
          {!state.signedIn && (
            <Link href="/login" className={linkCls}>
              Sign in
            </Link>
          )}
          <Link href={state.destination} className={ctaCls}>
            {state.ctaLabel}
          </Link>
        </nav>

        {/* Mobile disclosure */}
        <details className="relative md:hidden" data-testid="mobile-menu">
          <summary className="min-h-11 inline-flex cursor-pointer list-none items-center gap-2 rounded-md border border-rule px-3 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="space-y-1">
              <span className="block h-0.5 w-4 bg-ink" />
              <span className="block h-0.5 w-4 bg-ink" />
            </span>
            <span className="sr-only">Menu</span>
          </summary>
          <div className="absolute right-0 z-30 mt-1 w-56 rounded-md border border-rule bg-card p-2 shadow-lift">
            {MARKETING_NAV.map((l) => (
              <Link key={l.href} href={l.href} className={`${linkCls} w-full`}>
                {l.label}
              </Link>
            ))}
            {!state.signedIn ? (
              <Link href="/login" className={`${linkCls} w-full`}>
                Sign in
              </Link>
            ) : (
              <Link href="/account" className={`${linkCls} w-full`}>
                Account
              </Link>
            )}
            <Link href={state.destination} className={`${ctaCls} mt-1 w-full justify-center`}>
              {state.ctaLabel}
            </Link>
          </div>
        </details>
      </div>
    </header>
  );
}

export function MarketingFooter({ state }: { state: MarketingState }) {
  return (
    <footer className="border-t border-rule bg-paper">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-6 text-sm text-ink-muted">
        <span>© {new Date().getFullYear()} Agora — built for Nigerian small business.</span>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {MARKETING_NAV.map((l) => (
            <Link key={l.href} href={l.href} className={footLinkCls}>
              {l.label}
            </Link>
          ))}
          {state.signedIn ? (
            <Link href="/account" className={footLinkCls}>
              Account
            </Link>
          ) : (
            <>
              <Link href="/signup" className={footLinkCls}>
                Get a site
              </Link>
              <Link href="/login" className={footLinkCls}>
                Sign in
              </Link>
            </>
          )}
        </nav>
      </div>
    </footer>
  );
}

export function MarketingPage({
  state,
  children,
}: {
  state: MarketingState;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <MarketingHeader state={state} />
      <main className="flex-1">{children}</main>
      <MarketingFooter state={state} />
    </div>
  );
}
