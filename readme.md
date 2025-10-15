# Kawaii Figure Vault

A dreamy, anime-inspired static gallery for showcasing your collection of figures. Everything is powered by lightweight HTML, CSS, and vanilla JavaScript so it deploys beautifully on Cloudflare Pages.

## ✨ Features
- Magical hero section with animated sparkles and a floating mascot orb.
- Dynamic figure grid fed from a simple JavaScript data file—no extra HTML edits needed.
- Sorting controls to reorganize by release date or name.
- Smooth scroll navigation and scroll-in animations for a polished experience.

## 🧸 Getting Started
1. **Preview locally**: open `public/index.html` in your browser. No build step required.
2. **Customize the figures**:
   - Manage all of your entries from [`data/collection.json`](./data/collection.json).
   - The file is split into `owned` and `wishlist` arrays so you can copy/paste MyFigureCollection IDs alongside your notes.
   - Run `node scripts/add-item.mjs` for an interactive prompt that appends a new entry (use `--status wishlist` to target the wishlist).
   - After editing the JSON manually, regenerate the runtime module with `node scripts/generate-figures.mjs`.
   - Each entry can include an optional `mfcId`—cards will automatically link back to the matching MyFigureCollection page when it is present.
3. **Tweak the look & feel**: adjust colors, gradients, or layout inside [`styles.css`](./public/styles.css).
4. **Deploy on Cloudflare Pages or Workers**:
   - **Cloudflare Pages**: point your project at this repository. Set the build command to none and the output directory to `public/`.
   - **Cloudflare Workers**: run `npx wrangler deploy`. The included `wrangler.toml` serves the `public/` directory through a minimal Worker and automatically falls back to `index.html` for unknown routes.

## 🤖 Quick add helper

If you keep your collection on [MyFigureCollection](https://myfigurecollection.net/), you can store the item number in `data/collection.json` and let the UI link back to the original entry automatically. The helper script wraps that flow in a guided prompt so you do not have to edit JSON by hand every time.

### Interactive usage

```bash
# Start the prompt (you will be asked which list to target and for the figure details)
node scripts/add-item.mjs
```

The script will:

1. Ask whether the entry belongs in the `owned` or `wishlist` section.
2. Prompt for the figure name (required) and optional metadata such as series, manufacturer, scale, release date, image URL, tags, notes, and a MyFigureCollection item number.
3. Automatically normalize the data, save it into `data/collection.json`, and regenerate `figures.js` so the gallery reflects the update immediately.

You can pre-fill answers by passing flags. For example, `--mfc 1685257` sets the outbound link to `https://myfigurecollection.net/item/1685257`, and `--status wishlist` skips the first question. Any fields you omit will still be prompted for interactively.

### Non-interactive usage

Add `--non-interactive` (or `-y/--yes`) when you want to supply every field up front—useful for scripts or copy/paste from a spreadsheet:

```bash
node scripts/add-item.mjs --non-interactive --status wishlist --mfc 7654321 \
  --name "My Dream Figure" --series "Example Series" --manufacturer "Awesome Studio" \
  --scale "1/7" --release 2025-03 --image https://example.com/figure.jpg \
  --tags "Limited,Pastel" --caption "Displayed with the pastel lineup"
```

After editing `data/collection.json` manually, you can still regenerate the runtime module yourself:

```bash
node scripts/generate-figures.mjs
```

> **Why not just the item number?** MyFigureCollection protects its API with anti-bot checks, so the helper script cannot legally or reliably scrape the rest of the details for you. The script streamlines manual entry instead: supply the fields once—either through the prompt or command-line flags—and the site updates immediately with the information you provide.

## 🖼 Figure Object Reference
Each figure entry in `figures.js` can include the following fields:

```js
{
  id: "unique-id", // used internally for sorting and anchors
  name: "Display Name",
  series: "Series or franchise",
  manufacturer: "Manufacturer name",
  scale: "e.g. 1/7 Scale PVC",
  releaseDate: "YYYY-MM", // used for sorting and display
  image: "https://your-image-url.jpg", // can be local or remote
  caption: "Short alt-style caption shown under the image",
  tags: ["Tag one", "Tag two"],
  description: "Optional longer text (you can extend the UI if desired)",
}
```

Feel free to add additional properties—`script.js` will ignore unknown fields unless you wire them up.

## 🌸 License
This project is yours to customize! No attribution required.
