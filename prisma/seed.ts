import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

if (process.env.NODE_ENV === "production") {
  throw new Error(
    "prisma/seed.ts is a dev-only fixture (it upserts known test accounts). " +
    "Refusing to run in production."
  );
}

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 12);
  const verified = new Date(); // dev fixtures skip the email round-trip

  const dev = await prisma.user.upsert({
    where: { email: "dev@agora.test" },
    update: { password: passwordHash },
    create: {
      email: "dev@agora.test",
      password: passwordHash,
      emailVerifiedAt: verified,
    },
  });

  // Phase 0: developer-ness is a DeveloperProfile row, not a role.
  const devProfile = await prisma.developerProfile.upsert({
    where: { userId: dev.id },
    update: { displayName: "Agora Labs" },
    create: { userId: dev.id, displayName: "Agora Labs", bio: "First-party templates." },
  });

  const owner = await prisma.user.upsert({
    where: { email: "owner@agora.test" },
    update: { password: passwordHash },
    create: {
      email: "owner@agora.test",
      password: passwordHash,
      emailVerifiedAt: verified,
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: "admin@agora.test" },
    update: { password: passwordHash, isStaff: true },
    create: {
      email: "admin@agora.test",
      password: passwordHash,
      isStaff: true,
      emailVerifiedAt: verified,
    },
  });
  void admin; // isStaff unlocks /admin; nothing else to seed

  // First-party template packages, seeded PUBLISHED. The engine renders all
  // of them from `themes-packages/<slug>` (dev/preview) or immutable blob
  // versions once `npm run theme:publish` has uploaded them.
  const themeSpecs: {
    slug: string;
    name: string;
    price: number;
    category: string;
    description: string;
    categories: string[];
  }[] = [
    { slug: "minimal", name: "Minimal", price: 5000, category: "Business", description: "One clean page: who you are, what you do, how to reach you.", categories: ["business", "services"] },
    { slug: "boutique", name: "Boutique", price: 15000, category: "Retail", description: "Catalog-first storefront with per-item WhatsApp ordering.", categories: ["retail", "fashion"] },
    { slug: "bistro", name: "Bistro", price: 12000, category: "Food", description: "Menu by course, prominent hours, big Order-on-WhatsApp button.", categories: ["food", "restaurant"] },
    { slug: "studio", name: "Studio", price: 12000, category: "Services", description: "Services with prices and per-service booking links.", categories: ["services", "salon"] },
  ];
  let theme: { id: string } | null = null;
  for (const spec of themeSpecs) {
    const data = {
      name: spec.name,
      price: spec.price,
      category: spec.category,
      description: spec.description,
      categories: spec.categories,
      status: "published" as const,
      developerId: devProfile.id,
    };
    const found = await prisma.theme.findUnique({ where: { slug: spec.slug } });
    const row = found
      ? await prisma.theme.update({ where: { id: found.id }, data })
      : await prisma.theme.create({ data: { ...data, slug: spec.slug } });
    if (spec.slug === "minimal") theme = row;
  }
  if (!theme) throw new Error("seed: minimal theme missing after upsert");

  await prisma.business.upsert({
    where: { subdomain: "demo" },
    update: {
      name: "Demo Boutique",
      ownerId: owner.id,
      themeId: theme.id, // Minimal package renders Demo Boutique (port parity check)
      subscriptionStatus: "active",
    },
    create: {
      name: "Demo Boutique",
      subdomain: "demo",
      ownerId: owner.id,
      themeId: theme.id,
      description:
        "Handpicked fabrics, made-to-order pieces, and alterations — style that fits, not just size.",
      contactEmail: "hello@demoboutique.example",
      contactPhone: "+234 801 234 5678",
      address: "12 Awolowo Road, Ikoyi, Lagos",
      primaryColor: "#7c3aed",
      subscriptionStatus: "active",
      nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      // Phase 2.5 fixtures for the profile round-trip (Minimal ignores these;
      // they exist so switching the row's themeId in a dev DB exercises a
      // content theme against REAL data without the dashboard).
      whatsappNumber: "2348012345678",
      instagramUrl: "https://www.instagram.com/demoboutique",
      openingHours: {
        monday: { closed: false, open: "09:30", close: "18:00" },
        tuesday: { closed: false, open: "09:30", close: "18:00" },
        wednesday: { closed: false, open: "09:30", close: "18:00" },
        thursday: { closed: false, open: "09:30", close: "18:00" },
        friday: { closed: false, open: "09:30", close: "20:00" },
        saturday: { closed: false, open: "10:00", close: "20:00" },
        sunday: { closed: true },
      },
    },
  });

  console.log("Seed complete.");
  console.log("  dev@agora.test / password123  (developer)");
  console.log("  owner@agora.test / password123  (business_owner)");
  console.log("  admin@agora.test / password123  (admin — sees /admin/payments)");
  console.log("  demo business subdomain: 'demo'");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });