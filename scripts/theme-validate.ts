/**
 * npm run theme:validate [dir ...] — run the package validator over one or
 * more template packages (defaults to every themes-packages/*). Non-zero
 * exit on any error; warnings print but pass.
 */
import fs from "fs";
import path from "path";
import { validatePackage, type PackageFiles } from "../core/agora-engine";
import { readLocalPackage } from "../lib/templates/loader";

async function main() {
  const root = path.join(process.cwd(), "themes-packages");
  const targets = process.argv.slice(2);
  const slugs = targets.length
    ? targets.map((t) => path.basename(t.replace(/\/+$/, "")))
    : fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  let bad = 0;
  for (const slug of slugs) {
    let files: PackageFiles;
    try {
      files = readLocalPackage(slug);
    } catch (err) {
      console.error(`${slug}: cannot read (${err instanceof Error ? err.message : "?"})`);
      bad++;
      continue;
    }
    const { errors, warnings } = await validatePackage(files);
    for (const w of warnings) console.warn(`  warn ${slug}: ${w}`);
    if (errors.length) {
      bad++;
      for (const e of errors) console.error(`  FAIL ${slug}: ${e}`);
      console.error(`${slug}: ${errors.length} error(s)`);
    } else {
      console.log(`${slug}: OK (${files.size} files)`);
    }
  }
  if (bad) process.exit(1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
