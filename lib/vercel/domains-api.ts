/**
 * Vercel project-domains API (Phase 2 custom domains).
 *
 *   POST   /v9/projects/{projectId}/domains          { name }   attach
 *   GET    /v9/projects/{projectId}/domains/{domain}  verified + record info
 *   DELETE /v9/projects/{projectId}/domains/{domain}            detach
 *
 * `verified` from Vercel is the ONLY thing that may flip a Business to
 * domainStatus="verified" (it encodes: DNS seen + TLS issued). We never
 * infer verification from our own DNS lookups — serving traffic requires
 * Vercel to have the certificate anyway.
 */
import { env } from "@/lib/env";
import { vercelApiFetch, vercelApiConfigured, type VercelApiResult } from "./client";

export interface DomainConfigResult {
  verified: boolean;
  /** e.g. "cname.vercel-dns.com" when Vercel knows the expected records. */
  cname?: string;
  apexA?: string[];
}

function projectId(): string {
  return encodeURIComponent(env.VERCEL_PROJECT_ID ?? "");
}

export function domainsApiConfigured(): boolean {
  return vercelApiConfigured();
}

export async function addProjectDomain(name: string): Promise<VercelApiResult<unknown>> {
  return vercelApiFetch(`/v9/projects/${projectId()}/domains`, {
    method: "POST",
    body: { name },
  });
}

export async function removeProjectDomain(name: string): Promise<VercelApiResult<unknown>> {
  return vercelApiFetch(
    `/v9/projects/${projectId()}/domains/${encodeURIComponent(name)}`,
    { method: "DELETE" }
  );
}

export type DomainStatusResult =
  | { status: "unconfigured" }
  | { status: "error"; reason: string }
  | { status: "state"; data: DomainConfigResult };

/**
 * Project-scoped domain record — verified against THIS project (a domain
 * verified on someone else's project must never count). Field shapes are
 * parsed defensively and tolerate Vercel's documentation quirks (e.g.
 * `verified` surfacing as the string "true", records nested under
 * `configuration` OR `verification`), because this return value decides
 * whether live tenant traffic moves to a custom host.
 */
export async function getDomainState(name: string): Promise<DomainStatusResult> {
  if (!domainsApiConfigured()) return { status: "unconfigured" };
  const res = await vercelApiFetch<Record<string, unknown>>(
    `/v9/projects/${projectId()}/domains/${encodeURIComponent(name)}`
  );
  if (!res.ok || !res.data) return { status: "error", reason: res.error ?? "unknown" };
  const d = res.data;
  const cfg = (d.configuration ?? d.verification ?? d) as Record<string, unknown>;
  return {
    status: "state",
    data: {
      verified: d.verified === true || d.verified === "true",
      ...(typeof cfg.cname === "string" ? { cname: cfg.cname } : {}),
      ...(Array.isArray(cfg.a) && cfg.a.every((x) => typeof x === "string")
        ? { apexA: cfg.a as string[] }
        : {}),
    },
  };
}
