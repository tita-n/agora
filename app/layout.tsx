import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { AuthProvider } from "@/components/auth-provider";

export const metadata: Metadata = {
  title: "Agora",
  description: "Multi-tenant SaaS platform",
};

/**
 * Phase 2.5: tenant themes render with the owner's chosen font PAIR. The
 * three variable fonts are self-hosted via next/font/local (files committed
 * under app/fonts, from the Fontsource project, OFL) — no third-party font
 * requests ever leave the visitor's phone. Each `variable` defines its font
 * family as a CSS custom property; themes reference these by name so the
 * same classes work inside the client-side onboarding preview too.
 */
const inter = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});
const playfair = localFont({
  src: "./fonts/playfair-display-latin-wght-normal.woff2",
  variable: "--font-playfair",
  weight: "400 900",
  display: "swap",
});
const grotesk = localFont({
  src: "./fonts/space-grotesk-latin-wght-normal.woff2",
  variable: "--font-grotesk",
  weight: "300 700",
  display: "swap",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable} ${grotesk.variable}`}>
      <body className="min-h-screen bg-card text-ink antialiased">
        <AuthProvider><ToastProvider>{children}</ToastProvider></AuthProvider>
      </body>
    </html>
  );
}
