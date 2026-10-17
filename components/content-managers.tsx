"use client";

/**
 * Tenant content managers (Phase 2.5) — one reviewed file for the four
 * resource CRUD UIs. All network calls go to /api/business/* which re-does
 * EVERY check server-side (session, origin, caps, blob-only URLs, ownership
 * scoping of ids); this component only formats input (naira display ↔ kobo
 * integer) and shows the server's issue messages inline. Uploads reuse the
 * signed blob token flow (products/gallery lanes).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { uploadImage } from "@/lib/blob-client";
import { MAX_IMAGES_PER_PRODUCT } from "@/lib/content-limits";

export interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  priceKobo: number | null;
  category: string | null;
  inStock: boolean;
  imageUrls: string[];
}
export interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  priceKobo: number | null;
  priceLabel: string | null;
}
export interface GalleryRow {
  id: string;
  url: string;
  caption: string | null;
}
export interface TestimonialRow {
  id: string;
  authorName: string;
  quote: string;
}

type CallResult = { ok: true } | { ok: false; text: string };

/** One funnel for every manager call: server errors/issue-lists collapse to
 * a single display string here so no UI has to re-derive the message. */
async function call(method: "POST" | "PATCH" | "DELETE", url: string, body?: unknown): Promise<CallResult> {
  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      issues?: { path: string; message: string }[];
    };
    if (!res.ok) return { ok: false, text: json.issues?.[0]?.message ?? json.error ?? `Request failed (${res.status})` };
    return { ok: true };
  } catch {
    return { ok: false, text: "Network error — please try again." };
  }
}

const nairaToKobo = (s: string): number | undefined => {
  const t = s.trim().replace(/[,\s₦]/g, "");
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round(n * 100);
};
const koboToNaira = (k: number | null): string => (k === null || k === undefined ? "" : String(k / 100));

const inputCls =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none";

function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <p className={`mt-2 text-xs ${msg.ok ? "text-green-600" : "text-red-600"}`} role="status">
      {msg.text}
    </p>
  );
}

/** ↑/↓ controls (no drag-and-drop libs by design). */
function MoveButtons({ onMove, label }: { onMove: (dir: -1 | 1) => void; label: string }) {
  return (
    <span className="inline-flex flex-col">
      <button type="button" aria-label={`Move ${label} up`} onClick={() => onMove(-1)} className="px-1 text-gray-400 hover:text-gray-900">
        ▲
      </button>
      <button type="button" aria-label={`Move ${label} down`} onClick={() => onMove(1)} className="px-1 text-gray-400 hover:text-gray-900">
        ▼
      </button>
    </span>
  );
}

async function reorder(kind: string, ids: string[]) {
  return call("PATCH", "/api/business/reorder", { kind, ids });
}
function moved(ids: string[], index: number, dir: -1 | 1): string[] | null {
  const to = index + dir;
  if (to < 0 || to >= ids.length) return null;
  const next = [...ids];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

// ── Products ───────────────────────────────────────────────────────────────
export function ProductManager({ products, limit }: { products: ProductRow[]; limit: number }) {
  const router = useRouter();
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const [openId, setOpenId] = useState<string | null>(null); // "" = creating
  const [form, setForm] = useState({ name: "", description: "", price: "", category: "", inStock: true, imageUrls: [] as string[] });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const ids = products.map((p) => p.id);
  const start = (p?: ProductRow) => {
    setMsg(null);
    if (!p) {
      setOpenId("");
      setForm({ name: "", description: "", price: "", category: "", inStock: true, imageUrls: [] });
    } else {
      setOpenId(p.id);
      setForm({
        name: p.name,
        description: p.description ?? "",
        price: koboToNaira(p.priceKobo),
        category: p.category ?? "",
        inStock: p.inStock,
        imageUrls: [...p.imageUrls],
      });
    }
  };

  async function pickImages(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // allow re-picking the same file after a failure
    if (!userId) return;
    if (form.imageUrls.length >= MAX_IMAGES_PER_PRODUCT) {
      setMsg({ ok: false, text: `Max ${MAX_IMAGES_PER_PRODUCT} photos per product.` });
      return;
    }
    setUploading(true);
    const { url, error } = await uploadImage("products", userId, file);
    setUploading(false);
    if (url) setForm((f) => ({ ...f, imageUrls: [...f.imageUrls, url] }));
    else setMsg({ ok: false, text: error ?? "Upload failed" });
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const priceKobo = nairaToKobo(form.price);
    if (Number.isNaN(priceKobo)) {
      setBusy(false);
      setMsg({ ok: false, text: "Price must be a number (₦). Leave empty for “Price on request”." });
      return;
    }
    const body = {
      name: form.name,
      description: form.description,
      priceKobo,
      category: form.category,
      inStock: form.inStock,
      imageUrls: form.imageUrls,
    };
    const r = openId === "" ? await call("POST", "/api/business/products", body) : await call("PATCH", `/api/business/products/${openId}`, body);
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.text });
    setOpenId(null);
    router.refresh();
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this product? Its photos are removed from storage too.")) return;
    const r = await call("DELETE", `/api/business/products/${id}`);
    if (!r.ok) setMsg({ ok: false, text: r.text });
    router.refresh();
  }

  async function move(id: string, dir: -1 | 1) {
    const next = moved(ids, ids.indexOf(id), dir);
    if (!next) return;
    await reorder("products", next);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        {products.length}/{limit} products. Order here is the order visitors see. “Price on request” = leave price empty.
      </p>
      <ul className="divide-y rounded-lg border border-gray-200 bg-white">
        {products.map((p, i) => (
          <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
            <span className="w-6 text-right text-xs text-gray-400">{i + 1}</span>
            <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-gray-100">
              {p.imageUrls[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrls[0]} alt="" className="h-full w-full object-cover" />
              ) : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{p.name}</span>
              <span className="block truncate text-xs text-gray-500">
                {p.priceKobo !== null ? `₦${p.priceKobo / 100}` : "Price on request"}
                {p.category ? ` · ${p.category}` : ""}
                {!p.inStock ? " · sold out" : ""}
              </span>
            </span>
            <MoveButtons label={p.name} onMove={(d) => move(p.id, d)} />
            <button type="button" onClick={() => start(p)} className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium hover:bg-gray-50">
              Edit
            </button>
            <button type="button" onClick={() => remove(p.id)} className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50">
              Delete
            </button>
          </li>
        ))}
        {products.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-400">No products yet.</li>}
      </ul>

      {openId === null ? (
        <button type="button" onClick={() => start()} disabled={products.length >= limit} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-40">
          {products.length >= limit ? "Product limit reached" : "Add product"}
        </button>
      ) : (
        <div className="rounded-lg border border-gray-300 bg-gray-50 p-4">
          <h3 className="text-sm font-semibold">{openId === "" ? "New product" : "Edit product"}</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-gray-600">
              Name *<input className={inputCls} value={form.name} maxLength={120} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </label>
            <label className="block text-xs font-medium text-gray-600">
              Category (optional)<input className={inputCls} value={form.category} maxLength={60} placeholder="Dresses, Fabrics…" onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
            </label>
            <label className="block text-xs font-medium text-gray-600">
              Price ₦ (optional)<input className={inputCls} inputMode="decimal" value={form.price} placeholder="Leave empty = on request" onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
            </label>
            <label className="mt-6 flex items-center gap-2 text-xs font-medium text-gray-600">
              <input type="checkbox" checked={form.inStock} onChange={(e) => setForm((f) => ({ ...f, inStock: e.target.checked }))} />
              In stock
            </label>
            <label className="block text-xs font-medium text-gray-600 sm:col-span-2">
              Description (optional)
              <textarea className={inputCls} rows={3} maxLength={1000} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </label>
          </div>
          <div className="mt-3">
            <p className="text-xs font-medium text-gray-600">Photos ({form.imageUrls.length}/{MAX_IMAGES_PER_PRODUCT}) — PNG/JPG/WebP ≤ 2 MB</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {form.imageUrls.map((u) => (
                <span key={u} className="relative h-14 w-14 overflow-hidden rounded border border-gray-200 bg-white">
                  {/* small thumbnails: raw img avoids next/image width math in this admin grid;
                      it is our-blob-hosted by construction (upload flow). */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="Product photo" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => setForm((f) => ({ ...f, imageUrls: f.imageUrls.filter((x) => x !== u) }))}
                    className="absolute right-0 top-0 bg-black/60 px-1 text-[10px] font-bold text-white"
                  >
                    ✕
                  </button>
                </span>
              ))}
              {form.imageUrls.length < MAX_IMAGES_PER_PRODUCT && (
                <label className="flex h-14 w-14 cursor-pointer items-center justify-center rounded border border-dashed border-gray-300 text-xl text-gray-400 hover:bg-white">
                  {uploading ? "…" : "+"}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={pickImages} disabled={!userId || uploading} />
                </label>
              )}
            </div>
            {openId !== "" && form.imageUrls.length < (products.find((p) => p.id === openId)?.imageUrls.length ?? 0) && (
              <p className="mt-1 text-[11px] text-gray-400">Removed photos are deleted from storage when you save.</p>
            )}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button type="button" onClick={save} disabled={busy || uploading} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50">
              {busy ? "Saving…" : "Save product"}
            </button>
            <button type="button" onClick={() => setOpenId(null)} className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-white">
              Cancel
            </button>
          </div>
          <Msg msg={msg} />
        </div>
      )}
      {msg && openId === null && <Msg msg={msg} />}
    </div>
  );
}

// ── Services / Testimonials (simple field lists) ──────────────────────────
export function ServiceManager({ services, limit }: { services: ServiceRow[]; limit: number }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", price: "", priceLabel: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const ids = services.map((s) => s.id);

  const start = (s?: ServiceRow) => {
    setMsg(null);
    setOpenId(s ? s.id : "");
    setForm(s ? { name: s.name, description: s.description ?? "", price: koboToNaira(s.priceKobo), priceLabel: s.priceLabel ?? "" } : { name: "", description: "", price: "", priceLabel: "" });
  };
  async function save() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const priceKobo = nairaToKobo(form.price);
    if (Number.isNaN(priceKobo)) {
      setBusy(false);
      return setMsg({ ok: false, text: "Price must be a number (₦)." });
    }
    const body = { name: form.name, description: form.description, priceKobo, priceLabel: form.priceLabel };
    const r = openId === "" ? await call("POST", "/api/business/services", body) : await call("PATCH", `/api/business/services/${openId}`, body);
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.text });
    setOpenId(null);
    router.refresh();
  }
  async function remove(id: string) {
    if (!window.confirm("Delete this service?")) return;
    const r = await call("DELETE", `/api/business/services/${id}`);
    if (!r.ok) setMsg({ ok: false, text: r.text });
    router.refresh();
  }
  async function move(id: string, dir: -1 | 1) {
    const next = moved(ids, ids.indexOf(id), dir);
    if (!next) return;
    await reorder("services", next);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">{services.length}/{limit} services. “From ₦…” = put <em>from</em> in the label box.</p>
      <ul className="divide-y rounded-lg border border-gray-200 bg-white">
        {services.map((s, i) => (
          <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
            <span className="w-6 text-right text-xs text-gray-400">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{s.name}</span>
              <span className="block truncate text-xs text-gray-500">
                {s.priceKobo !== null ? `${s.priceLabel ? s.priceLabel + " " : ""}₦${s.priceKobo / 100}` : "Price on request"}
              </span>
            </span>
            <MoveButtons label={s.name} onMove={(d) => move(s.id, d)} />
            <button type="button" onClick={() => start(s)} className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium hover:bg-gray-50">Edit</button>
            <button type="button" onClick={() => remove(s.id)} className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50">Delete</button>
          </li>
        ))}
        {services.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-400">No services yet.</li>}
      </ul>
      {openId === null ? (
        <button type="button" onClick={() => start()} disabled={services.length >= limit} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-40">
          {services.length >= limit ? "Service limit reached" : "Add service"}
        </button>
      ) : (
        <div className="rounded-lg border border-gray-300 bg-gray-50 p-4">
          <h3 className="text-sm font-semibold">{openId === "" ? "New service" : "Edit service"}</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-gray-600">Name *<input className={inputCls} value={form.name} maxLength={120} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></label>
            <label className="block text-xs font-medium text-gray-600">Price ₦ (optional)<input className={inputCls} inputMode="decimal" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} /></label>
            <label className="block text-xs font-medium text-gray-600">Price label (optional)<input className={inputCls} value={form.priceLabel} maxLength={30} placeholder="from" onChange={(e) => setForm((f) => ({ ...f, priceLabel: e.target.value }))} /></label>
            <label className="block text-xs font-medium text-gray-600 sm:col-span-2">
              Description (optional)
              <textarea className={inputCls} rows={2} maxLength={1000} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </label>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button type="button" onClick={save} disabled={busy} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50">{busy ? "Saving…" : "Save service"}</button>
            <button type="button" onClick={() => setOpenId(null)} className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-white">Cancel</button>
          </div>
          <Msg msg={msg} />
        </div>
      )}
      {msg && openId === null && <Msg msg={msg} />}
    </div>
  );
}

export function TestimonialManager({ testimonials, limit }: { testimonials: TestimonialRow[]; limit: number }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState({ authorName: "", quote: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const ids = testimonials.map((t) => t.id);

  const start = (t?: TestimonialRow) => {
    setMsg(null);
    setOpenId(t ? t.id : "");
    setForm(t ? { authorName: t.authorName, quote: t.quote } : { authorName: "", quote: "" });
  };
  async function save() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const r = openId === "" ? await call("POST", "/api/business/testimonials", form) : await call("PATCH", `/api/business/testimonials/${openId}`, form);
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.text });
    setOpenId(null);
    router.refresh();
  }
  async function remove(id: string) {
    if (!window.confirm("Delete this testimonial?")) return;
    const r = await call("DELETE", `/api/business/testimonials/${id}`);
    if (!r.ok) setMsg({ ok: false, text: r.text });
    router.refresh();
  }
  async function move(id: string, dir: -1 | 1) {
    const next = moved(ids, ids.indexOf(id), dir);
    if (!next) return;
    await reorder("testimonials", next);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">{testimonials.length}/{limit} testimonials shown on Boutique & Studio.</p>
      <ul className="divide-y rounded-lg border border-gray-200 bg-white">
        {testimonials.map((t, i) => (
          <li key={t.id} className="flex items-start gap-3 px-3 py-2.5">
            <span className="w-6 pt-0.5 text-right text-xs text-gray-400">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm italic text-gray-700">“{t.quote}”</span>
              <span className="block text-xs text-gray-500">— {t.authorName}</span>
            </span>
            <MoveButtons label={t.authorName} onMove={(d) => move(t.id, d)} />
            <button type="button" onClick={() => start(t)} className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium hover:bg-gray-50">Edit</button>
            <button type="button" onClick={() => remove(t.id)} className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50">Delete</button>
          </li>
        ))}
        {testimonials.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-400">No testimonials yet.</li>}
      </ul>
      {openId === null ? (
        <button type="button" onClick={() => start()} disabled={testimonials.length >= limit} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-40">
          {testimonials.length >= limit ? "Testimonial limit reached" : "Add testimonial"}
        </button>
      ) : (
        <div className="rounded-lg border border-gray-300 bg-gray-50 p-4">
          <h3 className="text-sm font-semibold">{openId === "" ? "New testimonial" : "Edit testimonial"}</h3>
          <div className="mt-3 space-y-3">
            <label className="block text-xs font-medium text-gray-600">Author *<input className={inputCls} value={form.authorName} maxLength={80} onChange={(e) => setForm((f) => ({ ...f, authorName: e.target.value }))} /></label>
            <label className="block text-xs font-medium text-gray-600">
              Quote * (max 400)
              <textarea className={inputCls} rows={3} maxLength={400} value={form.quote} onChange={(e) => setForm((f) => ({ ...f, quote: e.target.value }))} />
            </label>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button type="button" onClick={save} disabled={busy} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50">{busy ? "Saving…" : "Save testimonial"}</button>
            <button type="button" onClick={() => setOpenId(null)} className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-white">Cancel</button>
          </div>
          <Msg msg={msg} />
        </div>
      )}
      {msg && openId === null && <Msg msg={msg} />}
    </div>
  );
}

export function GalleryManager({ images, limit }: { images: GalleryRow[]; limit: number }) {
  const router = useRouter();
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const ids = images.map((g) => g.id);

  async function addImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) e.target.value = "";
    if (!file || !userId) return;
    if (images.length >= limit) {
      setMsg({ ok: false, text: `Gallery is full (${limit}). Delete one first.` });
      return;
    }
    setUploading(true);
    const { url, error } = await uploadImage("gallery", userId, file);
    setUploading(false);
    if (!url) return setMsg({ ok: false, text: error ?? "Upload failed" });
    const r = await call("POST", "/api/business/gallery", { url, caption: undefined });
    if (!r.ok) return setMsg({ ok: false, text: r.text });
    router.refresh();
  }
  async function saveCaption(id: string) {
    setBusyId(id);
    const r = await call("PATCH", `/api/business/gallery/${id}`, { caption: captions[id] ?? "" });
    setBusyId(null);
    if (!r.ok) setMsg({ ok: false, text: r.text });
    else setMsg({ ok: true, text: "Caption saved." });
  }
  async function remove(id: string) {
    if (!window.confirm("Delete this photo from the gallery (and storage)?")) return;
    const r = await call("DELETE", `/api/business/gallery/${id}`);
    if (!r.ok) setMsg({ ok: false, text: r.text });
    router.refresh();
  }
  async function move(id: string, dir: -1 | 1) {
    const next = moved(ids, ids.indexOf(id), dir);
    if (!next) return;
    await reorder("gallery", next);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">{images.length}/{limit} gallery images. Uploads replace: to change a photo, delete it and add a new one.</p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {images.map((g, i) => (
          <li key={g.id} className="rounded-lg border border-gray-200 bg-white p-2">
            <div className="relative aspect-square overflow-hidden rounded bg-gray-100">
              <Image src={g.url} alt={g.caption ?? "Gallery photo"} fill sizes="(max-width: 640px) 50vw, 33vw" className="object-cover" />
            </div>
            <div className="mt-2 flex items-center gap-1">
              <MoveButtons label={`photo ${i + 1}`} onMove={(d) => move(g.id, d)} />
              <input
                className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-xs focus:border-gray-900 focus:outline-none"
                placeholder="Caption (optional)"
                maxLength={160}
                defaultValue={g.caption ?? ""}
                onChange={(e) => setCaptions((c) => ({ ...c, [g.id]: e.target.value }))}
              />
              <button type="button" onClick={() => saveCaption(g.id)} disabled={busyId === g.id} className="rounded border border-gray-300 px-2 py-1 text-[11px] font-medium hover:bg-gray-50 disabled:opacity-40">
                {busyId === g.id ? "…" : "Save"}
              </button>
              <button type="button" onClick={() => remove(g.id)} aria-label="Delete photo" className="rounded border border-red-200 px-2 py-1 text-[11px] text-red-600 hover:bg-red-50">
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
      {images.length === 0 && <p className="rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400">No photos yet.</p>}
      <label className="inline-block cursor-pointer rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700">
        {uploading ? "Uploading…" : "Add photo"}
        <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={addImage} disabled={!userId || uploading || images.length >= limit} />
      </label>
      <Msg msg={msg} />
    </div>
  );
}
