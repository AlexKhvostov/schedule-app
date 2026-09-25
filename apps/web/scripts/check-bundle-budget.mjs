import { readFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";

const root = process.cwd();
const nextDir = path.join(root, ".next");
const manifest = JSON.parse(await readFile(path.join(nextDir, "app-build-manifest.json"), "utf8"));
const files = [...new Set([...(manifest.pages["/layout"] ?? []), ...(manifest.pages["/page"] ?? [])])]
  .filter((file) => file.endsWith(".js"));

if (!files.length) throw new Error("No JavaScript assets found for /; run npm run build first.");

let compressedBytes = 0;
for (const file of files) {
  const fullPath = path.join(nextDir, file);
  await stat(fullPath);
  compressedBytes += gzipSync(await readFile(fullPath), { level: 9 }).byteLength;
}

const budgetKiB = Number(process.env.BUNDLE_BUDGET_KIB ?? 260);
const actualKiB = compressedBytes / 1024;
console.log(`Initial JavaScript for /: ${actualKiB.toFixed(1)} KiB gzip (budget ${budgetKiB} KiB)`);

if (actualKiB > budgetKiB) {
  throw new Error(`Bundle budget exceeded by ${(actualKiB - budgetKiB).toFixed(1)} KiB.`);
}
