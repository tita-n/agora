import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/auth-errors";
import { createAuthToken } from "@/lib/auth-tokens";
import { guardAction, noteFailure } from "@/lib/rate-limit";
import { sendVerificationEmail } from "@/lib/email";
import { appUrl } from "@/lib/site-urls";
import { readJson, sameOrigin, tooMany } from "@/lib/auth-route";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/signup — public account creation (Phase 0).
 *
 * No enumeration, ever: a taken email still returns 202 with the same body
 * (no email is sent). Password rules: 12–128 chars — bcryptjs truncates at
 * 72 bytes, which we document rather than silently "fix" (a 128-char cap
 * prevents the classic DoS of hashing megabyte passwords).
 */
const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  // 12 min is the platform floor for a password that can protect a business
  password: z.string().min(12, "Use at least 12 characters").max(128, "Password is too long (128 max)"),
});

export async function POST(req: NextRequest) {
  const blocked = sameOrigin(req);
  if (blocked) return blocked;

  const body = await readJson(req);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the form", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 }
    );
  }
  const email = normalizeEmail(parsed.data.email);

  const limited = await guardAction("signup", email);
  if (limited) return tooMany(limited.retryAfterSec);
  // Every signup ATTEMPT counts against the bucket (there is no "success"
  // reset here): verification-email flood control, not punishment of a
  // legitimate one-shot signup.
  await noteFailure("signup", email);

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    // Generic success — an account for this email just "received a message".
    return NextResponse.json({ ok: true });
  }

  const hash = await bcrypt.hash(parsed.data.password, 10);
  try {
    const created = await prisma.user.create({
      data: { email, password: hash },
      select: { id: true, email: true },
    });
    const { token } = await createAuthToken(created.id, "verify");
    const link = appUrl(`/verify-email?token=${encodeURIComponent(token)}`);
    await sendVerificationEmail(created.email, link);
  } catch (err) {
    // unique race (two tabs) or DB hiccup: same generic answer either way
    console.error(`[signup:create-failed] ${err instanceof Error ? "db" : "unknown"}`);
  }
  return NextResponse.json({ ok: true }, { status: 202 });
}
