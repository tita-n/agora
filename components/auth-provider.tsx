"use client";

import { SessionProvider as NextSessionProvider } from "next-auth/react";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <NextSessionProvider>{children}</NextSessionProvider>;
}