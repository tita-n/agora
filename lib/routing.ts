/**
 * Pure post-login landing decision (unit-tested). Priorities are
 * deliberate: staff can always reach /admin; an owner lands on their
 * sites; a developer goes to their console; a brand-new account starts
 * onboarding. Capability flags must come from a fresh DB read.
 */
export function postLoginPath(f: { isStaff: boolean; hasBusiness: boolean; isDeveloper: boolean }): string {
  if (f.isStaff) return "/admin";
  if (f.hasBusiness) return "/dashboard";
  if (f.isDeveloper) return "/developer";
  return "/onboard";
}
