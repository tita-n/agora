/** Prisma error inspection without importing generated types (keeps this
 * module testable and stable across prisma versions). */
export function isPrismaUniqueError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "P2002"
  );
}
