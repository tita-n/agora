/**
 * Shared presentational primitives for themes (Phase 2.5). Still pure
 * props→JSX — no fetching, no client JS (see themes/types.ts contract).
 * Themes compose these so colour/fonts/hours/contact render consistently
 * while each theme owns its own look-and-feel.
 */
import Image from "next/image";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { readableTextColor } from "@/lib/color";
import { buildWaLink } from "@/lib/contacts";
import { formatHours } from "@/lib/opening-hours";
import type { SiteData, SitePagination } from "@/lib/site-data";
import type { FontPairKey, SectionType } from "@/lib/site-config";
import { priceText } from "@/lib/site-data";

const FONT_VARS: Record<FontPairKey, { display: string; body: string }> = {
  clean: { display: "var(--font-inter)", body: "var(--font-inter)" },
  editorial: { display: "var(--font-playfair)", body: "var(--font-inter)" },
  grotesk: { display: "var(--font-grotesk)", body: "var(--font-inter)" },
};

export function ThemeRoot({
  data,
  children,
}: {
  data: SiteData;
  children: ReactNode;
}): ReactElement {
  const { primaryColor, fontPairKey } = data.config;
  const onPrimary = readableTextColor(primaryColor);
  const fonts = FONT_VARS[fontPairKey];
  const style = {
    "--ap": primaryColor,
    "--ap-ink": onPrimary,
    "--ap-focus": primaryColor,
    "--ap-head": fonts.display,
    fontFamily: fonts.body,
  } as CSSProperties;
  return (
    <div className="site min-h-screen bg-white text-gray-900" style={style}>
      {children}
    </div>
  );
}

export function Section({
  id,
  title,
  children,
  tone = "plain",
}: {
  id: SectionType;
  title?: string;
  children: ReactNode;
  tone?: "plain" | "soft";
}): ReactElement {
  return (
    <section
      id={id}
      aria-label={title}
      className={tone === "soft" ? "border-y border-gray-100 bg-gray-50 px-4 py-12" : "px-4 py-12"}
    >
      <div className="mx-auto max-w-5xl">
        {title && (
          <h2
            className="text-2xl font-bold tracking-tight"
            style={{ fontFamily: "var(--ap-head)" }}
          >
            {title}
          </h2>
        )}
        {children}
      </div>
    </section>
  );
}

/** The primary WhatsApp CTA. Returns null (renders nothing) without a
 * usable stored number — themes never branch on "is this safe". */
export function WaButton({
  digits,
  message,
  label,
  size = "md",
  inverted = false,
}: {
  digits: string | null;
  message: string;
  label: string;
  size?: "md" | "lg";
  /** for use ON the accent colour: button becomes ink with accent text */
  inverted?: boolean;
}): ReactElement | null {
  const href = buildWaLink(digits, message);
  if (!href) return null;
  const pad = size === "lg" ? "px-8 py-4 text-base" : "px-5 py-2.5 text-sm";
  const style = inverted
    ? { backgroundColor: "var(--ap-ink)", color: "var(--ap)" }
    : { backgroundColor: "var(--ap)", color: "var(--ap-ink)" };
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-block rounded-full font-semibold shadow-sm transition-opacity hover:opacity-90 ${pad}`}
      style={style}
    >
      {label}
    </a>
  );
}

/** Small inline WhatsApp text link for per-item order/booking rows. */
export function WaInline({
  digits,
  message,
  label,
}: {
  digits: string | null;
  message: string;
  label: string;
}): ReactElement | null {
  const href = buildWaLink(digits, message);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap text-sm font-semibold underline decoration-2" style={{ color: "var(--ap)" }}>
      {label}
    </a>
  );
}

/** Query-preserving page link for grids (no JS — plain <a> navigation). */
export function pageHref(p: SitePagination, target: number, activeCategory: string | null): string {
  const q = new URLSearchParams();
  if (target > 1) q.set("page", String(target));
  if (activeCategory) q.set("cat", activeCategory);
  const s = q.toString();
  return s ? `?${s}` : ".";
}

export function Pager({
  pagination,
  activeCategory,
}: {
  pagination: SitePagination;
  activeCategory: string | null;
}): ReactElement | null {
  if (pagination.totalPages <= 1) return null;
  const { page, totalPages } = pagination;
  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-between text-sm">
      {page > 1 ? (
        <a href={pageHref(pagination, page - 1, activeCategory)} className="rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-50">
          ← Previous
        </a>
      ) : (
        <span />
      )}
      <span className="text-gray-500">
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <a href={pageHref(pagination, page + 1, activeCategory)} className="rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-50">
          Next →
        </a>
      ) : (
        <span />
      )}
    </nav>
  );
}

/** Category filter chips — server-rendered links, zero client JS. */
export function CategoryChips({
  categories,
  active,
}: {
  categories: string[];
  active: string | null;
}): ReactElement | null {
  if (categories.length < 2) return null;
  const chip = (label: string, cat: string | null) => {
    const q = cat ? `?cat=${encodeURIComponent(cat)}` : ".";
    const isActive = active === cat;
    return (
      <a
        key={label}
        href={q}
        aria-current={isActive ? "page" : undefined}
        className="inline-block rounded-full border px-3 py-1 text-xs font-semibold"
        style={
          isActive
            ? { backgroundColor: "var(--ap)", borderColor: "var(--ap)", color: "var(--ap-ink)" }
            : { borderColor: "#d1d5db", color: "#374151" }
        }
      >
        {label}
      </a>
    );
  };
  return (
    <div className="mt-4 flex flex-wrap gap-2" role="navigation" aria-label="Product categories">
      {chip("All", null)}
      {categories.map((c) => chip(c, c))}
    </div>
  );
}

export function ProductImage({
  url,
  alt,
  priority = false,
}: {
  url: string;
  alt: string;
  priority?: boolean;
}): ReactElement {
  return (
    <Image
      src={url}
      alt={alt}
      fill
      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
      className="object-cover"
      priority={priority}
    />
  );
}

export function LogoMark({
  logoUrl,
  name,
  size = 72,
}: {
  logoUrl: string | null;
  name: string;
  size?: number;
}): ReactElement | null {
  if (!logoUrl) return null;
  return (
    <Image
      src={logoUrl}
      alt={`${name} logo`}
      width={size}
      height={size}
      className="rounded-xl object-contain"
      style={{ width: size, height: size }}
      priority
    />
  );
}

export function Price({ kobo, label }: { kobo: number | null; label?: string | null }): ReactElement {
  return <span className="font-semibold tabular-nums">{priceText(kobo, label)}</span>;
}

export function HoursTable({ data }: { data: SiteData }): ReactElement | null {
  const hours = data.business.openingHours;
  if (!hours) return null;
  // "all days closed" is content-free too — don't render an hours block
  // that only says Closed seven times.
  const anyOpen = Object.values(hours).some((d) => !d.closed);
  if (!anyOpen) return null;
  const short: Record<string, string> = {
    monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday",
    friday: "Friday", saturday: "Saturday", sunday: "Sunday",
  };
  return (
    <ul className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
      {Object.entries(short).map(([key, label]) => (
        <li key={key} className="flex items-center justify-between px-4 py-2.5 text-sm">
          <span className="font-medium">{label}</span>
          <span className={hours[key as keyof typeof hours].closed ? "text-gray-400" : ""}>
            {formatHours(hours[key as keyof typeof hours])}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ContactBlock({ data }: { data: SiteData }): ReactElement | null {
  const b = data.business;
  const has = b.contactEmail || b.contactPhone || b.address || b.instagramUrl || b.facebookUrl || b.tiktokUrl || b.mapsUrl;
  if (!has) return null;
  const links: { label: string; href: string }[] = [];
  if (b.instagramUrl) links.push({ label: "Instagram", href: b.instagramUrl });
  if (b.facebookUrl) links.push({ label: "Facebook", href: b.facebookUrl });
  if (b.tiktokUrl) links.push({ label: "TikTok", href: b.tiktokUrl });
  if (b.mapsUrl) links.push({ label: "Find us on the map", href: b.mapsUrl });
  return (
    <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
      <dl className="space-y-3">
        {b.contactEmail && (
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 font-medium text-gray-500">Email</dt>
            <dd>
              <a href={`mailto:${b.contactEmail}`} className="underline">
                {b.contactEmail}
              </a>
            </dd>
          </div>
        )}
        {b.contactPhone && (
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 font-medium text-gray-500">Phone</dt>
            <dd>{b.contactPhone}</dd>
          </div>
        )}
        {b.address && (
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 font-medium text-gray-500">Address</dt>
            <dd>{b.address}</dd>
          </div>
        )}
      </dl>
      {links.length > 0 && (
        <ul className="space-y-2">
          {links.map((l) => (
            <li key={l.label}>
              <a href={l.href} target="_blank" rel="noopener noreferrer" className="font-medium underline" style={{ color: "var(--ap)" }}>
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The billboard footer every Agora site carries. */
export function SiteFooter({ agoraHref }: { agoraHref: string }): ReactElement {
  return (
    <footer className="border-t border-gray-200 px-4 py-6 text-center">
      <a href={agoraHref} className="text-xs text-gray-400 transition-colors hover:text-gray-600">
        Powered by <span className="font-semibold">Agora</span>
      </a>
    </footer>
  );
}

/** CSS-only mobile nav: <details> disclosure, anchors to sections. */
export function SectionNav({ sections, labels }: { sections: SectionType[]; labels: Partial<Record<SectionType, string>> }): ReactElement | null {
  if (sections.length < 2) return null;
  return (
    <details className="md:hidden">
      <summary
        className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-semibold"
        style={{ backgroundColor: "var(--ap)", color: "var(--ap-ink)" }}
      >
        Menu
      </summary>
      <ul className="mt-2 space-y-1 rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-lg">
        {sections.map((s) => (
          <li key={s}>
            <a href={`#${s}`} className="block rounded px-2 py-1 capitalize hover:bg-gray-50">
              {labels[s] ?? s}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
