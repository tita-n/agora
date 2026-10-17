import Link from "next/link";

/**
 * Shared chrome for the admin area (Phase 2 close-out).
 *
 * SECURITY NOTE, stated because it matters: a layout is NOT a boundary.
 * Every admin page and route keeps its own server-side requireRole() /
 * role check (and mutations keep the same-origin check) — this nav only
 * saves clicks. The links render for anyone who reaches /admin/*, but the
 * data behind each one is gated page-by-page.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav className="border-b border-gray-800 bg-gray-900">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-4 px-4 py-2.5 text-sm">
          <Link href="/admin" className="font-semibold text-white hover:underline">
            Agora admin
          </Link>
          <Link href="/admin/payments" className="text-gray-300 hover:text-white">
            Payments
          </Link>
          <Link href="/admin/payouts" className="text-gray-300 hover:text-white">
            Payouts
          </Link>
          <Link href="/admin/ops" className="text-gray-300 hover:text-white">
            Operations
          </Link>
        </div>
      </nav>
      {children}
    </div>
  );
}
