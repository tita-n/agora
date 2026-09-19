/**
 * Thin, server-only Vercel REST client shared by the Phase 2 features
 * (usage-snapshot analytics + custom domains). Never imported from client
 * components; the token only exists server-side.
 */
import { env } from "@/lib/env";

export function vercelApiConfigured(): boolean {
  return Boolean(env.VERCEL_ACCESS_TOKEN && env.VERCEL_PROJECT_ID);
}

function base(): string {
  return (env.VERCEL_API_BASE_URL || "https://api.vercel.com").replace(/\/+$/, "");
}

export interface VercelApiResult<T> {
  ok: boolean;
  data?: T;
  /** Human-readable single-line failure for logs + domainError columns. */
  error?: string;
}

export async function vercelApiFetch<T>(
  path: string,
  init: { method?: "GET" | "POST" | "DELETE"; body?: unknown; timeoutMs?: number } = {}
): Promise<VercelApiResult<T>> {
  if (!vercelApiConfigured()) {
    return { ok: false, error: "VERCEL_ACCESS_TOKEN/VERCEL_PROJECT_ID not configured" };
  }
  try {
    const res = await fetch(`${base()}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${env.VERCEL_ACCESS_TOKEN}`,
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
      let reason = `Vercel API ${res.status}`;
      try {
        const parsed = JSON.parse(text) as { error?: { message?: string } };
        if (parsed.error?.message) reason += `: ${parsed.error.message}`;
      } catch {
        /* keep the bare status */
      }
      return { ok: false, error: reason.slice(0, 400) };
    }
    return { ok: true, data: (text ? JSON.parse(text) : {}) as T };
  } catch (err) {
    return {
      ok: false,
      error: `Vercel API request failed: ${err instanceof Error ? err.message : "unknown"}`.slice(0, 400),
    };
  }
}
