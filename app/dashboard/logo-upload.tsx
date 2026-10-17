"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { uploadLogo } from "@/lib/blob-client";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Logo management for an existing business. Upload goes browser → Blob
 * directly (token issued and constrained by /api/blob/token); the signed
 * completion callback persists Business.logoUrl.
 */
export default function LogoUpload({ currentLogoUrl }: { currentLogoUrl?: string | null }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [status, setStatus] = useState<
    "idle" | "uploading" | "done" | "error"
  >("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side pre-checks for fast failure only — the real enforcement
    // lives in /api/blob/token (size, type, path prefix).
    const userId = session?.user?.id;
    if (!userId) {
      setStatus("error");
      setError("You must be signed in to upload.");
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setStatus("error");
      setError("Only PNG, JPEG, or WebP images are allowed.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setStatus("error");
      setError("File exceeds the 2 MB limit.");
      return;
    }

    setStatus("uploading");
    setError(null);

    // Local preview
    setPreview(URL.createObjectURL(file));

    const { error: uploadError } = await uploadLogo(userId, file);
    if (uploadError) {
      setStatus("error");
      setError(uploadError);
      return;
    }
    setStatus("done");
    // The upload-completed callback persists logoUrl on the business;
    // refresh so dashboard + live site reflect it without manual reload.
    router.refresh();
  }

  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  async function removeLogo() {
    if (!window.confirm("Remove the logo from your site? The file is deleted from storage.")) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      const res = await fetch("/api/business/logo", { method: "DELETE" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setRemoveError(j.error ?? "Could not remove the logo.");
      } else {
        setPreview(null);
        router.refresh();
      }
    } catch {
      setRemoveError("Network error — try again.");
    } finally {
      setRemoving(false);
    }
  }

  const shown = preview ?? currentLogoUrl ?? null;

  return (
    <div className="w-full rounded-md border border-rule bg-card p-4 text-left">
      <h2 className="text-sm font-semibold text-ink">Logo</h2>
      <p className="mb-3 text-xs text-ink-faint">
        PNG, JPEG or WebP up to 2 MB. Appears on your site hero once saved.
      </p>
      <label className="block cursor-pointer rounded-md border border-dashed border-rule-strong px-3 py-4 text-center text-sm text-ink-muted hover:bg-paper">
        {status === "uploading" ? "Uploading…" : currentLogoUrl ? "Replace logo" : "Choose image"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={onChange}
        />
      </label>
      {shown && (
        <Image
          src={shown}
          alt="Logo preview"
          width={96}
          height={96}
          className="mt-3 max-h-24 rounded object-contain"
          unoptimized={shown.startsWith("blob:")} // local object-URL preview
        />
      )}
      {currentLogoUrl && !preview && (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={removeLogo}
            disabled={removing}
            className="rounded-md border border-danger/40 px-3 py-1 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
          >
            {removing ? "Removing…" : "Remove logo"}
          </button>
          {removeError && <span className="text-xs text-danger">{removeError}</span>}
        </div>
      )}
      {status === "done" && (
        <p className="mt-2 text-xs text-success">
          Saved — your site now shows this logo.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
