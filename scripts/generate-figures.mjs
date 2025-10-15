#!/usr/bin/env node
import { loadCollection, writeFiguresModule } from "./collection-utils.mjs";

const main = async () => {
  try {
    const collection = await loadCollection();
    await writeFiguresModule(collection);
    console.log("figures.js regenerated from data/collection.json");
  } catch (error) {
    console.error("Failed to generate figures.js:", error.message);
    process.exitCode = 1;
  }
};

await main();
