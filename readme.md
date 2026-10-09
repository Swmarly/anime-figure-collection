# Anime Figure Collection

Anime Figure Collection is a personal figure shelf site with two parts:

- a polished public React gallery for browsing owned figures and wishlist entries; and
- a private Cloudflare Worker admin panel for editing the collection data without redeploying the site.

The public app reads the current collection from `/api/collection`. The admin app writes the same JSON record back to Cloudflare KV and imports MFC item data through the linked `myfigurecollection-api` Python package. MFC upload images are displayed through a same-origin image route, so browsers do not hotlink them directly.

## What it does

### Public collection site

- Displays separate **Owned figures** and **Wishlist** sections.
- Shows collection metrics in the hero, including totals and last-updated state.
- Supports search and release/name sorting for each section.
- Opens figure photos in an accessible lightbox with multi-image navigation.
- Links entries back to MyFigureCollection when an MFC URL or item ID is available.
- Includes a theme toggle and responsive styling for desktop and mobile screens.

### Private admin panel

- Password-protected `/admin` area with login, logout, and session checks.
- Add, edit, remove, preview, and save collection entries.
- Import item details and the full official image gallery from MyFigureCollection by item number or URL through the API bridge.
- Refresh a single MFC image or bulk-refresh every entry with an MFC item number.
- Download a normalized JSON backup of the current collection.
- Copy the current entry JSON for manual edits or debugging.

### Worker and storage

- A Cloudflare Worker serves static assets, admin pages, JSON API routes, and a same-origin MFC image proxy.
- Cloudflare KV stores the collection under the `collection` key.
- If KV is missing in local development, the Worker falls back to in-memory storage.
- The Worker seeds an empty `{ owned: [], wishlist: [] }` collection when KV has no record yet.
- Admin mutations require an authenticated session and same-origin requests.

## Repository layout

```text
.
├── src/site/                 # Vite + React source for the public gallery
│   ├── index.html
│   └── src/
│       ├── App.tsx
│       ├── components/       # Hero, cards, controls, lightbox, theme toggle
│       ├── hooks/            # Collection fetch hook
│       ├── lib/              # Filtering, sorting, formatting, metrics helpers
│       ├── config.ts         # Public copy and sort options
│       └── types.ts          # Collection and figure types
├── admin/                    # Static private admin interface
│   ├── index.html
│   ├── admin.js
│   ├── admin.css
│   ├── login.html
│   ├── login.js
│   └── login.css
├── data/default-collection.js # Starter collection used when KV is empty
├── scripts/publish-site.mjs  # Copies the Vite build into root assets for Worker deploys
├── tests/                    # Worker, auth, collection, and MFC smoke tests
├── worker.js                 # Cloudflare Worker implementation
├── _worker.js                # Worker entry re-export used by Wrangler
├── vite.config.ts            # Vite config; proxies /api to Wrangler during development
├── wrangler.toml             # Worker, assets, secrets, and KV configuration
├── package.json              # npm scripts and dependencies
└── readme.md
```

## Collection data shape

The API returns a collection payload like this:

```json
{
  "owned": [],
  "wishlist": [],
  "updatedAt": "2026-06-10T00:00:00.000Z"
}
```

Each figure can contain these fields:

```json
{
  "slug": "example-figure",
  "name": "Example Figure",
  "series": "Example Series",
  "manufacturer": "Example Maker",
  "scale": "1/7",
  "releaseDate": "2026-06",
  "image": "https://example.com/main.jpg",
  "images": ["https://example.com/main.jpg", "https://example.com/alternate.jpg"],
  "alt": "Example Figure product photo",
  "caption": "Displayed on the top shelf",
  "description": "Optional public notes.",
  "tags": ["pastel", "limited"],
  "mfcId": 123456,
  "links": {
    "mfc": "https://myfigurecollection.net/item/123456"
  }
}
```

Notes:

- `owned` and `wishlist` are always arrays.
- `updatedAt` is set by the Worker whenever the admin panel saves the collection.
- Empty strings, empty arrays, and invalid values are cleaned before storage.
- `mfcId` and `links.mfc` are used by the admin panel and public cards to connect entries to MyFigureCollection.

## Requirements

- Node.js 18 or newer.
- npm.
- A Cloudflare account for deployment.
- Wrangler for local Worker development and deployment. You can use `npx wrangler` without installing it globally.

## Install

```bash
npm install
```

## Local development

### Public React app

Start Vite:

```bash
npm run dev
```

Vite serves the public app from `src/site` and proxies `/api` calls to `http://localhost:8787`.

### Worker API and admin panel

In a second terminal, start Wrangler:

```bash
npx wrangler dev
```

Useful local URLs:

- Public Worker site: `http://localhost:8787/`
- Admin panel: `http://localhost:8787/admin`
- Login page: `http://localhost:8787/admin/login.html`
- Collection API: `http://localhost:8787/api/collection`

Default local credentials are:

- username: `admin`
- password: `figureadmin`

Set real secrets before deploying anything public.

## npm scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the Vite dev server for the React gallery. |
| `npm run build` | Type-checks, builds the React app, copies the built `index.html` and hashed assets into the Worker-served root, then removes `dist/`. |
| `npm run preview` | Starts Vite preview when a `dist/` build is present. Note that `npm run build` publishes assets into the repository root and removes `dist/`. |
| `npm run lint` | Runs ESLint against `src` and `vite.config.ts` with zero warnings allowed. |
| `npm test` | Runs the Worker/auth, collection normalization, and MFC helper tests. |

## Worker API

| Route | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/api/collection` | `GET` | No | Returns the public collection payload. |
| `/api/collection` | `PUT` | Yes | Saves a normalized collection payload and updates `updatedAt`. |
| `/api/login` | `POST` | No | Validates admin credentials and sets the session cookie. |
| `/api/logout` | `POST` | Session | Clears admin session cookies. |
| `/api/auth-check` | `GET` | Session or Basic Auth | Returns `204` when the current admin session is valid. |
| `/api/mfc` | `GET` | Yes | Looks up a MyFigureCollection item for admin import/refresh workflows. Uses the Python API bridge when configured. |
| `/api/mfc/image` | `GET`, `HEAD` | No | Streams allowlisted MFC upload images through the same origin and caches successful responses. |

Protected HTML under `/admin` redirects to `/admin/login.html` when the request accepts HTML and no valid session is present.


### MFC API bridge

The linked `ssskay/myfigurecollection-api` project is a Python library and local MCP server, not a hosted REST API. It uses `curl_cffi` to make a browser-like TLS handshake; ordinary Cloudflare Worker requests to MFC can still be challenged. This repository includes a small authenticated HTTP adapter at `mfc-api-bridge/server.py` that runs the library on a trusted machine.

For reliable MFC imports and images, run the bridge on a home machine or another connection MFC accepts, and expose it to the Worker through an HTTPS tunnel. The bridge listens on `127.0.0.1:8765` by default and accepts only item lookups and MFC upload image URLs. It caches image bytes locally after their first fetch. Keep its bearer token secret.

Install and start the bridge:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r mfc-api-bridge/requirements.txt
$env:MFC_API_BRIDGE_TOKEN = "<same long random token configured in Cloudflare>"
python mfc-api-bridge/server.py
```

Configure the tunnel to forward an HTTPS hostname to `http://127.0.0.1:8765`. Then set `MFC_API_URL` to that HTTPS origin and `MFC_API_TOKEN` to the same token in the Cloudflare Worker or Pages runtime settings. For local Wrangler development, put these in the ignored `.dev.vars` file:

```text
MFC_API_URL=http://127.0.0.1:8765
MFC_API_TOKEN=<same long random token>
```

The token is sent only from the Worker to the bridge; it is never returned to browser code. The bridge is required for item imports and reliable MFC image delivery. Without it, those requests return an actionable setup error rather than attempting a direct Cloudflare-to-MFC request.

This repository's `wrangler.toml` deploys a Worker with static assets. If the project is deployed as Cloudflare Pages, Pages must run the `_worker.js` advanced-mode handler (or equivalent Functions); a static-only Pages deployment will not execute the `/api/*` routes.

## Configuration

The Worker reads these Cloudflare bindings and secrets:

| Name | Type | Required | Purpose |
| --- | --- | --- | --- |
| `COLLECTION` | KV namespace | Production recommended | Primary collection storage. |
| `FIGURE_COLLECTION` | KV namespace | No | Accepted fallback binding name. |
| `FIGURE_COLLECTION_KV` | KV namespace | No | Accepted fallback binding name. |
| `COLLECTION_KV` | KV namespace | No | Accepted fallback binding name. |
| `ADMIN_USERNAME` | Secret | Yes for deploys | Admin username. Defaults to `admin` if omitted. |
| `ADMIN_PASSWORD` | Secret | Yes for deploys | Admin password. Defaults to `figureadmin` if omitted. |
| `SESSION_SECRET` | Secret | Recommended | HMAC secret for admin sessions. Falls back to `ADMIN_PASSWORD` when omitted. |
| `MFC_API_URL` | Variable | Optional | HTTPS origin for the authenticated Python bridge. Use HTTP only for localhost development. |
| `MFC_API_TOKEN` | Secret | Required with `MFC_API_URL` | Bearer token shared with `MFC_API_BRIDGE_TOKEN` on the bridge host. |

`wrangler.toml` currently defines the Worker name, root asset serving, production and preview KV bindings, and required admin secrets.

## Deploying

1. Build the public site assets:

   ```bash
   npm run build
   ```

2. Log in to Cloudflare:

   ```bash
   npx wrangler login
   ```

3. Create a KV namespace if you are deploying to a new Cloudflare account:

   ```bash
   npx wrangler kv namespace create COLLECTION
   ```

   Copy the returned namespace ID into the `[[kv_namespaces]]` block in `wrangler.toml`. Add or update the preview namespace under `[[env.preview.kv_namespaces]]` if needed.

4. Set admin secrets:

   ```bash
   npx wrangler secret put ADMIN_USERNAME
   npx wrangler secret put ADMIN_PASSWORD
   npx wrangler secret put SESSION_SECRET
   ```

5. Deploy:

   ```bash
   npx wrangler deploy
   ```

6. Open the deployed Worker URL and sign in at `/admin` to add or import figures.

## Common admin workflow

1. Sign in at `/admin`.
2. Paste a MyFigureCollection item number or item URL into the lookup form.
3. Fetch details, review the generated fields, and adjust anything personal such as notes, tags, caption, or image alt text.
4. Choose whether the entry belongs in **Owned** or **Wishlist**.
5. Add or update the entry.
6. Save changes to Cloudflare.
7. Download a JSON backup after large edits.

## Testing and quality checks

Run the standard checks before deploying:

```bash
npm run lint
npm test
npm run build
```

The test suite runs directly in Node and imports the Worker module. It covers authentication/session behavior, collection normalization/storage behavior, and MFC parsing/image helper behavior.

## Troubleshooting

### The admin panel saves locally but data disappears later

The Worker is probably running without a KV binding. Add the `COLLECTION` KV namespace binding to `wrangler.toml` and deploy again.

### The public site cannot fetch the collection during Vite development

Start Wrangler on `http://localhost:8787` in a second terminal. Vite proxies `/api` requests there.

### MFC import or image refresh fails

Check that the bridge process is running, the Cloudflare tunnel reaches it, and `MFC_API_URL` plus the matching `MFC_API_TOKEN` are set in the same Worker/Pages environment. The bridge uses the API package's rate limit and cache. Without a bridge, the Worker falls back to direct edge requests, which MFC may challenge.

### Login loops or stale sessions

Use the sign-out button or clear cookies for the site. The Worker also clears invalid session cookies when protected admin pages are requested.

## License

This project is released under the [Creative Commons Attribution-NonCommercial 4.0 International License](./LICENSE). You may use and adapt the code for non-commercial purposes as long as you provide proper attribution to the Anime Figure Collection contributors.
