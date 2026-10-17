/**
 * "Bistro" — food theme (Phase 2.5). Menu = the Product rows grouped by
 * category ("Starters", "Mains", …); "price on request" products still
 * belong in the menu. Opening hours get the position of honour, and one big
 * Order-on-WhatsApp button carries the whole conversion story (no checkout
 * this phase). Zero client JS.
 */
import type { ReactElement } from "react";
import {
  ContactBlock,
  HoursTable,
  LogoMark,
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
import { hoursRangeLabel } from "@/lib/opening-hours";

function menuGroups(data: SiteRenderProps["data"]) {
  // first-appearance category order; uncategorized sinks to "More"
  const order: string[] = [];
  const groups = new Map<string, typeof data.products>();
  for (const p of data.products) {
    const key = p.category ?? "More";
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(p);
  }
  return order.map((name) => ({ name, items: groups.get(name)! }));
}

function renderSite({ data, agoraHref }: SiteRenderProps): ReactElement {
  const digits = data.business.whatsappDigits;
  const enabled = new Set(data.config.sections.filter((s) => s.enabled).map((s) => s.type));
  const b = data.business;
  const has: Partial<Record<SectionType, boolean>> = {
    about: Boolean(b.description),
    products: data.products.length > 0,
    services: data.services.length > 0,
    gallery: data.gallery.length > 0,
    testimonials: data.testimonials.length > 0,
    hours: b.openingHours !== null,
    contact: true,
  };
  const show = (t: SectionType) => enabled.has(t) && has[t] !== false;
  const groups = menuGroups(data);
  const today = data.business.openingHours ? hoursRangeLabel(data.business.openingHours) : null;

  return (
    <ThemeRoot data={data}>
      {/* Hero: warm, centered, one job — make them hungry and let them tap. */}
      <section
        className="px-4 pb-12 pt-14 text-center"
        style={{ backgroundColor: "var(--ap)", color: "var(--ap-ink)" }}
      >
        <LogoMark logoUrl={b.logoUrl} name={b.name} size={96} />
        <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-6xl" style={{ fontFamily: "var(--ap-head)" }}>
          {b.name}
        </h1>
        {b.description && <p className="mx-auto mt-4 max-w-lg text-lg leading-relaxed opacity-85">{b.description}</p>}
        <div className="mt-8 flex flex-col items-center gap-3">
          <WaButton digits={digits} message={`Hi ${b.name}! I'd like to place an order.`} label="Order on WhatsApp" size="lg" inverted />
          {b.contactPhone && <p className="text-sm opacity-80">or call {b.contactPhone}</p>}
        </div>
        {/* text color = readableTextColor(var(--ap)) via --ap-ink: a light owner
            colour can never produce white-on-light, and the inverted button
            (ink background, accent text) stays visible on the accent band. */}
      </section>

      <nav className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 backdrop-blur px-4 py-2">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <span className="text-sm font-bold" style={{ fontFamily: "var(--ap-head)" }}>
            {b.name}
          </span>
          <div className="hidden gap-4 text-sm font-medium md:flex">
            {show("products") && <a href="#products" className="hover:underline">Menu</a>}
            {show("hours") && <a href="#hours" className="hover:underline">Hours</a>}
            {show("contact") && <a href="#contact" className="hover:underline">Find us</a>}
          </div>
          <SectionNav sections={(["products", "hours", "contact"] as SectionType[]).filter(show)} labels={{ products: "Menu", hours: "Hours", contact: "Find us" }} />
        </div>
      </nav>

      {show("hours") && (
        <div className="px-4 pt-10">
          <div className="mx-auto max-w-4xl rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-center">
            <p className="text-sm font-bold uppercase tracking-wider text-gray-500">Opening hours</p>
            {today && <p className="mt-1 whitespace-pre-line text-sm text-gray-700">{today}</p>}
          </div>
        </div>
      )}

      {show("products") && (
        <Section id="products" title="Menu">
          <div className="mt-6 space-y-10">
            {groups.map((g) => (
              <div key={g.name}>
                <h3 className="text-xl font-bold" style={{ fontFamily: "var(--ap-head)", color: "var(--ap)" }}>
                  {g.name}
                </h3>
                <ul className="mt-3 divide-y divide-gray-100">
                  {g.items.map((p) => (
                    <li key={p.id} className="flex items-start gap-4 py-3">
                      {p.imageUrls[0] && (
                        <span className="relative hidden h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100 sm:block">
                          <ProductImage url={p.imageUrls[0]} alt={p.name} />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-4">
                          <p className="font-semibold">{p.name}</p>
                          <span className="h-px min-w-6 flex-1 border-b border-dotted border-gray-300" aria-hidden />
                          <Price kobo={p.priceKobo} />
                        </div>
                        {p.description && <p className="mt-0.5 text-sm leading-snug text-gray-500">{p.description}</p>}
                        {!p.inStock && <p className="mt-0.5 text-xs font-semibold text-gray-400">Sold out today</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <WaButton digits={digits} message={`Hi ${b.name}! I'd like to place an order.`} label="Order on WhatsApp" size="lg" />
          </div>
        </Section>
      )}

      {show("about") && (
        <Section id="about" title="Our story" tone="soft">
          <p className="mt-4 max-w-2xl leading-relaxed text-gray-700">{b.description}</p>
        </Section>
      )}

      {show("services") && (
        <Section id="services" title="Catering & events">
          <ul className="mt-4 space-y-3">
            {data.services.map((s) => (
              <li key={s.id} className="flex items-baseline justify-between gap-4">
                <span>
                  <span className="font-medium">{s.name}</span>
                  {s.description && <span className="block text-sm text-gray-500">{s.description}</span>}
                </span>
                <Price kobo={s.priceKobo} label={s.priceLabel} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {show("gallery") && (
        <Section id="gallery" title="From the kitchen">
          <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
            {data.gallery.map((g, i) => (
              <figure key={g.id} className="relative aspect-square overflow-hidden rounded-xl bg-gray-100">
                <ProductImage url={g.url} alt={g.caption ?? `Dish photo from ${b.name}`} priority={i < 3} />
              </figure>
            ))}
          </div>
        </Section>
      )}

      {show("testimonials") && (
        <Section id="testimonials" title="What guests say" tone="soft">
          <ul className="mt-4 grid gap-4 md:grid-cols-3">
            {data.testimonials.map((t) => (
              <li key={t.id} className="rounded-xl bg-white p-5 shadow-sm">
                <p className="text-gray-700">“{t.quote}”</p>
                <p className="mt-3 text-sm font-semibold text-gray-500">— {t.authorName}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {show("hours") && (
        <Section id="hours" title="Full opening hours">
          <HoursTable data={data} />
        </Section>
      )}

      {show("contact") && (
        <Section id="contact" title="Find us">
          <ContactBlock data={data} />
        </Section>
      )}

      <SiteFooter agoraHref={agoraHref} />
    </ThemeRoot>
  );
}

export const BistroTheme: ThemeModule = {
  key: "bistro",
  label: "Bistro",
  tagline: "Menus, hours and one big order button for food businesses.",
  forWho: "Restaurants, bakeries, kitchens — anywhere the menu is the site.",
  Site: renderSite,
};
