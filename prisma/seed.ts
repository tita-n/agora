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

  const dev = await prisma.user.upsert({
    where: { email: "dev@agora.test" },
    update: { password: passwordHash, role: "developer" },
    create: {
      email: "dev@agora.test",
      password: passwordHash,
      role: "developer",
    },
  });

  const owner = await prisma.user.upsert({
    where: { email: "owner@agora.test" },
    update: { password: passwordHash, role: "business_owner" },
    create: {
      email: "owner@agora.test",
      password: passwordHash,
      role: "business_owner",
    },
  });

  const existingTheme = await prisma.theme.findFirst({
    where: { devId: dev.id, name: "Minimal" },
  });
  const admin = await prisma.user.upsert({
    where: { email: "admin@agora.test" },
    update: { password: passwordHash, role: "admin" },
    create: {
      email: "admin@agora.test",
      password: passwordHash,
      role: "admin",
    },
  });
  void admin; // role exists for /admin/payments; no further seeding needed

  const theme = existingTheme
    ? await prisma.theme.update({
        where: { id: existingTheme.id },
        data: { price: 5000, category: "Business", templateKey: "minimal" },
      })
    : await prisma.theme.create({
        data: {
          name: "Minimal",
          devId: dev.id,
          price: 5000, // kobo = ₦50.00
          category: "Business",
          templateKey: "minimal",
        },
      });

  // Phase 2.5: the three content themes exist as purchasable rows (price =
  // data, rendering = code in themes/registry.ts). Same dev owns them in the
  // fixture so payout math stays exercised.
  const contentThemes: { name: string; price: number; category: string; templateKey: string }[] = [
    { name: "Boutique", price: 15000, category: "Retail", templateKey: "boutique" },
    { name: "Bistro", price: 12000, category: "Food", templateKey: "bistro" },
    { name: "Studio", price: 12000, category: "Services", templateKey: "studio" },
  ];
  for (const spec of contentThemes) {
    const found = await prisma.theme.findFirst({ where: { devId: dev.id, name: spec.name } });
    if (found) {
      await prisma.theme.update({ where: { id: found.id }, data: spec });
    } else {
      await prisma.theme.create({ data: { ...spec, devId: dev.id } });
    }
  }

  await prisma.business.upsert({
    where: { subdomain: "demo" },
    update: {
      name: "Demo Boutique",
      ownerId: owner.id,
      themeId: theme.id, // deliberately STILL Minimal: acceptance check —
      // existing Minimal-based sites must render exactly as before 2.5
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