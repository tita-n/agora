"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { uploadLogo } from "@/lib/blob-client";
import { MinimalSite } from "@/components/themes/minimal-site";

/**
 * 4-step onboarding wizard. Holds the DRAFT in client state only — nothing
 * is persisted server-side until the final "Pay & publish" click creates
 * the OnboardingSession and the Paystack transaction. No Business row
 * exists until a verified payment fulfills that session.
 */

interface Draft {
  subdomain: string;
  name: string;
  description: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  primaryColor: string;
  logoUrl: string;
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
};

type SubdomainCheck =
  | { state: "idle" | "checking" }
  | { state: "ok" }
  | { state: "taken"; reason: string };

function naira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

export function OnboardWizard({
  userId,
  rootDomain,
  themeName,
  themePriceKobo,
  hostingFeeKobo,
}: {
  userId: string;
  rootDomain: string;
  themeName: string;
  themePriceKobo: number;
  hostingFeeKobo: number;
}) {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [check, setCheck] = useState<SubdomainCheck>({ state: "idle" });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const latestCheck = useRef(0);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

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
      const res = await fetch("/api/onboarding/payment-init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = (await res.json()) as {
        authorizationUrl?: string;
        error?: string;
        issues?: { path: string; message: string }[];
      };
      if (!res.ok || !json.authorizationUrl) {
        setPayError(json.issues?.[0]?.message ?? json.error ?? "Could not start payment");
        return;
      }
      window.location.assign(json.authorizationUrl); // Paystack checkout
    } catch {
      setPayError("Network error — please try again.");
    } finally {
      setPaying(false);
    }
  }

  const totalKobo = themePriceKobo + hostingFeeKobo;
  const canLeaveStep1 = check.state === "ok";

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-xl">
        {/* Step indicator */}
        <ol className="mb-8 flex items-center justify-center gap-2 text-xs font-medium">
          {["Subdomain", "Profile", "Preview", "Payment"].map((label, i) => {
            const n = i + 1;
            return (
              <li key={label} className="flex items-center gap-2">
                {i > 0 && <span className="text-gray-300">—</span>}
                <span
                  className={
                    n === step
                      ? "rounded-full bg-gray-900 px-3 py-1 text-white"
                      : n < step
                        ? "rounded-full bg-gray-200 px-3 py-1 text-gray-700"
                        : "rounded-full px-3 py-1 text-gray-400"
                  }
                >
                  {n < step ? `✓ ${label}` : label}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {step === 1 && (
            <section>
              <h1 className="text-xl font-bold text-gray-900">Choose your address</h1>
              <p className="mt-1 text-sm text-gray-500">
                This is where your site will live. Lowercase letters, numbers
                and hyphens.
              </p>
              <div className="mt-4 flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 focus-within:border-gray-900">
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
                <span className="shrink-0 text-sm text-gray-400">.{rootDomain}</span>
              </div>
              <p
                className={`mt-2 min-h-5 text-xs ${
                  check.state === "ok"
                    ? "text-green-600"
                    : check.state === "taken"
                      ? "text-red-600"
                      : "text-gray-400"
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
              <h1 className="text-xl font-bold text-gray-900">Your business profile</h1>
              <p className="mt-1 text-sm text-gray-500">
                Everything here is optional except the name — a name-only
                site should still look great.
              </p>
              <div className="mt-4 space-y-4">
                <Field label="Business name *">
                  <input
                    value={draft.name}
                    onChange={(e) => set("name", e.target.value)}
                    maxLength={80}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                  />
                </Field>
                <Field label="Short description">
                  <textarea
                    value={draft.description}
                    onChange={(e) => set("description", e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="What you sell, who you are — 1–2 sentences."
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Contact email">
                    <input
                      type="email"
                      value={draft.contactEmail}
                      onChange={(e) => set("contactEmail", e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                    />
                  </Field>
                  <Field label="Phone">
                    <input
                      value={draft.contactPhone}
                      onChange={(e) => set("contactPhone", e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                    />
                  </Field>
                </div>
                <Field label="Address">
                  <input
                    value={draft.address}
                    onChange={(e) => set("address", e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Brand color">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={/^#[0-9a-fA-F]{6}$/.test(draft.primaryColor) ? draft.primaryColor : "#111827"}
                        onChange={(e) => set("primaryColor", e.target.value)}
                        className="h-9 w-12 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
                        aria-label="Pick a brand color"
                      />
                      <span className="text-xs text-gray-500">{draft.primaryColor || "default"}</span>
                    </div>
                  </Field>
                  <Field label="Logo (PNG/JPG/WebP, ≤2 MB)">
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50">
                        {uploading ? "Uploading…" : draft.logoUrl ? "Replace" : "Upload"}
                        <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onLogoPick} />
                      </label>
                      {uploadError && (
                        <span className="text-xs text-red-600">{uploadError}</span>
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
              <h1 className="text-xl font-bold text-gray-900">Live preview</h1>
              <p className="mt-1 text-sm text-gray-500">
                This is exactly what visitors at{" "}
                <span className="font-mono">
                  {draft.subdomain || "yours"}.{rootDomain}
                </span>{" "}
                will see — your real theme, your real data.
              </p>
              <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
                <MinimalSite
                  data={{
                    name: draft.name || "Your Business",
                    description: draft.description || null,
                    logoUrl: draft.logoUrl || null,
                    primaryColor: draft.primaryColor || null,
                    contactEmail: draft.contactEmail || null,
                    contactPhone: draft.contactPhone || null,
                    address: draft.address || null,
                  }}
                  agoraHref="/"
                />
              </div>
              <div className="mt-6 flex justify-between">
                <BackButton onClick={() => setStep(2)} />
                <NextButton onClick={() => setStep(4)} label="Continue to payment" />
              </div>
            </section>
          )}

          {step === 4 && (
            <section>
              <h1 className="text-xl font-bold text-gray-900">Confirm &amp; pay</h1>
              <p className="mt-1 text-sm text-gray-500">
                Your site goes live the moment payment succeeds. The plan
                renews monthly — you can cancel anytime from your dashboard.
              </p>
              <dl className="mt-4 divide-y rounded-lg border border-gray-200 text-sm">
                <Row label={`“${themeName}” theme — monthly`} value={naira(themePriceKobo)} />
                <Row label="Hosting — monthly" value={naira(hostingFeeKobo)} />
                <div className="flex items-center justify-between px-4 py-3 font-semibold">
                  <dt>Total today</dt>
                  <dd>{naira(totalKobo)}</dd>
                </div>
              </dl>
              <div className="mt-3 rounded-md bg-gray-50 px-4 py-2 text-xs text-gray-500">
                <span className="font-mono">{draft.subdomain}.{rootDomain}</span> →{" "}
                {draft.name || "Your Business"}
              </div>
              {payError && (
                <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{payError}</p>
              )}
              <div className="mt-6 flex items-center justify-between">
                <BackButton onClick={() => setStep(3)} />
                <button
                  onClick={pay}
                  disabled={paying}
                  className="rounded-md bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
                >
                  {paying ? "Redirecting to Paystack…" : `Pay ${naira(totalKobo)} & publish`}
                </button>
              </div>
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
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-gray-600">
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
      className="mt-6 w-full rounded-md bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
    >
      Back
    </button>
  );
}
