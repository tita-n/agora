import type { DefaultSession } from "next-auth";

/**
 * Module augmentation (finding L-1). Phase 0: the session carries IDENTITY
 * only — capabilities (staff / developer / owner) are re-read from the
 * database on every guarded render (lib/auth.ts), so a stale JWT can never
 * grant access.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
  }
}
