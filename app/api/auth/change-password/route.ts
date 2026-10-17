import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readJson, sameOrigin } from "@/lib/auth-route";

export const dynamic = "force-dynamic";

/** POST /api/auth/change-password { currentPassword, newPassword } (session required) */
export async function POST(req: NextRequest) {
  const blocked = sameOrigin(req);
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = z
    .object({
      currentPassword: z.string().min(1).max(200),
      newPassword: z.string().min(12, "Use at least 12 characters").max(128, "Password is too long (128 max)"),
    })
    .safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ error: "Check the form" }, { status: 400 });

  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { password: true } });
  if (!row || !(await bcrypt.compare(parsed.data.currentPassword, row.password))) {
    return NextResponse.json({ ok: false, error: "Your current password is not right." });
  }
  const hash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { password: hash, passwordChangedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
