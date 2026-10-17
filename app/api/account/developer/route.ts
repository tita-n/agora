import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readJson, sameOrigin } from "@/lib/auth-route";

export const dynamic = "force-dynamic";

/**
 * POST /api/account/developer — "Become a developer". Idempotent: creates
 * the DeveloperProfile or updates its intro fields. One account can be a
 * customer AND a developer; nothing here touches their businesses.
 */
const devSchema = z.object({
  displayName: z.string().trim().min(2).max(60).optional(),
  bio: z.string().trim().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const blocked = sameOrigin(req);
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = devSchema.safeParse((await readJson(req)) ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Check the form" }, { status: 400 });

  const data = { ...(parsed.data.displayName ? { displayName: parsed.data.displayName } : {}), ...(parsed.data.bio !== undefined ? { bio: parsed.data.bio } : {}) };
  const profile = await prisma.developerProfile.upsert({
    where: { userId: user.id },
    update: data,
    create: { userId: user.id, ...data },
    select: { id: true, displayName: true, bio: true },
  });
  return NextResponse.json({ ok: true, profile });
}
