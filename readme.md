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
   - Open [`figures.js`](./public/figures.js).
   - Replace the placeholder entries with your real figures.
   - Copy any object in the array to add a new figure.
   - Update the `image` field with an `assets/` path or remote URL.
3. **Tweak the look & feel**: adjust colors, gradients, or layout inside [`styles.css`](./public/styles.css).
4. **Deploy on Cloudflare Pages or Workers**:
   - **Cloudflare Pages**: point your project at this repository. Set the build command to none and the output directory to `public/`.
   - **Cloudflare Workers**: run `npx wrangler deploy`. The included `wrangler.toml` serves the `public/` directory through a minimal Worker and automatically falls back to `index.html` for unknown routes.

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
