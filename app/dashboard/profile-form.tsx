"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Dashboard profile editor. PATCHes /api/business/profile (same zod schema
 * as onboarding, minus subdomain/logoUrl) then refreshes server data.
 * The business itself is resolved from the session server-side — no id
 * travels from the client.
 */
export interface ProfileValues {
  name: string;
  description: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  primaryColor: string;
}

export function ProfileForm({ initial }: { initial: ProfileValues }) {
  const router = useRouter();
  const [values, setValues] = useState<ProfileValues>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const set = <K extends keyof ProfileValues>(k: K, v: ProfileValues[K]) => {
    setValues((s) => ({ ...s, [k]: v }));
    setMessage(null);
  };

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/business/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        issues?: { path: string; message: string }[];
      };
      if (res.ok && json.ok) {
        setMessage({ ok: true, text: "Saved — your site shows the changes immediately." });
        router.refresh();
      } else {
        setMessage({
          ok: false,
          text: json.issues?.[0]?.message ?? json.error ?? "Could not save changes.",
        });
      }
    } catch {
      setMessage({ ok: false, text: "Network error — try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full rounded-lg border border-gray-200 bg-white p-4 text-left">
      <h2 className="text-sm font-semibold text-gray-700">Business profile</h2>
      <div className="mt-3 space-y-3">
        <Input label="Business name" value={values.name} onChange={(v) => set("name", v)} maxLength={80} />
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500">Description</span>
          <textarea
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="What you sell, who you are — 1–2 sentences."
            className="w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
          />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Contact email" value={values.contactEmail} onChange={(v) => set("contactEmail", v)} />
          <Input label="Phone" value={values.contactPhone} onChange={(v) => set("contactPhone", v)} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Address" value={values.address} onChange={(v) => set("address", v)} maxLength={200} />
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Brand color</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(values.primaryColor) ? values.primaryColor : "#111827"}
                onChange={(e) => set("primaryColor", e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
                aria-label="Brand color"
              />
              <span className="font-mono text-xs text-gray-500">{values.primaryColor || "default"}</span>
            </div>
          </label>
        </div>
      </div>
      {message && (
        <p className={`mt-3 text-xs ${message.ok ? "text-green-600" : "text-red-600"}`}>{message.text}</p>
      )}
      <button
        onClick={save}
        disabled={saving || values.name.trim() === ""}
        className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
      />
    </label>
  );
}
