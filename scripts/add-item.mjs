#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import {
  loadCollection,
  saveCollection,
  writeFiguresModule,
  normalizeEntry,
  slugify,
} from "./collection-utils.mjs";

const ARG_PREFIX = "--";

const parseArgs = (argv) => {
  const options = {};
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith(ARG_PREFIX)) {
      positional.push(current);
      continue;
    }

    const [rawKey, rawValue] = current.slice(ARG_PREFIX.length).split("=", 2);
    const key = rawKey.trim();
    let value = rawValue;

    if (value === undefined) {
      value = argv[i + 1] && !argv[i + 1].startsWith(ARG_PREFIX) ? argv[++i] : "true";
    }

    options[key] = value;
  }

  return { options, positional };
};

const toBoolean = (value, fallback = false) => {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  return fallback;
};

const promptFor = async (rl, message, { defaultValue = "", allowEmpty = false } = {}) => {
  const suffix = defaultValue ? ` (${defaultValue})` : "";
  const response = await rl.question(`${message}${suffix}: `);
  const value = response.trim();
  if (!value && !allowEmpty) {
    if (defaultValue) return defaultValue;
    return promptFor(rl, message, { defaultValue, allowEmpty });
  }
  return value || defaultValue;
};

const main = async () => {
  const { options, positional } = parseArgs(process.argv.slice(2));
  const nonInteractive = toBoolean(
    options["non-interactive"] ?? options.yes ?? options.y,
    false
  );

  const rl = nonInteractive
    ? null
    : createInterface({ input, output, terminal: true, historySize: 0 });

  const ask = async (message, config = {}) => {
    if (nonInteractive) {
      return config.defaultValue ?? "";
    }
    return promptFor(rl, message, config);
  };

  try {
    const collection = await loadCollection();

    const statusFromArgs = (options.status ?? positional[1] ?? positional[0])?.toLowerCase();
    const status = ["owned", "wishlist"].includes(statusFromArgs)
      ? statusFromArgs
      : (await ask("Add to which list? (owned/wishlist)", { defaultValue: "owned" })).toLowerCase();

    if (!["owned", "wishlist"].includes(status)) {
      throw new Error("List must be either 'owned' or 'wishlist'.");
    }

    const mfcIdRaw = options.mfc ?? options.id ?? positional.find((value) => /\d+/.test(value));
    const mfcId = mfcIdRaw ? Number(String(mfcIdRaw).trim()) : null;

    const defaultName = options.name ?? (nonInteractive ? "" : "");
    const name = options.name ?? (await ask("Figure name", { defaultValue: defaultName })).trim();

    if (!name) {
      throw new Error("A name is required to create a new entry.");
    }

    const entry = {
      slug: options.slug ?? slugify({ name, mfcId }),
      mfcId,
      name,
      series: options.series ?? (await ask("Series", { allowEmpty: true })),
      manufacturer: options.manufacturer ?? (await ask("Manufacturer", { allowEmpty: true })),
      scale: options.scale ?? (await ask("Scale", { allowEmpty: true })),
      releaseDate:
        options.release ?? (await ask("Release date (YYYY-MM or leave blank)", { allowEmpty: true })),
      image: options.image ?? (await ask("Image URL", { allowEmpty: true })),
      caption: options.caption ?? (await ask("Caption", { allowEmpty: true })),
      description: options.description ?? (await ask("Description", { allowEmpty: true })),
      alt: options.alt ?? (await ask("Custom alt text", { allowEmpty: true })),
      tags: options.tags ?? (await ask("Tags (comma separated)", { allowEmpty: true })),
      notes: options.notes ?? (await ask("Personal notes (stored only in JSON)", { allowEmpty: true })),
    };

    const normalized = normalizeEntry(entry);

    const targetList = status === "owned" ? collection.owned : collection.wishlist;

    const existingIndex = targetList.findIndex(
      (item) => item.slug === normalized.slug || (normalized.mfcId && item.mfcId === normalized.mfcId)
    );

    if (existingIndex >= 0) {
      const replace = nonInteractive
        ? toBoolean(options.replace, true)
        : await ask("Entry exists. Overwrite? (y/N)", { defaultValue: "n" }).then((answer) =>
            ["y", "yes"].includes(answer.toLowerCase())
          );

      if (!replace) {
        console.log("Aborted without changes.");
        return;
      }

      targetList.splice(existingIndex, 1, {
        ...targetList[existingIndex],
        ...normalized,
      });
    } else {
      targetList.push(normalized);
    }

    const updated = await saveCollection(collection);
    await writeFiguresModule(updated);

    console.log(`Added ${normalized.name} to ${status}.`);
    if (normalized.mfcId) {
      console.log(`MyFigureCollection link: https://myfigurecollection.net/item/${normalized.mfcId}`);
    }
  } catch (error) {
    console.error("Unable to add item:", error.message);
    process.exitCode = 1;
  } finally {
    if (rl) {
      rl.close();
    }
  }
};

await main();
