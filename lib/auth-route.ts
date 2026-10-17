import { NextRequest, NextResponse } from "next/server";

/** Shared plumbing for public auth mutation routes: same-origin check
 * (cookie-authenticated POSTs), JSON parsing with a hard body ceiling, and
 * the standard 429 shape. */

export function sameOrigin(req: NextRequest): NextResponse | null {
  if (req.headers.get("origin") !== req.nextUrl.origin) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  return null;
}

export async function readJson(req: NextRequest, maxBytes = 8192): Promise<unknown | undefined> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > maxBytes) return undefined;
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

export const EMAIL_FIELD = /^[^\s@]{1,64}@[^\s@]{1,253}$/; // sanity gate only; zod/email validation owns semantics

export function tooMany(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { error: "Too many attempts — wait a little and try again." },
    { status: 429, headers: { "retry-after": String(retryAfterSec) } }
  );
}
