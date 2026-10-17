/**
 * Pure fixture data for /preview/[themeKey] and the onboarding wizard
 * (Phase 2.5). NO database, NO tenant data, no secrets — just realistic
 * sample content so a theme can be judged on looks alone. Same SiteData
 * shape the real pages pass, so a theme that renders fixtures renders the
 * truth. Images are same-origin /examples/*.svg placeholders (they never
 * leave the deployment host; the marketing page reuses the previews).
 */
import { defaultSiteConfig } from "./site-config";
import type { SiteData, SiteProduct } from "./site-data";

const IMG = (n: string) => `/examples/sample-${n}.svg`;

const PRODUCTS: SiteProduct[] = [
  { id: "p-anara", name: "Anara Ankara Two-Piece", description: "Hand-dyed ankara, cut to order in three lengths. Matches set includes head wrap.", priceKobo: 4250000, category: "Ready-to-wear", inStock: true, imageUrls: [IMG("a"), IMG("c")] },
  { id: "p-adire", name: "Àdìré Linen Shirt", description: "Natural-dyed linen with hand-painted resist pattern.", priceKobo: 2800000, category: "Ready-to-wear", inStock: true, imageUrls: [IMG("b")] },
  { id: "p-agbada", name: "Embroidered Agbada Set", description: "Three-piece agbada in cotton damask, silver thread embroidery.", priceKobo: 9800000, category: "Occasion", inStock: true, imageUrls: [IMG("f"), IMG("d")] },
  { id: "p-wrapper", name: "Cotton Wrapper (2 yards)", description: "Everyday wax-print cotton. Pre-washed.", priceKobo: 1200000, category: "Fabrics", inStock: true, imageUrls: [IMG("e")] },
  { id: "p-silk", name: "Silk Head Wrap", description: "Mulberry silk, hand-rolled hem.", priceKobo: 950000, category: "Accessories", inStock: false, imageUrls: [IMG("c")] },
  { id: "p-kaftan", name: "Travel Kaftan", description: "Wrinkle-resistant crepe, packed pocket. One size.", priceKobo: 3300000, category: "Ready-to-wear", inStock: true, imageUrls: [IMG("d"), IMG("a"), IMG("b")] },
  { id: "p-lace", name: "French Lace (per 5 yards)", description: "Corded French lace for special orders.", priceKobo: null, category: "Fabrics", inStock: true, imageUrls: [IMG("a")] },
  { id: "p-gown", name: "Aso-oke Pencil Gown", description: "Made to measure, 4–6 weeks.", priceKobo: 150000000, category: "Occasion", inStock: true, imageUrls: [IMG("f")] },
];

const MENU: SiteProduct[] = [
  { id: "m-jollof", name: "Smoky Jollof & Grilled Chicken", description: "Party-style jollof, quarter chicken, fried plantain.", priceKobo: 650000, category: "Mains", inStock: true, imageUrls: [IMG("e")] },
  { id: "m-pepper", name: "Goat Meat Pepper Soup", description: "Scent-leaf broth, assorted cuts, pounded yam on the side.", priceKobo: 450000, category: "Mains", inStock: true, imageUrls: [IMG("d")] },
  { id: "m-suya", name: "Suya Platter", description: "Beef skewers, yaji spice, onions, fresh tomato.", priceKobo: 300000, category: "Small chops", inStock: true, imageUrls: [IMG("a")] },
  { id: "m-puff", name: "Puff-puff (6 pieces)", description: "Served warm with honey butter.", priceKobo: 120000, category: "Small chops", inStock: true, imageUrls: [] },
  { id: "m-zobo", name: "Hibiscus Zobo Cooler", description: "Zobo, pineapple, ginger. Lightly sweet.", priceKobo: 150000, category: "Drinks", inStock: true, imageUrls: [IMG("b")] },
  { id: "m-chapman", name: "Full Chapman", description: "The house recipe — ask for it.", priceKobo: 250000, category: "Drinks", inStock: false, imageUrls: [] },
];

const OPEN = { closed: false as const, open: "09:00", close: "21:00" };
const OPEN_LATE = { closed: false as const, open: "09:00", close: "23:30" };
const CLOSED = { closed: true as const };

const HOURS = {
  monday: OPEN, tuesday: OPEN, wednesday: OPEN, thursday: OPEN, friday: OPEN_LATE, saturday: OPEN_LATE, sunday: CLOSED,
};

export const PREVIEW_TESTIMONIALS = [
  { id: "t1", authorName: "Amaka O.", quote: "The fit was perfect the first time. I ordered two more colours the same week." },
  { id: "t2", authorName: "Tunde A.", quote: "Ordered for my sister's wedding — arrived a full week early, beautifully wrapped." },
  { id: "t3", authorName: "Zainab K.", quote: "They actually answered on WhatsApp at 9pm and fixed my measurement by video call. Unreal." },
];

/** state=empty keeps only what every business always has: a name. */
export function previewSiteData(themeKey: string, state: "full" | "empty" = "full"): SiteData {
  const names: Record<string, { name: string; description: string }> = {
    boutique: {
      name: "Àṣọ Atelier",
      description: "Hand-dyed fabrics and made-to-order pieces in Yaba. Style that fits, not just size.",
    },
    bistro: { name: "Màà Má Kitchen", description: "Small-plate kitchen & late-night counter in Ikoyi. Wood fire, loud music, no rush." },
    studio: { name: "Lumen Studio", description: "Braids, locs and bridal hair by appointment — plus a quiet corner for lashes." },
    minimal: { name: "Àṣọ Atelier", description: "Hand-dyed fabrics and made-to-order pieces in Yaba." },
  };
  const meta = names[themeKey] ?? names.minimal;
  const emptyBusiness = {
    name: meta.name,
    description: null, logoUrl: null, contactEmail: null, contactPhone: null, address: null,
    whatsappDigits: null, instagramUrl: null, facebookUrl: null, tiktokUrl: null, mapsUrl: null,
    openingHours: null,
  };
  if (state === "empty") {
    return {
      themeKey,
      business: emptyBusiness,
      config: defaultSiteConfig("#111827"),
      products: [], categories: [], activeCategory: null, services: [], gallery: [], testimonials: [],
      pagination: null,
    };
  }

  const isFood = themeKey === "bistro";
  const products = isFood ? MENU : PRODUCTS;
  return {
    themeKey,
    business: {
      name: meta.name,
      description: meta.description,
      logoUrl: null,
      contactEmail: "hello@example.com",
      contactPhone: "+234 801 234 5678",
      address: "14 Herbert Martineau Street, Yaba, Lagos",
      whatsappDigits: "2348012345678",
      instagramUrl: "https://www.instagram.com/example",
      facebookUrl: null,
      tiktokUrl: "https://www.tiktok.com/@example",
      mapsUrl: null,
      openingHours: HOURS,
    },
    config: defaultSiteConfig(isFood ? "#b3362b" : themeKey === "studio" ? "#2f7a52" : "#714a8f"),
    products,
    categories: [...new Set(products.map((p) => p.category).filter((c): c is string => !!c))],
    activeCategory: null,
    services: [
      { id: "s1", name: "Bridal & event styling", description: "Trial, day-of styling and touch-up kit.", priceKobo: 12000000, priceLabel: "from" },
      { id: "s2", name: "Measurements session", description: "45 minutes, we keep your block on file.", priceKobo: 500000, priceLabel: null },
      { id: "s3", name: "Private chef dinner (6–10 guests)", description: "Menu co-designed a week ahead.", priceKobo: 25000000, priceLabel: "from" },
    ],
    gallery: [
      { id: "g1", url: IMG("a"), caption: "Saturday pickup at the studio" },
      { id: "g2", url: IMG("b"), caption: null },
      { id: "g3", url: IMG("c"), caption: "Dye day, second dip" },
      { id: "g4", url: IMG("d"), caption: null },
      { id: "g5", url: IMG("e"), caption: "Counter service, 8pm" },
      { id: "g6", url: IMG("f"), caption: "The quiet corner" },
    ],
    testimonials: PREVIEW_TESTIMONIALS,
    pagination: products.length > 24 ? { page: 1, pageSize: 24, totalItems: products.length, totalPages: 2 } : null,
  };
}

export function previewProduct(themeKey: string, productId: string): SiteProduct | null {
  const pool = themeKey === "bistro" ? MENU : PRODUCTS;
  return pool.find((p) => p.id === productId) ?? null;
}
