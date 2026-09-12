import { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { env } from "./env";

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
        if (!credentials?.email || !credentials?.password) return null;

        let user;
        try {
          user = await prisma.user.findUnique({
            where: { email: credentials.email },
          });
        } catch (err) {
          // DB unreachable etc. (finding M-12): log server-side — never the
          // credentials — and fail closed to the generic error.
          console.error(
            "[auth] login lookup failed:",
            err instanceof Error ? err.message : err
          );
          return null;
        }
        if (!user) return null;

        try {
          const valid = await bcrypt.compare(
            credentials.password,
            user.password
          );
          if (!valid) return null;
        } catch (err) {
          console.error(
            "[auth] password comparison failed:",
            err instanceof Error ? err.message : err
          );
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.uid = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) session.user.id = token.uid;
      if (token.role) session.user.role = token.role;
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
