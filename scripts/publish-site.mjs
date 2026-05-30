import { cp, mkdir, readdir, rm, copyFile } from "node:fs/promises";
import { join } from "node:path";

const repoRoot = new URL("..", import.meta.url);
const distDir = new URL("../dist/", import.meta.url);
const rootIndex = new URL("../index.html", import.meta.url);
const rootAssets = new URL("../assets/", import.meta.url);
const distAssets = new URL("../dist/assets/", import.meta.url);

await mkdir(rootAssets, { recursive: true });

for (const fileName of await readdir(rootAssets)) {
  if (/^index-[\w-]+\.(css|js)$/.test(fileName)) {
    await rm(join(rootAssets.pathname, fileName), { force: true });
  }
}

await copyFile(new URL("index.html", distDir), rootIndex);
await cp(distAssets, rootAssets, { recursive: true });
await rm(distDir, { recursive: true, force: true });

console.log(`Published built site assets to ${repoRoot.pathname}`);
