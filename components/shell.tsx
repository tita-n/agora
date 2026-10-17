import Link from "next/link";
import { getCurrentUser, userCapabilities } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SignOutButton } from "./sign-out-button";

/**
 * The logged-in shell (DESIGN.md): sticky top bar + left rail at lg+, the
 * rail collapses to a CSS-only <details> drawer below — zero client JS for
 * navigation. Used by dashboard, developer and admin; capabilities come from
 * a fresh DB read (same rule as the guards).
 */
export type NavItem = { href: string; label: string; current?: boolean };

export async function AppShell({
  section,
  children,
}: {
  section: "dashboard" | "developer" | "admin";
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) return null; // guarded pages redirect before this; defensive
  const caps = await userCapabilities(user.id);

  const items: NavItem[] = [];
  items.push({ href: "/dashboard", label: "My sites", current: section === "dashboard" });
  if (caps.isDeveloper || caps.isStaff)
    items.push({ href: "/developer", label: "Developer", current: section === "developer" });
  if (caps.isStaff)
    items.push({ href: "/admin", label: "Admin", current: section === "admin" });
  items.push({ href: "/account", label: "Account" });

  let siteCount = "";
  if (section === "dashboard") {
    const n = await prisma.business.count({ where: { ownerId: user.id } });
    siteCount = n ? String(n) : "";
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-40 border-b border-rule bg-card/95 backdrop-blur-sm supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex min-h-14 max-w-[1080px] items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-3">
            <details className="relative lg:hidden">
              <summary className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-rule text-lg" aria-label="Open menu">
                ☰
              </summary>
              <nav
                aria-label="Sections"
                className="absolute left-0 top-full z-50 w-56 rounded-md border border-rule bg-card p-2 shadow-lift"
              >
                {items.map((i) => <RailLink key={i.href} {...i} />)}
              </nav>
            </details>
            <Link href="/" className="font-display text-lg font-bold tracking-tight text-ink">
              Agora<span className="text-brass">.</span>
            </Link>
            <span className="text-xs font-medium uppercase tracking-wide text-ink-faint">{section}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {siteCount && <span className="hidden text-ink-muted sm:inline">{siteCount} site{siteCount === "1" ? "" : "s"}</span>}
            <Link href="/account" className="hidden max-w-40 truncate font-medium text-ink underline-offset-4 hover:underline sm:inline" title={user.email ?? ""}>
              {user.email}
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-[1080px] gap-8 px-4 py-6">
        <aside className="hidden w-48 shrink-0 lg:block" aria-label="Sections">
          <nav className="sticky top-20 space-y-0.5">
            {items.map((i) => <RailLink key={i.href} {...i} />)}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 pb-16">{children}</main>
      </div>
    </div>
  );
}

function RailLink({ href, label, current }: NavItem) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`block rounded-md px-3 py-2.5 text-sm ${
        current ? "bg-brass-faint font-semibold text-brass-dark" : "text-ink-muted hover:bg-ink/5 hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
}
