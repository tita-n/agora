import { AppShell } from "@/components/shell";

/**
 * Shared chrome for the admin area. SECURITY NOTE, stated because it
 * matters: a layout is NOT a boundary — every admin page and route keeps
 * its own requireStaff()/isStaffId() check (and mutations keep the
 * same-origin check). This nav only saves clicks.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell section="admin">
      <nav aria-label="Admin sections" className="mb-5 flex flex-wrap gap-1 text-sm">
        {[
          ["/admin", "Overview"],
          ["/admin/payments", "Payments"],
          ["/admin/payouts", "Payouts"],
          ["/admin/ops", "Operations"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="min-h-11 rounded-md px-3 py-2.5 font-medium text-ink-muted hover:bg-ink/5 hover:text-ink">
            {label}
          </a>
        ))}
      </nav>
      {children}
    </AppShell>
  );
}
