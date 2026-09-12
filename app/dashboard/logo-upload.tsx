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

  const shown = preview ?? currentLogoUrl ?? null;

  return (
    <div className="w-full rounded-lg border border-gray-200 bg-white p-4 text-left">
      <h2 className="text-sm font-semibold text-gray-700">Logo</h2>
      <p className="mb-3 text-xs text-gray-400">
        PNG, JPEG or WebP up to 2 MB. Appears on your site hero once saved.
      </p>
      <label className="block cursor-pointer rounded-md border border-dashed border-gray-300 px-3 py-4 text-center text-sm text-gray-500 hover:bg-gray-50">
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
      {status === "done" && (
        <p className="mt-2 text-xs text-green-600">
          Saved — your site now shows this logo.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
