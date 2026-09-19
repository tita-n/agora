/**
 * Per-host bandwidth via the Vercel Analytics daily-usage endpoint
 * (Pro-plan; returns 401/403/402 elsewhere — that is an EXPECTED,
 * gracefully-handled state, not an error to page about).
 *
 * Contract with the caller: we return usage PER DOMAIN HOSTNAME that
 * Vercel's response mentions. Attribution rules (see usage-snapshot cron):
 *  - a business's wildcard subdomain host (sub.root) is attributed ONLY if
 *    Vercel reports it as its own domain entry — some plans/projects roll
 *    wildcard children into the "*.root" entry; if the exact host never
 *    appears, we report nothing for it and the cron keeps the last known /
 *    manually seeded value (never zeroes it out silently).
 *  - a verified custom domain is a real project domain, so it shows up.
 *
 * UNITS ASSUMPTION (auditable, see README "Upgrading to Vercel Pro"):
 * `dataTransferred` is treated as BYTES (decimal, /1e9 → GB). On first run
 * with real credentials, compare one business against the project's Usage
 * dashboard before trusting invoices — this file is the single place the
 * assumption lives.
 */
import { env } from "@/lib/env";
import { vercelApiFetch, vercelApiConfigured } from "./client";

const BYTES_PER_GB = 1e9;

interface DailyUsageDomainEntry {
  name?: unknown;
  dataTransferred?: unknown;
  requests?: unknown;
}
interface DailyUsageDay {
  domains?: unknown;
}

export interface HostUsage {
  bandwidthGb: number;
  requests: number;
}

/** Parse the API shape defensively: never trust a missing/nested field. */
export function parseDailyUsage(
  json: unknown
): Record<string, HostUsage> {
  const out: Record<string, HostUsage> = {};
  const days = Array.isArray((json as { days?: unknown })?.days)
    ? ((json as { days: DailyUsageDay[] }).days)
    : [];
  for (const day of days) {
    const entries: DailyUsageDomainEntry[] = Array.isArray(day?.domains)
      ? (day.domains as DailyUsageDomainEntry[])
      : [];
    for (const e of entries) {
      if (typeof e?.name !== "string" || !e.name) continue;
      const host = e.name.toLowerCase();
      const gb = num(e.dataTransferred) / BYTES_PER_GB;
      const req = num(e.requests);
      const prev = out[host];
      out[host] = prev
        ? { bandwidthGb: prev.bandwidthGb + gb, requests: prev.requests + req }
        : { bandwidthGb: gb, requests: req };
    }
  }
  return out;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

export type DailyUsageOutcome =
  | { status: "ok"; hosts: Record<string, HostUsage> }
  | { status: "unconfigured" }
  | { status: "unavailable"; reason: string };

export async function fetchDailyUsageByHost(
  periodStart: Date,
  periodEnd: Date
): Promise<DailyUsageOutcome> {
  if (!vercelApiConfigured()) return { status: "unconfigured" };
  const since = Math.floor(periodStart.getTime() / 1000);
  const until = Math.floor(Math.min(periodEnd.getTime(), Date.now()) / 1000);
  const projectId = encodeURIComponent(env.VERCEL_PROJECT_ID ?? "");
  const res = await vercelApiFetch<unknown>(
    `/v1/analytics/daily-usage?projectId=${projectId}&since=${since}&until=${until}`
  );
  if (!res.ok || !res.data) return { status: "unavailable", reason: res.error ?? "unknown" };
  return { status: "ok", hosts: parseDailyUsage(res.data) };
}

