# Kawaii Figure Vault

A dreamy, anime-inspired static gallery for showcasing your collection of figures. Everything is powered by lightweight HTML, CSS, and vanilla JavaScript so it deploys beautifully on Cloudflare Pages.

## ✨ Features
- Magical hero section with animated sparkles and a floating mascot orb.
- Dynamic figure grid fed from a simple JavaScript data file—no extra HTML edits needed.
- Sorting controls to reorganize by release date or name.
- Smooth scroll navigation and scroll-in animations for a polished experience.

## 🧸 Getting Started
1. **Preview locally**: open `index.html` in your browser for a static preview, or run `npx wrangler dev` to emulate the production worker (required for the admin login).
2. **Customize the figures**:
   - Sign in to the admin panel at [`/admin`](https://figures.swmarly.com/admin) using your configured credentials. From there you can import entries from MyFigureCollection, edit the details manually, and download the updated [`data/collection.json`](./data/collection.json).
   - The JSON file is split into `owned` and `wishlist` arrays so you can track both shelves independently. The admin panel keeps the format intact when you export it.
   - After editing the JSON manually (or importing it through the admin panel), regenerate the runtime module with `node scripts/generate-figures.mjs` to refresh [`figures.js`](./figures.js).
   - Each entry can include an optional `mfcId`—cards automatically link back to the corresponding MyFigureCollection page when it is present.
3. **Tweak the look & feel**: adjust colors, gradients, or layout inside [`styles.css`](./styles.css).
4. **Deploy on Cloudflare Pages or Workers**:
   - **Cloudflare Pages**: point your project at this repository. Set the build command to none and the output directory to the repository root.
   - **Cloudflare Workers**: run `npx wrangler deploy`. The included `worker.js` serves the static assets and protects the admin area with HTTP Basic Auth.

## 🛠 Admin panel

Visit `/admin` (for example, <https://figures.swmarly.com/admin>) to manage the collection through a friendly interface. The panel lets you:

- Look up figures by MyFigureCollection item number. The Worker fetches the page server-side and pre-fills the form with any available metadata, including images, manufacturer, and release information.
- Switch to manual mode at any point—every field can be edited before you save.
- Append entries to the in-memory collection, keep track of everything you added during the session, and export the refreshed `collection.json` file for safekeeping.

### Authentication

The admin panel is protected with HTTP Basic Auth. Set your own credentials before deploying:

```bash
# Configure the username (optional, defaults to "admin")
wrangler secret put ADMIN_USERNAME

# Configure the password (required – overrides the in-repo development default)
wrangler secret put ADMIN_PASSWORD
```

For Cloudflare Pages, add `ADMIN_USERNAME` and `ADMIN_PASSWORD` as environment variables. Locally, you can start `wrangler dev` with `--var ADMIN_USERNAME=your-name --var ADMIN_PASSWORD=your-password`.

### Why the admin login needs `wrangler dev`

The login form at `/admin/login.html` calls Worker endpoints such as `/api/login` and `/api/auth-check`. When you open the site directly from the filesystem (for example with `file://` or via a static HTTP server), those endpoints do not exist, so the form cannot complete the authentication flow. Running `npx wrangler dev` (or deploying to Cloudflare Workers/Pages) provides the Worker runtime that serves these endpoints and enforces Basic Auth.

If you only need to view the public gallery you can stay in static mode. To test the admin panel—including sign-in and JSON exporting—you must run the Worker locally or access a deployed instance.

### Troubleshooting `SELF_SIGNED_CERT_IN_CHAIN`

Corporate networks sometimes intercept HTTPS traffic with their own certificates, which prevents `npx wrangler dev` (and other npm commands) from downloading dependencies. You can fix this without disabling SSL verification by telling npm about your corporate Certificate Authority (CA):

```powershell
# Windows PowerShell example – replace the path with your CA bundle
npm config set cafile "C:\\path\\to\\corporate-ca.pem"

# Or configure Node.js directly
setx NODE_EXTRA_CA_CERTS "C:\\path\\to\\corporate-ca.pem"
```

If you cannot obtain the CA file, run the command from a network that does not inject a self-signed certificate. Avoid `npm config set strict-ssl false`; it weakens HTTPS validation for every npm command.

> The repository defaults to `admin` / `figureadmin` for local development. Always override these values before going live.

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
