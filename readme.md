# Anime Figure Collection

Anime Figure Collection is a personal figure shelf site with two parts:

- a polished public React gallery for browsing owned figures and wishlist entries; and
- a private Cloudflare Worker admin panel for editing the collection data without redeploying the site.

The public app reads the current collection from `/api/collection`. The admin app writes the same JSON record back to Cloudflare KV, can import metadata from MyFigureCollection, and can refresh stale MFC image URLs when thumbnails move.

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
- Import item details from MyFigureCollection by item number or URL.
- Refresh a single MFC image or bulk-refresh every entry with an MFC item number.
- Download a normalized JSON backup of the current collection.
- Copy the current entry JSON for manual edits or debugging.

### Worker and storage

- A single Cloudflare Worker serves static assets, admin pages, and JSON API routes.
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
| `/api/mfc` | `GET` | Yes | Looks up a MyFigureCollection item for admin import/refresh workflows. |

Protected HTML under `/admin` redirects to `/admin/login.html` when the request accepts HTML and no valid session is present.

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

MyFigureCollection may block, change markup, or omit an image. Try again later, keep the existing image URL, or paste an image URL manually in the admin form.

### Login loops or stale sessions

Use the sign-out button or clear cookies for the site. The Worker also clears invalid session cookies when protected admin pages are requested.

## License

This project is released under the [Creative Commons Attribution-NonCommercial 4.0 International License](./LICENSE). You may use and adapt the code for non-commercial purposes as long as you provide proper attribution to the Anime Figure Collection contributors.
