"use client";

/**
 * Site design editor (Phase 2.5): section visibility/order + colour + font
 * pair, saved as Business.siteConfig through the validated API. Reordering
 * is ↑/↓ buttons by design (no drag-and-drop dependency, and the whole list
 * is sent so two tabs can't interleave half-orders).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FONT_PAIR_KEYS, FONT_PAIR_LABELS, type FontPairKey, type SectionType, type SiteConfig } from "@/lib/site-config";

const SECTION_LABELS: Record<SectionType, string> = {
  hero: "Hero (name, logo, first line)",
  about: "About (your description)",
  products: "Products / menu",
  services: "Services",
  gallery: "Photo gallery",
  testimonials: "Testimonials",
  hours: "Opening hours",
  contact: "Contact & links",
};

export function SiteDesign({ config, siteUrl, themeLabel, themeSlug }: { config: SiteConfig; siteUrl: string; themeLabel: string; themeSlug: string }) {
  const router = useRouter();
  const [sections, setSections] = useState(config.sections);
  const [primaryColor, setPrimaryColor] = useState(config.primaryColor);
  const [fontPairKey, setFontPairKey] = useState<FontPairKey>(config.fontPairKey);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const move = (index: number, dir: -1 | 1) => {
    const to = index + dir;
    if (to < 0 || to >= sections.length) return;
    const next = [...sections];
    [next[index], next[to]] = [next[to], next[index]];
    setSections(next);
  };

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/business/site-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections, primaryColor, fontPairKey }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; issues?: { message: string }[] };
      if (res.ok && json.ok) {
        setMsg({ ok: true, text: "Saved — live immediately on your site." });
        router.refresh();
      } else {
        setMsg({ ok: false, text: json.issues?.[0]?.message ?? json.error ?? "Could not save" });
      }
    } catch {
      setMsg({ ok: false, text: "Network error — please try again." });
    } finally {
      setBusy(false);
    }
  }

  const hexOk = /^#[0-9a-fA-F]{6}$/.test(primaryColor);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-semibold text-ink">Sections & order</h2>
        <p className="mt-1 text-xs text-ink-muted">
          What appears on your site, top to bottom. A section with nothing in it never shows — toggling it back on is
          free. Add content from Products / Services / Gallery / Testimonials pages.
        </p>
        <ul className="mt-3 divide-y rounded-md border border-rule bg-card">
          {sections.map((s, i) => (
            <li key={s.type} className="flex items-center gap-3 px-3 py-2">
              <span className="flex flex-col">
                <button type="button" aria-label={`Move ${s.type} up`} onClick={() => move(i, -1)} disabled={i === 0} className="px-1 text-ink-faint hover:text-ink disabled:opacity-25">
                  ▲
                </button>
                <button type="button" aria-label={`Move ${s.type} down`} onClick={() => move(i, 1)} disabled={i === sections.length - 1} className="px-1 text-ink-faint hover:text-ink disabled:opacity-25">
                  ▼
                </button>
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{SECTION_LABELS[s.type]}</span>
              <label className="flex items-center gap-2 text-xs font-medium text-ink-muted">
                <input
                  type="checkbox"
                  checked={s.enabled}
                  onChange={(e) =>
                    setSections((prev) => prev.map((p, j) => (j === i ? { ...p, enabled: e.target.checked } : p)))
                  }
                />
                Show
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold text-ink">Brand colour</h2>
          <p className="mt-1 text-xs text-ink-muted">Buttons, headings accents, links. Text on top of it is auto-checked for contrast.</p>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="color"
              aria-label="Pick a brand color"
              value={hexOk ? primaryColor : "#111827"}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded border border-rule-strong bg-card p-0.5"
            />
            <input
              className="w-28 rounded-md border border-rule-strong px-2 py-1.5 text-sm focus:border-ink focus:outline-none"
              value={primaryColor}
              maxLength={7}
              onChange={(e) => setPrimaryColor(e.target.value)}
              aria-label="Brand color hex"
            />
            {!hexOk && <span className="text-xs text-danger">use #rrggbb</span>}
          </div>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-ink">Fonts</h2>
          <p className="mt-1 text-xs text-ink-muted">Self-hosted — no third-party font downloads on your visitors&apos; data plans.</p>
          <div role="radiogroup" aria-label="Font pair" className="mt-2 space-y-1.5">
            {FONT_PAIR_KEYS.map((k) => (
              <label key={k} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${fontPairKey === k ? "border-ink bg-paper" : "border-rule hover:border-gray-400"}`}>
                <input type="radio" name="fontpair" checked={fontPairKey === k} onChange={() => setFontPairKey(k)} />
                {FONT_PAIR_LABELS[k]}
              </label>
            ))}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={busy || !hexOk} className="rounded-md bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink/80 disabled:opacity-50">
          {busy ? "Saving…" : "Save design"}
        </button>
        <a href={siteUrl} className="rounded-md border border-rule-strong px-5 py-2.5 text-sm font-medium text-ink hover:bg-paper">
          View my site ↗
        </a>
      </div>
      {msg && (
        <p className={`text-xs ${msg.ok ? "text-success" : "text-danger"}`} role="status">
          {msg.text}
        </p>
      )}

      <aside className="rounded-md border border-warn/40 bg-warn/10 p-4 text-xs leading-relaxed text-warn">
        <p className="font-semibold">You&apos;re on the “{themeLabel}” theme. <a href={`/t/${themeSlug}`} target="_blank" rel="noopener noreferrer" className="font-normal text-brass underline">See the full example site ↗</a></p>
        <p className="mt-1">
          Theme switching after signup isn&apos;t offered yet — a theme change moves your price, your payment
          schedule and the developer payout, so it&apos;s its own upcoming piece of work. Design choices above apply to
          your current theme; products/services you add are stored and will appear the moment a theme shows them.
        </p>
      </aside>
    </div>
  );
}
