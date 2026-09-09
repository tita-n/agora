import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

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

  const theme = await prisma.theme.upsert({
    where: { devId_name: { devId: dev.id, name: "Minimal" } },
    update: { price: 5000, category: "Business" },
    create: {
      name: "Minimal",
      devId: dev.id,
      price: 5000, // kobo = ₦50.00
      category: "Business",
    },
  });

  await prisma.business.upsert({
    where: { subdomain: "demo" },
    update: { name: "Demo Boutique", ownerId: owner.id, themeId: theme.id },
    create: {
      name: "Demo Boutique",
      subdomain: "demo",
      ownerId: owner.id,
      themeId: theme.id,
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