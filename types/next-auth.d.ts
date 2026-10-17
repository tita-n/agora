import type { DefaultSession } from "next-auth";

/**
 * Module augmentation (finding L-1): `id` and `role` are part of the session
 * contract, so every consumer gets real types instead of `as any` casts.
 * `role` stays a plain string here so the types don't depend on Prisma
 * client generation; the DB-side enum (M-8) constrains it at the source.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: string;
  }
}
