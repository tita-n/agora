import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ownerContext, parseBody } from "@/lib/owner-api";
import { buildSiteConfig, siteConfigSchema } from "@/lib/site-config";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/business/site-config — sections order/visibility + colour +
 * font pair. Validated by the exact schema the read path re-parses, so a
 * stored config is ALWAYS in-contract (the defensive read remains for
 * rows written before zod existed / by hand). Business.primaryColor is
 * synced to siteConfig.primaryColor so the legacy Minimal renderer and the
 * new one never disagree mid-edit.
 */
export async function PATCH(req: NextRequest) {
  const ctx = await ownerContext(req);
  if (!ctx.ok) return ctx.res;
  const body = await parseBody(req);
  if (body === null) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const pre = siteConfigSchema.safeParse(body);
  if (!pre.success) {
    return NextResponse.json(
      {
        error: "Please fix the highlighted fields",
        issues: pre.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 422 }
    );
  }
  const config = buildSiteConfig(body as never);
  if (!config) return NextResponse.json({ error: "Invalid site configuration" }, { status: 422 });

  await prisma.business.update({
    where: { id: ctx.businessId },
    data: { siteConfig: config, primaryColor: config.primaryColor },
  });
  return NextResponse.json({ ok: true, config });
}
