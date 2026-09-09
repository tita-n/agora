import { auth } from "next-auth";
import { prisma } from "./prisma";
import { redirect } from "next/navigation";

/**
 * Returns the current session user, or null if not authenticated.
 * Safe to call from Server Components and Route Handlers.
 */
export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user;
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
 */
export async function requireRole(roles: string[]) {
  const user = await requireAuth();
  if (!roles.includes(user.role)) redirect("/unauthorized");
  return user;
}

export { prisma };