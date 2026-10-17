/**
 * "Studio" — services theme (Phase 2.5) for salons, tutors, consultants.
 * Services are first-class (name, price, "from" labels, book-per-service
 * WhatsApp links), testimonials carry trust, hours answer "when". Zero
 * client JS; products remain supported (a studio that sells aftercare kits
 * shouldn't lose them) but sit below services by default.
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
  WaInline,
} from "./theme-ui";
import type { SiteRenderProps, ThemeModule } from "./types";
import type { SectionType } from "@/lib/site-config";

function renderSite({ data, agoraHref }: SiteRenderProps): ReactElement {
  const b = data.business;
  const digits = b.whatsappDigits;
  const enabled = new Set(data.config.sections.filter((s) => s.enabled).map((s) => s.type));
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

  return (
    <ThemeRoot data={data}>
      <header className="px-4 pb-4 pt-10">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-3">
            <LogoMark logoUrl={b.logoUrl} name={b.name} size={48} />
            <span className="text-lg font-bold tracking-tight" style={{ fontFamily: "var(--ap-head)" }}>
              {b.name}
            </span>
          </div>
          <SectionNav
            sections={(["services", "testimonials", "hours", "contact"] as SectionType[]).filter((s) => s === "services" ? true : show(s))}
            labels={{ services: "Services", testimonials: "Reviews" }}
          />
        </div>
      </header>

      <section className="px-4 pb-14 pt-6">
        <div className="mx-auto max-w-4xl">
          <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl" style={{ fontFamily: "var(--ap-head)" }}>
            {b.name}
          </h1>
          {b.description && <p className="mt-4 max-w-xl text-lg leading-relaxed text-gray-600">{b.description}</p>}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <WaButton digits={digits} message={`Hi ${b.name}! I'd like to book an appointment.`} label="Book on WhatsApp" size="lg" />
            {show("services") && (
              <a href="#services" className="text-sm font-semibold underline" style={{ color: "var(--ap)" }}>
                See services & prices
              </a>
            )}
          </div>
        </div>
      </section>

      {show("services") && (
        <Section id="services" title="Services & prices" tone="soft">
          <ul className="mt-5 divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white">
            {data.services.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{s.name}</p>
                  {s.description && <p className="mt-0.5 text-sm text-gray-500">{s.description}</p>}
                </div>
                <div className="flex items-center gap-4">
                  <Price kobo={s.priceKobo} label={s.priceLabel} />
                  <WaInline digits={digits} message={`Hi ${b.name}! I'd like to book: ${s.name}`} label="Book" />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {show("testimonials") && (
        <Section id="testimonials" title="Client words">
          <ul className="mt-5 grid gap-4 md:grid-cols-2">
            {data.testimonials.map((t) => (
              <li key={t.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-6">
                <p className="leading-relaxed text-gray-700" style={{ fontFamily: "var(--ap-head)" }}>
                  “{t.quote}”
                </p>
                <p className="mt-4 text-sm font-semibold text-gray-500">— {t.authorName}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {show("gallery") && (
        <Section id="gallery" title="The space & the work" tone="soft">
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {data.gallery.map((g, i) => (
              <figure key={g.id} className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-gray-100">
                <ProductImage url={g.url} alt={g.caption ?? `Photo from ${b.name}`} priority={i < 3} />
              </figure>
            ))}
          </div>
        </Section>
      )}

      {show("products") && (
        <Section id="products" title="Take home">
          <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {data.products.map((p) => (
              <li key={p.id} className="rounded-xl border border-gray-100 p-3">
                {p.imageUrls[0] && (
                  <span className="relative mb-2 block aspect-square overflow-hidden rounded-lg bg-gray-100">
                    <ProductImage url={p.imageUrls[0]} alt={p.name} />
                  </span>
                )}
                <p className="text-sm font-semibold">{p.name}</p>
                <div className="mt-1 flex items-center justify-between">
                  <Price kobo={p.priceKobo} />
                  <WaInline digits={digits} message={`Hi ${b.name}! I'd like to order: ${p.name}`} label="Ask" />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {show("about") && (
        <Section id="about" title="About" tone="soft">
          <p className="mt-4 max-w-2xl leading-relaxed text-gray-700">{b.description}</p>
        </Section>
      )}

      {show("hours") && (
        <Section id="hours" title="When we're open">
          <HoursTable data={data} />
        </Section>
      )}

      {show("contact") && (
        <Section id="contact" title="Visit" tone="soft">
          <ContactBlock data={data} />
        </Section>
      )}

      <SiteFooter agoraHref={agoraHref} />
    </ThemeRoot>
  );
}

export const StudioTheme: ThemeModule = {
  key: "studio",
  label: "Studio",
  tagline: "Services, prices and bookings for appointment businesses.",
  forWho: "Salons, barbers, tutors, consultants — anything you book.",
  Site: renderSite,
};
