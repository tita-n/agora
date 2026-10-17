import { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { env } from "./env";
import {
  AUTH_INFRA_ERROR_CODE,
  AUTH_TOO_MANY_ERROR_CODE,
  authLogContext,
  classifyThrown,
  normalizeEmail,
} from "./auth-errors";
import { guardAction, noteFailure, noteSuccess } from "./rate-limit";

/** Constant dummy for timing-equalized "user not found" (never a real
 * password's hash — its value is irrelevant, only its cost is). Computed
 * once per process at first import. */
const DUMMY_HASH = bcrypt.hashSync("timing-equalization-placeholder", 10);

/**
 * NextAuth configuration only (finding L-2). The route handler instance
 * lives exclusively in app/api/auth/[...nextauth]/route.ts, so importing
 * this module from a Server Component (via lib/auth.ts) never pulls a
 * second NextAuth() instance into the bundle.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = normalizeEmail(credentials?.email);
        const password = credentials?.password;
        if (!email || typeof password !== "string" || !password) return null;

        // Rate limit BEFORE any bcrypt work (Phase 0). Throwing a fixed
        // code keeps the outcome generic; the UI maps it to "try again
        // later" (which, unlike the infra code, never varies by account
        // existence… it only varies by attempt count).
        const locked = await guardAction("login", email);
        if (locked) throw new Error(AUTH_TOO_MANY_ERROR_CODE);

        let user;
        try {
          // Phase 0: no role column — capabilities are DB-derived per render
          // (lib/auth.ts guards); the JWT only carries identity.
          user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, email: true, password: true },
          });
        } catch (err) {
          // Data-layer failure (M-12): report DISTINCTLY now (Part 2) —
          // a DB blip must not masquerade as a wrong password. NextAuth v4
          // (core/routes/callback.js) turns a thrown Error's message into
          // the client-visible error value, so we throw a FIXED code — the
          // underlying error never reaches the client; the log carries a
          // stage tag only: never the email, never a hash, never anything
          // that could echo user input.
          console.error(authLogContext("lookup", classifyThrown(err)));
          throw new Error(AUTH_INFRA_ERROR_CODE);
        }
        if (!user) {
          // Timing equalization (Phase 0 hardening): compare against a dummy
          // hash so "no such account" costs the same as "wrong password" —
          // then return the identical generic failure.
          await bcrypt.compare(password, DUMMY_HASH).catch(() => undefined);
          await noteFailure("login", email);
          return null;
        }

        let valid = false;
        try {
          valid = await bcrypt.compare(password, user.password);
        } catch (err) {
          // bcrypt throws on a malformed stored hash — that IS an
          // infrastructure/data problem, not the user's password being wrong.
          console.error(authLogContext("hash-compare", classifyThrown(err)));
          throw new Error(AUTH_INFRA_ERROR_CODE);
        }
        if (!valid) {
          await noteFailure("login", email);
          return null;
        }
        await noteSuccess("login", email);

        const { id, email: e } = user;
        return { id, email: e };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) session.user.id = token.uid;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  // 7-day rolling session instead of the v4 default of 30 days (finding H-2).
  // Roles are additionally re-checked against the DB in requireRole().
  session: { strategy: "jwt" as const, maxAge: 7 * 24 * 60 * 60 },
  // Validated in lib/env.ts: in production this is guaranteed present and
  // >= 32 chars (or the app fails fast at boot instead of at request time).
  secret: env.NEXTAUTH_SECRET,
};
