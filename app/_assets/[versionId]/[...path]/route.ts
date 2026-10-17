import { loadPackageByVersionId } from "@/lib/templates/loader";

/**
 * Package assets — served ONLY for files inside a valided, published
 * package's file map (the map IS the allowlist; traversal is structurally
 * impossible: nothing else has a key). Immutable like the versions:
 * the versionId never changes content, so cache forever.
 */
export const dynamic = "force-dynamic"; // package LRU lookup per version, no HTTP caching of the *route*

const TYPES: Record<string, string> = {
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  woff: "font/woff",
  woff2: "font/woff2",
};

const NOT_FOUND = new Response("not found", { status: 404, headers: { "x-content-type-options": "nosniff" } });

export async function GET(_req: Request, ctx: { params: Promise<{ versionId: string; path: string[] }> }) {
  const { versionId, path } = await ctx.params;
  const rel = `assets/${path.join("/")}`;
  if (/[\\ ]|\.\./.test(rel)) return NOT_FOUND;
  let pkg: Awaited<ReturnType<typeof loadPackageByVersionId>> = null;
  try {
    pkg = await loadPackageByVersionId(versionId);
  } catch {
    return NOT_FOUND;
  }
  if (!pkg) return NOT_FOUND;
  const content = pkg.files.get(rel) ?? pkg.files.get(path.join("/"));
  if (content === undefined) return NOT_FOUND;
  const ext = (rel.split(".").pop() ?? "").toLowerCase();
  const type = TYPES[ext];
  if (!type) return NOT_FOUND;
  const body = typeof content === "string" ? content : content;
  return new Response(body as BodyInit, {
    headers: {
      "content-type": type,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
