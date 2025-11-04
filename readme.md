# Anime Figure Collection

Anime Figure Collection is a stylized gallery and admin console for cataloging a personal collection of anime figures. The public site is a static, animation-heavy showcase, while a Cloudflare Worker exposes an authenticated JSON API and serves every asset. Updates happen in real time—no rebuilds, no manual uploads.

## Highlights
- **Single Worker deployment** – `_worker.js` serves the gallery, admin interface, and API endpoints from the same Cloudflare Worker.
- **JSON-first data model** – All collection data lives in a simple `{ owned: Figure[], wishlist: Figure[] }` shape that can be exported or edited manually.
- **KV-backed persistence** – When a Cloudflare KV namespace is bound, the collection is durable; otherwise, the Worker falls back to an in-memory cache for local development.
- **Password-protected admin console** – `/admin` provides a lightweight SPA for editing entries, importing data, and managing the collection.

## Repository layout
```
.
├── index.html          # Public landing page for the gallery
├── styles.css          # Soft gradients, sparkles, and responsive layout rules
├── script.js           # Fetches the collection JSON and renders cards
├── worker.js           # Cloudflare Worker handling assets, API routes, and auth
├── _worker.js          # Entry point re-export for Wrangler/Pages compatibility
├── data/
│   └── default-collection.js  # Seed data used on first run
├── admin/
│   ├── index.html      # Authenticated admin SPA
│   ├── admin.js        # CRUD helpers, form bindings, and import utilities
│   ├── admin.css       # Styling for the admin interface
│   ├── login.html      # Public login view served at /admin/login.html
│   ├── login.js        # Handles Basic Auth and session token management
│   └── login.css       # Styling for the login view
├── wrangler.toml       # Wrangler configuration for the Worker
└── tests/              # Smoke tests for data normalization utilities
```

## Requirements
- Node.js 18+ (for running Wrangler locally)
- Wrangler CLI (`npm install -g wrangler`)
- A Cloudflare account with access to Workers and KV

## Configuration
The Worker recognizes the following environment bindings:

| Name | Type | Purpose |
| ---- | ---- | ------- |
| `COLLECTION` | KV namespace | Primary storage for the gallery data. The Worker also accepts `FIGURE_COLLECTION`, `FIGURE_COLLECTION_KV`, or `COLLECTION_KV` as binding names. |
| `ADMIN_USERNAME` | Secret | Overrides the default admin username (`admin`). |
| `ADMIN_PASSWORD` | Secret | Overrides the default admin password (`figureadmin`). Set this before deploying publicly. |
| `SESSION_SECRET` | Secret | Optional. If omitted, the Worker reuses `ADMIN_PASSWORD` for signing admin sessions. |

When no KV binding is configured the Worker caches data in-memory. This is sufficient for local development but changes are lost between deployments.

## Run locally
1. Install dependencies: `npm install -g wrangler` (or use `npx wrangler` in every command).
2. Start the development server:
   ```bash
   wrangler dev
   ```
3. Open `http://localhost:8787` to view the gallery. Visit `http://localhost:8787/admin/login.html` to access the admin console (default credentials: `admin` / `figureadmin`).

## Deploy to your own Cloudflare account
1. **Install Wrangler and authenticate**
   ```bash
   npm install -g wrangler
   wrangler login
   ```
2. **Create a KV namespace** for the collection data. Replace `my-figure-collection` with a unique name:
   ```bash
   wrangler kv namespace create collection
   ```
   Wrangler will output an `id` (and `preview_id`). Copy the production `id` into `wrangler.toml` under the `[[kv_namespaces]]` section. Example:
   ```toml
   [[kv_namespaces]]
   binding = "COLLECTION"
   id = "<your-production-id>"
   preview_id = "<your-preview-id>"
   ```
3. **Configure secrets** for admin authentication. Replace the placeholder values with secure credentials:
   ```bash
   wrangler secret put ADMIN_USERNAME
   wrangler secret put ADMIN_PASSWORD
   wrangler secret put SESSION_SECRET
   ```
4. **Publish the Worker**:
   ```bash
   wrangler deploy
   ```
5. **Visit your Worker URL** (shown after deploy). The admin console lives at `/admin`, with a dedicated login page at `/admin/login.html`.

### Optional: seed your own data
- Edit `data/default-collection.js` before deploying to customize the starter figures.
- From the admin console, use the “Export” option to download a JSON backup, modify it, and re-import it.

## Testing
Run the lightweight test suite to verify data utilities:
```bash
npm test
```
(Uses Node’s built-in test runner and does not require additional dependencies.)

## License
This project is released under the [MIT License](./LICENSE). You are free to use, modify, and distribute the code provided you include the original copyright notice.
