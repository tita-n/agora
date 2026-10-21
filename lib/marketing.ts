import { getCurrentUser, userCapabilities } from "@/lib/auth";
import { postLoginPath } from "@/lib/routing";

/**
 * The ONE derivation of "who is looking at a marketing page and what should
 * the CTA be" — shared by /, /how-it-works, /pricing, /faq so the header,
 * footer and every CTA stay state-consistent across the marketing cluster.
 * Capability flags come from a fresh DB read (never the token), matching the
 * house rule for authorization surfaces.
 */
export type MarketingState = {
  signedIn: boolean;
  email: string | null;
  caps: { isStaff: boolean; hasBusiness: boolean; isDeveloper: boolean };
  /** Where the primary CTA leads for THIS viewer. */
  destination: string;
  ctaLabel: string;
  /** Developer-track CTA on home/subpages, per state. */
  devCta: { label: string; href: string };
};

export async function getMarketingState(): Promise<MarketingState> {
  const user = await getCurrentUser();
  const caps = user
    ? await userCapabilities(user.id)
    : { isStaff: false, hasBusiness: false, isDeveloper: false };
  const destination = user
    ? postLoginPath(caps)
    : "/signup";
  const ctaLabel = !user
    ? "Create your site"
    : caps.isStaff
      ? "Admin dashboard"
      : caps.hasBusiness
        ? "Go to dashboard"
        : caps.isDeveloper
          ? "Developer console"
          : "Start onboarding";
  const devCta = !user
    ? { label: "Become a developer", href: "/signup" }
    : caps.isDeveloper
      ? { label: "Open developer console", href: "/developer" }
      : { label: "Become a developer", href: "/account" };
  return { signedIn: !!user, email: user?.email ?? null, caps, destination, ctaLabel, devCta };
}
