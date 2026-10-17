import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuthToken } from "@/lib/auth-tokens";
import { sendVerificationEmail } from "@/lib/email";
import { appUrl } from "@/lib/site-urls";
import { guardAction, noteFailure } from "@/lib/rate-limit";
import { sameOrigin, tooMany } from "@/lib/auth-route";

export const dynamic = "force-dynamic";

/** POST /api/auth/resend-verify (session required; throttled like signup). */
export async function POST(req: NextRequest) {
  const blocked = sameOrigin(req);
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = await guardAction("signup", user.email);
  if (limited) return tooMany(limited.retryAfterSec);
  await noteFailure("signup", user.email);

  const fresh = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true, emailVerifiedAt: true },
  });
  if (!fresh) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (fresh.emailVerifiedAt) return NextResponse.json({ ok: true, alreadyVerified: true });
  const { token } = await createAuthToken(user.id, "verify");
  await sendVerificationEmail(fresh.email, appUrl(`/verify-email?token=${encodeURIComponent(token)}`));
  return NextResponse.json({ ok: true });
}
