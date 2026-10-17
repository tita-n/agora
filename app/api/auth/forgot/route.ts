import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/auth-errors";
import { createAuthToken } from "@/lib/auth-tokens";
import { guardAction, noteFailure } from "@/lib/rate-limit";
import { sendPasswordResetEmail } from "@/lib/email";
import { appUrl } from "@/lib/site-urls";
import { readJson, sameOrigin, tooMany } from "@/lib/auth-route";

export const dynamic = "force-dynamic";

/** POST /api/auth/forgot { email } — always 202, even for unknown emails. */
export async function POST(req: NextRequest) {
  const blocked = sameOrigin(req);
  if (blocked) return blocked;
  const parsed = z.object({ email: z.string().trim().min(3) }).safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ ok: true }, { status: 202 });
  const email = normalizeEmail(parsed.data.email) ?? "";

  const limited = await guardAction("reset", email);
  if (limited) return tooMany(limited.retryAfterSec);
  await noteFailure("reset", email);

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
  if (user) {
    const { token } = await createAuthToken(user.id, "reset");
    const link = appUrl(`/reset-password?token=${encodeURIComponent(token)}`);
    await sendPasswordResetEmail(user.email, link);
  }
  // Identical response whether or not the account exists.
  return NextResponse.json({ ok: true }, { status: 202 });
}
