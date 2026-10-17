import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeAuthToken } from "@/lib/auth-tokens";
import { readJson, sameOrigin } from "@/lib/auth-route";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/verify { token }
 * Redeems a verification link (single-use, expiring, hashed at rest).
 * Already-verified + invalid both answer { ok:false } with the same copy —
 * never whether the account exists.
 */
export async function POST(req: NextRequest) {
  const blocked = sameOrigin(req);
  if (blocked) return blocked;
  const parsed = z.object({ token: z.string().min(20).max(100) }).safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "This link is not valid." }, { status: 400 });

  const userId = await consumeAuthToken(parsed.data.token, "verify");
  if (!userId) return NextResponse.json({ ok: false, error: "This link is invalid or has expired. Sign in and request a new one from your account page." });

  await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
