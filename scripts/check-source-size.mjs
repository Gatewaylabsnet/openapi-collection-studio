import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const roots = ["apps/desktop/src", "packages/core/src"];
const extensions = new Set([".ts", ".tsx", ".css"]);
const limit = 500;
const failures = [];

for (const root of roots) {
  for await (const file of filesUnder(root)) {
    if (!extensions.has(file.slice(file.lastIndexOf(".")))) continue;
    const text = await readFile(file, "utf8");
    const lines = text.split(/\r?\n/).length - (text.endsWith("\n") ? 1 : 0);
    if (lines > limit) failures.push(`${file}: ${lines} lines (limit ${limit})`);
  }
}

if (failures.length > 0) {
  console.error("Production source-size limit exceeded:\n" + failures.join("\n"));
  process.exit(1);
}

console.log(`All production TypeScript, TSX, and CSS sources are at most ${limit} lines.`);

async function* filesUnder(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* filesUnder(path);
    if (entry.isFile()) yield path;
  }
}
