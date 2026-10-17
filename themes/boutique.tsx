/**
 * "Boutique" — fashion & retail theme (Phase 2.5). Catalog-forward, server
 * rendered, zero client JS: category filters and pagination are plain links,
 * product detail is /p/<id>, order intent goes to WhatsApp (no cart this
 * phase — by design). Sections honor siteConfig order/visibility; a section
 * with no content never renders.
 */
import type { ReactElement } from "react";
import type { SiteProduct } from "@/lib/site-data";
import {
  CategoryChips,
  ContactBlock,
  HoursTable,
  LogoMark,
  Pager,
  Price,
  ProductImage,
  Section,
  SectionNav,
  SiteFooter,
  ThemeRoot,
  WaButton,
} from "./theme-ui";
import type { SiteRenderProps, ThemeModule } from "./types";
import type { SectionType } from "@/lib/site-config";

const LABELS: Partial<Record<SectionType, string>> = {
  products: "Shop",
  services: "Services",
  testimonials: "Kind words",
};

export function renderSite({ data, agoraHref }: SiteRenderProps): ReactElement {
  const digits = data.business.whatsappDigits;
  const enabled = new Set(data.config.sections.filter((s) => s.enabled).map((s) => s.type));
  const has: Record<string, boolean> = {
    about: Boolean(data.business.description),
    products: data.products.length > 0,
    services: data.services.length > 0,
    gallery: data.gallery.length > 0,
    testimonials: data.testimonials.length > 0,
    hours: data.business.openingHours !== null,
    contact: true,
  };
  const show = (t: SectionType) => enabled.has(t) && has[t] !== false;

  return (
    <ThemeRoot data={data}>
      <header className="border-b border-gray-100 px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <a href="." className="text-lg font-bold tracking-tight" style={{ fontFamily: "var(--ap-head)" }}>
            {data.business.name}
          </a>
          <SectionNav
            sections={(["products", "about", "hours", "contact"] as SectionType[]).filter((s) => (s === "products" ? show("products") && true : show(s)))}
            labels={LABELS}
          />
        </div>
      </header>

      {/* Hero — always rendered (carries name/logo): the "looks intentional
          with nothing but a name" guarantee. */}
      <section className="px-4 pb-10 pt-12 text-center">
        <LogoMark logoUrl={data.business.logoUrl} name={data.business.name} size={88} />
        <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl" style={{ fontFamily: "var(--ap-head)" }}>
          {data.business.name}
        </h1>
        {data.business.description && (
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-gray-600">{data.business.description}</p>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          {show("products") && (
            <a
              href="#products"
              className="rounded-full px-6 py-2.5 text-sm font-semibold"
              style={{ backgroundColor: "var(--ap)", color: "var(--ap-ink)" }}
            >
              Shop the collection
            </a>
          )}
          <WaButton digits={digits} message={`Hi ${data.business.name}!`} label="Chat with us" />
        </div>
      </section>

      {show("products") && (
        <Section id="products" title="Shop" tone="soft">
          <CategoryChips categories={data.categories} active={data.activeCategory} />
          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
            {data.products.map((p, i) => (
              <BoutiqueCard key={p.id} product={p} digits={digits} businessName={data.business.name} primary={i === 0 && !data.pagination} />
            ))}
          </div>
          {data.pagination && <Pager pagination={data.pagination} activeCategory={data.activeCategory} />}
        </Section>
      )}

      {show("about") && (
        <Section id="about" title="About">
          <p className="mt-4 max-w-2xl leading-relaxed text-gray-700">{data.business.description}</p>
        </Section>
      )}

      {show("services") && (
        <Section id="services" title="Services">
          <ul className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200">
            {data.services.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="font-medium">{s.name}</p>
                  {s.description && <p className="text-sm text-gray-500">{s.description}</p>}
                </div>
                <Price kobo={s.priceKobo} label={s.priceLabel} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {show("gallery") && (
        <Section id="gallery" title="Gallery">
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {data.gallery.map((g, i) => (
              <figure key={g.id} className="relative aspect-square overflow-hidden rounded-lg bg-gray-100">
                <ProductImage url={g.url} alt={g.caption ?? `Photo from ${data.business.name}`} priority={i < 3} />
                {g.caption && (
                  <figcaption className="absolute inset-x-0 bottom-0 truncate bg-black/45 px-2 py-1 text-[11px] text-white">
                    {g.caption}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        </Section>
      )}

      {show("testimonials") && (
        <Section id="testimonials" title="Kind words" tone="soft">
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {data.testimonials.map((t) => (
              <li key={t.id} className="rounded-xl border border-gray-200 bg-white p-5">
                <blockquote className="text-gray-700">“{t.quote}”</blockquote>
                <p className="mt-3 text-sm font-semibold text-gray-500">— {t.authorName}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {show("hours") && (
        <Section id="hours" title="Opening hours">
          <HoursTable data={data} />
        </Section>
      )}

      {show("contact") && (
        <Section id="contact" title="Visit & contact">
          <ContactBlock data={data} />
        </Section>
      )}

      <SiteFooter agoraHref={agoraHref} />
    </ThemeRoot>
  );
}

/** Card with digits passed explicitly (no module-scope holders — the theme
 * is a pure function of its props, contract #1). */
function BoutiqueCard({
  product,
  digits,
  businessName,
  primary,
}: {
  product: SiteProduct;
  digits: string | null;
  businessName: string;
  primary: boolean;
}): ReactElement {
  const cover = product.imageUrls[0] ?? null;
  const href = `p/${encodeURIComponent(product.id)}`;
  return (
    <article>
      <a href={href} className="block rounded-lg transition-shadow hover:shadow-md" aria-label={`${product.name} — view details`}>
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-lg bg-gray-100">
          {cover ? (
            <ProductImage url={cover} alt={product.name} priority={primary} />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-gray-400">No photo yet</div>
          )}
          {!product.inStock && (
            <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-gray-700 shadow">
              Sold out
            </span>
          )}
        </div>
        <div className="px-1 py-3">
          <h3 className="text-sm font-semibold leading-snug">{product.name}</h3>
          <p className="mt-1 text-sm text-gray-600">
            <Price kobo={product.priceKobo} />
          </p>
        </div>
      </a>
      <div className="flex items-center justify-between gap-2">
        <WaButton digits={product.inStock ? digits : null} message={`Hi ${businessName}! I'd like to order: ${product.name}`} label="Order on WhatsApp" />
      </div>
    </article>
  );
}

function ProductDetail({ data, product, agoraHref }: import("./types").ProductRenderProps): ReactElement {
  const digits = data.business.whatsappDigits;
  const gallery = product.imageUrls;
  return (
    <ThemeRoot data={data}>
      <header className="border-b border-gray-100 px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <a href="." className="text-lg font-bold tracking-tight" style={{ fontFamily: "var(--ap-head)" }}>
            {data.business.name}
          </a>
          <a href="." className="text-sm font-medium underline">
            ← Back to shop
          </a>
        </div>
      </header>
      <main className="px-4 py-10">
        <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-2">
          <div>
            {gallery.length > 0 ? (
              <ul className="space-y-3">
                {gallery.map((u, i) => (
                  <li key={u} className="relative aspect-[4/5] overflow-hidden rounded-xl bg-gray-100">
                    <ProductImage url={u} alt={`${product.name} — photo ${i + 1} of ${gallery.length}`} priority={i === 0} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex aspect-[4/5] items-center justify-center rounded-xl bg-gray-100 text-sm text-gray-400">
                No photos for this item yet
              </div>
            )}
          </div>
          <div>
            {product.category && (
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{product.category}</p>
            )}
            <h1 className="mt-1 text-3xl font-bold tracking-tight" style={{ fontFamily: "var(--ap-head)" }}>
              {product.name}
            </h1>
            <p className="mt-3 text-xl">
              <Price kobo={product.priceKobo} />
            </p>
            {!product.inStock && (
              <p className="mt-2 inline-block rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                Currently sold out
              </p>
            )}
            {product.description && <p className="mt-5 leading-relaxed text-gray-700">{product.description}</p>}
            <div className="mt-8">
              <WaButton
                digits={product.inStock ? digits : null}
                message={`Hi ${data.business.name}! I'd like to order: ${product.name}`}
                label={product.inStock ? "Order on WhatsApp" : "Ask about restock on WhatsApp"}
                size="lg"
              />
              {!digits && <p className="mt-3 text-sm text-gray-500">Contact this shop directly to order.</p>}
            </div>
          </div>
        </div>
      </main>
      <SiteFooter agoraHref={agoraHref} />
    </ThemeRoot>
  );
}

export const BoutiqueTheme: ThemeModule = {
  key: "boutique",
  label: "Boutique",
  tagline: "Catalog-forward look for fashion and retail.",
  forWho: "Boutiques, fashion, homeware — anything sold as a list of products.",
  Site: renderSite,
  ProductPage: ProductDetail,
};
