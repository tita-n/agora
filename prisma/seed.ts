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
  const theme = existingTheme
    ? await prisma.theme.update({
        where: { id: existingTheme.id },
        data: { price: 5000, category: "Business" },
      })
    : await prisma.theme.create({
        data: {
          name: "Minimal",
          devId: dev.id,
          price: 5000, // kobo = ₦50.00
          category: "Business",
        },
      });

  await prisma.business.upsert({
    where: { subdomain: "demo" },
    update: {
      name: "Demo Boutique",
      ownerId: owner.id,
      themeId: theme.id,
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
    },
  });

  console.log("Seed complete.");
  console.log("  dev@agora.test / password123  (developer)");
  console.log("  owner@agora.test / password123  (business_owner)");
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