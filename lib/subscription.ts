/**
 * Subscription status → display copy. Shared by tenant dashboards and the
 * dev view. Deliberately calm wording for past_due: this is a small
 * business owner checking on their site, not a dev debugging an outage.
 */

export const SUBSCRIPTION_STATUSES = ["inactive", "active", "past_due"] as const;

export function subscriptionBadge(status: string): {
  label: string;
  classes: string;
} {
  switch (status) {
    case "active":
      return { label: "Active", classes: "bg-green-50 text-green-700 ring-green-600/20" };
    case "past_due":
      return { label: "Payment needs attention", classes: "bg-amber-50 text-amber-800 ring-amber-600/20" };
    default:
      return { label: "Inactive", classes: "bg-gray-100 text-gray-600 ring-gray-500/20" };
  }
}

/** Deterministic date rendering (SSR/CSR-safe): 12 Sep 2026. */
export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}
