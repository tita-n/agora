/**
 * npm run theme:publish <dir> — the publish pipeline (docs/TEMPLATE_SPEC.md):
 * read a package directory, run the FULL validator, zip, hash, upload to
 * blob storage when BLOB_READ_WRITE_TOKEN exists, and point the Theme row's
 * current version at the new immutable package. In dev without a token the
 * zip is stored via the same "local:" key shape the seed uses (nothing is
 * uploaded; the row still gets the real checksum/size/fileCount).
 *
 * Usage: tsx scripts/theme-publish.ts themes-packages/boutique [--theme <slug>]
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { validatePackage, type PackageFiles } from "../core/agora-engine";
import { zipPackageFiles, sha256 } from "../lib/templates/loader";

function readDir(root: string): PackageFiles {
  const files: PackageFiles = new Map();
  const walk = (dir: string, rel = "") => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name.startsWith(".")) continue;
      const relPath = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) walk(path.join(dir, ent.name), relPath);
      else {
        const bytes = new Uint8Array(fs.readFileSync(path.join(dir, ent.name)));
        const texty = /\.(liquid|css|json|txt|md)$/i.test(relPath);
        files.set(relPath, texty ? new TextDecoder().decode(bytes) : bytes);
      }
    }
  };
  walk(root);
  return files;
}

async function main() {
  const args = process.argv.slice(2);
  const dir = args[0];
  if (!dir || !fs.existsSync(dir)) {
    console.error("usage: tsx scripts/theme-publish.ts <package-dir>");
    process.exit(2);
  }
  const files = readDir(dir);
  const { errors, warnings } = await validatePackage(files);
  for (const w of warnings) console.warn(`warn: ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`BLOCKED: ${e}`);
    process.exit(1);
  }
  const manifest = JSON.parse(files.get("theme.json") as string) as { id: string; version: string };
  const zip = zipPackageFiles(files);
  const checksum = sha256(zip);
  const fileCount = files.size;
  const sizeBytes = zip.byteLength;

  const prisma = new PrismaClient();
  const theme = await prisma.theme.findUnique({ where: { slug: manifest.id }, select: { id: true } });
  if (!theme) {
    console.error(`no Theme row with slug ${manifest.id} — create it (marketplace listing) before publishing`);
    process.exit(1);
  }
  let storageKey = `local:${manifest.id}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { storage } = await import("../lib/templates/storage");
    storageKey = await storage.storePackage(`themes/${manifest.id}/${manifest.version}/package.zip`, zip);
    console.log(`uploaded ${storageKey}`);
  } else {
    console.log("no BLOB_READ_WRITE_TOKEN — recording local: key (dev)");
  }
  const data = {
    manifest: manifest as never,
    storageKey,
    checksum,
    sizeBytes,
    fileCount,
  };
  const version = await prisma.themeVersion.upsert({
    where: { themeId_version: { themeId: theme.id, version: manifest.version } },
    update: data,
    create: { themeId: theme.id, version: manifest.version, ...data },
  });
  await prisma.theme.update({ where: { id: theme.id }, data: { currentVersionId: version.id } });
  console.log(`published ${manifest.id}@${manifest.version}: ${fileCount} files, ${(sizeBytes / 1024).toFixed(1)}KB zipped, sha256 ${checksum.slice(0, 12)}…`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
