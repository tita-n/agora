"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { uploadLogo } from "@/lib/blob-client";
import { THEMES, THEME_CATALOG } from "@/themes/registry";
import { defaultSiteConfig } from "@/lib/site-config";
import type { SiteData } from "@/lib/site-data";
import { WEEKDAYS, type Weekday } from "@/lib/opening-hours";
import { formatNaira } from "@/lib/money";
import type { PaymentInstructions } from "@/lib/payments/types";

/**
 * 5-step onboarding wizard (Phase 2.5). Holds the DRAFT in client state
 * only — nothing is persisted server-side until the final "Pay & publish"
 * click creates the OnboardingSession and the payment. No Business row
 * exists until a verified payment fulfills that session.
 *
 * The preview step renders the SELECTED theme's real component from draft
 * state — the same pure functions the server runs against DB state (theme
 * contract, themes/types.ts), so what you preview is literally what ships.
 * Links inside the preview are inert on purpose (a draft has no URL yet).
 */

export interface WizardTheme {
  name: string;
  priceKobo: number;
  slug: string;
  description: string | null;
}

interface DayForm {
  closed: boolean;
  open: string;
  close: string;
}
type HoursForm = Record<Weekday, DayForm>;

const EMPTY_HOURS: HoursForm = Object.fromEntries(
  WEEKDAYS.map((d) => [d, { closed: d === "sunday", open: "", close: "" }])
) as HoursForm;

interface Draft {
  subdomain: string;
  name: string;
  description: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  primaryColor: string;
  logoUrl: string;
  themeSlug: string;
  whatsappNumber: string;
  instagramUrl: string;
  facebookUrl: string;
  tiktokUrl: string;
  mapsUrl: string;
  hours: HoursForm;
}

const EMPTY_DRAFT: Draft = {
  subdomain: "",
  name: "",
  description: "",
  contactEmail: "",
  contactPhone: "",
  address: "",
  primaryColor: "#111827",
  logoUrl: "",
  themeSlug: "minimal",
  whatsappNumber: "",
  instagramUrl: "",
  facebookUrl: "",
  tiktokUrl: "",
  mapsUrl: "",
  hours: EMPTY_HOURS,
};

/** Hours form → draftSchema input (all-closed collapses to undefined). */
function hoursPayload(hours: HoursForm) {
  const out: Record<string, { closed: boolean; open?: string; close?: string }> = {};
  let anyOpen = false;
  for (const d of WEEKDAYS) {
    const day = hours[d];
    if (day.closed || !day.open || !day.close) out[d] = { closed: true };
    else {
      out[d] = { closed: false, open: day.open, close: day.close };
      anyOpen = true;
    }
  }
  return anyOpen ? out : undefined;
}

/** Minimal-safe primary color for previews (mirrors MinimalSite's fallback). */
const safeHex = (v: string) => (/^#[0-9a-fA-F]{6}$/.test(v) ? v : "#111827");

function draftToSiteData(draft: Draft): SiteData {
  return {
    themeKey: draft.themeSlug,
    business: {
      name: draft.name || "Your Business",
      description: draft.description || null,
      logoUrl: draft.logoUrl || null,
      contactEmail: draft.contactEmail || null,
      contactPhone: draft.contactPhone || null,
      address: draft.address || null,
      whatsappDigits: /^[1-9]\d{7,14}$/.test(draft.whatsappNumber.replace(/\D/g, ""))
        ? draft.whatsappNumber.replace(/\D/g, "")
        : null,
      instagramUrl: draft.instagramUrl || null,
      facebookUrl: draft.facebookUrl || null,
      tiktokUrl: draft.tiktokUrl || null,
      mapsUrl: draft.mapsUrl || null,
      openingHours: null, // rendered live below instead — preview shows the SHAPE
    },
    config: defaultSiteConfig(safeHex(draft.primaryColor)),
    products: [],
    categories: [],
    activeCategory: null,
    services: [],
    gallery: [],
    testimonials: [],
    pagination: null,
  };
}

type SubdomainCheck =
  | { state: "idle" | "checking" }
  | { state: "ok" }
  | { state: "taken"; reason: string };

export function OnboardWizard({
  userId,
  rootDomain,
  themes,
  hostingFeeKobo,
}: {
  userId: string;
  rootDomain: string;
  themes: WizardTheme[];
  hostingFeeKobo: number;
}) {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [check, setCheck] = useState<SubdomainCheck>({ state: "idle" });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [issued, setIssued] = useState<PaymentInstructions | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const latestCheck = useRef(0);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const setDay = (day: Weekday, patch: Partial<DayForm>) =>
    setDraft((d) => ({ ...d, hours: { ...d.hours, [day]: { ...d.hours[day], ...patch } } }));

  const selectedTheme =
    themes.find((t) => t.slug === draft.themeSlug) ?? themes[0] ?? { name: "Minimal", priceKobo: 0, slug: "minimal", description: null };

  // Step 1: debounced live availability (server runs lib/tenant rules + DB).
  useEffect(() => {
    const sub = draft.subdomain.trim().toLowerCase();
    if (step !== 1 || sub === "") {
      setCheck({ state: "idle" });
      return;
    }
    const id = ++latestCheck.current;
    setCheck({ state: "checking" });
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/onboarding/subdomain-check?subdomain=${encodeURIComponent(sub)}`
        );
        const json = (await res.json()) as { available?: boolean; reason?: string };
        if (latestCheck.current !== id) return; // a newer request won
        setCheck(
          json.available
            ? { state: "ok" }
            : { state: "taken", reason: json.reason ?? "Not available" }
        );
      } catch {
        if (latestCheck.current === id) setCheck({ state: "idle" });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [draft.subdomain, step]);

  async function onLogoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const { url, error } = await uploadLogo(userId, file);
      if (url) set("logoUrl", url);
      else setUploadError(error ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function pay() {
    setPaying(true);
    setPayError(null);
    try {
      const payload = {
        subdomain: draft.subdomain,
        name: draft.name,
        description: draft.description,
        contactEmail: draft.contactEmail,
        contactPhone: draft.contactPhone,
        address: draft.address,
        primaryColor: draft.primaryColor,
        logoUrl: draft.logoUrl,
        themeSlug: draft.themeSlug,
        whatsappNumber: draft.whatsappNumber || undefined,
        instagramUrl: draft.instagramUrl || undefined,
        facebookUrl: draft.facebookUrl || undefined,
        tiktokUrl: draft.tiktokUrl || undefined,
        mapsUrl: draft.mapsUrl || undefined,
        openingHours: hoursPayload(draft.hours),
      };
      const res = await fetch("/api/onboarding/payment-init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as {
        instructions?: PaymentInstructions;
        error?: string;
        issues?: { path: string; message: string }[];
      };
      if (!res.ok || !json.instructions) {
        setPayError(json.issues?.[0]?.message ?? json.error ?? "Could not start payment");
        return;
      }
      const ins = json.instructions;
      if (ins.type === "checkout_redirect" && ins.redirectUrl) {
        window.location.assign(ins.redirectUrl); // paystack provider: hosted page
        return;
      }
      setIssued(ins); // manual provider: show transfer instructions
    } catch {
      setPayError("Network error — please try again.");
    } finally {
      setPaying(false);
    }
  }

  const totalKobo = selectedTheme.priceKobo + hostingFeeKobo;
  const canLeaveStep1 = check.state === "ok";
  const PreviewTheme = THEMES[draft.themeSlug] ?? THEMES.minimal;

  return (
    <main className="min-h-screen bg-paper px-4 py-12">
      <div className="mx-auto max-w-xl">
        {/* Step indicator */}
        <ol className="mb-8 flex flex-wrap items-center justify-center gap-2 text-xs font-medium">
          {["Subdomain", "Profile", "Theme", "Preview", "Payment"].map((label, i) => {
            const n = i + 1;
            return (
              <li key={label} className="flex items-center gap-2">
                {i > 0 && <span className="text-ink-faint">—</span>}
                <span
                  className={
                    n === step
                      ? "rounded-full bg-ink px-3 py-1 text-white"
                      : n < step
                        ? "rounded-full bg-gray-200 px-3 py-1 text-ink"
                        : "rounded-full px-3 py-1 text-ink-faint"
                  }
                >
                  {n < step ? `✓ ${label}` : label}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="rounded-xl border border-rule bg-card p-6 shadow-sm">
          {step === 1 && (
            <section>
              <h1 className="text-xl font-bold text-ink">Choose your address</h1>
              <p className="mt-1 text-sm text-ink-muted">
                This is where your site will live. Lowercase letters, numbers
                and hyphens.
              </p>
              <div className="mt-4 flex items-center gap-2 rounded-md border border-rule-strong px-3 py-2 focus-within:border-ink">
                <input
                  autoFocus
                  value={draft.subdomain}
                  onChange={(e) =>
                    set("subdomain", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                  }
                  placeholder="myboutique"
                  className="min-w-0 flex-1 text-sm outline-none"
                  maxLength={63}
                />
                <span className="shrink-0 text-sm text-ink-faint">.{rootDomain}</span>
              </div>
              <p
                className={`mt-2 min-h-5 text-xs ${
                  check.state === "ok"
                    ? "text-success"
                    : check.state === "taken"
                      ? "text-danger"
                      : "text-ink-faint"
                }`}
                role="status"
              >
                {check.state === "checking" && "Checking…"}
                {check.state === "ok" && "Available ✓"}
                {check.state === "taken" && check.reason}
              </p>
              <NextButton disabled={!canLeaveStep1} onClick={() => setStep(2)} />
            </section>
          )}

          {step === 2 && (
            <section>
              <h1 className="text-xl font-bold text-ink">Your business profile</h1>
              <p className="mt-1 text-sm text-ink-muted">
                Everything here is optional except the name — a name-only
                site should still look great. WhatsApp + hours light up the
                order/book buttons on real themes.
              </p>
              <div className="mt-4 space-y-4">
                <Field label="Business name *">
                  <input
                    value={draft.name}
                    onChange={(e) => set("name", e.target.value)}
                    maxLength={80}
                    className="w-full rounded-md border border-rule-strong px-3 py-2 text-sm focus:border-ink focus:outline-none"
                  />
                </Field>
                <Field label="Short description">
                  <textarea
                    value={draft.description}
                    onChange={(e) => set("description", e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="What you sell, who you are — 1–2 sentences."
                    className="w-full rounded-md border border-rule-strong px-3 py-2 text-sm focus:border-ink focus:outline-none"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Contact email">
                    <input
                      type="email"
                      value={draft.contactEmail}
                      onChange={(e) => set("contactEmail", e.target.value)}
                      className="w-full rounded-md border border-rule-strong px-3 py-2 text-sm focus:border-ink focus:outline-none"
                    />
                  </Field>
                  <Field label="Phone">
                    <input
                      value={draft.contactPhone}
                      onChange={(e) => set("contactPhone", e.target.value)}
                      className="w-full rounded-md border border-rule-strong px-3 py-2 text-sm focus:border-ink focus:outline-none"
                    />
                  </Field>
                </div>
                <Field label="Address">
                  <input
                    value={draft.address}
                    onChange={(e) => set("address", e.target.value)}
                    className="w-full rounded-md border border-rule-strong px-3 py-2 text-sm focus:border-ink focus:outline-none"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="WhatsApp number (orders & bookings)">
                    <input
                      value={draft.whatsappNumber}
                      onChange={(e) => set("whatsappNumber", e.target.value)}
                      placeholder="0803 123 4567"
                      className="w-full rounded-md border border-rule-strong px-3 py-2 text-sm focus:border-ink focus:outline-none"
                      maxLength={24}
                    />
                  </Field>
                  <Field label="Google Maps link">
                    <input
                      value={draft.mapsUrl}
                      onChange={(e) => set("mapsUrl", e.target.value)}
                      placeholder="https://maps.google.com/…"
                      className="w-full rounded-md border border-rule-strong px-3 py-2 text-sm focus:border-ink focus:outline-none"
                      maxLength={400}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Instagram">
                    <input
                      value={draft.instagramUrl}
                      onChange={(e) => set("instagramUrl", e.target.value)}
                      placeholder="instagram.com/you"
                      className="w-full rounded-md border border-rule-strong px-3 py-2 text-sm focus:border-ink focus:outline-none"
                      maxLength={300}
                    />
                  </Field>
                  <Field label="Facebook">
                    <input
                      value={draft.facebookUrl}
                      onChange={(e) => set("facebookUrl", e.target.value)}
                      placeholder="facebook.com/you"
                      className="w-full rounded-md border border-rule-strong px-3 py-2 text-sm focus:border-ink focus:outline-none"
                      maxLength={300}
                    />
                  </Field>
                  <Field label="TikTok">
                    <input
                      value={draft.tiktokUrl}
                      onChange={(e) => set("tiktokUrl", e.target.value)}
                      placeholder="tiktok.com/@you"
                      className="w-full rounded-md border border-rule-strong px-3 py-2 text-sm focus:border-ink focus:outline-none"
                      maxLength={300}
                    />
                  </Field>
                </div>

                <fieldset className="rounded-md border border-rule p-3">
                  <legend className="px-1 text-xs font-medium text-ink-muted">Opening hours (optional)</legend>
                  <div className="space-y-1.5">
                    {WEEKDAYS.map((day) => (
                      <div key={day} className="flex flex-wrap items-center gap-2 text-xs capitalize">
                        <span className="w-16 font-medium">{day}</span>
                        <label className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={draft.hours[day].closed}
                            onChange={(e) => setDay(day, { closed: e.target.checked })}
                          />
                          Closed
                        </label>
                        {!draft.hours[day].closed && (
                          <>
                            <input
                              type="time"
                              value={draft.hours[day].open}
                              onChange={(e) => setDay(day, { open: e.target.value })}
                              className="rounded border border-rule-strong px-2 py-1"
                              aria-label={`${day} opening time`}
                            />
                            <span className="text-ink-faint">→</span>
                            <input
                              type="time"
                              value={draft.hours[day].close}
                              onChange={(e) => setDay(day, { close: e.target.value })}
                              className="rounded border border-rule-strong px-2 py-1"
                              aria-label={`${day} closing time`}
                            />
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-ink-faint">
                    Shown on Bistro & Studio; all-Closed is treated as “no hours listed”.
                  </p>
                </fieldset>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Brand color">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={safeHex(draft.primaryColor)}
                        onChange={(e) => set("primaryColor", e.target.value)}
                        className="h-9 w-12 cursor-pointer rounded border border-rule-strong bg-card p-0.5"
                        aria-label="Pick a brand color"
                      />
                      <span className="text-xs text-ink-muted">{draft.primaryColor || "default"}</span>
                    </div>
                  </Field>
                  <Field label="Logo (PNG/JPG/WebP, ≤2 MB)">
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer rounded-md border border-dashed border-rule-strong px-3 py-1.5 text-xs text-ink-muted hover:bg-paper">
                        {uploading ? "Uploading…" : draft.logoUrl ? "Replace" : "Upload"}
                        <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onLogoPick} />
                      </label>
                      {uploadError && (
                        <span className="text-xs text-danger">{uploadError}</span>
                      )}
                      {draft.logoUrl && (
                        <Image
                          src={draft.logoUrl}
                          alt="Logo preview"
                          width={32}
                          height={32}
                          className="h-8 w-8 rounded object-contain"
                        />
                      )}
                    </div>
                  </Field>
                </div>
              </div>
              <div className="mt-6 flex justify-between">
                <BackButton onClick={() => setStep(1)} />
                <NextButton disabled={draft.name.trim() === ""} onClick={() => setStep(3)} />
              </div>
            </section>
          )}

          {step === 3 && (
            <section>
              <h1 className="text-xl font-bold text-ink">Choose a theme</h1>
              <p className="mt-1 text-sm text-ink-muted">
                The theme decides how your content looks. Open a full example
                of any theme first — they all show YOUR color and name in the
                live preview on the next step.
              </p>
              <div role="radiogroup" aria-label="Theme" className="mt-4 space-y-3">
                {themes.map((theme) => {
                  const meta = THEME_CATALOG.find((c) => c.key === theme.slug);
                  const active = draft.themeSlug === theme.slug;
                  return (
                    <button
                      type="button"
                      key={theme.slug}
                      role="radio"
                      aria-checked={active}
                      onClick={() => set("themeSlug", theme.slug)}
                      className={`block w-full rounded-md border p-4 text-left transition ${
                        active ? "border-ink bg-paper shadow-sm" : "border-rule hover:border-gray-400"
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-semibold text-ink">{theme.name}</span>
                        <span className="text-sm text-ink-muted">{formatNaira(theme.priceKobo)}/mo</span>
                      </div>
                      {meta && <p className="mt-1 text-xs text-ink-muted">{meta.forWho}</p>}
                      <p className="mt-2 text-xs">
                        <a
                          href={`/preview/${theme.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-sky-700 underline"
                        >
                          See a full example site ↗
                        </a>
                      </p>
                    </button>
                  );
                })}
              </div>
              {draft.themeSlug === "minimal" && (
                <p className="mt-3 text-xs text-ink-faint">
                  Minimal is a one-page card — catalog themes come with
                  product & menu editors after you go live.
                </p>
              )}
              <div className="mt-6 flex justify-between">
                <BackButton onClick={() => setStep(2)} />
                <NextButton onClick={() => setStep(4)} label="See it with my details" />
              </div>
            </section>
          )}

          {step === 4 && (
            <section>
              <h1 className="text-xl font-bold text-ink">Live preview</h1>
              <p className="mt-1 text-sm text-ink-muted">
                This is exactly what visitors at{" "}
                <span className="font-mono">
                  {draft.subdomain || "yours"}.{rootDomain}
                </span>{" "}
                will see — your real theme, your real data. (Links are idle
                in preview; your site has no address until payment.)
              </p>
              <div
                className="mt-4 max-h-[70vh] overflow-y-auto rounded-md border border-rule"
                onClickCapture={(e) => {
                  // Inert preview: any click on a link inside the render is
                  // swallowed (draft content has no home to navigate to yet).
                  const target = (e.target as HTMLElement).closest("a");
                  if (target) e.preventDefault();
                }}
              >
                <PreviewTheme.Site data={draftToSiteData(draft)} agoraHref="/" />
              </div>
              <div className="mt-6 flex justify-between">
                <BackButton onClick={() => setStep(3)} />
                <NextButton onClick={() => setStep(5)} label="Continue to payment" />
              </div>
            </section>
          )}

          {step === 5 && (
            <section>
              {acknowledged ? (
                <>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-2xl">✓</div>
                  <h1 className="mt-4 text-xl font-bold text-ink">Thanks — we&apos;ll verify shortly</h1>
                  <p className="mt-2 text-sm text-ink-muted">
                    Transfers are checked and activated manually, usually the
                    same business day. Nothing else is needed from you: as soon
                    as your payment is confirmed your site goes live and your
                    dashboard will show it. Keep your transfer receipt handy.
                  </p>
                  <a
                    href="/dashboard"
                    className="mt-6 inline-block rounded-md border border-rule-strong px-5 py-2.5 text-sm font-medium text-ink hover:bg-paper"
                  >
                    Go to dashboard
                  </a>
                </>
              ) : issued ? (
                <>
                  <h1 className="text-xl font-bold text-ink">Send your transfer</h1>
                  <p className="mt-1 text-sm text-ink-muted">
                    Transfer the exact amount below, with the reference as your
                    transfer narration — that&apos;s how we match it to you.
                  </p>
                  <dl className="mt-4 divide-y rounded-md border border-rule text-sm">
                    <CopyRow label="Amount" value={formatNaira(issued.amountKobo)} />
                    <CopyRow label="Bank" value={issued.bankName ?? "—"} noCopy />
                    <CopyRow label="Account name" value={issued.accountName ?? "—"} noCopy />
                    <CopyRow label="Account number" value={issued.accountNumber ?? "—"} />
                    <CopyRow label="Reference" value={issued.reference ?? "—"} mono />
                  </dl>
                  {payError && (
                    <p className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">{payError}</p>
                  )}
                  <button
                    onClick={() => setAcknowledged(true)}
                    className="mt-6 w-full rounded-md bg-ink py-2.5 text-sm font-semibold text-white hover:bg-ink/80"
                  >
                    I&apos;ve made the transfer
                  </button>
                  <p className="mt-2 text-center text-xs text-ink-faint">
                    This just lets us know to look out for it — your site activates
                    when we&apos;ve confirmed the payment.
                  </p>
                </>
              ) : (
                <>
                  <h1 className="text-xl font-bold text-ink">Confirm &amp; pay</h1>
                  <p className="mt-1 text-sm text-ink-muted">
                    Your site is created the moment payment is confirmed.
                  </p>
                  <dl className="mt-4 divide-y rounded-md border border-rule text-sm">
                    <Row label={`"${selectedTheme.name}" theme — monthly`} value={formatNaira(selectedTheme.priceKobo)} />
                    <Row label="Hosting — monthly" value={formatNaira(hostingFeeKobo)} />
                    <div className="flex items-center justify-between px-4 py-3 font-semibold">
                      <dt>Total</dt>
                      <dd>{formatNaira(totalKobo)}</dd>
                    </div>
                  </dl>
                  <div className="mt-3 rounded-md bg-paper px-4 py-2 text-xs text-ink-muted">
                    <span className="font-mono">{draft.subdomain}.{rootDomain}</span> →{" "}
                    {draft.name || "Your Business"}
                  </div>
                  {payError && (
                    <p className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">{payError}</p>
                  )}
                  <div className="mt-6 flex items-center justify-between">
                    <BackButton onClick={() => setStep(4)} />
                    <button
                      onClick={pay}
                      disabled={paying}
                      className="rounded-md bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/80 disabled:opacity-50"
                    >
                      {paying ? "Preparing…" : `Continue — ${formatNaira(totalKobo)}`}
                    </button>
                  </div>
                </>
              )}
            </section>
          )}

        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-left">
      <span className="mb-1 block text-xs font-medium text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

function CopyRow({
  label,
  value,
  mono,
  noCopy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  noCopy?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable (permissions/http) — value is visible anyway
    }
  }
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-ink-muted">
      <dt className="shrink-0">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2">
        <span className={`truncate ${mono ? "font-mono font-semibold text-ink" : "font-medium text-ink"}`}>
          {value}
        </span>
        {!noCopy && (
          <button
            onClick={copy}
            className="shrink-0 rounded border border-rule px-1.5 py-0.5 text-[10px] font-medium text-ink-muted hover:bg-paper"
          >
            {copied ? "copied ✓" : "copy"}
          </button>
        )}
      </dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-ink-muted">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function NextButton({
  onClick,
  disabled,
  label = "Continue",
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="mt-6 w-full rounded-md bg-ink py-2.5 text-sm font-semibold text-white hover:bg-ink/80 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md border border-rule-strong px-4 py-2.5 text-sm font-medium text-ink-muted hover:bg-paper"
    >
      Back
    </button>
  );
}
