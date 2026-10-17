import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isStaffId } from "@/lib/auth";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
// the self-fetch below needs room for the longest job's own work
export const maxDuration = 60;

/**
 * POST /api/admin/ops/run  { job }
 *
 * Manual trigger for the four Vercel crons, for testing through the browser
 * instead of curl+bearer (Admin → Operations). This endpoint is the ONLY
 * place CRON_SECRET is presented — it never reaches the client: the
 * browser POSTs a job NAME from a fixed allow-list, the server then calls
 * the cron route on its own origin with the bearer header, and the cron's
 * JSON summary is passed back for display.
 *
 * Deliberately thin: no state, no "last run" record, no queue — it just
 * borrows the crons' own auth and idempotence. Every job it can trigger is
 * safe to run at any time (all four are upsert/dedup-guarded by design);
 * that property is what makes exposing a "run now" button acceptable, and
 * it should stay true for any job added to the list.
 */
const JOBS = {
  "usage-snapshot": "/api/cron/usage-snapshot",
  "renewal-reminders": "/api/cron/renewal-reminders",
  "past-due-sweep": "/api/cron/past-due-sweep",
  "dev-payouts": "/api/cron/dev-payouts",
} as const;
export type OpsJob = keyof typeof JOBS;

export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isStaffId(user.id))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  let job: unknown;
  try {
    job = (await req.json() as { job?: unknown }).job;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof job !== "string" || !(job in JOBS)) {
    return NextResponse.json({ error: "Unknown job" }, { status: 400 });
  }
  const path: string = JOBS[job as OpsJob];

  // Loop back through the platform edge, exactly like Vercel's scheduler
  // would: same routing, same middleware, same handler — not a function
  // import that could drift from what the real schedule runs.
  const target = new URL(path, req.nextUrl.origin).toString();
  try {
    const res = await fetch(target, {
      method: "GET",
      headers: env.CRON_SECRET
        ? { authorization: `Bearer ${env.CRON_SECRET}` }
        : undefined, // local dev without CRON_SECRET: the cron route allows it by design
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });
    const text = await res.text();
    let summary: unknown = text;
    try {
      summary = JSON.parse(text);
    } catch {
      /* keep raw text (e.g. an HTML error page) */
    }
    return NextResponse.json({ ok: res.ok, status: res.status, summary });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Self-call failed: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 502 }
    );
  }
}
