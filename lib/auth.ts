import { getServerSession } from "next-auth";
import { authOptions } from "./auth-config";
import { prisma } from "./prisma";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";

/**
 * Guards (Phase 0 capability model). There are no roles: "developer" = has
 * a DeveloperProfile, "staff" = User.isStaff, "owner of business X" =
 * Business.ownerId == user. The JWT is only an identity claim — every guard
 * re-reads the authoritative capabilities from the database on the guarded
 * render (the old H-2 finding stays fixed: a demoted/deleted user loses
 * access on the next request, not at token expiry).
 */
export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id) return null;
  return user;
}

/** Requires an authenticated user; redirects to /login otherwise. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** @deprecated kept as an alias so old imports keep working during the migration */
export const requireAuth = requireUser;

/** Requires platform staff (admin surfaces). */
export async function requireStaff() {
  const user = await requireUser();
  const fresh = await prisma.user.findUnique({
    where: { id: user.id },
    select: { isStaff: true },
  });
  if (!fresh) redirect("/login"); // deleted mid-session
  if (!fresh.isStaff) redirect("/unauthorized");
  return user;
}

/** Requires a developer identity (DeveloperProfile exists). */
export async function requireDeveloper() {
  const user = await requireUser();
  const profile = await prisma.developerProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!profile) redirect("/unauthorized");
  return { user, developerProfileId: profile.id };
}

/**
 * Requires that the current user OWNS the given business (or is staff, for
 * admin tooling that passes allowStaff). Returns the trimmed business.
 * This is the page-level twin of the API routes' ownerContext; mutations in
 * route handlers keep doing their own `where: { id, businessId }` scoping.
 */
export async function requireBusinessOwner(businessId: string, opts: { allowStaff?: boolean } = {}) {
  const user = await requireUser();
  const business = await prisma.business.findFirst({
    where: opts.allowStaff ? { id: businessId } : { id: businessId, ownerId: user.id },
    select: { id: true, subdomain: true, ownerId: true },
  });
  if (!business) notFound();
  return { user, business };
}

/** The signed-in user's own business (Phase 1 policy: one per account), or
 * null. Never takes a businessId from the client. */
export async function ownBusiness(userId: string) {
  return prisma.business.findFirst({
    where: { ownerId: userId },
    select: {
      id: true,
      name: true,
      subdomain: true,
      customDomain: true,
      domainStatus: true,
      logoUrl: true,
      subscriptionStatus: true,
      themeId: true,
    },
  });
}

export { prisma };

/** JSON-route twin of requireStaff: returns the user when staff, else null
 * (route handlers answer with their own 403 shape). Fresh DB read — never
 * trusts the JWT beyond identity. */
export async function staffUserOrNull() {
  const user = await getCurrentUser();
  if (!user?.id) return null;
  const fresh = await prisma.user.findUnique({
    where: { id: user.id },
    select: { isStaff: true },
  });
  return fresh?.isStaff ? user : null;
}

/** Account-settings view: capabilities in one fresh read (used by
 * /account and post-login routing). */
export async function userCapabilities(userId: string) {
  const [u, biz, dev] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { isStaff: true, emailVerifiedAt: true } }),
    prisma.business.findFirst({ where: { ownerId: userId }, select: { id: true } }),
    prisma.developerProfile.findUnique({ where: { userId }, select: { id: true } }),
  ]);
  return {
    isStaff: u?.isStaff ?? false,
    emailVerified: Boolean(u?.emailVerifiedAt),
    hasBusiness: Boolean(biz),
    isDeveloper: Boolean(dev),
  };
}

/** JSON-route staff predicate (fresh DB read) for handlers that already have
 * the session user. Page guards keep using requireStaff(). */
export async function isStaffId(userId: string): Promise<boolean> {
  const fresh = await prisma.user.findUnique({
    where: { id: userId },
    select: { isStaff: true },
  });
  return Boolean(fresh?.isStaff);
}
