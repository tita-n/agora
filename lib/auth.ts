import { getServerSession } from "next-auth";
import { authOptions } from "./auth-config";
import { prisma } from "./prisma";
import { redirect } from "next/navigation";

/**
 * Returns the current session user, or null if not authenticated.
 * Safe to call from Server Components and Route Handlers.
 * (id/role are typed via the next-auth module augmentation in types/.)
 */
export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id) return null;
  return user;
}

/**
 * Requires an authenticated user. Redirects to /login otherwise.
 */
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Requires one of the given roles. Redirects to /login if unauthenticated,
 * or to /unauthorized if authenticated but wrong role.
 *
 * The role from the JWT is only a snapshot taken at sign-in (finding H-2):
 * we always re-read the authoritative role from the database here, so a
 * demoted or deleted user loses access on the next request instead of after
 * the token's maxAge.
 */
export async function requireRole(roles: string[]) {
  const user = await requireAuth();
  const fresh = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });
  if (!fresh) redirect("/login"); // user deleted — session is no longer valid
  if (!roles.includes(fresh.role)) redirect("/unauthorized");
  return { ...user, role: fresh.role };
}

export { prisma };
