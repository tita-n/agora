/**
 * WhatsApp number normalization + wa.me link building, and the social-link
 * allowlist (Phase 2.5). Pure; unit-tested. The STORED form of a WhatsApp
 * number is digits with country code and NO punctuation (wa.me's documented
 * form) — so a tampered DB row can never smuggle a URL through a link.
 */

export interface WhatsappResult {
  ok: boolean;
  /** digits only, with country code (e.g. "2348012345678") when ok */
  digits?: string;
  reason?: string;
}

/**
 * Accepts: "0803 123 4567", "08031234567", "+234 803-123-4567",
 * "2348031234567", "(0803) 123 4567". Nigerian local form (leading 0) gets
 * the +234 country code prepended (default country, per spec); an explicit
 * leading + (any country) is kept as typed.
 */
export function normalizeWhatsapp(raw: string | null | undefined): WhatsappResult {
  if (typeof raw !== "string") return { ok: false, reason: "Enter a WhatsApp number" };
  const s = raw.trim();
  if (!s) return { ok: false, reason: "Enter a WhatsApp number" };
  const hasPlus = s.startsWith("+");
  if (/[a-zA-Z]/.test(s)) return { ok: false, reason: "Digits only, e.g. 0803 123 4567" };
  let digits = s.replace(/[^\d]/g, "");
  if (hasPlus) {
    // explicit country code as typed
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2); // international access code, e.g. 00234...
  } else if (digits.startsWith("0")) {
    digits = `234${digits.slice(1)}`; // local form → Nigeria default
  }
  if (digits.length < 8 || digits.length > 15) {
    return { ok: false, reason: "That doesn't look like a complete phone number" };
  }
  return { ok: true, digits };
}

/**
 * Server-built wa.me order/booking link. `text` is the message the customer
 * will send — encodeURIComponent keeps it inside the query. digits MUST come
 * from normalizeWhatsapp (already enforced at write time; re-checked here so
 * even a hand-seeded row cannot produce a javascript:/data: href — and a
 * leading 0, which normalize would never emit, means a hand-written row:
 * refused rather than opened on a guaranteed-bad number).
 */
export function buildWaLink(digits: string | null | undefined, text: string): string | null {
  if (typeof digits !== "string" || !/^[1-9]\d{7,14}$/.test(digits)) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text.slice(0, 500))}`;
}

/**
 * Social links: https ONLY, on the platform's own hosts (subdomains of the
 * allowlisted root). This is the full defence against javascript:/data:/etc:
 * the URL is parsed, protocol and host must match — everything else is
 * rejected. Stored value is the canonical https origin+path as re-serialized.
 */
export type SocialPlatform = "instagram" | "facebook" | "tiktok";

const SOCIAL_ROOTS: Record<SocialPlatform, string[]> = {
  instagram: ["instagram.com"],
  facebook: ["facebook.com"],
  tiktok: ["tiktok.com"],
};

export function normalizeSocialUrl(platform: SocialPlatform, raw: string | null | undefined):
  | { ok: true; url: string }
  | { ok: false; reason: string } {
  if (typeof raw !== "string") return { ok: false, reason: "Enter a link or leave it empty" };
  const s = raw.trim();
  if (!s) return { ok: true, url: "" }; // cleared is valid — stored as null
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return { ok: false, reason: "That is not a valid link" };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "Links must start with https://" };
  if (u.username || u.password) return { ok: false, reason: "Links cannot embed credentials" };
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  const roots = SOCIAL_ROOTS[platform];
  const onRoot = roots.some((r) => host === r || host.endsWith(`.${r}`));
  if (!onRoot) {
    return { ok: false, reason: `Must be a ${platform}.com link` };
  }
  u.protocol = "https:";
  u.hash = "";
  return { ok: true, url: u.toString().slice(0, 300) };
}
