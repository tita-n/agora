"use client";

import { useState } from "react";
import { uploadLogo } from "@/lib/blob-client";

export default function LogoUpload() {
  const [status, setStatus] = useState<
    "idle" | "uploading" | "done" | "error"
  >("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("uploading");
    setError(null);

    // Local preview
    setPreview(URL.createObjectURL(file));

    const { url, error: uploadError } = await uploadLogo(file);
    if (uploadError) {
      setStatus("error");
      setError(uploadError);
      return;
    }
    setStatus("done");
    console.log("Uploaded logo:", url);
  }

  return (
    <div className="mt-8 w-full max-w-sm rounded-lg border border-gray-200 p-4 text-left">
      <h2 className="text-sm font-semibold text-gray-700">
        Upload your logo
      </h2>
      <p className="mb-3 text-xs text-gray-400">
        Smoke test for Vercel Blob — uploads go straight to Blob from the
        browser.
      </p>
      <label className="block cursor-pointer rounded-md border border-dashed border-gray-300 px-3 py-4 text-center text-sm text-gray-500 hover:bg-gray-50">
        {status === "uploading" ? "Uploading…" : "Choose image"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onChange}
        />
      </label>
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt="Logo preview"
          className="mt-3 max-h-24 rounded"
        />
      )}
      {status === "done" && (
        <p className="mt-2 text-xs text-green-600">
          Uploaded successfully.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}