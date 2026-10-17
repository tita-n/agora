import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { consumeAuthToken } from "@/lib/auth-tokens";
import { readJson, sameOrigin } from "@/lib/auth-route";

export const dynamic = "force-dynamic";

const resetSchema = z.object({
  token: z.string().min(20).max(100),
  password: z.string().min(12, "Use at least 12 characters").max(128, "Password is too long (128 max)"),
});

/** POST /api/auth/reset { token, password } */
export async function POST(req: NextRequest) {
  const blocked = sameOrigin(req);
  if (blocked) return blocked;
  const parsed = resetSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const userId = await consumeAuthToken(parsed.data.token, "reset");
  if (!userId) {
    return NextResponse.json({ ok: false, error: "This reset link is invalid or has expired. Start again from “Forgot password”." });
  }

  const hash = await bcrypt.hash(parsed.data.password, 10);
  // The token was atomically consumed above, so a retry can't double-apply;
  // a partial failure here (password set, cleanup lost) is still safe:
  // outstanding reset tokens are only superseded on the next reset request.
  await prisma.user.update({
    where: { id: userId },
    data: { password: hash, passwordChangedAt: new Date() },
  });
  await prisma.authToken.deleteMany({ where: { userId, kind: "reset", usedAt: null } });
  return NextResponse.json({ ok: true });
}
